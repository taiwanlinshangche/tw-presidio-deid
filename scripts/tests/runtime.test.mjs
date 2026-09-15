import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProcessRunner } from '../setup/process.mjs';
import { frontendFingerprint, validBuild, saveBuild } from '../setup/installer.mjs';

test('process runner preserves Unicode/spaced arguments and reports failures', async t => {
  const root = await mkdtemp(join(tmpdir(), '安裝 空白 ')); t.after(() => rm(root, { recursive: true, force: true }));
  const runner = new ProcessRunner(root);
  assert.equal((await runner.run(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', '中文 檔案'])).stdout, '中文 檔案');
  await assert.rejects(runner.run(process.execPath, ['-e', 'process.exit(7)']), /7/);
  await runner.close();
});

test('build validation catches changed source and missing or corrupted artifacts', async t => {
  const root = await mkdtemp(join(tmpdir(), 'setup-build-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['frontend', 'dist', '.runtime']) await mkdir(join(root, path));
  for (const file of ['package.json', 'package-lock.json', 'vite.config.js', 'frontend/index.html', 'dist/index.html']) await writeFile(join(root, file), file);
  assert.equal(await validBuild(root), false);
  await saveBuild(root); assert.equal(await validBuild(root), true);
  const before = await frontendFingerprint(root); await writeFile(join(root, 'frontend/index.html'), 'changed');
  assert.notEqual(await frontendFingerprint(root), before); assert.equal(await validBuild(root), false);
  await saveBuild(root); await writeFile(join(root, 'dist/index.html'), 'corrupt'); assert.equal(await validBuild(root), false);
});
