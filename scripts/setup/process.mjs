import { spawn } from 'node:child_process';
import { dirname, delimiter } from 'node:path';

export class ProcessSlot {
  constructor() { this.current = null; }
  set(child) { this.current = child; }
  isCurrent(child) { return this.current === child; }
  clear(child) {
    if (!this.isCurrent(child)) return false;
    this.current = null;
    return true;
  }
}

export function parseBackendPort(output) {
  const match = output.match(/DEID_SERVER_PORT=(\d+)/);
  return match ? Number(match[1]) : null;
}

export class ProcessRunner {
  constructor(root, env = {}) {
    this.root = root;
    this.env = { ...process.env, ...env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH || ''}` };
    this.children = new Set();
    this.controller = new AbortController();
    this.closed = false;
  }
  spawn(command, args, onData = () => {}) {
    if (this.closed) throw new Error('啟動器已關閉。');
    const child = spawn(command, args, { cwd: this.root, env: this.env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    this.children.add(child);
    child.once('close', () => this.children.delete(child));
    child.stdout.on('data', data => onData(data.toString(), 'stdout'));
    child.stderr.on('data', data => onData(data.toString(), 'stderr'));
    return child;
  }
  run(command, args, { onData = () => {}, timeout = 30 * 60_000 } = {}) {
    return new Promise((resolve, reject) => {
      let stdout = '', stderr = '';
      const child = this.spawn(command, args, (data, stream) => {
        if (stream === 'stdout') stdout = (stdout + data).slice(-16_384);
        else stderr = (stderr + data).slice(-16_384);
        onData(data, stream);
      });
      const timer = setTimeout(() => { this.kill(child); reject(new Error('操作逾時，請重試。')); }, timeout);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', code => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`程序結束（${code ?? '已中止'}）：${stderr || stdout}`));
      });
    });
  }
  kill(child, force = false) {
    if (!child.pid || child.exitCode !== null) return;
    if (process.platform === 'win32') {
      // taskkill /T also stops installer descendants; never target unrelated processes.
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.kill());
    } else {
      try { process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { /* already stopped */ }
    }
  }
  async stop(child) {
    if (!child || child.exitCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { this.kill(child, true); resolve(); }, 2000);
      child.once('close', () => { clearTimeout(timer); resolve(); });
      this.kill(child);
    });
  }
  async close() {
    this.closed = true;
    this.controller.abort();
    const children = [...this.children];
    await Promise.all(children.map(child => this.stop(child)));
  }
}
