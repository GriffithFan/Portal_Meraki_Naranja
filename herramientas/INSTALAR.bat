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
"%~dp0.venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
"%~dp0.venv\Scripts\python.exe" -m pip install --quiet -r "%~dp0extractor\requirements.txt" python-docx
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
