import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function unlinkIfSame(file, expected) {
  try {
    const current = await readJson(file);
    if (current?.instance === expected.instance) await unlink(file);
  } catch { /* another claimant changed or removed it */ }
}

async function atomicWrite(file, value, instance) {
  const temporary = `${file}.${instance}.tmp`;
  await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  try { await rename(temporary, file); } finally { await unlink(temporary).catch(() => {}); }
}

export async function acquireSession(directory, { malformedGraceMs = 1000 } = {}) {
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'session.json');
  const lock = join(directory, 'session.lock');
  const instance = randomUUID();
  const owner = { pid: process.pid, instance, port: null };

  for (let attempt = 0; attempt < 30; attempt++) {
    let published;
    try { published = await readJson(file); }
    catch {
      try {
        const details = await stat(file);
        if (Date.now() - details.mtimeMs < malformedGraceMs) {
          await delay(100); continue;
        }
      } catch { /* it was replaced or removed; acquisition below is safe */ }
      published = null;
    }
    if (published && isAlive(published.pid)) {
      if (published.port) return { existing: published };
      await delay(100); continue;
    }

    const temporaryLock = `${lock}.${instance}.tmp`;
    await writeFile(temporaryLock, JSON.stringify(owner), { mode: 0o600, flag: 'wx' });
    try {
      await link(temporaryLock, lock);
      await unlink(temporaryLock);
      await atomicWrite(file, owner, instance);
      return {
        instance,
        async publish(port) {
          owner.port = port;
          const current = await readJson(lock);
          if (current?.instance !== instance) throw new Error('啟動工作階段的所有權已變更。');
          await atomicWrite(file, owner, instance);
        },
        async release() {
          await unlinkIfSame(file, owner);
          await unlinkIfSame(lock, owner);
        },
      };
    } catch (error) {
      await unlink(temporaryLock).catch(() => {});
      if (error.code !== 'EEXIST') throw error;
    }

    try {
      const lockOwner = await readJson(lock);
      if (isAlive(lockOwner.pid)) {
        const current = await readJson(file).catch(() => null);
        if (current?.instance === lockOwner.instance && current.port) return { existing: current };
      } else {
        await unlinkIfSame(lock, lockOwner);
      }
    } catch {
      // New locks are atomically published. Only remove malformed legacy locks
      // after a grace period, and only when their filesystem identity is unchanged.
      try {
        const before = await stat(lock);
        if (Date.now() - before.mtimeMs >= malformedGraceMs) {
          const after = await stat(lock);
          if (before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs) await unlink(lock);
        }
      } catch { /* another claimant changed or removed it */ }
    }
    await delay(100);
  }
  throw new Error('另一個啟動程序仍在準備中。請稍候，或關閉原啟動視窗後再試。');
}
