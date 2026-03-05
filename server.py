#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Простой HTTP сервер для разработки и отладки 3D карты кампуса.
Запускает локальный сервер с поддержкой CORS и правильными MIME-типами.
"""

import http.server
import socketserver
import os
import sys
from pathlib import Path

# Исправляем кодировку для Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Порт по умолчанию
PORT = 3000

# MIME типы для правильной загрузки файлов
MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.obj': 'model/obj',
    '.mtl': 'text/plain',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
}

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Кастомный обработчик запросов с поддержкой CORS и правильных MIME-типов."""
    
    def end_headers(self):
        # Добавляем CORS заголовки для разработки
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()
    
    def guess_type(self, path):
        """Определяет MIME-тип файла."""
        base, ext = os.path.splitext(path)
        ext = ext.lower()
        
        if ext in MIME_TYPES:
            return MIME_TYPES[ext]
        
        return super().guess_type(path)
    
    def log_message(self, format, *args):
        """Кастомное логирование запросов."""
        print(f"[{self.address_string()}] {format % args}")

def main():
    """Запускает HTTP сервер."""
    # Меняем рабочую директорию на директорию скрипта
    script_dir = Path(__file__).parent.absolute()
    os.chdir(script_dir)
    
    # Проверяем наличие основных файлов
    if not Path('index.html').exists():
        print("⚠️  Предупреждение: index.html не найден в текущей директории")
        print(f"   Рабочая директория: {os.getcwd()}")
    
    # Создаем сервер
    try:
        with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
            print("=" * 60)
            print("Python HTTP server started!")
            print("=" * 60)
            print(f"URL: http://localhost:{PORT}")
            print(f"Directory: {os.getcwd()}")
            print("=" * 60)
            print("Press Ctrl+C to stop the server")
            print("=" * 60)
            print()
            
            # Запускаем сервер
            httpd.serve_forever()
            
    except OSError as e:
        if e.errno == 48 or e.winerror == 10048:  # Address already in use (Windows)
            print(f"Error: Port {PORT} is already in use!")
            print(f"Try another port: python server.py {PORT + 1}")
            sys.exit(1)
        else:
            print(f"Error starting server: {e}")
            sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nServer stopped by user")
        sys.exit(0)

if __name__ == "__main__":
    # Проверяем аргументы командной строки для порта
    if len(sys.argv) > 1:
        try:
            PORT = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port: {sys.argv[1]}. Using default port: {PORT}")
    
    main()
