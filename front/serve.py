"""Loopback, GET-only viewer. No database or filesystem gateway."""

import argparse
from http.client import HTTPConnection, HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
READ_ROUTE = re.compile(r"/(?:claims(?:/[^/]+)?|trace/[^/]+|assets(?:/[^/]+)?|bundles/[^/]+)")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, status, data, content_type="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def failure(self, status, message):
        self.reply(status, json.dumps({"ok": False, "error": {"message": message}}, ensure_ascii=False).encode())

    def do_GET(self):
        parsed = urlsplit(self.path)
        if parsed.path in ("/", "/index.html"):
            return self.reply(200, (ROOT / "index.html").read_bytes(), "text/html; charset=utf-8")
        if not parsed.path.startswith("/api/"):
            return self.failure(404, "未找到")
        path = parsed.path[4:]
        decoded = unquote(path)
        if not READ_ROUTE.fullmatch(decoded) or any(p in (".", "..") for p in decoded.split("/")) or "\\" in decoded or any(ord(c) < 32 for c in decoded):
            return self.failure(404, "未找到只读接口")
        connection = HTTPConnection("127.0.0.1", self.server.backend_port, timeout=5)
        try:
            headers = {}
            if self.headers.get("Authorization"):
                headers["Authorization"] = self.headers["Authorization"]
            connection.request("GET", path + ("?" + parsed.query if parsed.query else ""), headers=headers)
            response = connection.getresponse()
            self.reply(response.status, response.read(), response.getheader("Content-Type", "application/json"))
        except (OSError, TimeoutError, HTTPException):
            self.failure(503, "服务未起，请启动 Knot 后端后重试")
        finally:
            connection.close()

    def reject(self):
        self.close_connection = True
        self.failure(405, "只读入口，仅允许 GET")

    do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_HEAD = reject


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=7319)
    parser.add_argument("--backend-port", type=int, default=7318)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.backend_port = args.backend_port
    print(f"http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
