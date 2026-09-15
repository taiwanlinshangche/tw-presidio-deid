import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request } from 'node:http';
import { SetupManager } from '../setup/manager.mjs';
import { downloadVerified } from '../setup/download.mjs';
import { createSetupServer } from '../setup/server.mjs';

const temp = async t => { const dir = await mkdtemp(join(tmpdir(), '去識別 setup ')); t.after(() => rm(dir, { recursive: true, force: true })); return dir; };

test('failed post-install verification never reports ready', async () => {
  const ids = ['node', 'python', 'presidio', 'torch', 'transformers', 'huggingface', 'ckip', 'tokenizer', 'frontend'];
  const inspect = async publish => ids.forEach(id => publish({ id, status: id === 'ckip' ? 'missing' : 'ready' }));
  const manager = new SetupManager([{ id: 'models', itemIds: ['ckip', 'tokenizer'], label: '模型', check: async () => false, install: async () => {} }], async () => assert.fail('must not start'), inspect);
  await manager.install(); assert.equal(manager.state.status, 'error');
  assert.equal(manager.state.items.find(item => item.id === 'ckip').status, 'error');
});

test('download validates checksum, reuses valid cache, and rejects corrupted data', async t => {
  const dir = await temp(t); let requests = 0;
  const source = createServer((req, res) => { requests++; res.end('hello'); });
  await new Promise(resolve => source.listen(0, '127.0.0.1', resolve)); t.after(() => source.close());
  const url = `http://127.0.0.1:${source.address().port}`; const dest = join(dir, 'archive');
  const hash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
  await downloadVerified(url, dest, hash); await downloadVerified(url, dest, hash);
  assert.equal(requests, 1); assert.equal(await readFile(dest, 'utf8'), 'hello');
  await assert.rejects(downloadVerified(url, join(dir, 'bad'), '0'.repeat(64)), /校驗/);
});

test('setup API refuses cross-origin, unexpected payloads, and arbitrary commands', async t => {
  const dir = await temp(t); let installs = 0; let rechecks = 0;
  const manager = { state: { status: 'missing' }, install() { installs++; return Promise.resolve(); }, recheck() { rechecks++; return Promise.resolve(); } };
  const server = createSetupServer({ root: dir, manager, instance: 'test' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/setup/status`)).status, 200);
  const post = (headers, body) => fetch(`${base}/api/setup/install`, { method: 'POST', headers, body });
  assert.equal((await post({ Origin: 'https://evil.example', 'X-Deid-Setup': '1' })).status, 403);
  assert.equal((await post({ Origin: base })).status, 403);
  assert.equal((await post({ Origin: base, 'X-Deid-Setup': '1' }, 'command=evil')).status, 400);
  assert.equal((await post({ Origin: base, 'X-Deid-Setup': '1' })).status, 202);
  assert.equal(installs, 1);
  assert.equal((await fetch(`${base}/api/setup/status?refresh=1`)).status, 403);
  assert.equal((await fetch(`${base}/api/setup/status?refresh=1`, { headers: { Origin: base, 'X-Deid-Setup': '1' } })).status, 202);
  assert.equal(rechecks, 1); assert.equal(installs, 1);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  const status = await new Promise(resolve => { const req = request(`${base}/api/setup/status`, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.end(); });
  assert.equal(status, 403);
});

test('analysis API requires all ten server-side readiness results', async t => {
  const dir = await temp(t); let forwarded = 0;
  const backend = createServer((req, res) => { forwarded++; req.resume(); res.end('{}'); });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve)); t.after(() => backend.close());
  const manager = { state: { status: 'ready' } };
  const server = createSetupServer({ root: dir, manager, instance: 'gate', getBackendPort: () => backend.address().port });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/analyses`, { method: 'POST' })).status, 503);
  assert.equal(forwarded, 0);
  manager.state.items = ['node','python','presidio','torch','transformers','huggingface','ckip','tokenizer','frontend','analysis'].map(id => ({ id, status: 'ready' }));
  assert.equal((await fetch(`${base}/api/analyses`, { method: 'POST' })).status, 200);
  assert.equal(forwarded, 1);
});

test('development UI handler is reached only after complete readiness', async t => {
  const dir = await temp(t); let calls = 0;
  const manager = { state: { status: 'missing', items: [] } };
  const server = createSetupServer({ root: dir, manager, instance: 'dev', getUIHandler: () => (req, res) => { calls++; res.end('dev'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/main.js`;
  assert.equal((await fetch(url)).status, 404); assert.equal(calls, 0);
  manager.state = { status: 'ready', items: ['node','python','presidio','torch','transformers','huggingface','ckip','tokenizer','frontend','analysis'].map(id => ({ id, status: 'ready' })) };
  assert.equal(await (await fetch(url)).text(), 'dev'); assert.equal(calls, 1);
});
