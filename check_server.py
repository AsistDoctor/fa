#!/usr/bin/env python3
"""
Скрипт для проверки статуса сервера
"""
import socket
import sys

PORT = 3000

def check_port(port):
    """Проверяет, занят ли порт"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(('127.0.0.1', port))
        sock.close()
        return result == 0
    except Exception as e:
        print(f"Ошибка при проверке порта: {e}")
        return False

def get_local_ip():
    """Получает локальный IP адрес"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception as e:
        return None

print("=" * 60)
print("ПРОВЕРКА СТАТУСА СЕРВЕРА")
print("=" * 60)
print()

# Проверяем порт
print(f"Проверка порта {PORT}...")
if check_port(PORT):
    print(f"✓ Порт {PORT} ЗАНЯТ - сервер, вероятно, запущен")
    print()
    print("🌐 Адреса для доступа:")
    print(f"   Локально: http://localhost:{PORT}/index.html")
    print(f"   Локально: http://127.0.0.1:{PORT}/index.html")
    
    local_ip = get_local_ip()
    if local_ip:
        print(f"   Сеть: http://{local_ip}:{PORT}/index.html")
    else:
        print("   ⚠️  Не удалось определить IP адрес для сетевого доступа")
    
    print()
    print("💡 Если сервер не отвечает:")
    print("   1. Проверьте, что сервер действительно запущен")
    print("   2. Проверьте брандмауэр Windows")
    print("   3. Попробуйте перезапустить сервер")
else:
    print(f"✗ Порт {PORT} СВОБОДЕН - сервер не запущен")
    print()
    print("💡 Для запуска сервера выполните:")
    print("   python run_server.py")
    print()
    print("Или:")
    print("   npm start")

print()
print("=" * 60)
