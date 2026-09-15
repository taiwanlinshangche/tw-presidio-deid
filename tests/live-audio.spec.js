import { test, expect } from '@playwright/test';

const names = ['01_拖入檔案_把檔案拖進來.wav', '02_放開_版本一.wav', '03_放開_版本二.wav', '04_開始處理_讓我幫你看看.wav', '05_思考中_嗯_版本一.wav', '06_思考中_嗯_版本二.wav', '07_完成_好了.wav'];

test('七個 WAV 可解碼，真實播放器完成啟動與處理配音', async ({ page }) => {
  await page.addInitScript(() => {
    window.playedClips = [];
    document.addEventListener('play', event => {
      if (event.target.id === 'ui-audio') window.playedClips.push(decodeURIComponent(event.target.src.split('/').pop()).slice(0, 2));
    }, true);
  });
  await page.goto('/');
  await page.screenshot({ path: 'work/start-screen.png', animations: 'disabled' });
  await expect(page.locator('#ui-audio')).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await expect(page.locator('#enable-audio')).toHaveCount(0);
  await expect.poll(() => page.locator('#ui-audio').evaluate(el => el.currentTime), { timeout: 5000 }).toBeGreaterThan(.1);
  await expect.poll(() => page.locator('#ui-audio').evaluate(el => el.ended), { timeout: 5000 }).toBe(true);
  const decoded = await page.evaluate(async names => {
    const context = new AudioContext();
    try {
      const result = [];
      for (const name of names) {
        const response = await fetch(`/audio/${encodeURIComponent(name)}`);
        const audio = await context.decodeAudioData(await response.arrayBuffer());
        result.push({ name, duration: audio.duration, channels: audio.numberOfChannels });
      }
      return result;
    } finally { await context.close(); }
  }, names);
  expect(decoded).toHaveLength(7);
  for (const audio of decoded) {
    expect(audio.duration).toBeGreaterThan(1);
    expect(audio.duration).toBeLessThan(3);
    expect(audio.channels).toBe(1);
  }
  await page.locator('#file-input').setInputFiles({ name: '音效測試.md', mimeType: 'text/markdown', buffer: Buffer.from('# 音效測試') });
  await expect(page.locator('#reader')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.playedClips), { timeout: 10_000 }).toContain('07');
  await expect.poll(() => page.locator('#ui-audio').evaluate(el => el.ended), { timeout: 5000 }).toBe(true);
  // 真實推論耗時依機器負載而異；允許原有排程的思考聲，不允許重播開始或完成。
  const clips = await page.evaluate(() => window.playedClips);
  expect(clips.join(',')).toMatch(/^01,04(?:,05){0,2}(?:,06)?,07$/);
});
