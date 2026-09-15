import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBackendPort, ProcessSlot } from '../setup/process.mjs';

test('a stale backend callback cannot clear the replacement backend', () => {
  const slot = new ProcessSlot();
  const oldBackend = {};
  const newBackend = {};
  slot.set(oldBackend);
  slot.set(newBackend);
  assert.equal(slot.clear(oldBackend), false);
  assert.equal(slot.current, newBackend);
  assert.equal(slot.clear(newBackend), true);
  assert.equal(slot.current, null);
});

test('backend port marker is parsed when concurrent output precedes it', () => {
  assert.equal(parseBackendPort('正在載入本機辨識模型…DEID_SERVER_PORT=61752'), 61752);
});
