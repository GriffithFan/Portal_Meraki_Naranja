"""Auto-lanza un predio en Salesforce a partir de la NI y el usuario THNET.

Resuelve solo: NI -> incidencia -> lista de cronogramas LAC_M (en orden) ->
elige el ULTIMO -> su sub-cronograma LAC_EQs -> setea Instalador Responsable +
Orden de Trabajo='Lanzada' en el LAC_M e Instalador en el LAC_EQs.

Optimizado: cachea la sesion (cookies) para saltear el login en llamadas
siguientes, y usa esperas explicitas en vez de sleeps fijos en la navegacion.

Uso:  lanzar_predio_ni.py <NI> "<THNET Cxx>" [--dry-run]
--dry-run: NO guarda; solo informa que cronograma lanzaria (para validar la regla).

Imprime SIEMPRE una ultima linea:  RESULT_JSON: { ... }
"""
import os, re, sys, json, time
from urllib.parse import quote_plus
from salesforce_auth import load_config, crear_driver, login
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

FLD_INSTALADOR = "CF00N1I0000061Omw"   # lookup Instalador Responsable
FLD_ORDEN = "00N1I00000BPdvM"          # select Orden de Trabajo
OUT = "/tmp/lz"; os.makedirs(OUT, exist_ok=True)
COOKIE_FILE = "/tmp/sf_cookies.json"


def out(obj):
    print("RESULT_JSON: " + json.dumps(obj, ensure_ascii=False), flush=True)


def shot(d, n):
    try:
        d.save_screenshot(f"{OUT}/{n}.png")
        open(f"{OUT}/{n}.html", "w", encoding="utf-8").write(d.page_source)
    except Exception:
        pass


def wait_ready(d, timeout=25):
    try:
        WebDriverWait(d, timeout).until(lambda x: x.execute_script("return document.readyState") == "complete")
    except Exception:
        pass
    time.sleep(0.2)


def es_pagina_login(d):
    try:
        if "login" in (d.current_url or "").lower():
            return True
        return bool(d.find_elements(By.ID, "username") or d.find_elements(By.NAME, "username"))
    except Exception:
        return False


def guardar_cookies(d):
    try:
        json.dump(d.get_cookies(), open(COOKIE_FILE, "w"))
    except Exception:
        pass


def cargar_cookies():
    try:
        return json.load(open(COOKIE_FILE))
    except Exception:
        return None


def inyectar_cookies(d, base, cookies):
    """Carga el dominio (para poder setear cookies) e inyecta las cacheadas."""
    try:
        d.get(base)
    except Exception:
        pass
    wait_ready(d, 15)
    for c in cookies or []:
        ck = {"name": c.get("name"), "value": c.get("value")}
        if not ck["name"]:
            continue
        if c.get("path"):
            ck["path"] = c["path"]
        if c.get("domain"):
            ck["domain"] = c["domain"]
        if c.get("secure") is not None:
            ck["secure"] = c["secure"]
        try:
            d.add_cookie(ck)
        except Exception:
            ck.pop("domain", None)
            try:
                d.add_cookie(ck)
            except Exception:
                pass


def detalle_valor(html, label):
    m = re.search(r">\s*" + re.escape(label) + r"\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.S)
    return re.sub(r"<[^>]+>", " ", m.group(1)).strip()[:80] if m else ""


def cid_de(href):
    m = re.search(r"/(a0[0-9A-Za-z]{12,15})", href or "")
    return m.group(1) if m else ""


def listar_cronos(d, distinto_de=None):
    vistos = {}
    orden = []
    for a in d.find_elements(By.PARTIAL_LINK_TEXT, "Cronograma"):
        t = (a.text or "").strip()
        href = a.get_attribute("href") or ""
        if not re.match(r"^Cronograma\s+\d+", t) or not href:
            continue
        cid = cid_de(href)
        if not cid:
            continue
        row = ""
        try:
            tr = a.find_element(By.XPATH, "./ancestor::tr[1]")
            row = (tr.text or "").replace("\n", " ")
        except Exception:
            pass
        if cid not in vistos:
            vistos[cid] = {"id": cid, "nombre": t, "href": href, "row": row}
            orden.append(cid)
        else:
            if href and not href.rstrip("/").endswith("/e"):
                vistos[cid]["href"] = href
            if len(row) > len(vistos[cid]["row"]):
                vistos[cid]["row"] = row
    for cid in orden:
        c = vistos[cid]
        up = c["row"].upper()
        c["es_lacm"] = "LAC_M" in up
        c["es_laceq"] = "LAC_EQ" in up
    return [vistos[c] for c in orden if not (distinto_de and c == distinto_de)]


def filtrar_lacm(cronos):
    con_tipo = [c for c in cronos if c["es_lacm"] or c["es_laceq"]]
    if any(c["es_lacm"] for c in cronos):
        return [c for c in cronos if c["es_lacm"]]
    if con_tipo:
        return [c for c in cronos if not c["es_laceq"]]
    return cronos


def set_instalador(d, valor):
    inp = WebDriverWait(d, 25).until(EC.presence_of_element_located((By.ID, FLD_INSTALADOR)))
    d.execute_script("arguments[0].value='';", inp)
    try:
        d.execute_script(f"var e=document.getElementById('{FLD_INSTALADOR}_lkid'); if(e) e.value='';")
    except Exception:
        pass
    inp.click()
    for ch in valor:
        inp.send_keys(ch)
        time.sleep(0.12)
    time.sleep(2.5)
    item = None
    sel = ".autoCompleteRow a, .autoCompleteRow, .autoCompleteBoxScrolling a, a.autocompleteMatch"
    for el in d.find_elements(By.CSS_SELECTOR, sel):
        try:
            if el.is_displayed() and (el.text or "").strip() == valor:
                item = el
                break
        except Exception:
            continue
    if item is None:
        for el in d.find_elements(By.TAG_NAME, "a"):
            try:
                if el.is_displayed() and (el.text or "").strip() == valor:
                    item = el
                    break
            except Exception:
                continue
    if item is None:
        raise RuntimeError(f"No aparecio el item de autocompletado para '{valor}'")
    d.execute_script("arguments[0].click();", item)
    time.sleep(1.5)
    lkid = d.execute_script(f"var e=document.getElementById('{FLD_INSTALADOR}_lkid'); return e? e.value : '';")
    txt = d.find_element(By.ID, FLD_INSTALADOR).get_attribute("value")
    if not lkid or valor.lower() not in (txt or "").lower():
        raise RuntimeError(f"Lookup NO resolvio (texto='{txt}', lkid='{lkid}')")


def guardar(d):
    btn = d.find_element(By.CSS_SELECTOR, "input[name='save']")
    d.execute_script("arguments[0].click();", btn)
    time.sleep(4)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if len(args) < 2:
        out({"ok": False, "estado": "ARGS", "error": "uso: <NI> <THNET> [--dry-run]"})
        return
    ni, instalador = args[0], args[1]
    cfg = load_config()
    base = cfg.url_base.rstrip("/")
    d = crear_driver(headless=True)
    d.set_page_load_timeout(70)
    try:
        search_url = base + "/_ui/search/ui/UnifiedSearchResults?searchType=2&sen=a0H&str=" + quote_plus(ni)

        # --- Sesion: reusar cookies cacheadas; si no valen, login completo ---
        cookies = cargar_cookies()
        autenticado = False
        if cookies:
            inyectar_cookies(d, base, cookies)
            d.get(search_url)
            wait_ready(d)
            autenticado = not es_pagina_login(d)
        if not autenticado:
            # sin cookies (o expiradas): login completo, sin sonda desperdiciada
            if not login(d, cfg):
                out({"ok": False, "estado": "LOGIN", "error": "login fallo"})
                return
            guardar_cookies(d)
            d.get(search_url)
            wait_ready(d)
        else:
            guardar_cookies(d)  # refrescar TTL del cache

        # 1) NI -> incidencia
        m = re.search(r"/(a0H[0-9A-Za-z]{12,15})", d.page_source)
        inc_id = m.group(1) if m else ""
        if not inc_id:
            out({"ok": False, "estado": "SIN_INCIDENCIA", "error": f"no se encontro incidencia para {ni}", "ni": ni})
            return

        # 2) incidencia -> cronogramas LAC_M en orden -> el ULTIMO
        d.get(base + "/" + inc_id)
        wait_ready(d)
        todos = listar_cronos(d)
        lacms = filtrar_lacm(todos)
        if not lacms:
            out({"ok": False, "estado": "SIN_CRONOGRAMA", "error": "la incidencia no tiene cronogramas LAC_M", "inc_id": inc_id})
            return
        elegido = lacms[-1]
        lacm_id = elegido["id"]

        # 3) LAC_M elegido: estado/orden + sub-cronograma LAC_EQs
        d.get(base + "/" + lacm_id)
        wait_ready(d)
        h = d.page_source
        est = detalle_valor(h, "Estado")
        orden_tr = detalle_valor(h, "Orden de Trabajo")
        inst_actual = detalle_valor(h, "Instalador Responsable")
        subs = listar_cronos(d, distinto_de=lacm_id)
        laceq = None
        for s in subs:
            if s["es_laceq"]:
                laceq = s
                break
        if laceq is None and subs:
            laceq = subs[0]
        laceq_id = laceq["id"] if laceq else ""

        plan = {
            "ni": ni, "inc_id": inc_id, "instalador": instalador,
            "lacm_id": lacm_id, "lacm_nombre": elegido["nombre"],
            "lacm_estado": est, "orden_trabajo_actual": orden_tr, "instalador_actual": inst_actual,
            "laceq_id": laceq_id, "laceq_nombre": (laceq["nombre"] if laceq else ""),
            "total_lacm": len(lacms),
            "lista_lacm": [{"nombre": c["nombre"], "id": c["id"], "row": c["row"][:120]} for c in lacms],
        }

        if not laceq_id:
            out({"ok": False, "estado": "SIN_LACEQ", "error": "no se encontro sub-cronograma LAC_EQs", **plan})
            return

        ya_lanzado = (orden_tr.strip().lower() == "lanzada") and (instalador.lower() in (inst_actual or "").lower())

        if dry:
            out({"ok": True, "estado": "DRY_RUN", "ya_lanzado": ya_lanzado, **plan})
            return
        if ya_lanzado:
            out({"ok": True, "estado": "YA_LANZADO", "ya_lanzado": True, **plan})
            return

        # 4) LAC_M: instalador + Orden de Trabajo = Lanzada
        d.get(f"{base}/{lacm_id}/e")
        wait_ready(d)
        set_instalador(d, instalador)
        Select(d.find_element(By.NAME, FLD_ORDEN)).select_by_visible_text("Lanzada")
        shot(d, "lacm_pre")
        guardar(d)
        d.get(f"{base}/{lacm_id}")
        wait_ready(d)
        h2 = d.page_source
        inst2 = detalle_valor(h2, "Instalador Responsable")
        orden2 = detalle_valor(h2, "Orden de Trabajo")
        if instalador.lower() not in inst2.lower() or orden2.strip().lower() != "lanzada":
            out({"ok": False, "estado": "LACM_NO_QUEDO", "error": f"LAC_M quedo Instalador='{inst2}' Orden='{orden2}'", **plan})
            return

        # 5) LAC_EQs: solo instalador
        d.get(f"{base}/{laceq_id}/e")
        wait_ready(d)
        set_instalador(d, instalador)
        shot(d, "laceq_pre")
        guardar(d)
        d.get(f"{base}/{laceq_id}")
        wait_ready(d)
        inst3 = detalle_valor(d.page_source, "Instalador Responsable")
        if instalador.lower() not in inst3.lower():
            out({"ok": False, "estado": "LACEQ_NO_QUEDO", "error": f"LAC_EQs quedo Instalador='{inst3}'", **plan})
            return

        out({"ok": True, "estado": "LANZADO", **plan})
    except Exception as e:
        out({"ok": False, "estado": "EXCEPCION", "error": str(e)[:300]})
    finally:
        d.quit()


if __name__ == "__main__":
    main()
