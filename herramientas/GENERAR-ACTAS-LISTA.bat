@echo off
chcp 65001 >nul
title Generar actas de una lista de predios
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo  [X] Falta instalar. Ejecuta primero INSTALAR.bat
  pause & exit /b 1
)
if not exist "credenciales.txt" (
  echo  [X] Falta credenciales.txt con el usuario y clave de Salesforce.
  pause & exit /b 1
)

rem Las credenciales van como variables de entorno, igual que en el servidor.
for /f "usebackq tokens=1,* delims==" %%A in ("credenciales.txt") do (
  echo %%A | findstr /b "#" >nul || set "%%A=%%B"
)

rem La cache de sesion apunta a /tmp por defecto, que en Windows no existe: sin esto
rem habria que hacer login en Salesforce en cada corrida.
set "SF_COOKIE_FILE=%~dp0.sf_cookies.json"

set "LISTA=%~1"
if "%LISTA%"=="" (
  echo.
  echo  ================================================
  echo   Generar actas de una lista de predios
  echo  ================================================
  echo.
  echo  Arrastra el archivo con la lista sobre este .bat,
  echo  o escribi la ruta aca abajo.
  echo.
  echo  Sirve un .csv, un .txt o un .xlsx. Se usa la columna
  echo  PREDIO si existe; si no, la primera.
  echo.
  set /p LISTA="  Archivo: "
)

rem Se quitan las comillas que agrega Windows al arrastrar.
set LISTA=%LISTA:"=%
if not exist "%LISTA%" (
  echo  [X] No existe: %LISTA%
  pause & exit /b 1
)

echo.
echo  Trabajando. Se abre una ventana de Chrome: NO LA CIERRES.
echo  Cada acta tarda unos segundos; una lista larga puede llevar un rato.
echo.

".venv\Scripts\python.exe" "actas\generar_actas_lote.py" "%LISTA%"

echo.
pause
