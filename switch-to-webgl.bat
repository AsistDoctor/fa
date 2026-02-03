@echo off
echo Switching back to WebGL version...
if exist main.js (
    ren main.js main-threejs.js
    echo Renamed main.js to main-threejs.js
)
if exist main-webgl.js (
    ren main-webgl.js main.js
    echo Renamed main-webgl.js to main.js
    echo.
    echo Done! Now using WebGL version.
    echo Open index.html in your browser.
) else (
    echo Error: main-webgl.js not found!
    pause
    exit /b 1
)
pause
