"""僅供本機使用的 JSON 分析 API，不保存或記錄文件。"""
import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BODY_BYTES = 256 * 1024
MAX_CHARACTERS = 30_000


class AnalysisServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, ui_ports=(4173, 4175)):
        super().__init__(address, Handler)
        self.analyze = None
        self.model_error = False
        self.analysis_lock = threading.Lock()
        self.allowed_origins = {f'http://{host}:{port}' for host in ('127.0.0.1', 'localhost') for port in ui_ports}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def fail(self, status, code, message):
        self.send_json(status, {'error': {'code': code, 'message': message}})

    def local_request(self):
        hosts = {f'{host}:{self.server.server_port}' for host in ('127.0.0.1', 'localhost')}
        origin = self.headers.get('Origin')
        if self.headers.get('Host') not in hosts or (origin and origin not in self.server.allowed_origins):
            self.fail(403, 'FORBIDDEN', '僅接受本機工作台的請求。')
            return False
        return True

    def do_GET(self):
        if not self.local_request():
            return
        if self.path != '/api/health':
            return self.fail(404, 'NOT_FOUND', '找不到此服務。')
        state = 'ready' if self.server.analyze else 'error' if self.server.model_error else 'loading'
        self.send_json(200, {'status': state})

    def do_POST(self):
        if not self.local_request():
            return
        if self.path != '/api/analyses':
            return self.fail(404, 'NOT_FOUND', '找不到此服務。')
        if self.headers.get('X-Deid-Request') != '1':
            return self.fail(403, 'FORBIDDEN', '缺少本機分析請求標頭。')
        if self.headers.get_content_type() != 'application/json':
            return self.fail(415, 'INVALID_CONTENT_TYPE', '請使用 JSON 格式。')
        if self.headers.get('Transfer-Encoding'):
            return self.fail(400, 'INVALID_BODY', '不接受分塊傳輸。')
        try:
            size = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            size = -1
        if not 0 <= size <= MAX_BODY_BYTES:
            return self.fail(413, 'TOO_LARGE', '檔案過大，請拆分後再試。')
        try:
            self.connection.settimeout(5)
            raw = self.rfile.read(size)
            if len(raw) != size:
                raise ValueError()
            payload = json.loads(raw.decode('utf-8'))
            text = payload.get('text') if isinstance(payload, dict) else None
            if not isinstance(text, str) or '\0' in text or any(0xD800 <= ord(c) <= 0xDFFF for c in text):
                raise ValueError()
        except (ValueError, UnicodeError, OSError):
            return self.fail(400, 'INVALID_BODY', '需要有效的 UTF-8 文字。')
        if len(text) > MAX_CHARACTERS:
            return self.fail(413, 'TOO_LARGE', '目前最多辨識 30,000 個字元，請拆分後再試。')
        if self.server.analyze is None:
            return self.fail(503, 'MODEL_UNAVAILABLE', '本機模型尚未就緒，請確認模型已安裝。')
        if not self.server.analysis_lock.acquire(blocking=False):
            return self.fail(429, 'BUSY', '正在處理其他文件，請稍後再試。')
        try:
            self.send_json(200, self.server.analyze(text))
        except ValueError:
            self.fail(422, 'ANALYSIS_LIMIT', '無法完整分析此文件，請拆分後再試。')
        except Exception:
            self.fail(500, 'ANALYSIS_FAILED', '辨識失敗，未產生遮罩結果。請重新開啟文件。')
        finally:
            self.server.analysis_lock.release()


def prepare_analyzer(create=None, analyze=None):
    if create is None and analyze is None:
        from backend.analyzer import create_analyzer, analyze_document
        create = create_analyzer
        analyze = analyze_document
    elif create is None or analyze is None:
        raise TypeError('create and analyze must be provided together')

    engine = create()
    ready = lambda text: analyze(engine, text)
    sample_email = 'setup@example.test'
    result = ready(f'聯絡 {sample_email}，電話 0912345678')
    if not any(
        entity.get('type') == 'EMAIL_ADDRESS'
        and entity.get('start') == 3
        and entity.get('end') == 3 + len(sample_email)
        for entity in result.get('entities', [])
    ):
        raise RuntimeError('Analyzer startup smoke test did not find the synthetic email')
    return ready


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--ui-port', type=int, default=4173)
    args = parser.parse_args()
    server = AnalysisServer(('127.0.0.1', args.port), ui_ports=(args.ui_port, 4175))

    def prepare():
        print('正在載入本機辨識模型…', flush=True)
        try:
            server.analyze = prepare_analyzer()
            print('本機辨識模型已就緒。', flush=True)
        except Exception:
            server.model_error = True
            print('模型載入失敗。請依 README 安裝 Python 依賴與模型，再重新啟動。', flush=True)

    # Publish the machine-readable port before another thread can write stdout.
    print(f'DEID_SERVER_PORT={server.server_port}', flush=True)
    print(f'辨識 API：http://127.0.0.1:{server.server_port}', flush=True)
    threading.Thread(target=prepare, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
