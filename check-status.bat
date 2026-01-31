@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo Проверка статуса Git репозитория
echo ========================================
echo.

echo Remote репозитории:
git remote -v
echo.

echo Текущая ветка:
git branch
echo.

echo Статус файлов:
git status
echo.

echo Последние коммиты:
git log --oneline -5
echo.

echo ========================================
pause
