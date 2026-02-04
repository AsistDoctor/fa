#!/usr/bin/env python3
"""Простой запуск HTTP-сервера на порту 3000 с поддержкой сетевого доступа."""
import http.server
import socketserver
import os
import socket
import sys

PORT = 3000

# Переходим в директорию скрипта
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP обработчик с поддержкой CORS."""
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()
    
    def log_message(self, format, *args):
        """Логирование запросов."""
        print(f"[{self.address_string()}] {format % args}")

def get_local_ip():
    """Получает локальный IP адрес для доступа по сети."""
    try:
        # Подключаемся к внешнему адресу, чтобы узнать локальный IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception as e:
        print(f"⚠️  Предупреждение при определении IP: {e}")
        return None

def get_all_ips():
    """Получает все локальные IP адреса."""
    ips = []
    try:
        hostname = socket.gethostname()
        local_ips = socket.gethostbyname_ex(hostname)[2]
        # Фильтруем только IPv4 и исключаем localhost
        ips = [ip for ip in local_ips if not ip.startswith("127.") and ":" not in ip]
    except:
        pass
    return ips

try:
    # Проверяем, свободен ли порт
    test_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    test_socket.settimeout(1)
    result = test_socket.connect_ex(('127.0.0.1', PORT))
    test_socket.close()
    
    if result == 0:
        print(f"✗ ОШИБКА: Порт {PORT} уже занят!")
        print("   Закройте другой процесс, использующий этот порт")
        print("   Или измените PORT в скрипте")
        sys.exit(1)
    
    # Запускаем сервер на всех интерфейсах (0.0.0.0)
    with socketserver.TCPServer(("0.0.0.0", PORT), CORSRequestHandler) as httpd:
        local_ip = get_local_ip()
        all_ips = get_all_ips()
        
        print("=" * 60)
        print("✓ СЕРВЕР ЗАПУЩЕН УСПЕШНО!")
        print("=" * 60)
        print(f"✓ Директория: {os.getcwd()}")
        print(f"✓ Порт: {PORT}")
        print(f"✓ Прослушивание на всех интерфейсах (0.0.0.0)")
        
        print(f"\n📱 ЛОКАЛЬНЫЙ ДОСТУП:")
        print(f"   http://localhost:{PORT}/index.html")
        print(f"   http://127.0.0.1:{PORT}/index.html")
        
        if local_ip:
            print(f"\n🌐 СЕТЕВОЙ ДОСТУП (для друзей):")
            print(f"   http://{local_ip}:{PORT}/index.html")
            print(f"\n💡 Друзья должны использовать: http://{local_ip}:{PORT}")
        
        if all_ips:
            print(f"\n📡 Все доступные IP адреса:")
            for ip in all_ips:
                if ip != local_ip:
                    print(f"   http://{ip}:{PORT}/index.html")
        
        print(f"\n✓ Доступные HTML файлы:")
        html_files = [f for f in sorted(os.listdir(".")) if f.endswith(".html")]
        if html_files:
            for f in html_files:
                print(f"    - {f}")
        else:
            print("    (не найдено)")
        
        print(f"\n⚠️  ВАЖНО:")
        print(f"   1. Убедитесь, что брандмауэр Windows разрешает доступ на порт {PORT}")
        print(f"   2. Оба компьютера должны быть в одной сети (Wi-Fi/LAN)")
        print(f"   3. Если не работает, проверьте настройки брандмауэра")
        
        print(f"\n🛑 Нажмите Ctrl+C для остановки сервера")
        print("=" * 60)
        print()
        
        httpd.serve_forever()
        
except OSError as e:
    error_msg = str(e)
    if "Address already in use" in error_msg or "уже используется" in error_msg or "10048" in error_msg:
        print(f"✗ ОШИБКА: Порт {PORT} уже занят!")
        print("   Закройте другой процесс или измените PORT в скрипте")
        print("\n   Попробуйте найти процесс:")
        print(f"   netstat -ano | findstr :{PORT}")
    else:
        print(f"✗ ОШИБКА запуска сервера: {e}")
        print(f"   Тип ошибки: {type(e).__name__}")
    sys.exit(1)
    
except KeyboardInterrupt:
    print("\n\n✓ Сервер остановлен пользователем")
    sys.exit(0)
    
except Exception as e:
    print(f"\n✗ Неожиданная ошибка: {e}")
    print(f"   Тип: {type(e).__name__}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
