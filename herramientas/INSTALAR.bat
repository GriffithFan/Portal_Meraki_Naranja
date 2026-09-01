@echo off
chcp 65001 >nul
title Instalador de herramientas THNET
echo.
echo  ================================================
echo   Instalacion de las herramientas de escritorio
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
rem --no-cache-dir: si en la cache de pip quedaron descargas de otra version de
rem Python, las lee mal y escupe cientos de "Cache entry deserialization failed".
rem No rompe nada -vuelve a bajar el paquete- pero son cientos de lineas amarillas
rem que dicen "failed" y cualquiera asume que la instalacion se rompio.
"%~dp0.venv\Scripts\python.exe" -m pip install --quiet --no-cache-dir --upgrade pip
"%~dp0.venv\Scripts\python.exe" -m pip install --quiet --no-cache-dir -r "%~dp0extractor\requirements.txt" python-docx
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
echo     ENRIQUECER.bat     completar datos de una lista
echo     GENERAR-ACTA.bat   armar el acta de un predio
echo  ================================================
echo.
pause
exit /b 0

:error
echo.
echo  [X] Fallo la instalacion. Copia el error de arriba y pedi ayuda.
pause
exit /b 1
