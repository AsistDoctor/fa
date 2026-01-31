@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo Настройка Git Credential Manager
echo ========================================
echo.

echo [1/5] Удаление файлов с токенами из git...
git rm --cached auto-push.bat setup-git-auth.bat setup-git-auth.sh 2>nul
echo ✓ Готово
echo.

echo [2/5] Настройка remote БЕЗ токена...
git remote set-url origin https://github.com/AsistDoctor/fa.git
echo ✓ Remote настроен
echo.

echo [3/5] Настройка Git Credential Manager...
git config --global credential.helper manager-core
echo ✓ Credential Manager настроен
echo.

echo [4/5] Добавление изменений...
git add .
echo ✓ Готово
echo.

echo [5/5] Создание коммита без токенов...
git commit -m "Remove files with tokens and update .gitignore"
echo ✓ Коммит создан
echo.

echo ========================================
echo Отправка на GitHub...
echo ========================================
echo.
echo Git Credential Manager откроет окно для авторизации
echo Войди через GitHub в открывшемся окне
echo.

git push -u origin main

if errorlevel 1 (
    echo.
    echo ⚠ Если нужна авторизация, выполни:
    echo   git push -u origin main
    echo.
    echo Git Credential Manager откроет окно для входа
) else (
    echo.
    echo ✓ Успешно отправлено на GitHub!
)

echo.
pause
