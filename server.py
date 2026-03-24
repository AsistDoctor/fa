#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Простой HTTP сервер для разработки и отладки 3D карты кампуса.
Добавляет dev API для реактивного сохранения позиций моделей в SQLite.
"""

import http.server
import socketserver
import json
import os
import sqlite3
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# Исправляем кодировку для Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Порт по умолчанию
PORT = 3000
DEV_MODE = os.getenv("DEV_MODE", "true").lower() in ("1", "true", "yes", "on")
DB_FILE = "dev_data.sqlite3"

EVENT_CONDITION = threading.Condition()
EVENTS = []
EVENT_STATE = {"id": 0}

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
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()
    
    def guess_type(self, path):
        """Определяет MIME-тип файла."""
        _base, ext = os.path.splitext(path)
        ext = ext.lower()
        
        if ext in MIME_TYPES:
            return MIME_TYPES[ext]
        
        return super().guess_type(path)
    
    def log_message(self, fmt, *args):
        """Кастомное логирование запросов."""
        print(f"[{self.address_string()}] {fmt % args}")

    def do_OPTIONS(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/dev/"):
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/dev/"):
            self._handle_api_get(parsed)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/dev/"):
            self._handle_api_write(parsed, method="POST")
            return
        self.send_error(404, "Not Found")

    def do_PATCH(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/dev/"):
            self._handle_api_write(parsed, method="PATCH")
            return
        self.send_error(404, "Not Found")

    def _send_json(self, status_code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _handle_api_get(self, parsed):
        if parsed.path == "/api/dev/status":
            self._send_json(200, {"ok": True, "devMode": DEV_MODE, "dbFile": DB_FILE})
            return

        if parsed.path == "/api/dev/model_positions":
            payload = read_all_model_positions()
            self._send_json(200, payload)
            return

        if parsed.path == "/api/dev/events":
            self._handle_sse_events(parsed)
            return

        self._send_json(404, {"ok": False, "error": "Unknown API endpoint"})

    def _handle_api_write(self, parsed, method):
        if not DEV_MODE:
            self._send_json(403, {"ok": False, "error": "DEV_MODE is disabled"})
            return

        try:
            body = self._read_json_body()
        except json.JSONDecodeError:
            self._send_json(400, {"ok": False, "error": "Invalid JSON"})
            return

        if parsed.path == "/api/dev/model_positions" and method in ("POST", "PATCH"):
            client_id = str(body.get("clientId", "unknown"))
            count = upsert_many_positions(body, client_id=client_id)
            self._send_json(200, {"ok": True, "updated": count})
            return

        if parsed.path.startswith("/api/dev/models/") and parsed.path.endswith("/transform") and method == "PATCH":
            parts = parsed.path.strip("/").split("/")
            # api/dev/models/{modelKey}/transform
            if len(parts) != 5:
                self._send_json(400, {"ok": False, "error": "Invalid path"})
                return
            model_key = parts[3]
            client_id = str(body.get("clientId", "unknown"))
            model_data = upsert_single_model(model_key, body, client_id=client_id)
            self._send_json(200, {"ok": True, "modelKey": model_key, "data": model_data})
            return

        self._send_json(404, {"ok": False, "error": "Unknown API endpoint"})

    def _handle_sse_events(self, parsed):
        if not DEV_MODE:
            self._send_json(403, {"ok": False, "error": "DEV_MODE is disabled"})
            return

        query = parse_qs(parsed.query)
        try:
            since = int(query.get("since", ["0"])[0])
        except ValueError:
            since = 0

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.end_headers()

        last_sent = since
        deadline = time.time() + 25.0
        try:
            while time.time() < deadline:
                to_send = []
                with EVENT_CONDITION:
                    to_send = [e for e in EVENTS if e["_id"] > last_sent]
                    if not to_send:
                        EVENT_CONDITION.wait(timeout=2.0)
                        to_send = [e for e in EVENTS if e["_id"] > last_sent]

                if not to_send:
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    continue

                for event in to_send:
                    payload = json.dumps(event, ensure_ascii=False)
                    message = f"id: {event['_id']}\nevent: update\ndata: {payload}\n\n".encode("utf-8")
                    self.wfile.write(message)
                    self.wfile.flush()
                    last_sent = event["_id"]
        except (BrokenPipeError, ConnectionResetError):
            return


def get_db_path():
    return Path(__file__).parent.absolute() / DB_FILE


def emit_event(event):
    with EVENT_CONDITION:
        EVENT_STATE["id"] += 1
        event["_id"] = EVENT_STATE["id"]
        EVENTS.append(event)
        # ограничиваем память
        if len(EVENTS) > 1000:
            del EVENTS[:200]
        EVENT_CONDITION.notify_all()


def init_db():
    db_path = get_db_path()
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS model_transforms (
                model_key TEXT PRIMARY KEY,
                x REAL NOT NULL DEFAULT 0,
                y REAL NOT NULL DEFAULT 0,
                z REAL NOT NULL DEFAULT 0,
                yaw REAL NOT NULL DEFAULT 0,
                scale_x REAL NOT NULL DEFAULT 1,
                scale_y REAL NOT NULL DEFAULT 1,
                scale_z REAL NOT NULL DEFAULT 1,
                file TEXT,
                updated_at INTEGER NOT NULL,
                updated_by TEXT
            )
            """
        )
        conn.commit()

    bootstrap_from_json_if_empty()


def bootstrap_from_json_if_empty():
    db_path = get_db_path()
    json_path = Path(__file__).parent.absolute() / "model_positions.json"

    with sqlite3.connect(db_path) as conn:
        row = conn.execute("SELECT COUNT(1) FROM model_transforms").fetchone()
        if row and row[0] > 0:
            return

    if not json_path.exists():
        return

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            payload = json.load(f)
        upsert_many_positions(payload, client_id="bootstrap")
        print("✓ DB bootstrap: импортированы позиции из model_positions.json")
    except (OSError, ValueError, json.JSONDecodeError, sqlite3.Error) as exc:
        print(f"⚠ DB bootstrap failed: {exc}")


def normalize_model_payload(data, existing=None):
    existing = existing or {}
    offset = data.get("offset", {})
    rotation = data.get("rotation", {})
    scale = data.get("scale", {})

    return {
        "offset": {
            "x": float(offset.get("x", existing.get("x", 0.0))),
            "y": float(offset.get("y", existing.get("y", 0.0))),
            "z": float(offset.get("z", existing.get("z", 0.0))),
        },
        "rotation": {
            "yaw": float(rotation.get("yaw", existing.get("yaw", 0.0)))
        },
        "scale": {
            "x": float(scale.get("x", existing.get("scale_x", 1.0))),
            "y": float(scale.get("y", existing.get("scale_y", 1.0))),
            "z": float(scale.get("z", existing.get("scale_z", 1.0))),
        },
        "file": data.get("file", existing.get("file"))
    }


def upsert_single_model(model_key, data, client_id="unknown"):
    db_path = get_db_path()
    now_ms = int(time.time() * 1000)
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT x, y, z, yaw, scale_x, scale_y, scale_z, file FROM model_transforms WHERE model_key = ?",
            (model_key,),
        ).fetchone()
        existing = {}
        if row:
            existing = {
                "x": row[0], "y": row[1], "z": row[2], "yaw": row[3],
                "scale_x": row[4], "scale_y": row[5], "scale_z": row[6], "file": row[7],
            }

        normalized = normalize_model_payload(data, existing=existing)
        conn.execute(
            """
            INSERT INTO model_transforms (
                model_key, x, y, z, yaw, scale_x, scale_y, scale_z, file, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(model_key) DO UPDATE SET
                x=excluded.x, y=excluded.y, z=excluded.z, yaw=excluded.yaw,
                scale_x=excluded.scale_x, scale_y=excluded.scale_y, scale_z=excluded.scale_z,
                file=excluded.file, updated_at=excluded.updated_at, updated_by=excluded.updated_by
            """,
            (
                model_key,
                normalized["offset"]["x"],
                normalized["offset"]["y"],
                normalized["offset"]["z"],
                normalized["rotation"]["yaw"],
                normalized["scale"]["x"],
                normalized["scale"]["y"],
                normalized["scale"]["z"],
                normalized["file"],
                now_ms,
                client_id,
            ),
        )
        conn.commit()

    emit_event({
        "type": "model_transform_updated",
        "modelKey": model_key,
        "clientId": client_id,
        "ts": now_ms,
        "data": normalized,
    })
    return normalized


def upsert_many_positions(payload, client_id="unknown"):
    if not isinstance(payload, dict):
        return 0
    count = 0
    for key, value in payload.items():
        if key == "labels" or not str(key).startswith("model"):
            continue
        if not isinstance(value, dict):
            continue
        upsert_single_model(str(key), value, client_id=client_id)
        count += 1
    return count


def read_all_model_positions():
    result = {}
    db_path = get_db_path()
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT model_key, x, y, z, yaw, scale_x, scale_y, scale_z, file
            FROM model_transforms
            ORDER BY model_key
            """
        ).fetchall()

    for row in rows:
        model_key = row[0]
        result[model_key] = {
            "offset": {"x": row[1], "y": row[2], "z": row[3]},
            "rotation": {"yaw": row[4]},
            "scale": {"x": row[5], "y": row[6], "z": row[7]},
            "file": row[8],
        }
    return result

def main():
    """Запускает HTTP сервер."""
    # Меняем рабочую директорию на директорию скрипта
    script_dir = Path(__file__).parent.absolute()
    os.chdir(script_dir)

    init_db()
    
    # Проверяем наличие основных файлов
    if not Path('index.html').exists():
        print("⚠️  Предупреждение: index.html не найден в текущей директории")
        print(f"   Рабочая директория: {os.getcwd()}")
    
    # Создаем сервер
    try:
        class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
            allow_reuse_address = True
            daemon_threads = True

        with ThreadedTCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
            print("=" * 60)
            print("Python HTTP server started!")
            print("=" * 60)
            print(f"URL: http://localhost:{PORT}")
            print(f"LAN URL: http://0.0.0.0:{PORT}")
            print(f"DEV_MODE: {DEV_MODE}")
            print(f"DB: {DB_FILE}")
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
