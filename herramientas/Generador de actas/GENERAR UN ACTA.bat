@echo off
chcp 65001 >nul
title Generar acta de un predio
cd /d "%~dp0"

if not exist "..\.venv\Scripts\python.exe" (
  echo  [X] Falta instalar. Ejecuta primero INSTALAR.bat, que esta en la carpeta de arriba
  pause & exit /b 1
)
if not exist "..\credenciales.txt" (
  echo  [X] Falta credenciales.txt con el usuario y clave de Salesforce.
  pause & exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("..\credenciales.txt") do (
  echo %%A | findstr /b "#" >nul || set "%%A=%%B"
)

rem La cache de sesion apunta a /tmp por defecto, que en Windows no existe.
set "SF_COOKIE_FILE=%~dp0.sf_cookies.json"
set "ACTAS_OUT_DIR=%~dp0actas-generadas"

set "PREDIO=%~1"
if "%PREDIO%"=="" (
  echo.
  set /p PREDIO="  Numero de predio (ej: 605708): "
)

echo.
echo  Generando el acta del predio %PREDIO%...
echo  Chrome corre en segundo plano, sin ventana. No cierres esta consola.
echo.

"..\.venv\Scripts\python.exe" "generar_acta_uno.py" %PREDIO%

if errorlevel 1 (
  echo.
  echo  [X] Termino con error. Revisa el mensaje de arriba.
) else (
  echo.
  echo  [OK] El acta quedo en la carpeta "actas-generadas".
)
pause
