import test from 'node:test';
import assert from 'node:assert/strict';
import { SetupManager, runtimeReady } from '../setup/manager.mjs';
import { inspectRuntime } from '../setup/installer.mjs';

const ids = ['node', 'python', 'presidio', 'torch', 'transformers', 'huggingface', 'ckip', 'tokenizer', 'frontend'];
function fixture(overrides = {}, steps = [], start = async () => {}) {
  const state = Object.fromEntries(ids.map(id => [id, 'ready'])); Object.assign(state, overrides);
  const inspect = async publish => { for (const id of ids) publish({ id, status: state[id] }); };
  return { state, manager: new SetupManager(steps, start, inspect) };
}

test('missing CKIP leaves independent tokenizer ready and analysis blocked', async () => {
  const { manager } = fixture({ ckip: 'missing' }, [], () => assert.fail('must not start'));
  await manager.check();
  assert.equal(manager.state.items.length, 10);
  assert.equal(manager.state.items.find(x => x.id === 'ckip').status, 'missing');
  assert.equal(manager.state.items.find(x => x.id === 'tokenizer').status, 'ready');
  assert.equal(manager.state.items.find(x => x.id === 'analysis').status, 'blocked');
  assert.equal(manager.state.items.filter(x => x.status === 'ready').length, 8);
  assert.equal(runtimeReady(manager.state), false);
});

test('install is single-flight, repairs only missing group then checks again', async () => {
  let installs = 0, starts = 0;
  const f = fixture({ ckip: 'missing' }, [], async () => { starts++; });
  f.manager.steps = [
    { id: 'packages', itemIds: ['presidio', 'torch', 'transformers', 'huggingface'], check: () => assert.fail('already checked'), install: () => assert.fail('should skip') },
    { id: 'models', label: '下載中文模型', itemIds: ['ckip', 'tokenizer'], check: async () => f.state.ckip === 'ready', install: async () => { installs++; f.state.ckip = 'ready'; } },
  ];
  await f.manager.check();
  const one = f.manager.install(); const two = f.manager.install(); assert.equal(one, two);
  await one;
  assert.equal(installs, 1); assert.equal(starts, 1); assert.ok(runtimeReady(f.manager.state));
});

test('download failure preserves ready items and retry can recover', async () => {
  let fail = true;
  const f = fixture({ ckip: 'missing' });
  f.manager.steps = [{ id: 'models', label: '下載中文模型', itemIds: ['ckip', 'tokenizer'], check: async () => f.state.ckip === 'ready', install: async () => { if (fail) throw new Error('ENOSPC'); f.state.ckip = 'ready'; } }];
  await f.manager.install();
  assert.equal(f.manager.state.status, 'error');
  assert.equal(f.manager.state.items.find(x => x.id === 'tokenizer').status, 'ready');
  assert.match(f.manager.state.message, /空間/);
  fail = false; await f.manager.install(); assert.ok(runtimeReady(f.manager.state));
});

test('failed smoke is never ready and later service failure revokes readiness', async () => {
  const f = fixture({}, [], async () => { throw new Error('smoke failed'); });
  await f.manager.check();
  assert.equal(f.manager.state.items.find(x => x.id === 'analysis').status, 'error');
  assert.equal(runtimeReady(f.manager.state), false);
  f.manager.start = async () => {}; await f.manager.install(); assert.ok(runtimeReady(f.manager.state));
  f.manager.failAnalysis('辨識服务停止'); assert.equal(runtimeReady(f.manager.state), false);
});

test('ready gate rejects a scalar ready flag or duplicate/missing items', () => {
  assert.equal(runtimeReady({ status: 'ready' }), false);
  assert.equal(runtimeReady({ status: 'ready', items: Array(10).fill({ id: 'python', status: 'ready' }) }), false);
});

test('runtime inspection uses one Python report and still inspects frontend if Python cannot run', async () => {
  let reports = 0; const updates = [];
  const runner = { async run(command, args) {
    if (args.includes('report')) { reports++; throw new Error('ENOENT'); }
    return { stdout: '10.0.0', stderr: '' };
  } };
  await inspectRuntime('/nonexistent-checklist-fixture', runner, item => updates.push(item));
  assert.equal(reports, 1);
  assert.ok(updates.some(x => x.id === 'python' && x.status === 'missing'));
  assert.ok(updates.some(x => x.id === 'presidio' && x.status === 'blocked'));
  assert.ok(updates.some(x => x.id === 'frontend' && x.status === 'missing'));
});

test('Python report that exits abnormally cannot leave all rows ready', async () => {
  const updates = [];
  const runner = { async run(command, args, options) {
    if (args.includes('report')) {
      for (const id of ['python','presidio','torch','transformers','huggingface','ckip','tokenizer']) options.onData(JSON.stringify({ id, status: 'ready' }) + '\n', 'stdout');
      throw new Error('process exited 1');
    }
    return { stdout: '10', stderr: '' };
  } };
  await inspectRuntime('/nonexistent-checklist-fixture', runner, item => updates.push(item));
  assert.equal(updates.filter(x => x.id === 'python').at(-1).status, 'error');
});

test('launch recheck does not reuse stale ready items or install anything', async () => {
  const f = fixture(); await f.manager.check(); assert.ok(runtimeReady(f.manager.state));
  f.state.ckip = 'missing'; await f.manager.recheck();
  assert.equal(runtimeReady(f.manager.state), false);
  assert.equal(f.manager.state.items.find(item => item.id === 'ckip').status, 'missing');
});
