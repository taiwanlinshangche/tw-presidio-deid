import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function downloadVerified(url, destination, sha256, onProgress = () => {}, signal) {
  await mkdir(dirname(destination), { recursive: true });
  try { if (await digest(destination) === sha256) return; } catch { /* no usable cache */ }
  const partial = `${destination}.part`;
  try {
    const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(600_000)]) : AbortSignal.timeout(600_000) });
    if (!response.ok) throw new Error(`下載失敗：HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length')) || null;
    let received = 0;
    const file = await open(partial, 'w');
    try {
      for await (const chunk of response.body) {
        // FileHandle.write can write fewer bytes than requested.
        let offset = 0;
        while (offset < chunk.length) offset += (await file.write(chunk, offset)).bytesWritten;
        received += chunk.length;
        onProgress(total ? { received, total } : null);
      }
    } finally { await file.close(); }
    if (await digest(partial) !== sha256) throw new Error('下載檔案校驗失敗，請重試。');
    await rm(destination, { force: true });
    await rename(partial, destination);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
