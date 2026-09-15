import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile, readdir, mkdir, rm, rename, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { downloadVerified } from './download.mjs';

const UV_VERSION = '0.12.13';
const UV = {
  'darwin-arm64': { archive: 'uv-aarch64-apple-darwin.tar.gz', sha: '7e6ddb9316acc00f2296c82ff4d99977870ee34b2f0ddcae9444d714db9364ed', binary: 'uv-aarch64-apple-darwin/uv' },
  'win32-x64': { archive: 'uv-x86_64-pc-windows-msvc.zip', sha: 'a86c9dc7bad9b03f388583b7187c05fe9951c2e0d392217e8fd43d97787f6ec2', binary: 'uv.exe' },
};
async function treeHash(directory) {
  const hash = createHash('sha256');
  async function visit(path, prefix = '') {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await visit(join(path, entry.name), name);
      else if (entry.isFile()) { hash.update(name); hash.update(await readFile(join(path, entry.name))); }
      else throw new Error('建置目錄不接受符號連結。');
    }
  }
  await visit(directory);
  return hash.digest('hex');
}
export async function frontendFingerprint(root) {
  const hash = createHash('sha256');
  for (const name of ['package.json', 'package-lock.json', 'vite.config.js']) hash.update(await readFile(join(root, name)));
  hash.update(await treeHash(join(root, 'frontend')));
  return hash.digest('hex');
}
export async function saveBuild(root) {
  await mkdir(join(root, '.runtime'), { recursive: true });
  await writeFile(join(root, '.runtime/build.json'), JSON.stringify({ source: await frontendFingerprint(root), output: await treeHash(join(root, 'dist')) }));
}
export async function validBuild(root) {
  try {
    const saved = JSON.parse(await readFile(join(root, '.runtime/build.json'), 'utf8'));
    return existsSync(join(root, 'dist/index.html')) && saved.source === await frontendFingerprint(root) && saved.output === await treeHash(join(root, 'dist'));
  } catch { return false; }
}
export function runtimeEnvironment(root) {
  const runtime = join(root, '.runtime');
  return {
    UV_PYTHON_INSTALL_DIR: join(runtime, 'python'), UV_PYTHON_BIN_DIR: join(runtime, 'python-bin'),
    UV_CACHE_DIR: join(runtime, 'uv-cache'), UV_PYTHON_PREFERENCE: 'only-managed', UV_NO_CONFIG: '1',
    UV_PYTHON_INSTALL_REGISTRY: '0', UV_PYTHON_NO_REGISTRY: '1', UV_PYTHON_INSTALL_BIN: '0',
    HF_HOME: join(runtime, 'huggingface'), HF_HUB_DISABLE_TELEMETRY: '1', HF_HUB_DISABLE_IMPLICIT_TOKEN: '1',
    HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8',
    npm_config_cache: join(runtime, 'npm-cache'), npm_config_audit: 'false', npm_config_fund: 'false',
  };
}
export function pythonPath(root) { return join(root, '.runtime', 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'); }
export function npmCLI() {
  const paths = [process.env.npm_execpath, process.env.DEID_NPM_CLI,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const cli = paths.find(path => path?.endsWith('npm-cli.js') && existsSync(path));
  if (!cli) throw new Error('找不到 npm，請使用專案的啟動檔重新開啟。');
  return cli;
}
export function installSteps(root, runner) {
  const runtime = join(root, '.runtime');
  const python = pythonPath(root);
  const uv = join(runtime, process.platform === 'win32' ? 'uv.exe' : 'uv');
  const succeeds = async (command, args) => { try { await runner.run(command, args, { timeout: 120_000 }); return true; } catch { return false; } };
  async function ensureUV(progress) {
    if (await succeeds(uv, ['--version'])) return;
    const target = UV[`${process.platform}-${process.arch}`];
    if (!target) throw new Error('目前僅支援 Apple Silicon Mac 與 Windows x64。');
    const archive = join(runtime, target.archive);
    await downloadVerified(`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${target.archive}`, archive, target.sha, progress, runner.controller.signal);
    const staging = join(runtime, 'uv-extract');
    await rm(staging, { recursive: true, force: true }); await mkdir(staging, { recursive: true });
    if (process.platform === 'win32') {
      // Paths are environment variables, never interpolated into PowerShell source.
      const previous = { ...runner.env };
      runner.env.DEID_ARCHIVE = archive; runner.env.DEID_EXTRACT = staging;
      try { await runner.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:DEID_ARCHIVE -DestinationPath $env:DEID_EXTRACT -Force']); }
      finally { runner.env = previous; }
    } else await runner.run('/usr/bin/tar', ['-xzf', archive, '-C', staging]);
    await rm(uv, { force: true }); await rename(join(staging, target.binary), uv);
    if (process.platform !== 'win32') await chmod(uv, 0o755);
    await rm(staging, { recursive: true, force: true });
  }
  const check = mode => succeeds(python, ['-m', 'backend.setup_check', mode]);
  const npm = args => runner.run(process.execPath, [npmCLI(), ...args]);
  return [
    { id: 'frontend', itemIds: ['frontend'], label: '準備網頁元件',
      check: () => validFrontendDependencies(root, runner),
      install: async () => { await npm(['ci', '--include=dev', '--no-audit', '--no-fund']); await writeFile(join(runtime, 'npm-lock.sha'), createHash('sha256').update(await readFile(join(root, 'package-lock.json'))).digest('hex')); },
    },
    { id: 'python', itemIds: ['python'], label: '準備 Python',
      check: () => succeeds(python, ['-c', 'import sys; assert sys.version_info[:2] == (3, 12)']),
      install: async progress => {
        await ensureUV(progress); progress(null);
        await runner.run(uv, ['python', 'install', '3.12', '--no-bin', '--no-registry']);
        // Only the dedicated, app-owned environment is replaced when unusable.
        await rm(join(runtime, 'venv'), { recursive: true, force: true });
        await runner.run(uv, ['venv', '--python', '3.12', join(runtime, 'venv')]);
      },
    },
    { id: 'packages', itemIds: ['presidio', 'torch', 'transformers', 'huggingface'], label: '安裝辨識套件', check: () => check('dependencies'),
      install: async progress => { await ensureUV(progress); progress(null); await runner.run(uv, ['pip', 'install', '--python', python, '--only-binary', ':all:', '-r', 'backend/requirements.txt']); await runner.run(uv, ['pip', 'check', '--python', python]); },
    },
    { id: 'models', itemIds: ['ckip', 'tokenizer'], label: '下載中文模型', check: () => check('models'),
      install: async progress => {
        let pending = '';
        await runner.run(python, ['-u', 'scripts/download-model.py'], { onData(data, stream) {
          if (stream !== 'stdout') return;
          pending += data;
          const lines = pending.split('\n'); pending = lines.pop();
          for (const line of lines) {
            try { const event = JSON.parse(line); if (event.type === 'progress') progress(event.total > 0 ? { received: event.received, total: event.total, unit: event.unit } : null); } catch { /* informational output */ }
          }
        } });
      },
    },
    { id: 'build', itemIds: ['frontend'], label: '準備工作台', check: () => validBuild(root), install: async () => { await npm(['run', 'build']); await saveBuild(root); } },
  ];
}

async function validFrontendDependencies(root, runner) {
  try {
    const expected = createHash('sha256').update(await readFile(join(root, 'package-lock.json'))).digest('hex');
    if (await readFile(join(root, '.runtime/npm-lock.sha'), 'utf8') !== expected) return false;
    await runner.run(process.execPath, [npmCLI(), 'ls', '--all', '--include=dev'], { timeout: 120_000 });
    return true;
  } catch { return false; }
}

export async function inspectRuntime(root, runner, publish) {
  publish({ id: 'node', status: 'checking' });
  const [major, minor] = process.versions.node.split('.').map(Number);
  try {
    if (!(major > 22 || major === 22 && minor >= 12)) throw new Error('incompatible Node');
    await runner.run(process.execPath, [npmCLI(), '--version'], { timeout: 30_000 });
    publish({ id: 'node', status: 'ready', detail: `Node.js ${process.versions.node}` });
  } catch { publish({ id: 'node', status: 'missing', detail: '請重新執行啟動檔，準備相容的 Node.js 與 npm' }); }

  const pythonIds = ['python', 'presidio', 'torch', 'transformers', 'huggingface', 'ckip', 'tokenizer'];
  const completed = new Set();
  let pending = '';
  const consume = line => {
    try {
      const item = JSON.parse(line);
      if (!pythonIds.includes(item.id) || !['checking', 'ready', 'missing', 'blocked', 'error'].includes(item.status)) return;
      publish({ id: item.id, status: item.status, ...(typeof item.detail === 'string' ? { detail: item.detail } : {}) });
      if (item.status !== 'checking') completed.add(item.id);
    } catch { /* stdout report owns JSON lines; malformed reports fail closed below */ }
  };
  publish({ id: 'python', status: 'checking' });
  try {
    await runner.run(pythonPath(root), ['-u', '-m', 'backend.setup_check', 'report'], {
      timeout: 120_000,
      onData(data, stream) {
        if (stream !== 'stdout') return;
        pending += data;
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) consume(line);
      },
    });
    if (pending.trim()) consume(pending);
  } catch {
    // A complete-looking report is not valid if its process failed afterwards.
    if (completed.has('python')) publish({ id: 'python', status: 'error', detail: '環境檢查未正常完成，請重試' });
  }
  for (const id of pythonIds) {
    if (completed.has(id)) continue;
    publish({ id, status: id === 'python' ? 'missing' : 'blocked', detail: id === 'python' ? '專案 Python 無法執行' : '需先準備可用的 Python 檢查環境' });
  }
  publish({ id: 'frontend', status: 'checking' });
  const usable = await validFrontendDependencies(root, runner) && await validBuild(root);
  publish({ id: 'frontend', status: usable ? 'ready' : 'missing', detail: usable ? '網頁套件與建置有效' : '網頁套件或建置需要準備' });
}
