@echo off
chcp 65001 >nul
title Installation Supabase KeepAlive
where python >nul 2>nul
if errorlevel 1 (
  echo Python n'est pas installe. Installe-le depuis https://www.python.org/downloads/
  echo ^(coche "Add python.exe to PATH" pendant l'installation^), puis relance ce fichier.
  pause
  exit /b 1
)
echo Installation des dependances...
python -m pip install --upgrade pystray pillow
if errorlevel 1 (
  echo Echec de l'installation des dependances.
  pause
  exit /b 1
)
echo Lancement de l'application...
start "" pythonw "%~dp0supabase_keepalive.py"
echo.
echo Termine. L'application se lancera desormais automatiquement avec Windows.
echo Interface web : http://127.0.0.1:8765  ^(ou bouton "Interface web" dans l'application^)
echo IMPORTANT : ne deplace pas ni ne supprime ce dossier apres l'installation.
pause
