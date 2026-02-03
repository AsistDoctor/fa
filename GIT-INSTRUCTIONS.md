# Инструкции по созданию Git ветки

Из-за проблем с кириллицей в путях Windows, создайте ветку вручную:

## Создание ветки threejs-refactor

### Вариант 1: Через Git Bash или командную строку

```bash
# Перейдите в директорию проекта
cd "c:\Users\Rebys\OneDrive\Рабочий стол\Папки\fuf\fa-main"

# Создайте и переключитесь на новую ветку
git checkout -b threejs-refactor

# Проверьте текущую ветку
git branch
```

### Вариант 2: Через GitHub Desktop

1. Откройте GitHub Desktop
2. Выберите репозиторий `fa-main`
3. Нажмите `Branch` → `New Branch`
4. Введите имя: `threejs-refactor`
5. Нажмите `Create Branch`

### Вариант 3: Через VS Code

1. Откройте проект в VS Code
2. Нажмите на название ветки внизу слева
3. Выберите "Create new branch"
4. Введите: `threejs-refactor`
5. Нажмите Enter

## Коммит изменений

После создания ветки, закоммитьте все изменения:

```bash
# Добавить все файлы
git add .

# Или добавить конкретные файлы
git add main-threejs.js
git add index-threejs.html
git add package.json
git add README-THREEJS.md
git add *.bat

# Создать коммит
git commit -m "Refactor to Three.js: reduce code from 1700 to 600 lines

- Rewrote main.js using Three.js instead of raw WebGL
- Added OBJLoader for model loading
- Added OrbitControls for camera management
- Maintained all original functionality
- Created helper scripts for switching between versions
- Added comprehensive documentation"

# Отправить в удалённый репозиторий
git push -u origin threejs-refactor
```

## Файлы для коммита

Новые файлы в ветке:
- `main-threejs.js` - Three.js версия основного файла
- `index-threejs.html` - HTML для Three.js версии
- `README-THREEJS.md` - Документация
- `switch-to-threejs.bat` - Скрипт переключения
- `switch-to-webgl.bat` - Скрипт возврата
- `install-threejs.bat` - Скрипт установки
- `package.json` - Обновлён с зависимостью three
- `GIT-INSTRUCTIONS.md` - Этот файл

Изменённые файлы:
- `package.json` - добавлена зависимость `three` и `type: "module"`

## После коммита

1. Проверьте, что ветка создана: `git branch`
2. Убедитесь, что все файлы закоммичены: `git status`
3. Отправьте ветку на GitHub: `git push -u origin threejs-refactor`
4. Создайте Pull Request на GitHub для сравнения с main веткой

## Возврат к основной ветке

```bash
git checkout main
# или
git checkout master
```

## Сравнение веток

```bash
# Посмотреть различия
git diff main..threejs-refactor

# Посмотреть статистику изменений
git diff --stat main..threejs-refactor
```
