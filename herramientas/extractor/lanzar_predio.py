"""Lanza un cronograma en Salesforce: setea Instalador Responsable y pasa la
Orden de Trabajo a 'Lanzada' en el LAC_M, y el mismo instalador en el LAC_EQs.
Con verificación: aborta si el lookup no resolvió o si el guardado no quedó.

Uso: lanzar_predio.py <crono_lacm_id> <crono_laceq_id> "<INSTALADOR>"
"""
import os, re, sys, time
from salesforce_auth import load_config, crear_driver, login
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

OUT = "/tmp/lz"; os.makedirs(OUT, exist_ok=True)
FLD_INSTALADOR = "CF00N1I0000061Omw"     # lookup Instalador Responsable
FLD_ORDEN = "00N1I00000BPdvM"            # select Orden de Trabajo

def shot(d, n):
    try: d.save_screenshot(f"{OUT}/{n}.png"); open(f"{OUT}/{n}.html","w",encoding="utf-8").write(d.page_source)
    except Exception: pass

def detalle_valor(html, label):
    m = re.search(r">\s*"+re.escape(label)+r"\s*</td>\s*<td[^>]*>(.*?)</td>", html, re.S)
    return re.sub(r"<[^>]+>"," ",m.group(1)).strip()[:60] if m else ""

def set_instalador(d, valor):
    inp = WebDriverWait(d, 25).until(EC.presence_of_element_located((By.ID, FLD_INSTALADOR)))
    d.execute_script("arguments[0].value='';", inp)
    try: d.execute_script(f"var e=document.getElementById('{FLD_INSTALADOR}_lkid'); if(e) e.value='';")
    except Exception: pass
    inp.click()
    for ch in valor:
        inp.send_keys(ch); time.sleep(0.12)
    time.sleep(2.5)
    shot(d, "ac_instalador")
    # El item resalta el match (texto partido con <strong>): comparo el texto
    # COMPLETO del elemento (Selenium .text), no el nodo directo.
    item = None
    sel = ".autoCompleteRow a, .autoCompleteRow, .autoCompleteBoxScrolling a, a.autocompleteMatch"
    for el in d.find_elements(By.CSS_SELECTOR, sel):
        try:
            if el.is_displayed() and (el.text or "").strip() == valor:
                item = el; break
        except Exception: continue
    if item is None:  # fallback: cualquier link visible con ese texto exacto
        for el in d.find_elements(By.TAG_NAME, "a"):
            try:
                if el.is_displayed() and (el.text or "").strip() == valor:
                    item = el; break
            except Exception: continue
    if item is None:
        raise RuntimeError(f"No apareció el item de autocompletado para '{valor}'")
    d.execute_script("arguments[0].click();", item)
    time.sleep(1.5)
    # verificar que el lookup quedó resuelto (_lkid no vacío) y el texto correcto
    lkid = d.execute_script(f"var e=document.getElementById('{FLD_INSTALADOR}_lkid'); return e? e.value : '';")
    txt = d.find_element(By.ID, FLD_INSTALADOR).get_attribute("value")
    print(f"   instalador -> texto='{txt}' lkid='{lkid}'", flush=True)
    if not lkid or valor.lower() not in (txt or "").lower():
        raise RuntimeError(f"Lookup NO resolvió (texto='{txt}', lkid='{lkid}')")

def xpath_lit(s):
    if '"' not in s: return f'"{s}"'
    if "'" not in s: return f"'{s}'"
    return "concat('" + s.replace("'", "',\"'\",'") + "')"

def guardar(d):
    btn = d.find_element(By.CSS_SELECTOR, "input[name='save']")
    d.execute_script("arguments[0].click();", btn)
    time.sleep(4)

def main():
    lacm_id, laceq_id, instalador = sys.argv[1], sys.argv[2], sys.argv[3]
    cfg = load_config()
    d = crear_driver(headless=True); d.set_page_load_timeout(70)
    try:
        assert login(d, cfg), "login falló"
        base = cfg.url_base.rstrip("/")

        # ---- 1) LAC_M: instalador + Orden de Trabajo = Lanzada ----
        print(f"[LAC_M {lacm_id}] abriendo edición...", flush=True)
        d.get(f"{base}/{lacm_id}/e"); time.sleep(3)
        set_instalador(d, instalador)
        Select(d.find_element(By.NAME, FLD_ORDEN)).select_by_visible_text("Lanzada")
        print("   orden de trabajo -> Lanzada", flush=True)
        shot(d, "lacm_pre_guardar")
        guardar(d)

        # verificar
        d.get(f"{base}/{lacm_id}"); time.sleep(3)
        h = d.page_source
        inst = detalle_valor(h, "Instalador Responsable"); orden = detalle_valor(h, "Orden de Trabajo")
        print(f"[LAC_M] tras guardar -> Instalador='{inst}' | Orden='{orden}'", flush=True)
        if instalador.lower() not in inst.lower() or orden.strip().lower() != "lanzada":
            raise RuntimeError("LAC_M no quedó como esperado; NO sigo con LAC_EQs.")

        # ---- 2) LAC_EQs: solo instalador ----
        print(f"[LAC_EQs {laceq_id}] abriendo edición...", flush=True)
        d.get(f"{base}/{laceq_id}/e"); time.sleep(3)
        set_instalador(d, instalador)
        shot(d, "laceq_pre_guardar")
        guardar(d)
        d.get(f"{base}/{laceq_id}"); time.sleep(3)
        inst2 = detalle_valor(d.page_source, "Instalador Responsable")
        print(f"[LAC_EQs] tras guardar -> Instalador='{inst2}'", flush=True)
        ok = instalador.lower() in inst2.lower()
        print("\nRESULTADO:", "OK ✅" if ok else "REVISAR ⚠️", flush=True)
    finally:
        d.quit()

if __name__ == "__main__":
    main()
