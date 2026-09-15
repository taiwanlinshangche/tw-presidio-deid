import { test, expect } from './fixtures.js';

async function mockAudio(page, requireGesture = false) {
  await page.addInitScript(requireGesture => {
    window.audioStarts = [];
    const timers = new WeakMap();
    let unlocked = !requireGesture;
    for (const name of ['pointerdown', 'keydown', 'click', 'touchend']) window.addEventListener(name, event => { if (event.isTrusted) unlocked = true; }, { capture: true });
    const durations = { '01': 2300, '02': 1340, '03': 1050, '04': 1580, '05': 1510, '06': 1710, '07': 1250 };
    HTMLMediaElement.prototype.play = function () {
      if (!unlocked) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
      unlocked = true;
      const clip = decodeURIComponent(this.src.split('/').pop()).slice(0, 2);
      window.audioStarts.push({ clip, time: Date.now() });
      clearTimeout(timers.get(this));
      timers.set(this, setTimeout(() => this.dispatchEvent(new Event('ended')), durations[clip]));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () { clearTimeout(timers.get(this)); };
  }, requireGesture);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
}
async function dragData(page) {
  return page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['# 測試'], '測試.md'));
    return data;
  });
}
const clips = page => page.evaluate(() => window.audioStarts.filter(e => e.clip !== '01').map(e => e.clip));
const input = { name: '測試.md', mimeType: 'text/markdown', buffer: Buffer.from('# 測試') };

test('初始只有開始按鈕，點擊立即播放而不等待一秒', async ({ page }) => {
  await mockAudio(page, true);
  await page.goto('/');
  await expect(page.getByRole('button', { name: '開始', exact: true })).toBeVisible();
  await page.clock.runFor(10_000);
  expect(await page.evaluate(() => window.audioStarts)).toEqual([]);
  const time = await page.evaluate(() => Date.now());
  await page.getByRole('button', { name: '開始', exact: true }).click();
  expect(await page.evaluate(() => window.audioStarts)).toEqual([{ clip: '01', time }]);
  await expect(page.getByRole('button', { name: '把 .md 拖進來' })).toBeVisible();
});

test('拖曳提醒每兩秒輪播，跨過子元素不重啟', async ({ page }) => {
  await mockAudio(page);
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  const data = await dragData(page);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: data });
  await page.locator('#choose').dispatchEvent('dragenter', { dataTransfer: data });
  await page.locator('body').dispatchEvent('dragleave', { dataTransfer: data });
  await page.clock.runFor(4001);
  expect(await clips(page)).toEqual(['02', '03', '02']);
  const starts = await page.evaluate(() => window.audioStarts.filter(e => e.clip !== '01').map(e => e.time));
  expect(starts[1] - starts[0]).toBe(2000);
  expect(starts[2] - starts[0]).toBe(4000);
});

test('離開拖曳後取消後續提醒，重新進入可重播', async ({ page }) => {
  await mockAudio(page);
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  const data = await dragData(page);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: data });
  await page.clock.runFor(500);
  await page.locator('body').dispatchEvent('dragleave', { dataTransfer: data });
  await page.clock.runFor(5000);
  expect(await clips(page)).toEqual(['02']);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: data });
  expect(await clips(page)).toEqual(['02', '02']);
});

test('處理配音：04 後隔兩秒 05，再隔兩秒又一秒才換 06', async ({ page }) => {
  await mockAudio(page);
  await page.route('**/api/analyses', () => {});
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles(input);
  await expect.poll(() => clips(page)).toEqual(['04']);
  await page.clock.runFor(11_400);
  expect(await clips(page)).toEqual(['04', '05', '06']);
  const starts = await page.evaluate(() => window.audioStarts.filter(e => e.clip !== '01').map(e => e.time));
  expect(starts[1] - starts[0]).toBe(1580 + 2000);
  expect(starts[2] - starts[1]).toBe(1510 + 2000 + 1000);
});

test('完成只接好了，模型未就緒時只播開始處理、不播完成', async ({ page }) => {
  await mockAudio(page);
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles(input);
  await expect(page.locator('#reader')).toBeVisible();
  await page.clock.runFor(10_000);
  expect(await clips(page)).toEqual(['04', '07']);
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByRole('button', { name: '把 .md 拖進來' })).toBeVisible();
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'loading' } }));
  await page.locator('#file-input').setInputFiles(input);
  await expect(page.locator('#loading')).toBeVisible();
  await page.clock.runFor(15_000);
  expect(await clips(page)).toEqual(['04', '07', '04', '05', '06', '05']);
});

test('開始後沒有音效開關，其他點擊不重播開場', async ({ page }) => {
  await mockAudio(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await expect(page.locator('#enable-audio')).toHaveCount(0);
  await page.locator('body').click({ position: { x: 20, y: 20 } });
  await page.locator('body').click({ position: { x: 20, y: 20 } });
  expect(await page.evaluate(() => window.audioStarts.map(e => e.clip))).toEqual(['01']);
});

test('開始後完成聲自動接續，關閉後不補播', async ({ page }) => {
  await mockAudio(page, true);
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles(input);
  await expect(page.locator('#reader')).toBeVisible();
  await page.clock.runFor(5000);
  expect(await clips(page)).toEqual(['04', '07']);
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.locator('#reader')).toBeHidden();
  await page.locator('body').click({ position: { x: 20, y: 20 } });
  await page.clock.runFor(10_000);
  expect(await clips(page)).toEqual(['04', '07']);
});

test('放下檔案就停止提醒，完成後不會再播放開版本', async ({ page }) => {
  await mockAudio(page);
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  const data = await dragData(page);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: data });
  await page.clock.runFor(500);
  await page.locator('body').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.locator('#reader')).toBeVisible();
  await page.clock.runFor(10_000);
  expect(await clips(page)).toEqual(['02', '04', '07']);
});

// 配音節奏：04 → 2s → 05 → 2s（基本）；之後每 1s 換一個嗯（06、05 交替）
for (const [time, expected] of [[2000, ['04', '07']], [4000, ['04', '05', '07']], [9000, ['04', '05', '06', '07']]]) {
  test(`處理 ${time} 毫秒時完成，不殘留思考排程`, async ({ page }) => {
    await mockAudio(page);
    let analysis;
    await page.route('**/api/analyses', route => { analysis = route; });
    await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
    await page.locator('#file-input').setInputFiles(input);
    await expect.poll(() => Boolean(analysis)).toBe(true);
    await page.clock.runFor(time);
    await analysis.fulfill({ json: { entities: [], offsetEncoding: 'utf-16' } });
    await expect(page.locator('#reader')).toBeVisible();
    await page.clock.runFor(10_000);
    expect(await clips(page)).toEqual(expected);
  });
}

test('好了與畫面同時播放，關閉後不再補播', async ({ page }) => {
  await mockAudio(page);
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles(input);
  await expect(page.locator('#reader')).toBeVisible();
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByRole('button', { name: '把 .md 拖進來' })).toBeVisible();
  await page.clock.runFor(10_000);
  expect(await clips(page)).toEqual(['04', '07']);
});


test('尚未開始不處理拖曳，鍵盤可立即開始', async ({ page }) => {
  await mockAudio(page, true);
  await page.goto('/');
  const data = await dragData(page);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: data });
  await page.locator('body').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#drag-feedback')).toBeHidden();
  await expect(page.getByRole('button', { name: '開始', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '開始', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.audioStarts.map(e => e.clip))).toEqual(['01']);
});
