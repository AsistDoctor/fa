@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Восстановление моделей из Git...

REM Восстанавливаем модели из Git
git checkout HEAD -- "fa-main/models/" 2>nul
if errorlevel 1 (
    echo ⚠ Не удалось восстановить из Git, проверяю наличие файлов...
) else (
    echo ✓ Модели восстановлены из Git
)

REM Копируем модели в корень
if exist "fa-main\models" (
    if not exist "models" mkdir models
    xcopy /E /I /Y "fa-main\models\*" "models\" >nul
    echo ✓ Модели скопированы в корень
) else (
    echo ⚠ Папка fa-main\models не найдена
)

REM Восстанавливаем assets из Git
git checkout HEAD -- "fa-main/assets/plan.jpg" 2>nul

REM Копируем assets в корень
if exist "fa-main\assets\plan.jpg" (
    if not exist "assets" mkdir assets
    copy /Y "fa-main\assets\plan.jpg" "assets\" >nul
    echo ✓ Assets скопированы в корень
)

echo.
echo Готово! Теперь можно удалить папку fa-main
pause
