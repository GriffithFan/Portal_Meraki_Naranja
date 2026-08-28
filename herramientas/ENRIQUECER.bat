@echo off
chcp 65001 >nul
title Enriquecer lista de predios
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo  [X] Falta instalar. Ejecuta primero INSTALAR.bat
  pause & exit /b 1
)
if not exist "credenciales.txt" (
  echo  [X] Falta credenciales.txt con el usuario y clave de Salesforce.
  pause & exit /b 1
)

rem Las credenciales se cargan como variables de entorno, igual que en el servidor.
for /f "usebackq tokens=1,* delims==" %%A in ("credenciales.txt") do (
  echo %%A | findstr /b "#" >nul || set "%%A=%%B"
)

set "ENTRADA=%~1"
if "%ENTRADA%"=="" (
  echo.
  echo  Arrastra el Excel sobre este archivo, o escribi la ruta:
  set /p ENTRADA="  Excel de entrada: "
)
if not exist "%ENTRADA%" (
  echo  [X] No existe: %ENTRADA%
  pause & exit /b 1
)

set "SALIDA=%~dpn1-enriquecido.xlsx"
echo.
echo  Entrada: %ENTRADA%
echo  Salida:  %SALIDA%
echo.
echo  Trabajando. Abre una ventana de Chrome: no la cierres.
echo.

rem 4 procesos en paralelo. Con 8 Chrome se cae; esto esta medido.
".venv\Scripts\python.exe" "extractor\extractor_datos_predio_incidencia.py" --input "%ENTRADA%" --output "%SALIDA%" --workers 4

if errorlevel 1 (
  echo.
  echo  [X] Termino con error. Revisa el mensaje de arriba.
) else (
  echo.
  echo  [OK] Listo: %SALIDA%
)
pause
