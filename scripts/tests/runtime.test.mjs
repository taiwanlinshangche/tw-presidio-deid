import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProcessRunner } from '../setup/process.mjs';
import { frontendFingerprint, validBuild, saveBuild, writeBuildManifest, shippedBuildValid } from '../setup/installer.mjs';
import { resolve } from 'node:path';

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

test('shipped build manifest validates a fresh download without .runtime', async t => {
  const root = await mkdtemp(join(tmpdir(), 'setup-shipped-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['frontend', 'dist']) await mkdir(join(root, path));
  for (const file of ['package.json', 'package-lock.json', 'vite.config.js', 'frontend/index.html', 'dist/index.html']) await writeFile(join(root, file), file);
  assert.equal(await validBuild(root), false);
  await writeBuildManifest(root);
  assert.equal(await shippedBuildValid(root), true); assert.equal(await validBuild(root), true);
  await writeFile(join(root, 'frontend/index.html'), 'changed'); assert.equal(await validBuild(root), false);
});

test('repo ships a dist/ that matches the source (run npm run build:release before publishing)', async () => {
  assert.equal(await shippedBuildValid(resolve(import.meta.dirname, '../..')), true, 'frontend-build.json 與 dist/ 不符合目前原始碼，請執行 npm run build:release');
});
