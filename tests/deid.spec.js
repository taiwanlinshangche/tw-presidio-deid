import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';

const original = '# 提案\r\n\r\n😀 **王小明** 與王小明，任職努法有限公司。\r\n\r\n| 電話 | 0912-345-678 |\r\n\r\n```text\r\n王小明\r\n```\r\n';
function response(text) {
  const types = { '王小明': 'PERSON', '努法有限公司': 'ORGANIZATION', '0912-345-678': 'TW_PHONE_NUMBER' };
  const entities = [];
  for (const [word, type] of Object.entries(types)) {
    for (const match of text.matchAll(new RegExp(word, 'g'))) entities.push({ start: match.index, end: match.index + word.length, type, score: .9 });
  }
  entities.sort((a, b) => a.start - b.start);
  entities.forEach((e, i) => { e.id = String(i); });
  return { entities, offsetEncoding: 'utf-16' };
}
async function open(page, text = original) {
  await page.route('**/api/analyses', route => route.fulfill({ json: response(route.request().postDataJSON().text) }));
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles({ name: '提案.md', mimeType: 'text/markdown', buffer: Buffer.from('\uFEFF' + text) });
  await expect(page.locator('#preview h1')).toHaveText('提案');
}

test('預設標記 hover 變色，只有遮罩 hover 才顯示原文', async ({ page }) => {
  await open(page);
  const mark = page.locator('#preview .pii-mark').first();
  await expect(mark).toHaveText('王小明');
  await expect(mark).toHaveAttribute('aria-pressed', 'false');
  const beforeColor = await mark.evaluate(el => getComputedStyle(el).color);
  await mark.hover();
  await expect(mark).not.toHaveCSS('color', beforeColor);
  await expect(page.getByRole('tooltip')).toBeHidden();
  await mark.click();
  await expect(mark).toHaveText('〔姓名 1〕');
  await expect(mark).toHaveAttribute('aria-pressed', 'true');
  await expect(mark).toHaveCSS('color', await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor));
  await expect(page.getByRole('tooltip')).toContainText('王小明');
  await mark.click();
  await expect(mark).toHaveText('王小明');
});

test('同名遮罩跨頁籤同步，下載保留 BOM 與換行', async ({ page }) => {
  await open(page);
  const mark = page.locator('#preview .pii-mark').first();
  await mark.click();
  await expect(page.locator('#preview .pii-mark').nth(1)).toHaveText('〔姓名 1〕');
  await page.getByRole('tab', { name: '原始碼' }).click();
  await expect(page.locator('#source')).toHaveValue(original.replaceAll('\r\n', '\n')); // 原始碼是編輯框（textarea 以 \n 顯示），永遠是原文
  await page.getByRole('tab', { name: '預覽' }).click();
  const pending = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await pending;
  const data = await readFile(await download.path());
  expect(data).toEqual(Buffer.from('\uFEFF' + original.replaceAll('王小明', '〔姓名 1〕')));
  expect(download.suggestedFilename()).toBe('[去識別] 提案.md');
  expect(data.toString()).not.toContain('data-pii');
  expect(data.toString()).not.toContain('PIITOKEN');
});

test('程式碼中的標記也能遮罩，所有候選遮罩後匯出不含選取原文', async ({ page }) => {
  await open(page);
  for (const mark of await page.locator('#preview .pii-mark').all()) {
    if (await mark.getAttribute('aria-pressed') === 'false') await mark.click();
  }
  const pending = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await pending;
  const text = await readFile(await download.path(), 'utf-8');
  for (const word of ['王小明', '努法有限公司', '0912-345-678']) expect(text).not.toContain(word);
  expect(text).toContain('```text\r\n〔姓名 1〕');
  const mark = page.locator('#preview .pii-mark').first();
  await mark.focus();
  await page.keyboard.press('Enter');
  await expect(mark).toHaveText('王小明');
});

test('錯誤的分析區間不會被當成成功，服務失敗可重新選檔', async ({ page }) => {
  await page.route('**/api/analyses', route => route.fulfill({ json: { offsetEncoding: 'utf-16', entities: [{ id: '0', start: 1, end: 9999, type: 'PERSON', score: .9 }] } }));
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles({ name: '測試.md', mimeType: '', buffer: Buffer.from('# 測試') });
  await expect(page.getByRole('alert')).toContainText('辨識結果格式不正確');
  await expect(page.locator('#reader')).toBeHidden();
  await page.route('**/api/analyses', route => route.fulfill({ status: 500, json: { error: { code: 'ANALYSIS_FAILED', message: '辨識失敗' } } }));
  await page.locator('#file-input').setInputFiles({ name: '測試.md', mimeType: '', buffer: Buffer.from('# 測試') });
  await expect(page.getByRole('alert')).toContainText('辨識失敗');
});
