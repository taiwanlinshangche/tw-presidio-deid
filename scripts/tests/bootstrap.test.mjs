import assert from 'node:assert/strict';
import { access, chmod, cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const project = resolve(import.meta.dirname, '../..');
const macLauncher = join(project, 'start.command');
const windowsBootstrap = join(project, 'scripts/bootstrap-windows.ps1');
const expectedVersion = '24.21.0';
const expectedMacSha = 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057';
const expectedWindowsSha = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541';

async function executable(path, body) {
  await writeFile(path, body, { mode: 0o755 });
  await chmod(path, 0o755);
}

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `${name} 中文路徑 `));
  await mkdir(join(root, 'scripts'), { recursive: true });
  await cp(macLauncher, join(root, 'start.command'));
  await writeFile(join(root, 'scripts/start.mjs'), '');
  await chmod(join(root, 'start.command'), 0o755);
  return root;
}

async function macPlatformTools(bin, architecture = 'arm64') {
  await executable(join(bin, 'uname'), `#!/bin/sh\nif [ "$1" = "-s" ]; then echo Darwin; else echo ${architecture}; fi\n`);
  await executable(join(bin, 'sw_vers'), '#!/bin/sh\necho 14.7.1\n');
}

test('macOS launcher reuses a compatible Node and passes an absolute script path', async () => {
  const root = await fixture('reuse');
  const bin = join(root, 'fake-bin');
  const log = join(root, 'node.log');
  await mkdir(bin);
  await macPlatformTools(bin);
  await mkdir(join(root, 'lib/node_modules/npm/bin'), { recursive: true });
  await writeFile(join(root, 'lib/node_modules/npm/bin/npm-cli.js'), '');
  await executable(join(bin, 'node'), `#!/bin/sh\nif [ "$1" = "-p" ]; then case "$2" in *execPath*) echo "${join(bin, 'node')}";; *) echo 24.21.0;; esac; exit 0; fi\nprintf '%s\\n' "$@" > "${log}"\n`);
  const result = spawnSync('/bin/sh', [join(root, 'start.command')], {
    cwd: '/', encoding: 'utf8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(log, 'utf8'), `${join(root, 'scripts/start.mjs')}\n--open\n`);
  await assert.rejects(access(join(root, '.runtime/bootstrap.lock')));
});

test('macOS launcher downloads, verifies, atomically installs, and starts pinned Node', async () => {
  const root = await fixture('download');
  const bin = join(root, 'fake-bin');
  const log = join(root, 'download.log');
  await mkdir(bin);
  await macPlatformTools(bin);
  await executable(join(bin, 'curl'), `#!/bin/sh\nprintf '%s\\n' "$@" > "${log}"\nwhile [ "$#" -gt 0 ]; do [ "$1" = "--output" ] && { shift; : > "$1"; }; shift; done\n`);
  await executable(join(bin, 'shasum'), `#!/bin/sh\n[ -f "$3" ] || exit 1\necho '${expectedMacSha}  placeholder'\n`);
  await executable(join(bin, 'tar'), `#!/bin/sh\nwhile [ "$#" -gt 0 ]; do [ "$1" = "-C" ] && { shift; target="$1"; }; shift; done\nmkdir -p "$target/node-v${expectedVersion}-darwin-arm64/bin" "$target/node-v${expectedVersion}-darwin-arm64/lib/node_modules/npm/bin"\n: > "$target/node-v${expectedVersion}-darwin-arm64/lib/node_modules/npm/bin/npm-cli.js"\ncat > "$target/node-v${expectedVersion}-darwin-arm64/bin/node" <<NODE\n#!/bin/sh\nif [ "\\$1" = "-p" ]; then case "\\$2" in *execPath*) echo "\\$(CDPATH= cd -- \"\\$(dirname -- \"\\$0\")\" && pwd)/node";; *) echo ${expectedVersion};; esac; exit 0; fi\nprintf '%s\\n' "\\$@" > "${log}.node"\nNODE\nchmod +x "$target/node-v${expectedVersion}-darwin-arm64/bin/node"\n`);
  const result = spawnSync('/bin/sh', [join(root, 'start.command')], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(log, 'utf8'), new RegExp(`https://nodejs\\.org/dist/v${expectedVersion}/node-v${expectedVersion}-darwin-arm64\\.tar\\.gz`));
  assert.equal(await readFile(`${log}.node`, 'utf8'), `${join(root, 'scripts/start.mjs')}\n--open\n`);
});

test('macOS launcher rejects unsupported architectures before download', async () => {
  const root = await fixture('unsupported');
  const bin = join(root, 'fake-bin');
  await mkdir(bin);
  await macPlatformTools(bin, 'x86_64');
  const result = spawnSync('/bin/sh', [join(root, 'start.command')], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /僅支援 Apple Silicon/);
});

test('launchers pin official Node archives and checksums without accepting command input', async () => {
  const mac = await readFile(macLauncher, 'utf8');
  const windows = await readFile(windowsBootstrap, 'utf8');
  assert.match(mac, new RegExp(expectedVersion));
  assert.match(mac, new RegExp(expectedMacSha));
  assert.match(windows, new RegExp(expectedVersion));
  assert.match(windows, new RegExp(expectedWindowsSha));
  assert.match(windows, /node-v\$NodeVersion-win-x64\.zip/);
  assert.doesNotMatch(mac, /eval|source /);
  assert.doesNotMatch(windows, /Invoke-Expression|Start-Process/);
});

test('Windows bootstrap releases its short-lived lock before entering foreground Node', async () => {
  const windows = await readFile(windowsBootstrap, 'utf8');
  assert.match(windows, /Release-BootstrapLock\s*\r?\n\s*& \$node/);
});

test('Windows PowerShell source has a UTF-8 BOM for Windows PowerShell 5.1', async () => {
  const bytes = await readFile(windowsBootstrap);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('Windows bootstrap waits for a newly created lock to publish its PID', async () => {
  const windows = await readFile(windowsBootstrap, 'utf8');
  assert.match(windows, /if \(-not \$ownerPid\)[\s\S]*Start-Sleep -Milliseconds 100[\s\S]*Get-Content -LiteralPath \$ownerFile/);
});

test('macOS file lock rejects overlap and is released after a process-group crash', async () => {
  const root = await fixture('file-lock');
  const bin = join(root, 'fake-bin');
  const marker = join(root, 'node-check-started');
  await mkdir(bin);
  await macPlatformTools(bin);
  await mkdir(join(root, 'lib/node_modules/npm/bin'), { recursive: true });
  await writeFile(join(root, 'lib/node_modules/npm/bin/npm-cli.js'), '');
  await executable(join(bin, 'node'), `#!/bin/sh\nif [ "$1" = "-p" ]; then : > "${marker}"; sleep 5; echo 24.21.0; exit 0; fi\nexit 0\n`);
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin` };
  const holder = spawn('/bin/sh', [join(root, 'start.command')], { detached: true, env, stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await access(marker); break; } catch { await new Promise(resolve => setTimeout(resolve, 10)); }
  }

  const overlapping = spawnSync('/bin/sh', [join(root, 'start.command')], { encoding: 'utf8', env });
  process.kill(-holder.pid, 'SIGKILL');
  await new Promise(resolve => holder.once('close', resolve));
  await executable(join(bin, 'node'), `#!/bin/sh\nif [ "$1" = "-p" ]; then case "$2" in *execPath*) echo "${join(bin, 'node')}";; *) echo 24.21.0;; esac; exit 0; fi\nexit 0\n`);
  const recovered = spawnSync('/bin/sh', [join(root, 'start.command')], { encoding: 'utf8', env });

  assert.notEqual(overlapping.status, 0);
  assert.match(overlapping.stderr, /另一個初始化程序正在執行/);
  assert.equal(recovered.status, 0, recovered.stderr);
  await access(join(root, '.runtime/bootstrap.lockfile'));
});

test('macOS signal traps exit and bootstrap lock uses an OS-managed file descriptor', async () => {
  const mac = await readFile(macLauncher, 'utf8');
  assert.match(mac, /trap cleanup EXIT/);
  assert.match(mac, /trap 'exit 130' INT/);
  assert.match(mac, /exec 9>"\$LOCK_FILE"/);
  assert.match(mac, /flock\(\$f, LOCK_EX\|LOCK_NB\)/);
  assert.match(mac, /exec 9>&-/);
  assert.doesNotMatch(mac, /bootstrap\.reclaim\.lock|rm -rf "\$LOCK_FILE"/);
});
