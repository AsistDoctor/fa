#!/usr/bin/env python3
"""Запуск HTTP-сервера для папки fa-main на порту 3000."""
import http.server
import os
import socketserver

# Получаем директорию, где находится этот скрипт
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = 3000

# Переходим в директорию скрипта
os.chdir(SCRIPT_DIR)

Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Server at http://localhost:{PORT}")
    print(f"Serving directory: {SCRIPT_DIR}")
    print("Available files:")
    for f in sorted(os.listdir(".")):
        if f.endswith(".html"):
            print(f"  - {f}")
    print("\nPress Ctrl+C to stop.")
    httpd.serve_forever()
