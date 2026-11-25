@echo off
chcp 65001 >nul
rem Optionnel : cree un vrai .exe autonome (dist\SupabaseKeepAlive.exe)
python -m pip install --upgrade pyinstaller pystray pillow
python -m PyInstaller --onefile --noconsole --name SupabaseKeepAlive "%~dp0supabase_keepalive.py"
echo.
echo Fichier cree : dist\SupabaseKeepAlive.exe
echo Lance-le une fois : il s'ajoutera au demarrage de Windows.
pause
