"""Genera UN acta a partir del numero de predio (para Carrot, corre en el VPS).

Flujo: resuelve el predio -> id de Salesforce (001...), abre el registro,
extrae los campos y llena el template Word. Imprime una unica linea
`RESULT_JSON: {...}` con la ruta del .docx generado (o el error).

Uso:  generar_acta_uno.py <numero_predio> [incidencia]

Credenciales: usa las del .env del server (SALESFORCE_URL_BASE/USERNAME/PASSWORD)
si estan presentes; si no, cae a las del modulo Script_para_llenar_actas.
Reusa la cookie-cache /tmp/sf_cookies.json (sesion tibia compartida con el
resto de la infra de Salesforce del VPS) para arrancar rapido.
"""
import os
import re
import sys
import json
import time
from urllib.parse import quote_plus

# stdout/stderr en UTF-8 (el modulo imprime emojis; evita UnicodeEncodeError en Linux).
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
from selenium import webdriver
from selenium.webdriver.common.by import By

import Script_para_llenar_actas as actas

# --- Config desde el entorno (respaldo: lo hardcodeado en el modulo) ---
if os.getenv("SALESFORCE_USERNAME"):
    actas.USERNAME = os.environ["SALESFORCE_USERNAME"]
if os.getenv("SALESFORCE_PASSWORD"):
    actas.PASSWORD = os.environ["SALESFORCE_PASSWORD"]
if os.getenv("SALESFORCE_URL_BASE"):
    actas.URL_BASE = os.environ["SALESFORCE_URL_BASE"]

BASE = actas.URL_BASE.rstrip("/")
OUT_DIR = os.getenv("ACTAS_OUT_DIR", "/tmp/actas")
TEMPLATE = os.getenv(
    "ACTAS_TEMPLATE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), actas.WORD_TEMPLATE),
)
COOKIE_FILE = os.getenv("SF_COOKIE_FILE", "/tmp/sf_cookies.json")


def emit(obj):
    print("RESULT_JSON: " + json.dumps(obj, ensure_ascii=False), flush=True)


def crear_driver_linux():
    o = webdriver.ChromeOptions()
    o.page_load_strategy = "eager"
    o.add_argument("--headless=new")
    o.add_argument("--window-size=1920,1080")
    o.add_argument("--no-sandbox")
    o.add_argument("--disable-dev-shm-usage")
    o.add_argument("--disable-gpu")
    o.add_argument("--disable-notifications")
    o.add_argument("--disable-extensions")
    o.add_argument("--disable-background-networking")
    o.add_experimental_option("prefs", {"profile.managed_default_content_settings.images": 2})
    d = webdriver.Chrome(options=o)
    d.implicitly_wait(0)
    d.set_page_load_timeout(75)
    return d


def cargar_cookies():
    try:
        with open(COOKIE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def guardar_cookies(driver):
    try:
        with open(COOKIE_FILE, "w", encoding="utf-8") as f:
            json.dump(driver.get_cookies(), f)
    except Exception:
        pass


def inyectar_cookies(driver, cookies):
    try:
        driver.get(BASE + "/")
    except Exception:
        pass
    time.sleep(1)
    for c in cookies or []:
        nombre = c.get("name")
        if not nombre:
            continue
        ck = {"name": nombre, "value": c.get("value", "")}
        if c.get("path"):
            ck["path"] = c["path"]
        if c.get("domain"):
            ck["domain"] = c["domain"]
        try:
            driver.add_cookie(ck)
        except Exception:
            ck.pop("domain", None)
            try:
                driver.add_cookie(ck)
            except Exception:
                pass


def parece_login(driver):
    try:
        url = (driver.current_url or "").lower()
        if "login" in url:
            return True
        return bool(driver.find_elements(By.ID, "username") or driver.find_elements(By.NAME, "username"))
    except Exception:
        return False


def _nombre_cuenta(html):
    """Lee el campo 'Nombre de la cuenta' de la ficha de un predio."""
    pat = re.compile(
        r'<td[^>]*class="[^"]*labelCol[^"]*"[^>]*>\s*Nombre de la cuenta\s*</td>\s*<td[^>]*>(.*?)</td>',
        re.I | re.S,
    )
    m = pat.search(html)
    if not m:
        return ""
    txt = re.sub(r"<[^>]+>", " ", m.group(1))
    txt = txt.replace("&nbsp;", " ").split("[")[0]
    return re.sub(r"\s+", " ", txt).strip()


def resolver_id(driver, predio):
    """predio -> record id 001... VERIFICANDO que la cuenta sea la pedida.

    Antes se tomaba el primer id que apareciera en el HTML de la busqueda, y la
    busqueda de Salesforce trae coincidencias parciales y vistos recientemente:
    eso generaba actas con los datos de otro establecimiento.
    """
    s = requests.Session()
    for c in driver.get_cookies():
        try:
            s.cookies.set(c["name"], c.get("value", ""), domain=c.get("domain"), path=c.get("path", "/"))
        except Exception:
            pass

    urls = [
        BASE + "/_ui/search/ui/UnifiedSearchResults?searchType=2&sen=001&str=" + quote_plus(predio),
        BASE + "/_ui/search/ui/UnifiedSearchResults?searchType=2&str=" + quote_plus(predio),
    ]
    exactos, todos = [], []
    for url in urls:
        html = ""
        try:
            html = s.get(url, timeout=25).text
        except Exception:
            try:
                driver.get(url)
                time.sleep(2)
                html = driver.page_source
            except Exception:
                continue
        # el link cuyo texto visible es exactamente el numero de predio
        for m in re.finditer(r'href="[^"]*/(001[0-9A-Za-z]{12,15})[^"]*"[^>]*>(.*?)</a>', html, re.S):
            visible = re.sub(r"<[^>]+>", "", m.group(2))
            visible = visible.replace("&nbsp;", " ").strip()
            if visible == predio and m.group(1) not in exactos:
                exactos.append(m.group(1))
        for m in re.finditer(r"/(001[0-9A-Za-z]{12,15})", html):
            if m.group(1) not in todos:
                todos.append(m.group(1))

    # verificar abriendo la ficha: el nombre de la cuenta debe ser el predio pedido
    for cid in exactos + [c for c in todos if c not in exactos][:8]:
        try:
            html = s.get(BASE + "/" + cid, timeout=25).text
        except Exception:
            continue
        if _nombre_cuenta(html) == predio:
            return cid

    # nada verificado: mejor fallar que emitir un acta de otro predio
    return None


def _labels(html, prefijo=""):
    """label -> valor de una ficha de Salesforce."""
    out = {}
    pat = re.compile(
        r'<td[^>]*class="[^"]*labelCol[^"]*"[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>',
        re.I | re.S,
    )
    for m in pat.finditer(html):
        lab = re.sub(r"<[^>]+>", " ", m.group(1)).replace("&nbsp;", " ")
        lab = re.sub(r"\s+", " ", lab).strip()
        val = re.sub(r"<[^>]+>", " ", m.group(2)).replace("&nbsp;", " ")
        val = re.sub(r"\s+", " ", val).split("[")[0].strip()
        if lab and lab not in out:
            out[lab] = val
    return out


def _sesion_http(driver):
    """Una sesion requests con las cookies del navegador."""
    s = requests.Session()
    for c in driver.get_cookies():
        try:
            s.cookies.set(c["name"], c.get("value", ""), domain=c.get("domain"), path=c.get("path", "/"))
        except Exception:
            pass
    return s


def incidencias_del_predio(s, record_id):
    """[(id, NI)] de las incidencias que lista la ficha de un predio."""
    if not record_id:
        return []
    try:
        html = s.get(BASE + "/" + record_id, timeout=25).text
    except Exception:
        return []
    out = []
    for m in re.finditer(r'href="[^"]*/(a0H[0-9A-Za-z]{12,15})[^"]*"[^>]*>(.*?)</a>', html, re.S):
        visible = re.sub(r"<[^>]+>", "", m.group(2)).replace("&nbsp;", " ").strip()
        mm = re.search(r"NI-\d+", visible)
        if mm and (m.group(1), mm.group(0)) not in out:
            out.append((m.group(1), mm.group(0)))
    return out


def _campos_de_incidencia(s, cid, numero):
    """Lee la ficha de la incidencia y devuelve sus datos, o {} si no es la pedida."""
    try:
        v = _labels(s.get(BASE + "/" + cid, timeout=25).text)
    except Exception:
        return {}
    leido = v.get("Numero de Incidencia") or v.get("Número de Incidencia") or ""
    if numero not in leido:
        return {}
    depto = v.get("Departamento", "")
    dir_full = v.get("Direccion", "") or v.get("Dirección", "")
    # "CALLE 123 LOCALIDAD, Provincia 6450 Argentina" -> calle sola
    calle = dir_full.split(",")[0].strip()
    if depto and calle.upper().endswith(depto.upper()):
        calle = calle[: -len(depto)].strip()
    return {"escuela": v.get("Nombre Escuela", ""), "direccion": calle,
            "localidad": depto, "provincia": v.get("Provincia", "")}


def datos_incidencia(driver, numero, record_id=None):
    """Datos del establecimiento SEGUN LA INCIDENCIA (no segun el primer CUE).

    Un predio puede tener varias escuelas asociadas; la incidencia dice cual hay
    que intervenir. Devuelve {} si no se puede resolver.

    Se entra POR LA FICHA DEL PREDIO, no por el buscador. La cuenta con la que
    corre esto en el VPS no tiene permiso para buscar incidencias —el objeto no
    esta indexado para su perfil y la busqueda devuelve cero siempre, aunque la
    incidencia exista—, pero si puede abrir la ficha cuando llega por el link que
    figura en el predio o por el id directo. La busqueda queda como respaldo para
    las cuentas que si pueden usarla.
    """
    if not numero:
        return {}
    s = _sesion_http(driver)

    # 1) el camino que siempre funciona: la lista de incidencias del predio
    for cid, ni in incidencias_del_predio(s, record_id):
        if ni == numero:
            datos = _campos_de_incidencia(s, cid, numero)
            if datos:
                return datos

    # 2) respaldo: el buscador (solo sirve con cuentas que lo tengan habilitado)
    try:
        html = s.get(BASE + "/_ui/search/ui/UnifiedSearchResults?searchType=2&sen=a0H&str="
                     + quote_plus(numero), timeout=25).text
    except Exception:
        return {}
    cands = []
    for m in re.finditer(r'href="[^"]*/(a0H[0-9A-Za-z]{12,15})[^"]*"[^>]*>(.*?)</a>', html, re.S):
        visible = re.sub(r"<[^>]+>", "", m.group(2)).replace("&nbsp;", " ").strip()
        if numero in visible and m.group(1) not in cands:
            cands.append(m.group(1))
    for m in re.finditer(r"/(a0H[0-9A-Za-z]{12,15})", html):
        if m.group(1) not in cands:
            cands.append(m.group(1))
    for cid in cands[:6]:
        datos = _campos_de_incidencia(s, cid, numero)
        if datos:
            return datos
    return {}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        emit({"ok": False, "error": "Falta el numero de predio."})
        return
    predio = re.sub(r"[^0-9]", "", args[0])
    incidencia = (args[1].strip() if len(args) > 1 else "")
    if not predio:
        emit({"ok": False, "error": "Numero de predio invalido."})
        return
    if not os.path.exists(TEMPLATE):
        emit({"ok": False, "error": f"No se encuentra el template: {TEMPLATE}"})
        return
    os.makedirs(OUT_DIR, exist_ok=True)

    driver = None
    try:
        driver = crear_driver_linux()

        # Sesion tibia con la cookie-cache; si no sirve, login completo.
        autenticado = False
        cookies = cargar_cookies()
        if cookies:
            inyectar_cookies(driver, cookies)
            try:
                driver.get(BASE + "/")
                time.sleep(1)
            except Exception:
                pass
            autenticado = not parece_login(driver)
        if not autenticado:
            # Cookies vencidas/ausentes: limpiar (las stale confunden el form de login)
            # y hacer login limpio, igual que el extractor que funciona.
            try:
                driver.delete_all_cookies()
            except Exception:
                pass
            if not actas.login(driver):
                emit({"ok": False, "error": "No se pudo iniciar sesion en Salesforce."})
                return
        guardar_cookies(driver)

        record_id = resolver_id(driver, predio)
        if not record_id:
            emit({"ok": False, "error": f"No se encontro el predio {predio} en Salesforce."})
            return

        actas.ir_a_registro(driver, record_id)
        data = actas.extraer_campos_predio(driver, record_id=record_id)
        data["Numero_Incidencia"] = incidencia

        # El predio puede tener VARIAS escuelas (varios CUEs) y extraer_campos_predio
        # toma la primera de la lista. Si tenemos la incidencia, ella define cual es
        # el establecimiento a intervenir: sus datos tienen prioridad.
        if incidencia:
            try:
                di = datos_incidencia(driver, incidencia, record_id=record_id)
                if di.get("escuela"):
                    data["Establecimiento"] = di["escuela"]
                if di.get("direccion"):
                    data["Direccion"] = di["direccion"]
                if di.get("localidad"):
                    data["Localidad"] = di["localidad"]
                if di.get("provincia"):
                    data["Provincia"] = di["provincia"]
                if di:
                    print("[DEBUG] datos tomados de la incidencia %s: %s / %s"
                          % (incidencia, di.get("escuela", ""), di.get("localidad", "")))
            except Exception as e:
                print("[DEBUG] no se pudieron leer los datos de la incidencia: %s" % str(e)[:80])
        if not data.get("Numero de Predio"):
            data["Numero de Predio"] = predio

        num = data.get("Numero de Predio") or predio
        nombre_archivo = f"Acta_{num}.docx"
        out_path = os.path.join(OUT_DIR, nombre_archivo)
        actas.rellenar_word(TEMPLATE, data, out_path)

        if not os.path.exists(out_path):
            emit({"ok": False, "error": "El acta no se genero (no existe el archivo de salida)."})
            return

        emit({
            "ok": True,
            "predio": num,
            "incidencia": incidencia,
            "recordId": record_id,
            "docx": out_path,
            "nombreArchivo": nombre_archivo,
            "establecimiento": data.get("Establecimiento", ""),
            "cue": data.get("CUE", ""),
        })
    except Exception as e:
        emit({"ok": False, "error": str(e)[:400]})
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass


if __name__ == "__main__":
    main()
