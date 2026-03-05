# Создание символической ссылки для автоматической синхронизации

## Что это даст:
- Файлы в `www/fa-main` будут автоматически синхронизироваться с исходной папкой проекта
- Изменения в исходных файлах сразу видны в www
- Не нужно копировать файлы вручную

## Как создать (выберите один вариант):

### Вариант 1: Через командную строку (от имени администратора)

1. Откройте командную строку (cmd) **от имени администратора**
2. Выполните команду:

```cmd
mklink /D "C:\Program Files\Ampps\www\fa-main" "C:\Users\Rebys\OneDrive\Рабочий стол\Папки\fuf\fa-main"
```

**Или если AMPPS в другой папке:**
```cmd
mklink /D "C:\Program Files (x86)\Ampps\www\fa-main" "C:\Users\Rebys\OneDrive\Рабочий стол\Папки\fuf\fa-main"
```

### Вариант 2: Через PowerShell (от имени администратора)

1. Откройте PowerShell **от имени администратора**
2. Выполните:

```powershell
New-Item -ItemType SymbolicLink -Path "C:\Program Files\Ampps\www\fa-main" -Target "C:\Users\Rebys\OneDrive\Рабочий стол\Папки\fuf\fa-main"
```

**Или для Program Files (x86):**
```powershell
New-Item -ItemType SymbolicLink -Path "C:\Program Files (x86)\Ampps\www\fa-main" -Target "C:\Users\Rebys\OneDrive\Рабочий стол\Папки\fuf\fa-main"
```

## Важно:
- **Сначала удалите** существующую папку `fa-main` из www (если она там есть)
- Команду нужно выполнять **от имени администратора**
- После создания ссылки все изменения в исходной папке будут сразу видны в www

## Проверка:
После создания ссылки откройте:
```
http://localhost/fa-main/index.html
```

Измените что-то в исходных файлах - изменения сразу появятся на сайте!
