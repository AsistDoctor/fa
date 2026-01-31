#!/usr/bin/env python3
"""Запуск HTTP-сервера для папки fa-main на порту 3000."""
import http.server
import os
import socketserver

DIR = os.path.join(os.path.dirname(__file__), "fa-main")
PORT = 3000

os.chdir(DIR)
Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Server at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    httpd.serve_forever()
