/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Arma el ZIP del Generador de actas, listo para subir al NAS y usar en otra PC.
 *
 *   node scripts/empaquetar-actas.js [--sin-credenciales]
 *
 * El ZIP es AUTOCONTENIDO: adentro va su propio INSTALAR.bat y su requirements, y los
 * .bat apuntan a rutas locales. En el repositorio esos .bat apuntan a `..\.venv` y
 * `..\credenciales.txt` porque comparten el entorno con el enriquecedor; acá se reescriben
 * al vuelo en vez de mantener dos copias que se van a desincronizar.
 */
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const RAIZ = path.resolve(__dirname, "..");
const ORIGEN = path.join(RAIZ, "herramientas", "Generador de actas");
const REQS = path.join(RAIZ, "herramientas", "extractor", "requirements.txt");
const CREDS = path.join(RAIZ, "herramientas", "credenciales.txt");
const SIN_CREDS = process.argv.includes("--sin-credenciales");
const SALIDA = path.join(RAIZ, "..", "Generador de actas.zip");

/** El instalador del ZIP: mismo contenido, pero todo relativo a su propia carpeta. */
const INSTALADOR = `@echo off
chcp 65001 >nul
title Instalador - Generador de actas
echo.
echo  ================================================
echo   Generador de actas - instalacion
echo  ================================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo  [X] No se encontro Python.
  echo.
  echo      Instalalo desde https://www.python.org/downloads/
  echo      IMPORTANTE: al instalar, tildar "Add Python to PATH".
  echo.
  pause
  exit /b 1
)
python --version

echo.
echo  Creando el entorno...
python -m venv "%~dp0.venv"
if errorlevel 1 goto error

echo  Instalando dependencias (tarda unos minutos)...
rem --no-cache-dir: si en la cache de pip quedaron descargas de otra version de Python,
rem las lee mal y llena la pantalla de "Cache entry deserialization failed". No rompe
rem nada, pero parece que fallo la instalacion.
"%~dp0.venv\\Scripts\\python.exe" -m pip install --quiet --no-cache-dir --upgrade pip
"%~dp0.venv\\Scripts\\python.exe" -m pip install --quiet --no-cache-dir -r "%~dp0requirements.txt"
if errorlevel 1 goto error

if not exist "%~dp0credenciales.txt" (
  copy "%~dp0credenciales.EJEMPLO.txt" "%~dp0credenciales.txt" >nul
  echo.
  echo  [!] Se creo credenciales.txt
  echo      Abrilo y completa el usuario y la clave de Salesforce ANTES de usar nada.
)

echo.
echo  ================================================
echo   Listo. Ya podes usar:
echo     GENERAR UN ACTA.bat
echo     GENERAR ACTAS DE UNA LISTA.bat
echo  ================================================
echo.
pause
exit /b 0

:error
echo.
echo  [X] Fallo la instalacion. Copia el error de arriba y pedi ayuda.
pause
exit /b 1
`;

const CREDS_EJEMPLO = `# Credenciales de Salesforce.
# Completar y guardar. NO compartir este archivo: da acceso a Salesforce.

SALESFORCE_URL_BASE=https://tu-instancia.my.site.com/mined/
SALESFORCE_USERNAME=usuario@dominio
SALESFORCE_PASSWORD=tu-clave
`;

/** Los .bat del repo miran un nivel arriba; en el ZIP todo esta al lado. */
function alocal(txt) {
  return txt
    .replace(/\.\.\\\.venv/g, "%~dp0.venv")
    .replace(/\.\.\\credenciales\.txt/g, "%~dp0credenciales.txt")
    .replace(/Ejecuta primero INSTALAR\.bat, que esta en la carpeta de arriba/g,
             "Ejecuta primero INSTALAR.bat");
}

(async () => {
  if (!fs.existsSync(ORIGEN)) throw new Error("No existe " + ORIGEN);
  const salida = fs.createWriteStream(SALIDA);
  const zip = archiver("zip", { zlib: { level: 9 } });
  const listo = new Promise((res, rej) => { salida.on("close", res); zip.on("error", rej); });
  zip.pipe(salida);

  const RAIZ_ZIP = "Generador de actas";
  let n = 0;
  for (const f of fs.readdirSync(ORIGEN)) {
    const abs = path.join(ORIGEN, f);
    if (fs.statSync(abs).isDirectory()) continue;           // actas-generadas, .venv, etc.
    if (f === ".sf_cookies.json") continue;                 // sesion local, no viaja
    if (f.endsWith(".bat")) {
      zip.append(alocal(fs.readFileSync(abs, "utf8")), { name: `${RAIZ_ZIP}/${f}` });
    } else {
      zip.file(abs, { name: `${RAIZ_ZIP}/${f}` });
    }
    n++;
  }

  zip.append(INSTALADOR, { name: `${RAIZ_ZIP}/INSTALAR.bat` });
  zip.file(REQS, { name: `${RAIZ_ZIP}/requirements.txt` });
  zip.append(CREDS_EJEMPLO, { name: `${RAIZ_ZIP}/credenciales.EJEMPLO.txt` });
  if (!SIN_CREDS && fs.existsSync(CREDS)) {
    zip.file(CREDS, { name: `${RAIZ_ZIP}/credenciales.txt` });
  }

  await zip.finalize();
  await listo;
  const kb = (fs.statSync(SALIDA).size / 1024).toFixed(0);
  console.log(`${SALIDA}`);
  console.log(`  ${n + 3 + (SIN_CREDS ? 0 : 1)} archivos · ${kb} KB`);
  console.log(SIN_CREDS ? "  SIN credenciales (hay que completarlas en destino)"
                        : "  CON credenciales adentro: el ZIP da acceso a Salesforce");
})().catch((e) => { console.error(String(e)); process.exit(1); });
