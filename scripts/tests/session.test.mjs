import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireSession } from '../setup/session.mjs';

test('same project is single-instance and clean shutdown releases ownership', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'session-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const first = await acquireSession(dir);
  await first.publish(4567);
  const second = await acquireSession(dir);
  assert.equal(second.existing.port, 4567); assert.equal(second.existing.instance, first.instance);
  await first.release();
  const third = await acquireSession(dir); assert.ok(third.instance); await third.release();
});

test('stale session from exited process can be recovered', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'session-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'session.json'), JSON.stringify({ pid: 2147483647, instance: 'old', port: 4567 }));
  const next = await acquireSession(dir); assert.ok(next.instance); assert.notEqual(next.instance, 'old'); await next.release();
});

test('empty session left by a crashed legacy launcher can be recovered', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'session-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'session.json'), '');
  const next = await acquireSession(dir, { malformedGraceMs: 0 });
  await next.publish(4568);
  assert.equal(JSON.parse(await readFile(join(dir, 'session.json'), 'utf8')).port, 4568);
  await next.release();
});

test('simultaneous claimants preserve one owner', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'session-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const claim = () => acquireSession(dir).then(async result => {
    if (!result.existing) await result.publish(4569);
    return result;
  });
  const [first, second] = await Promise.all([claim(), claim()]);
  const owners = [first, second].filter(result => !result.existing);
  assert.equal(owners.length, 1);
  await owners[0].release();
});
