@echo off
cd /d "%~dp0fa-main"
echo Starting server at http://localhost:3000
echo Press Ctrl+C to stop.
python -m http.server 3000
pause
