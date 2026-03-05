# Настройка AMPPS для 3D проекта

## Шаги настройки:

### 1. Определите путь к проекту
Ваш проект находится в:
```
C:\Users\Rebys\OneDrive\Рабочий стол\Папки\fuf\fa-main
```

### 2. Создайте виртуальный хост в AMPPS

#### Вариант А: Через панель управления AMPPS
1. Откройте AMPPS Control Panel
2. Нажмите на кнопку "www" или откройте папку `C:\Program Files (x86)\Ampps\www`
3. Создайте символическую ссылку или скопируйте проект в `www`:
   ```powershell
   # От имени администратора в PowerShell:
   New-Item -ItemType SymbolicLink -Path "C:\Program Files (x86)\Ampps\www\fa-main" -Target "C:\Users\Rebys\OneDrive\Рабочий стол\Папки\fuf\fa-main"
   ```
   Или просто скопируйте папку проекта в `www`

#### Вариант Б: Настройка виртуального хоста вручную
1. Откройте файл: `C:\Program Files (x86)\Ampps\apache\conf\extra\httpd-vhosts.conf`
2. Добавьте в конец файла:

```apache
<VirtualHost *:80>
    ServerName fa-main.local
    DocumentRoot "C:/Users/Rebys/OneDrive/Рабочий стол/Папки/fuf/fa-main"
    
    <Directory "C:/Users/Rebys/OneDrive/Рабочий стол/Папки/fuf/fa-main">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        
        # CORS заголовки
        Header set Access-Control-Allow-Origin "*"
        Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Header set Access-Control-Allow-Headers "*"
    </Directory>
    
    ErrorLog "C:/Program Files (x86)/Ampps/apache/logs/fa-main-error.log"
    CustomLog "C:/Program Files (x86)/Ampps/apache/logs/fa-main-access.log" common
</VirtualHost>
```

3. Добавьте в файл `C:\Windows\System32\drivers\etc\hosts` (от имени администратора):
   ```
   127.0.0.1    fa-main.local
   ```

### 3. Убедитесь, что модули включены
Откройте `C:\Program Files (x86)\Ampps\apache\conf\httpd.conf` и проверьте, что раскомментированы:
```apache
LoadModule headers_module modules/mod_headers.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule expires_module modules/mod_expires.so
LoadModule deflate_module modules/mod_deflate.so

Include conf/extra/httpd-vhosts.conf
```

### 4. Запустите AMPPS
1. Откройте AMPPS Control Panel
2. Запустите Apache (если не запущен)
3. Откройте браузер: `http://fa-main.local/index.html`
   Или: `http://localhost/fa-main/index.html` (если скопировали в www)

### 5. Для доступа из сети
В `httpd-vhosts.conf` измените:
```apache
<VirtualHost *:80>
    ServerName 192.168.1.100  # Ваш локальный IP
    DocumentRoot "C:/Users/Rebys/OneDrive/Рабочий стол/Папки/fuf/fa-main"
    ...
</VirtualHost>
```

Или добавьте в `httpd.conf`:
```apache
Listen 0.0.0.0:80
```

## Проверка работы:
1. Откройте `http://localhost/fa-main/index.html` или `http://fa-main.local/index.html`
2. Проверьте консоль браузера (F12) на ошибки
3. Убедитесь, что модели загружаются

## Проблемы:
- **403 Forbidden**: Проверьте права доступа к папке
- **Модули не работают**: Перезапустите Apache через AMPPS Control Panel
- **CORS ошибки**: Убедитесь, что `mod_headers` включен
