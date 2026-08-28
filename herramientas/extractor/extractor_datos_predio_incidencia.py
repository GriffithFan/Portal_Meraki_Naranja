"""
Extractor completo Predio + Incidencia desde Salesforce.

Entrada esperada:
  Excel con columnas Numero_Predio y Numero_Incidencia.

Salida:
  Datos_Completos_Predio_Incidencia.xlsx con:
    - Datos_Completos: una fila por par predio-incidencia.
    - Cronogramas_Originados: todos los cronogramas de cada incidencia.
    - Detalles_Estados: todos los detalles de estado de cada incidencia.
    - Comentarios_Incidencias: comentarios si existen.
    - Predio_CUEs_Asociados: CUEs asociados al predio.
    - Predio_Equipos: equipos asociados al predio.
    - Resumen y Errores.
"""

from __future__ import annotations

import argparse
import html
import io
import json
import re
import sys
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd
import requests
from openpyxl.utils import get_column_letter

from reportes_predio_incidencia import (  # noqa: E402
    build_extra_sheets,
    create_input_template,
    enrich_main_df,
    enrich_related_dfs,
    format_workbook,
    report_columns_first,
)


BASE_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = BASE_DIR.parent
if str(WORKSPACE_DIR) not in sys.path:
    sys.path.append(str(WORKSPACE_DIR))

from salesforce_auth import crear_driver, load_config, login  # noqa: E402


if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


DEFAULT_INPUT = BASE_DIR / "Entrada_Prueba_Predios_Incidencias.xlsx"
DEFAULT_OUTPUT = BASE_DIR / "Datos_Completos_Predio_Incidencia.xlsx"
DEFAULT_TEMPLATE = BASE_DIR / "Plantilla_Entrada_Predios_Incidencias.xlsx"
CACHE_DIR = BASE_DIR / "cache"
CACHE_DIR.mkdir(exist_ok=True)

PREDIO_CACHE_PATH = CACHE_DIR / "predio_ids.csv"
INCIDENCIA_CACHE_PATH = CACHE_DIR / "incidencia_ids.csv"
PAGES_DIR = CACHE_DIR / "pages"
PAGES_DIR.mkdir(exist_ok=True)

SAVE_EVERY = 100
DEFAULT_WORKERS = 8
URL_BASE = ""
PREDIO_ID_RE = re.compile(r"001[0-9A-Za-z]{12,15}")
INCIDENCIA_ID_RE = re.compile(r"a0H[0-9A-Za-z]{12,15}")
INC_RE = re.compile(r"NI-\d+", re.IGNORECASE)
PREDIO_RE = re.compile(r"\b\d{6,8}\b")

RELATED_LISTS_INCIDENCIA = {
    "Cronogramas_Originados": "Cronogramas Originados",
    "Detalles_Estados": "Detalles Estados",
    "Comentarios_Incidencias": "Comentarios de Incidencias",
}
RELATED_LISTS_PREDIO = {
    "Predio_CUEs_Asociados": "CUEs Asociados",
    "Predio_Equipos": "Equipos",
}

thread_local = threading.local()
cookie_specs: list[dict] = []


def clean_text(value) -> str:
    if pd.isna(value):
        return ""
    value = str(value).replace("\xa0", " ").strip()
    return re.sub(r"\s+", " ", value)


def clean_inc(value) -> str:
    match = INC_RE.search(clean_text(value))
    return match.group(0).upper() if match else ""


def clean_predio(value) -> str:
    value = clean_text(value)
    if value.endswith(".0"):
        value = value[:-2]
    match = PREDIO_RE.search(value)
    return match.group(0) if match else ""


def strip_tags(fragment: str) -> str:
    fragment = re.sub(r"<script\b.*?</script>", " ", fragment, flags=re.IGNORECASE | re.DOTALL)
    fragment = re.sub(r"<style\b.*?</style>", " ", fragment, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", fragment)
    text = html.unescape(text).replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return "" if text == "&nbsp;" else text


def normalize_label(value: str) -> str:
    value = strip_tags(value)
    value = "".join(
        c for c in unicodedata.normalize("NFD", value) if unicodedata.category(c) != "Mn"
    )
    value = value.replace("ñ", "n").replace("Ñ", "N")
    value = re.sub(r"[^0-9A-Za-z]+", "_", value).strip("_")
    return value or "Campo"


def unique_join(values: list[str]) -> str:
    seen = set()
    out = []
    for value in values:
        value = clean_text(value)
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return " | ".join(out)


def set_cookies_from_driver(driver) -> None:
    global cookie_specs
    cookie_specs = driver.get_cookies()


def get_session() -> requests.Session:
    session = getattr(thread_local, "session", None)
    if session is not None:
        return session

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36"
            )
        }
    )
    for cookie in cookie_specs:
        session.cookies.set(
            cookie["name"],
            cookie["value"],
            domain=cookie.get("domain"),
            path=cookie.get("path", "/"),
        )
    thread_local.session = session
    return session


def http_get(url: str, retries: int = 3) -> str:
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            response = get_session().get(url, timeout=35)
            response.raise_for_status()
            return response.text
        except Exception as exc:
            last_error = exc
            time.sleep(0.8 * attempt)
    raise RuntimeError(str(last_error))


def page_cache_path(record_id: str) -> Path:
    case_sensitive_name = record_id.encode("ascii").hex()
    return PAGES_DIR / f"{case_sensitive_name}.html"


def get_record_page(record_id: str, use_page_cache: bool = True) -> str:
    path = page_cache_path(record_id)
    if use_page_cache and path.exists():
        return path.read_text(encoding="utf-8", errors="replace")
    url = URL_BASE.rstrip("/") + "/" + record_id
    page = http_get(url)
    path.write_text(page, encoding="utf-8", errors="replace")
    return page


def load_cache(path: Path, key_col: str, value_cols: list[str]) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    try:
        df = pd.read_csv(path, dtype=str, keep_default_na=False)
    except Exception:
        return {}
    cache: dict[str, dict[str, str]] = {}
    for _, row in df.iterrows():
        key = clean_text(row.get(key_col, ""))
        if key:
            cache[key] = {col: clean_text(row.get(col, "")) for col in value_cols}
    return cache


def save_cache(path: Path, key_col: str, cache: dict[str, dict[str, str]], value_cols: list[str]) -> None:
    rows = []
    for key, values in sorted(cache.items()):
        row = {key_col: key}
        for col in value_cols:
            row[col] = values.get(col, "")
        rows.append(row)
    pd.DataFrame(rows, columns=[key_col] + value_cols).to_csv(
        path, index=False, encoding="utf-8-sig"
    )


def seed_cache_from_parent(predio_cache, incidencia_cache) -> None:
    parent_cache = WORKSPACE_DIR / ".cache_ultimos_cronogramas"
    predios = parent_cache / "predio_ids.csv"
    incidencias = parent_cache / "incidencia_ids.csv"

    if predios.exists():
        df = pd.read_csv(predios, dtype=str, keep_default_na=False)
        for _, row in df.iterrows():
            predio = clean_predio(row.get("Numero_Predio", ""))
            sf_id = clean_text(row.get("Salesforce_Id", ""))
            if predio and PREDIO_ID_RE.fullmatch(sf_id) and predio not in predio_cache:
                predio_cache[predio] = {"Salesforce_Id": sf_id, "Predio_Error": ""}

    if incidencias.exists():
        df = pd.read_csv(incidencias, dtype=str, keep_default_na=False)
        for _, row in df.iterrows():
            inc = clean_inc(row.get("Numero_Incidencia", ""))
            inc_id = clean_text(row.get("Incidencia_Id", ""))
            if inc and INCIDENCIA_ID_RE.fullmatch(inc_id) and inc not in incidencia_cache:
                incidencia_cache[inc] = {"Incidencia_Id": inc_id, "Incidencia_Error": ""}


def search_predio_id(predio: str) -> dict[str, str]:
    candidates: list[str] = []
    pages = []
    urls = [
        URL_BASE.rstrip("/") + "/_ui/search/ui/UnifiedSearchResults?searchType=2&sen=001&str=" + quote_plus(predio),
        URL_BASE.rstrip("/") + "/_ui/search/ui/UnifiedSearchResults?searchType=2&str=" + quote_plus(predio),
    ]
    try:
        pages = [http_get(url) for url in urls]
    except Exception as exc:
        return {"Salesforce_Id": "", "Predio_Error": f"search predio fallo: {exc}"}

    for page in pages:
        pattern = re.compile(
            r'<a[^>]+href="([^"]*/mined/(001[0-9A-Za-z]{12,15})[^"]*)"[^>]*>\s*'
            + re.escape(predio)
            + r"\s*</a>",
            flags=re.IGNORECASE,
        )
        match = pattern.search(page)
        if match and match.group(2) not in candidates:
            candidates.append(match.group(2))

        for id_match in PREDIO_ID_RE.finditer(page):
            candidate = id_match.group(0)
            if candidate not in candidates:
                candidates.append(candidate)

    checked = []
    for candidate in candidates:
        try:
            candidate_page = get_record_page(candidate, use_page_cache=True)
            values = parse_labels(candidate_page, "Predio")
            actual = clean_predio(values.get("Predio_Nombre_de_la_cuenta", ""))
            checked.append(f"{candidate}:{actual or 'sin_predio'}")
            if actual == predio:
                return {"Salesforce_Id": candidate, "Predio_Error": ""}
        except Exception as exc:
            checked.append(f"{candidate}:error {exc}")

    detail = "; ".join(checked[:8])
    return {
        "Salesforce_Id": "",
        "Predio_Error": "predio no encontrado/verificado" + (f" ({detail})" if detail else ""),
    }


def search_incidencia_id(numero: str) -> dict[str, str]:
    url = (
        URL_BASE.rstrip("/")
        + "/_ui/search/ui/UnifiedSearchResults?searchType=2&sen=a0H&str="
        + quote_plus(numero)
    )
    try:
        page = http_get(url)
    except Exception as exc:
        return {"Incidencia_Id": "", "Incidencia_Error": f"search incidencia fallo: {exc}"}

    candidates: list[str] = []
    pattern = re.compile(
        r'<a[^>]+href="([^"]*/mined/(a0H[0-9A-Za-z]{12,15})[^"]*)"[^>]*>\s*'
        + re.escape(numero)
        + r"\s*</a>",
        flags=re.IGNORECASE,
    )
    match = pattern.search(page)
    if match:
        candidates.append(match.group(2))

    for id_match in INCIDENCIA_ID_RE.finditer(page):
        candidate = id_match.group(0)
        if candidate not in candidates:
            candidates.append(candidate)

    checked = []
    for candidate in candidates:
        try:
            candidate_page = get_record_page(candidate, use_page_cache=True)
            values = parse_labels(candidate_page, "Incidencia")
            actual = clean_inc(values.get("Incidencia_Numero_de_Incidencia", ""))
            checked.append(f"{candidate}:{actual or 'sin_numero'}")
            if actual == numero:
                return {"Incidencia_Id": candidate, "Incidencia_Error": ""}
        except Exception as exc:
            checked.append(f"{candidate}:error {exc}")

    detail = "; ".join(checked[:8])
    return {
        "Incidencia_Id": "",
        "Incidencia_Error": "incidencia no encontrada/verificada" + (f" ({detail})" if detail else ""),
    }


def parse_labels(page: str, prefix: str) -> dict[str, str]:
    values: dict[str, list[str]] = {}
    pattern = re.compile(
        r'<td[^>]*class="[^"]*labelCol[^"]*"[^>]*>(.*?)</td>\s*'
        r'<td[^>]*>(.*?)</td>',
        flags=re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(page):
        raw_label = strip_tags(match.group(1))
        value = strip_tags(match.group(2))
        if not raw_label:
            continue
        col = f"{prefix}_{normalize_label(raw_label)}"
        values.setdefault(col, []).append(value)
    return {col: unique_join(vals) for col, vals in values.items()}


def parse_related_table(page: str, title: str) -> tuple[list[str], list[dict[str, str]]]:
    idx = page.find(title)
    if idx < 0:
        return [], []
    table_idx = page.find('<table class="list"', idx)
    if table_idx < 0:
        return [], []
    end_idx = page.find("</table>", table_idx)
    if end_idx < 0:
        return [], []

    table = page[table_idx:end_idx]
    header_match = re.search(
        r'<tr[^>]*class="[^"]*headerRow[^"]*"[^>]*>(.*?)</tr>',
        table,
        flags=re.IGNORECASE | re.DOTALL,
    )
    headers = []
    if header_match:
        headers = [
            normalize_label(cell)
            for cell in re.findall(
                r"<th\b[^>]*>(.*?)</th>",
                header_match.group(1),
                flags=re.IGNORECASE | re.DOTALL,
            )
        ]

    rows = []
    for row_html in re.findall(
        r'<tr[^>]*class="[^"]*dataRow[^"]*"[^>]*>(.*?)</tr>',
        table,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        cells = [
            strip_tags(cell)
            for cell in re.findall(
                r"<(?:td|th)\b[^>]*>(.*?)</(?:td|th)>",
                row_html,
                flags=re.IGNORECASE | re.DOTALL,
            )
        ]
        if not headers:
            headers = [f"Col_{idx + 1}" for idx in range(len(cells))]
        row = {}
        for idx, value in enumerate(cells):
            key = headers[idx] if idx < len(headers) else f"Col_{idx + 1}"
            row[key] = value
        if any(row.values()):
            rows.append(row)
    return headers, rows


def resumen_rows(rows: list[dict[str, str]], preferred_cols: list[str]) -> str:
    parts = []
    for row in rows:
        vals = [row.get(col, "") for col in preferred_cols if row.get(col, "")]
        if not vals:
            vals = [v for v in row.values() if v]
        if vals:
            parts.append(" - ".join(vals))
    return " | ".join(parts)


# Regex label->valor (misma estructura que parse_labels) para leer el checkbox
# "Activo" del DETALLE de un cronograma (la lista relacionada no trae ese campo).
_ACTIVO_LABEL_PAT = re.compile(
    r'<td[^>]*class="[^"]*labelCol[^"]*"[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>',
    flags=re.IGNORECASE | re.DOTALL,
)


def ultimo_cronograma_id(page: str) -> str:
    """ID (a04...) del ULTIMO cronograma de la lista 'Cronogramas Originados'."""
    idx = page.find("Cronogramas Originados")
    if idx < 0:
        return ""
    table_idx = page.find('<table class="list"', idx)
    if table_idx < 0:
        return ""
    end_idx = page.find("</table>", table_idx)
    if end_idx < 0:
        return ""
    ids = re.findall(r"/mined/(a04[A-Za-z0-9]{12,15})", page[table_idx:end_idx])
    return ids[-1] if ids else ""


def parse_cronograma_activo(page: str) -> str:
    """Lee el checkbox 'Activo' del detalle de un cronograma. 'SI' | 'NO' | ''.

    Salesforce clasico renderiza el booleano como <img src=".../checkbox_checked.gif">
    (tildado) o checkbox_unchecked.gif (sin tildar) dentro de la celda de valor.
    """
    for match in _ACTIVO_LABEL_PAT.finditer(page):
        if strip_tags(match.group(1)).strip() == "Activo":
            value = match.group(2)
            if "checkbox_checked" in value:
                return "SI"
            if "checkbox_unchecked" in value:
                return "NO"
            return ""
    return ""


def build_input(path: Path, sheet: str | None, predio_col: str, incidencia_col: str, limit: int | None) -> pd.DataFrame:
    df = pd.read_excel(path, sheet_name=sheet or 0, dtype=str, keep_default_na=False).fillna("")
    if predio_col not in df.columns or incidencia_col not in df.columns:
        raise RuntimeError(
            f"El Excel debe tener columnas {predio_col!r} y {incidencia_col!r}. "
            f"Columnas disponibles: {list(df.columns)}"
        )
    rows = pd.DataFrame(
        {
            "Numero_Predio": df[predio_col].map(clean_predio),
            "Numero_Incidencia": df[incidencia_col].map(clean_inc),
        }
    )
    for col in df.columns:
        if col not in {predio_col, incidencia_col}:
            rows[f"Origen_{normalize_label(str(col))}"] = df[col].map(clean_text)
    rows = rows[(rows["Numero_Predio"] != "") & (rows["Numero_Incidencia"] != "")].copy()
    rows = rows.drop_duplicates(subset=["Numero_Predio", "Numero_Incidencia"]).reset_index(drop=True)
    if limit:
        rows = rows.head(limit).copy()
    return rows


def resolve_many(items, func, cache, label, cache_path, key_col, value_cols, workers) -> None:
    pending = [item for item in items if item and not cache.get(item)]
    print(f"{label}: {len(items)} unicos, {len(pending)} pendientes", flush=True)
    if not pending:
        return

    done = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(func, item): item for item in pending}
        for future in as_completed(futures):
            item = futures[future]
            try:
                cache[item] = future.result()
            except Exception as exc:
                cache[item] = {value_cols[0]: "", value_cols[-1]: str(exc)}
            done += 1
            if done % 25 == 0 or done == len(pending):
                print(f"  {label}: {done}/{len(pending)}", flush=True)
            if done % SAVE_EVERY == 0:
                save_cache(cache_path, key_col, cache, value_cols)
    save_cache(cache_path, key_col, cache, value_cols)


def process_pair(row, predio_cache, incidencia_cache, use_page_cache=True):
    predio = row["Numero_Predio"]
    incidencia = row["Numero_Incidencia"]
    sf_id = predio_cache.get(predio, {}).get("Salesforce_Id", "")
    inc_id = incidencia_cache.get(incidencia, {}).get("Incidencia_Id", "")

    result = {
        "Numero_Predio": predio,
        "Numero_Incidencia": incidencia,
        "Salesforce_Id": sf_id,
        "Incidencia_Id": inc_id,
        "Predio_Error": predio_cache.get(predio, {}).get("Predio_Error", ""),
        "Incidencia_Error": incidencia_cache.get(incidencia, {}).get("Incidencia_Error", ""),
    }
    errors = []
    related = {
        "Cronogramas_Originados": [],
        "Detalles_Estados": [],
        "Comentarios_Incidencias": [],
        "Predio_CUEs_Asociados": [],
        "Predio_Equipos": [],
    }

    predio_page = ""
    incidencia_page = ""
    if sf_id:
        try:
            predio_page = get_record_page(sf_id, use_page_cache=use_page_cache)
            result.update(parse_labels(predio_page, "Predio"))
        except Exception as exc:
            errors.append({"Tipo": "Predio", "Id": sf_id, "Error": str(exc)})
    if inc_id:
        try:
            incidencia_page = get_record_page(inc_id, use_page_cache=use_page_cache)
            result.update(parse_labels(incidencia_page, "Incidencia"))
        except Exception as exc:
            errors.append({"Tipo": "Incidencia", "Id": inc_id, "Error": str(exc)})

    if incidencia_page:
        for sheet_name, title in RELATED_LISTS_INCIDENCIA.items():
            _, rows = parse_related_table(incidencia_page, title)
            for idx, rel_row in enumerate(rows, start=1):
                rel_row = dict(rel_row)
                rel_row.update(
                    {
                        "Numero_Predio": predio,
                        "Numero_Incidencia": incidencia,
                        "Salesforce_Id": sf_id,
                        "Incidencia_Id": inc_id,
                        "Orden_Relacionado": idx,
                    }
                )
                related[sheet_name].append(rel_row)
            result[f"{sheet_name}_Cantidad"] = len(rows)

        crono_rows = related["Cronogramas_Originados"]
        if crono_rows:
            ultimo = crono_rows[-1]
            for key, value in ultimo.items():
                if key in {"Numero_Predio", "Numero_Incidencia", "Salesforce_Id", "Incidencia_Id", "Orden_Relacionado"}:
                    continue
                result[f"Cronograma_Ultimo_{key}"] = value
            result["Cronogramas_Originados_Resumen"] = resumen_rows(
                crono_rows,
                ["Nombre_de_Cronograma", "Tipo_de_Cronograma", "Estado", "Fecha_de_Inicio", "Fecha_de_Fin"],
            )
            # ── Tilde "Activo" REAL del ultimo cronograma. No esta en la lista
            #    relacionada, hay que entrar al detalle del registro y leerlo.
            cid = ultimo_cronograma_id(incidencia_page)
            if cid:
                result["Cronograma_Ultimo_Id"] = cid
                try:
                    crono_page = get_record_page(cid, use_page_cache=use_page_cache)
                    result["Cronograma_Ultimo_Activo_Real"] = parse_cronograma_activo(crono_page)
                    detalle_crono = parse_labels(crono_page, "Cronograma_Ultimo")
                    for _k, _v in detalle_crono.items():
                        _kl = _k.lower()
                        if "orden" in _kl and "trabajo" in _kl and _v:
                            result["Cronograma_Ultimo_Orden_de_Trabajo"] = _v
                            break
                except Exception as exc:
                    errors.append({"Tipo": "Cronograma", "Id": cid, "Error": str(exc)})

        det_rows = related["Detalles_Estados"]
        if det_rows:
            result["Detalles_Estados_Resumen"] = resumen_rows(
                det_rows, ["Detalle_Estado", "Nivel", "Estado", "Responsable", "Fecha_Estado"]
            )

    if predio_page:
        for sheet_name, title in RELATED_LISTS_PREDIO.items():
            _, rows = parse_related_table(predio_page, title)
            for idx, rel_row in enumerate(rows, start=1):
                rel_row = dict(rel_row)
                rel_row.update(
                    {
                        "Numero_Predio": predio,
                        "Numero_Incidencia": incidencia,
                        "Salesforce_Id": sf_id,
                        "Incidencia_Id": inc_id,
                        "Orden_Relacionado": idx,
                    }
                )
                related[sheet_name].append(rel_row)
            result[f"{sheet_name}_Cantidad"] = len(rows)

    result["Errores_Extraccion"] = " | ".join(e["Error"] for e in errors)
    return result, related, errors


def write_excel(output_path: Path, main_rows, related_rows, errors, metadata, assignment_source=None) -> None:
    main_df = pd.DataFrame(main_rows).fillna("")
    main_df = enrich_main_df(main_df, assignment_source)
    cronogramas_count = pd.to_numeric(
        main_df.get("Cronogramas_Originados_Cantidad", pd.Series(dtype=int)),
        errors="coerce",
    ).fillna(0)

    base_cols = [
        "Numero_Predio",
        "Numero_Incidencia",
        "Salesforce_Id",
        "Incidencia_Id",
        "Predio_Error",
        "Incidencia_Error",
        "Errores_Extraccion",
    ]
    other_cols = [c for c in main_df.columns if c not in base_cols]
    main_df = report_columns_first(main_df[[c for c in base_cols if c in main_df.columns] + sorted(other_cols)])
    related_dfs = {
        sheet_name: pd.DataFrame(rows).fillna("")
        for sheet_name, rows in related_rows.items()
    }
    related_dfs = enrich_related_dfs(related_dfs, main_df)
    extra_sheets = build_extra_sheets(main_df, related_dfs)

    resumen = pd.DataFrame(
        [
            {"Concepto": "Pares procesados", "Cantidad": len(main_df)},
            {"Concepto": "Con Salesforce_Id", "Cantidad": int((main_df["Salesforce_Id"] != "").sum())},
            {"Concepto": "Con Incidencia_Id", "Cantidad": int((main_df["Incidencia_Id"] != "").sum())},
            {
                "Concepto": "Con Cronogramas Originados",
                "Cantidad": int((cronogramas_count > 0).sum()),
            },
            {"Concepto": "Errores extraccion", "Cantidad": int((main_df["Errores_Extraccion"] != "").sum())},
        ]
    )
    meta_df = pd.DataFrame([metadata])

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        resumen.to_excel(writer, sheet_name="Resumen", index=False)
        meta_df.to_excel(writer, sheet_name="Metadata", index=False)
        main_df.to_excel(writer, sheet_name="Datos_Completos", index=False)

        for sheet_name, rel_df in related_dfs.items():
            if len(rel_df):
                id_cols = ["Numero_Predio", "Numero_Incidencia", "Salesforce_Id", "Incidencia_Id", "Orden_Relacionado"]
                rel_df = rel_df[[c for c in id_cols if c in rel_df.columns] + sorted(c for c in rel_df.columns if c not in id_cols)]
            rel_df.to_excel(writer, sheet_name=sheet_name[:31], index=False)

        pd.DataFrame(errors).fillna("").to_excel(writer, sheet_name="Errores", index=False)
        for sheet_name, df in extra_sheets.items():
            df.to_excel(writer, sheet_name=sheet_name[:31], index=False)

        format_workbook(writer)


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrae datos completos de predio e incidencia desde Salesforce.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Excel de entrada.")
    parser.add_argument("--sheet", default=None, help="Hoja de entrada. Por defecto, la primera.")
    parser.add_argument("--predio-col", default="Numero_Predio", help="Columna con numero de predio.")
    parser.add_argument("--incidencia-col", default="Numero_Incidencia", help="Columna con numero de incidencia.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Excel de salida.")
    parser.add_argument("--limit", type=int, default=None, help="Procesa solo N filas para prueba.")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Requests paralelos.")
    parser.add_argument("--no-page-cache", action="store_true", help="Ignora cache HTML de paginas.")
    parser.add_argument(
        "--assignment-source",
        default=None,
        help="Excel original con hojas Asignado - ... para reconstruir Asignado_Original.",
    )
    parser.add_argument(
        "--template-output",
        default=str(DEFAULT_TEMPLATE),
        help="Ruta de la plantilla Excel de entrada que se crea para futuras cargas.",
    )
    parser.add_argument("--refresh-predio-cache", action="store_true", help="Vuelve a buscar todos los IDs de predio.")
    parser.add_argument("--refresh-incidencia-cache", action="store_true", help="Vuelve a buscar y verificar todos los IDs de incidencia.")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    rows = build_input(input_path, args.sheet, args.predio_col, args.incidencia_col, args.limit)
    config = load_config()
    global URL_BASE
    URL_BASE = config.url_base

    print("=" * 72, flush=True)
    print("EXTRACTOR COMPLETO PREDIO + INCIDENCIA", flush=True)
    print("=" * 72, flush=True)
    print(f"Entrada : {input_path}", flush=True)
    print(f"Salida  : {output_path}", flush=True)
    print(f"Pares   : {len(rows)}", flush=True)
    print(f"Predios unicos: {rows['Numero_Predio'].nunique()}", flush=True)
    print(f"Incidencias unicas: {rows['Numero_Incidencia'].nunique()}", flush=True)

    predio_cache = load_cache(PREDIO_CACHE_PATH, "Numero_Predio", ["Salesforce_Id", "Predio_Error"])
    incidencia_cache = load_cache(INCIDENCIA_CACHE_PATH, "Numero_Incidencia", ["Incidencia_Id", "Incidencia_Error"])
    if args.refresh_predio_cache:
        predio_cache = {}
    if args.refresh_incidencia_cache:
        incidencia_cache = {}
    seed_cache_from_parent(predio_cache, incidencia_cache)
    if args.refresh_predio_cache:
        predio_cache = {}
    if args.refresh_incidencia_cache:
        incidencia_cache = {}

    driver = crear_driver(headless=True)
    try:
        if not login(driver, config):
            raise RuntimeError("No se pudo iniciar sesion en Salesforce")
        set_cookies_from_driver(driver)
    finally:
        driver.quit()

    resolve_many(
        sorted(rows["Numero_Predio"].unique()),
        search_predio_id,
        predio_cache,
        "predios",
        PREDIO_CACHE_PATH,
        "Numero_Predio",
        ["Salesforce_Id", "Predio_Error"],
        args.workers,
    )
    resolve_many(
        sorted(rows["Numero_Incidencia"].unique()),
        search_incidencia_id,
        incidencia_cache,
        "incidencias",
        INCIDENCIA_CACHE_PATH,
        "Numero_Incidencia",
        ["Incidencia_Id", "Incidencia_Error"],
        args.workers,
    )

    main_rows = []
    related_rows = {name: [] for name in list(RELATED_LISTS_INCIDENCIA) + list(RELATED_LISTS_PREDIO)}
    errors = []
    use_page_cache = not args.no_page_cache

    pending = rows.to_dict("records")
    done = 0
    print(f"Extrayendo paginas: {len(pending)} pares", flush=True)
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(process_pair, row, predio_cache, incidencia_cache, use_page_cache): row
            for row in pending
        }
        for future in as_completed(futures):
            row = futures[future]
            try:
                result, related, row_errors = future.result()
                for col, value in row.items():
                    if col not in result:
                        result[col] = value
                main_rows.append(result)
                for name, rel_list in related.items():
                    related_rows[name].extend(rel_list)
                for err in row_errors:
                    err.update({"Numero_Predio": row["Numero_Predio"], "Numero_Incidencia": row["Numero_Incidencia"]})
                    errors.append(err)
            except Exception as exc:
                errors.append(
                    {
                        "Tipo": "General",
                        "Numero_Predio": row.get("Numero_Predio", ""),
                        "Numero_Incidencia": row.get("Numero_Incidencia", ""),
                        "Error": str(exc),
                    }
                )
            done += 1
            if done % 25 == 0 or done == len(pending):
                print(f"  paginas: {done}/{len(pending)}", flush=True)

    metadata = {
        "input": str(input_path.resolve()),
        "output": str(output_path.resolve()),
        "pares": len(rows),
        "workers": args.workers,
        "url_base": URL_BASE,
        "page_cache": str(PAGES_DIR.resolve()),
        "assignment_source": str(Path(args.assignment_source).resolve()) if args.assignment_source else "",
        "template_output": str(Path(args.template_output).resolve()) if args.template_output else "",
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    if args.template_output:
        create_input_template(Path(args.template_output), overwrite=True)
    write_excel(output_path, main_rows, related_rows, errors, metadata, args.assignment_source)

    print("\nCompletado.", flush=True)
    print(f"Salida: {output_path.resolve()}", flush=True)
    print(f"Filas Datos_Completos: {len(main_rows)}", flush=True)
    print(f"Cronogramas rows: {len(related_rows['Cronogramas_Originados'])}", flush=True)
    print(f"Errores: {len(errors)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
