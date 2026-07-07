#!/usr/bin/env python3
"""
Portafolio Digital HCI - Servidor local sencillo (solo librería estándar).

Sirve la aplicación y guarda los datos EN EL PROYECTO (no en el navegador):
  - Las entradas/secciones/integrantes  ->  data/state.json
  - Los archivos subidos                ->  uploads/

Así, cualquiera que ejecute el proyecto puede subir archivos y, al hacer
`git add . && git commit && git push`, esos archivos y datos quedan en el
repositorio y los demás los reciben con `git pull`.

Uso:
    python3 server.py
Luego abre en el navegador:  http://localhost:8000
"""

import json
import os
import re
import time
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Carpeta donde vive este archivo (y la app: index.html, css/, js/)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
STATE_FILE = os.path.join(DATA_DIR, "state.json")

PORT = 8000
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB por archivo

# Tipos MIME para servir archivos estáticos
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8",
    ".ico": "image/x-icon",
}


def ensure_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)


def safe_filename(name):
    """Genera un nombre de archivo único y seguro conservando la extensión."""
    name = os.path.basename(name or "archivo")
    base, ext = os.path.splitext(name)
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)[:60] or "archivo"
    ext = re.sub(r"[^A-Za-z0-9.]", "", ext)[:10]
    stamp = time.strftime("%Y%m%d-%H%M%S")
    rnd = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=4))
    return f"{stamp}-{rnd}-{base}{ext}"


class Handler(BaseHTTPRequestHandler):
    # ---------- utilidades de respuesta ----------
    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, message, status=400):
        self.send_json({"error": message}, status)

    # ---------- GET ----------
    def do_GET(self):
        path = self.path.split("?", 1)[0]

        if path == "/api/state":
            return self.handle_get_state()

        # Todo lo demás son archivos estáticos (app, css, js, uploads/…)
        return self.serve_static(path)

    def handle_get_state(self):
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return self.send_json(data)
            except (OSError, json.JSONDecodeError):
                return self.send_json({})
        # Sin datos aún: el frontend usará sus datos semilla
        return self.send_json({})

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"

        # Resuelve la ruta dentro de BASE_DIR e impide salir de la carpeta
        rel = path.lstrip("/")
        full = os.path.normpath(os.path.join(BASE_DIR, rel))
        if not full.startswith(BASE_DIR):
            return self.send_error_json("Ruta no permitida", 403)
        if not os.path.isfile(full):
            return self.send_error_json("No encontrado", 404)

        ext = os.path.splitext(full)[1].lower()
        ctype = MIME_TYPES.get(ext, "application/octet-stream")
        try:
            with open(full, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_error_json("No se pudo leer el archivo", 500)

        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- POST ----------
    def do_POST(self):
        path = self.path.split("?", 1)[0]

        if path == "/api/state":
            return self.handle_save_state()
        if path == "/api/upload":
            return self.handle_upload()

        return self.send_error_json("Ruta no encontrada", 404)

    def handle_save_state(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return self.send_error_json("Cuerpo vacío")
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return self.send_error_json("JSON inválido")

        try:
            ensure_dirs()
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except OSError as e:
            return self.send_error_json(f"No se pudo guardar: {e}", 500)

        return self.send_json({"ok": True})

    def handle_upload(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return self.send_error_json("Archivo vacío")
        if length > MAX_UPLOAD_BYTES:
            return self.send_error_json("El archivo supera el límite de 25 MB", 413)

        # El frontend envía el archivo como cuerpo crudo y el nombre/tipo por
        # cabeceras, así evitamos parsear multipart (más simple y sin librerías).
        orig_name = self.headers.get("X-File-Name", "archivo")
        file_type = self.headers.get("X-File-Type", "application/octet-stream")

        data = self.rfile.read(length)
        filename = safe_filename(orig_name)

        try:
            ensure_dirs()
            with open(os.path.join(UPLOADS_DIR, filename), "wb") as f:
                f.write(data)
        except OSError as e:
            return self.send_error_json(f"No se pudo guardar el archivo: {e}", 500)

        return self.send_json({
            "name": orig_name,
            "type": file_type,
            "url": f"/uploads/{filename}",
        })

    # Silencia el log por defecto y usa uno más corto
    def log_message(self, fmt, *args):
        print(f"  {self.command} {self.path}")


def main():
    ensure_dirs()
    try:
        server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"\n  El puerto {PORT} ya está en uso (¿otro servidor abierto?).")
            print("  Cierra el otro servidor, o libera el puerto con:")
            print(f"    lsof -nP -iTCP:{PORT} -sTCP:LISTEN")
            print("    kill <PID>")
            print(f"  También puedes cambiar PORT en server.py a otro número (p. ej. 8001).\n")
            return
        raise
    print("=" * 52)
    print("  Portafolio Digital HCI - servidor local")
    print(f"  Abre en el navegador:  http://localhost:{PORT}")
    print("  Los datos se guardan en:  data/state.json")
    print("  Los archivos subidos en:  uploads/")
    print("  Detén el servidor con Ctrl+C")
    print("=" * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        server.shutdown()


if __name__ == "__main__":
    main()
