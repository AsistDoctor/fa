# Настройка Apache для 3D проекта

## Вариант 1: XAMPP (рекомендуется для Windows)

### Установка:
1. Скачайте XAMPP с https://www.apachefriends.org/
2. Установите в `C:\xampp`

### Настройка:
1. Откройте файл `C:\xampp\apache\conf\extra\httpd-vhosts.conf`
2. Добавьте в конец файла содержимое из `apache-config.conf`
3. **ВАЖНО:** Измените путь `DocumentRoot` на ваш реальный путь к проекту
4. Убедитесь, что в `C:\xampp\apache\conf\httpd.conf` раскомментирована строка:
   ```apache
   Include conf/extra/httpd-vhosts.conf
   ```
5. Убедитесь, что модули включены в `httpd.conf`:
   ```apache
   LoadModule headers_module modules/mod_headers.so
   LoadModule rewrite_module modules/mod_rewrite.so
   LoadModule expires_module modules/mod_expires.so
   LoadModule deflate_module modules/mod_deflate.so
   ```

### Запуск:
1. Откройте XAMPP Control Panel
2. Запустите Apache
3. Откройте браузер: `http://localhost/index.html`

### Для доступа из сети:
В `apache-config.conf` измените:
```apache
ServerName 192.168.1.100  # Ваш локальный IP
```
Или добавьте в `httpd.conf`:
```apache
Listen 0.0.0.0:80
```

---

## Вариант 2: WAMP

### Установка:
1. Скачайте WAMP с https://www.wampserver.com/
2. Установите в `C:\wamp64`

### Настройка:
1. Откройте файл `C:\wamp64\bin\apache\apache2.4.x\conf\extra\httpd-vhosts.conf`
2. Добавьте содержимое из `apache-config.conf`
3. Измените путь `DocumentRoot`
4. Включите виртуальные хосты в `httpd.conf`

### Запуск:
1. Запустите WAMP
2. Откройте `http://localhost/index.html`

---

## Вариант 3: Отдельный Apache

### Установка:
1. Скачайте Apache с https://httpd.apache.org/download.cgi
2. Распакуйте в `C:\Apache24`

### Настройка:
1. Откройте `C:\Apache24\conf\httpd.conf`
2. Найдите `DocumentRoot` и измените на путь к проекту:
   ```apache
   DocumentRoot "C:/Users/Rebys/OneDrive/Рабочий стол/Папки/fuf/fa-main"
   ```
3. Найдите `<Directory>` и измените путь:
   ```apache
   <Directory "C:/Users/Rebys/OneDrive/Рабочий стол/Папки/fuf/fa-main">
       Options Indexes FollowSymLinks
       AllowOverride All
       Require all granted
   </Directory>
   ```

### Запуск:
```bash
# От имени администратора
cd C:\Apache24\bin
httpd.exe -k start
```

---

## Проверка работы:

1. Откройте браузер: `http://localhost/index.html`
2. Откройте консоль разработчика (F12)
3. Проверьте, что нет ошибок загрузки файлов
4. Проверьте, что модели загружаются

## Для доступа из сети:

1. Узнайте ваш локальный IP:
   ```powershell
   ipconfig
   ```
2. Найдите IPv4 адрес (например, 192.168.1.100)
3. В Apache конфигурации укажите этот IP или используйте `*:80`
4. Откройте в браузере: `http://192.168.1.100/index.html`

## Проблемы:

- **403 Forbidden**: Проверьте права доступа к папке проекта
- **Модели не загружаются**: Проверьте пути в `modelFiles` в `main.js`
- **CORS ошибки**: Убедитесь, что модуль `mod_headers` включен
