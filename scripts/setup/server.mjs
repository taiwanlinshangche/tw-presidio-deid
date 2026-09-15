import { runtimeReady } from './manager.mjs';
import { createServer, request } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wav': 'audio/wav', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };
export function createSetupServer({ root, manager, instance, getBackendPort = () => null, getUIHandler = () => null }) {
  const server = createServer(async (req, res) => {
    const host = `127.0.0.1:${server.address().port}`;
    const origin = `http://${host}`;
    const send = (code, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' });
      res.end(typeof body === 'object' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
    };
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== origin)) return send(403, { error: '僅接受本機工作台的請求。' });
    if (req.method === 'GET' && req.url === '/api/setup/status?refresh=1') {
      if (req.headers.origin !== origin || req.headers['x-deid-setup'] !== '1') return send(403, { error: '請從本機啟動器重新檢查。' });
      manager.recheck(); return send(202, { ...manager.state, instance });
    }
    if (req.method === 'GET' && req.url === '/api/setup/status') return send(200, { ...manager.state, instance });
    if (req.method === 'POST' && req.url === '/api/setup/install') {
      if (req.headers.origin !== origin || req.headers['x-deid-setup'] !== '1') return send(403, { error: '請從工作台啟動。' });
      if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) !== 0) return send(400, { error: '安裝不接受額外參數。' });
      manager.install(); return send(202, manager.state);
    }
    if (['/api/health', '/api/analyses'].includes(req.url)) {
      if (!runtimeReady(manager.state)) {
        req.resume();
        if (req.url === '/api/health') return send(200, { status: manager.state.status === 'error' ? 'error' : 'loading' });
        return send(503, { error: { code: 'MODEL_UNAVAILABLE', message: '必要元件尚未全部通過檢查。' } });
      }
      const port = getBackendPort();
      if (!port) return send(503, { error: { message: '本機模型尚未就緒。' } });
      const proxy = request({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${port}` } }, upstream => {
        res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
      });
      proxy.on('error', () => { if (!res.headersSent) send(503, { error: { message: '本機服務已停止，請重新啟動。' } }); else res.destroy(); });
      req.on('aborted', () => proxy.destroy()); req.pipe(proxy); return;
    }
    if (req.url.startsWith('/api/')) return send(404, { error: '找不到此服務。' });
    if (runtimeReady(manager.state) && getUIHandler()) return getUIHandler()(req, res, () => send(404, { error: '找不到頁面。' }));
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: '不支援此操作。' });
    try {
      // 工作台（dist/）隨 repo 一起發布，啟動檢查與安裝都在它裡面完成；沒有 dist 只會發生在開發者刪掉建置時。
      if (!existsSync(resolve(root, 'dist/index.html'))) return send(404, { error: '尚未建置工作台：請執行 npm run build:release。' });
      const base = resolve(root, 'dist');
      const relative = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.slice(1));
      // Never expose source, .runtime, symlinks outside dist, or a directory listing.
      const file = await realpath(resolve(base, relative));
      const realBase = await realpath(base);
      if (!file.startsWith(realBase + sep)) return send(404, { error: '找不到頁面。' });
      const content = await readFile(file);
      send(200, req.method === 'HEAD' ? '' : content, types[extname(file)] || 'application/octet-stream');
    } catch { send(404, { error: '找不到頁面。' }); }
  });
  server.requestTimeout = 30_000;
  return server;
}
