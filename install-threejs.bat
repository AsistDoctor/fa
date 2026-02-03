@echo off
echo Installing Three.js...
cd /d "%~dp0"
call npm install
echo.
echo Installation complete!
echo.
echo To use Three.js version:
echo 1. Run switch-to-threejs.bat
echo 2. Or open index-threejs.html directly
pause
