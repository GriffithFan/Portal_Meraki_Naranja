"""Genera las actas de una LISTA de predios, en una sola pasada.

Uso:  generar_actas_lote.py <archivo-con-la-lista> [carpeta-de-salida] [--continuar]

El archivo puede ser .csv, .txt o .xlsx. Se toma la columna PREDIO si existe; si no,
la primera columna. Sirve tal cual el CSV que exporta Carrot.

Por que existe teniendo `generar_acta_uno.py`: ese abre un Chrome, hace login y lo cierra
para CADA predio. Con una lista de cincuenta eso son cincuenta arranques de navegador y
cincuenta logins — mas de una hora. Aca se abre una sola sesion y se recorre la lista,
que es la diferencia entre que la herramienta se use o no.

Con `--continuar` saltea los predios que ya tienen su .docx en la carpeta de salida, asi
una corrida larga que se corto se retoma donde iba en vez de rehacerla entera.

Al terminar deja en la carpeta de salida:
  Acta_<predio>.docx      una por predio que salio bien
  resumen.csv             que paso con cada uno, incluidos los que fallaron
  IMPRIMIR TODAS.bat      manda las actas a la impresora predeterminada
"""
import os
import re
import sys
import csv
import json
import time
from datetime import datetime

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)

import Script_para_llenar_actas as actas
import generar_acta_uno as uno

# Credenciales desde el entorno, igual que el resto de las herramientas.
for var, attr in [("SALESFORCE_USERNAME", "USERNAME"), ("SALESFORCE_PASSWORD", "PASSWORD"),
                  ("SALESFORCE_URL_BASE", "URL_BASE")]:
    if os.getenv(var):
        setattr(actas, attr, os.environ[var])

TEMPLATE = os.path.join(AQUI, actas.WORD_TEMPLATE)


def leer_lista(ruta):
    """Numeros de predio del archivo, y la incidencia de cada uno si viene.

    Devuelve (predios, {predio: NI}). La incidencia se busca por patron en la misma
    fila en vez de por nombre de columna: asi sirve igual el CSV que exporta Carrot,
    un txt pegado a mano o un xlsx con las columnas en otro orden.
    """
    ext = os.path.splitext(ruta)[1].lower()
    filas = []
    lineas_crudas = []
    if ext in (".xlsx", ".xlsm"):
        import openpyxl
        wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
        for ws in wb.worksheets:
            it = ws.iter_rows(values_only=True)
            cab = next(it, None)
            if not cab:
                continue
            idx = 0
            for i, c in enumerate(cab):
                if str(c or "").strip().upper() in ("PREDIO", "NUMERO_PREDIO", "NRO PREDIO"):
                    idx = i
                    break
            else:
                # Sin cabecera reconocible: la primera fila tambien es un dato.
                if str(cab[0] or "").strip().isdigit():
                    filas.append(str(cab[0]).strip())
            for r in it:
                if r and r[idx] is not None:
                    filas.append(str(r[idx]).strip())
                    lineas_crudas.append(" ".join(str(c) for c in r if c is not None))
    else:
        with open(ruta, "r", encoding="utf-8-sig", errors="replace") as fh:
            texto = fh.read()
        # Separador: ; o , o salto de linea. Se toma el primer campo de cada linea.
        for linea in texto.splitlines():
            if not linea.strip():
                continue
            primero = re.split(r"[;,\t]", linea)[0].strip().strip('"')
            filas.append(primero)
            lineas_crudas.append(linea)

    # Solo numeros, sin repetidos, conservando el orden.
    vistos = set()
    salida = []
    incidencias = {}
    for i, f in enumerate(filas):
        n = re.sub(r"[^0-9]", "", f)
        if len(n) < 5 or n in vistos:
            continue
        vistos.add(n)
        salida.append(n)
        cruda = lineas_crudas[i] if i < len(lineas_crudas) else ""
        m = re.search(r"NI-?(\d{6,})", cruda, re.I)
        if m:
            incidencias[n] = "NI-" + m.group(1)
    return salida, incidencias


def bat_imprimir(carpeta):
    """Deja un .bat que manda todas las actas a la impresora predeterminada."""
    contenido = """@echo off
chcp 65001 >nul
title Imprimir todas las actas
cd /d "%~dp0"

set /a TOTAL=0
for %%f in (Acta_*.docx) do set /a TOTAL+=1
if %TOTAL%==0 (
  echo  No hay actas en esta carpeta.
  pause & exit /b 1
)

echo.
echo  Se van a imprimir %TOTAL% actas en la impresora predeterminada.
echo  Para cambiarla: Configuracion ^> Bluetooth y dispositivos ^> Impresoras.
echo.
set /p SEGURO="  Continuar? (S/N): "
if /i not "%SEGURO%"=="S" exit /b 0

echo.
rem Se imprime con el programa asociado al .docx (Word). Word tiene que estar instalado.
rem Se espera entre una y otra: si se mandan todas de golpe, Word se satura y pierde
rem trabajos silenciosamente.
for %%f in (Acta_*.docx) do (
  echo   imprimiendo %%f
  powershell -NoProfile -Command "Start-Process -FilePath '%%~ff' -Verb Print -PassThru | Out-Null"
  timeout /t 3 /nobreak >nul
)

echo.
echo  Listo: %TOTAL% actas enviadas a la cola de impresion.
echo  Si alguna no sale, revisa la cola de la impresora.
pause
"""
    with open(os.path.join(carpeta, "IMPRIMIR TODAS.bat"), "w", encoding="utf-8") as fh:
        fh.write(contenido)


CAMPOS_RESUMEN = ["predio", "estado", "archivo", "establecimiento"]


def escribir_resumen(carpeta, resultados):
    """Se reescribe despues de cada predio: si la corrida se corta, el registro queda."""
    with open(os.path.join(carpeta, "resumen.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CAMPOS_RESUMEN, delimiter=";")
        w.writeheader()
        w.writerows(resultados)


def reabrir_sesion(driver):
    """Salesforce corta la sesion sola en corridas largas. Devuelve True si la recupero."""
    try:
        driver.get(actas.URL_BASE)
        if not uno.parece_login(driver):
            return False          # la sesion estaba bien; el fallo era del predio
        print("   ... la sesion de Salesforce se cayo, entrando de nuevo")
        actas.login(driver)
        uno.guardar_cookies(driver)
        return True
    except Exception as e:
        print(f"   ... no se pudo reabrir la sesion: {str(e)[:80]}")
        return False


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    continuar = "--continuar" in sys.argv
    if not args:
        print("Falta el archivo con la lista de predios.")
        print("Uso: generar_actas_lote.py <archivo> [carpeta-de-salida]")
        return 1
    lista_path = args[0]
    if not os.path.exists(lista_path):
        print(f"No existe el archivo: {lista_path}")
        return 1

    predios, incidencias = leer_lista(lista_path)
    if not predios:
        print("No se encontro ningun numero de predio en el archivo.")
        return 1

    # Dentro de esta misma carpeta: la herramienta queda autocontenida y las actas no
    # se mezclan con las otras herramientas.
    salida = args[1] if len(args) > 1 else os.path.join(
        AQUI, "actas-generadas", datetime.now().strftime("%Y-%m-%d %H%M"))
    os.makedirs(salida, exist_ok=True)

    total_lista = len(predios)
    ya_estaban = []
    if continuar:
        pendientes = []
        for n in predios:
            if os.path.exists(os.path.join(salida, f"Acta_{n}.docx")):
                ya_estaban.append(n)
            else:
                pendientes.append(n)
        predios = pendientes

    print(f"Predios en la lista : {total_lista}")
    print(f"Con incidencia      : {len(incidencias)}"
          + ("" if incidencias else "  (sin ella, un predio con varias escuelas puede salir con la equivocada)"))
    if ya_estaban:
        print(f"Ya generados        : {len(ya_estaban)} (se saltean)")
        print(f"Quedan por generar  : {len(predios)}")
    print(f"Carpeta de salida   : {salida}")
    if not predios:
        print("\nNo queda ninguno pendiente.")
        return 0
    print("\nAbriendo Salesforce (Chrome corre sin ventana)...\n")

    driver = uno.crear_driver_linux()
    resultados = []
    try:
        # Sesion tibia si hay cookies guardadas; si no, login completo.
        cookies = uno.cargar_cookies()
        if cookies:
            uno.inyectar_cookies(driver, cookies)
        driver.get(actas.URL_BASE)
        if uno.parece_login(driver):
            print("Iniciando sesion...")
            actas.login(driver)
            time.sleep(3)
            # Solo se guardan las cookies si la sesion quedo abierta de verdad. Antes se
            # guardaban siempre: un login fallido pisaba las cookies buenas y dejaba el
            # archivo envenenado para las corridas siguientes.
            if uno.parece_login(driver):
                print("\nNO SE PUDO ENTRAR A SALESFORCE. Reviso las credenciales y no sigo:")
                print("sin sesion, cada predio saldria como 'no encontrado' y eso es falso.")
                return 2
            uno.guardar_cookies(driver)

        t0 = time.time()

        def generar(predio):
            """Devuelve la fila del resumen. Lanza si Salesforce no respondio."""
            record_id = uno.resolver_id(driver, predio)
            if not record_id:
                return {"predio": predio, "estado": "no encontrado", "archivo": "", "establecimiento": ""}
            actas.ir_a_registro(driver, record_id)
            data = actas.extraer_campos_predio(driver, record_id=record_id)

            # Un predio puede tener varias escuelas (varios CUEs) y extraer_campos_predio
            # toma la primera de la lista. La incidencia dice cual hay que intervenir, asi
            # que sus datos mandan. Esto ya lo hacia `generar_acta_uno.py`, pero el lote
            # nunca lo llamaba: por eso una tanda podia salir con la escuela equivocada.
            incidencia = incidencias.get(predio, "")
            if incidencia:
                data["Numero_Incidencia"] = incidencia
                try:
                    di = uno.datos_incidencia(driver, incidencia, record_id=record_id)
                    for clave, campo in (("escuela", "Establecimiento"), ("direccion", "Direccion"),
                                         ("localidad", "Localidad"), ("provincia", "Provincia")):
                        if di.get(clave):
                            data[campo] = di[clave]
                except Exception as e:
                    print(f"   ... no se pudo leer la incidencia {incidencia}: {str(e)[:70]}")

            if not data.get("Numero de Predio"):
                data["Numero de Predio"] = predio
            nombre = f"Acta_{data.get('Numero de Predio') or predio}.docx"
            destino = os.path.join(salida, nombre)
            actas.rellenar_word(TEMPLATE, data, destino)
            ok = os.path.exists(destino)
            return {"predio": predio, "estado": "ok" if ok else "error al escribir",
                    "archivo": nombre if ok else "",
                    "establecimiento": data.get("Establecimiento", "")}

        seguidos_mal = 0
        for i, predio in enumerate(predios, 1):
            marca = f"[{i}/{len(predios)}] {predio}"
            fila = None
            try:
                fila = generar(predio)
            except Exception as e:
                # Dos fallos seguidos casi siempre son la sesion caida, no el predio.
                seguidos_mal += 1
                if seguidos_mal >= 2 and reabrir_sesion(driver):
                    seguidos_mal = 0
                    try:
                        fila = generar(predio)
                    except Exception as e2:
                        e = e2
                if fila is None:
                    print(f"{marca}  ERROR: {str(e)[:90]}")
                    fila = {"predio": predio, "estado": f"error: {str(e)[:80]}", "archivo": "", "establecimiento": ""}

            if fila["estado"] == "ok":
                seguidos_mal = 0
                print(f"{marca}  OK  {fila['establecimiento'][:40]}")
            elif fila["estado"] == "no encontrado":
                print(f"{marca}  NO SE ENCONTRO en Salesforce")
            resultados.append(fila)
            escribir_resumen(salida, resultados)

            # En una corrida de cientos, saber cuanto falta es la diferencia entre
            # esperar tranquilo y pensar que se colgo.
            if i % 25 == 0 and i < len(predios):
                pasado = time.time() - t0
                falta = int(pasado / i * (len(predios) - i))
                print(f"   ... {i}/{len(predios)} · {int(pasado // 60)} min corridos · "
                      f"quedan ~{falta // 60} min")

        seg = int(time.time() - t0)
        print(f"\nTerminado en {seg // 60} min {seg % 60} s")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    escribir_resumen(salida, resultados)
    bat_imprimir(salida)

    ok = sum(1 for r in resultados if r["estado"] == "ok")
    print(f"\n{ok} actas generadas · {len(resultados) - ok} con problema")
    if ya_estaban:
        print(f"{len(ya_estaban)} ya estaban de antes · {ok + len(ya_estaban)} actas en la carpeta")
    print(f"Carpeta: {salida}")
    if ok or ya_estaban:
        print('Para imprimirlas todas: abri la carpeta y hace doble clic en "IMPRIMIR TODAS.bat"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
