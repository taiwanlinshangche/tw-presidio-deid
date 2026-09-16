import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { SetupManager } from './setup/manager.mjs';
import { parseBackendPort, ProcessRunner, ProcessSlot } from './setup/process.mjs';
import { installSteps, inspectRuntime, pythonPath, runtimeEnvironment } from './setup/installer.mjs';
import { createSetupServer } from './setup/server.mjs';
import { acquireSession } from './setup/session.mjs';

const root = resolve(import.meta.dirname, '..');
const development = process.argv.includes('--dev');
// 開發模式要用 node_modules 裡的 Vite；全新 clone 沒有 node_modules（隨附建置不需要它），一開始就講清楚，不要等模型載完才失敗。
if (development && !existsSync(join(root, 'node_modules/vite/dist/node/index.js'))) {
  console.error('開發模式需要 npm 套件：請先執行 npm ci，一般使用請直接執行 start.command（或 npm start）。');
  process.exit(1);
}
const shouldOpen = process.argv.includes('--open');
function openBrowser(url) {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? '/usr/bin/open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log(`請在瀏覽器開啟 ${url}`)); child.unref();
}

let session, runner, server, stopping = false, backendPort = null, backend, viteServer;
const backendSlot = new ProcessSlot();
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  if (server) { server.closeAllConnections(); server.close(); }
  await viteServer?.close();
  await runner?.close();
  await session?.release?.();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('SIGHUP', () => stop());

try {
  session = await acquireSession(join(root, '.runtime'));
  if (session.existing) {
    const url = `http://127.0.0.1:${session.existing.port}`;
    const state = await fetch(`${url}/api/setup/status`, { signal: AbortSignal.timeout(2000) }).then(r => r.json());
    if (state.instance !== session.existing.instance) throw new Error('原啟動程序沒有回應，請關閉原啟動視窗後重試。');
    const refresh = await fetch(`${url}/api/setup/status?refresh=1`, { headers: { Origin: url, 'X-Deid-Setup': '1' }, signal: AbortSignal.timeout(2000) });
    if (!refresh.ok) throw new Error('請先關閉舊啟動視窗，再重新執行啟動檔。');
    console.log(`工作台已開啟，正在重新檢查：${url}`);
    if (shouldOpen) openBrowser(url);
  } else {
    runner = new ProcessRunner(root, runtimeEnvironment(root));
    const manager = new SetupManager(installSteps(root, runner), async () => {
      if (backend) {
        const previous = backend;
        await runner.stop(previous);
        backendSlot.clear(previous);
        if (backend === previous) backend = null;
        backendPort = null;
      }
      let line = '';
      let failed = null;
      const child = runner.spawn(pythonPath(root), ['-u', '-m', 'backend.server', '--port', '0', '--ui-port', String(server.address().port)], (data, stream) => {
        if (!backendSlot.isCurrent(child)) return;
        if (stream === 'stderr') { process.stderr.write(data); return; }
        line += data; const lines = line.split('\n'); line = lines.pop();
        for (const output of lines) {
          const reportedPort = parseBackendPort(output);
          if (reportedPort) backendPort = reportedPort;
          else if (output.trim()) console.log(output);
        }
      });
      backend = child;
      backendSlot.set(child);
      child.once('error', error => { if (backendSlot.isCurrent(child)) failed = error; });
      child.once('exit', () => {
        if (!backendSlot.clear(child)) return;
        failed ||= new Error('本機辨識服務已停止。'); backendPort = null;
        if (backend === child) backend = null;
        if (!stopping && manager.state.status === 'ready') manager.failAnalysis('本機辨識服務已停止，請重新開啟啟動檔。');
      });
      try {
        const deadline = Date.now() + 120_000;
        while (!stopping && Date.now() < deadline) {
          if (failed) throw failed;
          if (backendPort) {
            const response = await fetch(`http://127.0.0.1:${backendPort}/api/health`, { signal: AbortSignal.timeout(2000) });
            const state = await response.json();
            if (state.status === 'ready') {
              if (development && !viteServer) {
                const { createServer } = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href);
                viteServer = await createServer({ configFile: join(root, 'vite.config.js'), server: { middlewareMode: true, ws: { server } } });
              }
              return;
            }
            if (state.status === 'error') throw new Error('模型載入或辨識測試失敗。');
          }
          await delay(250);
        }
        throw new Error('模型載入逾時，請確認可用記憶體後重試。');
      } catch (error) {
        await runner.stop(child);
        if (backendSlot.clear(child)) backendPort = null;
        if (backend === child) backend = null;
        throw error;
      }
    }, publish => inspectRuntime(root, runner, publish));
    server = createSetupServer({ root, manager, instance: session.instance, getBackendPort: () => backendPort, getUIHandler: () => viteServer?.middlewares });
    const preferredPort = Number(process.env.DEID_PORT || 4173);
    await new Promise((resolve, reject) => {
      server.once('error', error => {
        if (error.code === 'EADDRINUSE') server.listen(0, '127.0.0.1', resolve);
        else reject(error);
      });
      server.listen(preferredPort, '127.0.0.1', resolve);
    });
    await session.publish(server.address().port);
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`工作台：${url}\n關閉時請按 Control + C。`);
    if (shouldOpen) openBrowser(url);
    await manager.check();
    // 只有網頁建置過期（原始碼更新後）時不必等使用者按安裝：本機重建，不需要網路。
    const { status, items } = manager.state;
    const onlyFrontendStale = status === 'missing' && items.some(item => item.id === 'frontend' && item.status === 'missing')
      && items.every(item => item.status === 'ready' || item.id === 'frontend' || item.id === 'analysis');
    if (onlyFrontendStale) await manager.install();
  }
} catch (error) {
  console.error(`無法啟動：${error.message}`);
  await stop(1);
}
