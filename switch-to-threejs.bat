@echo off
echo Switching to Three.js version...
if exist main.js (
    if not exist main-webgl.js (
        ren main.js main-webgl.js
        echo Renamed main.js to main-webgl.js (backup)
    ) else (
        echo Warning: main-webgl.js already exists, skipping backup
    )
)
if exist main-threejs.js (
    ren main-threejs.js main.js
    echo Renamed main-threejs.js to main.js
    echo.
    echo Done! Now using Three.js version.
    echo Open index.html in your browser.
) else (
    echo Error: main-threejs.js not found!
    pause
    exit /b 1
)
pause
