import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';

const samplePath = 'frontend/public/examples/範例提案.md';
const file = (name, text) => ({ name, mimeType: 'text/markdown', buffer: Buffer.from(text) });

test('選檔後呈現提案標題、表格與程式碼，下載保持原始位元組', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#export')).toBeDisabled();
  await page.locator('#file-input').setInputFiles(samplePath);
  await expect(page.locator('#preview h1')).toHaveText('青年 AI 實作培力計畫提案書');
  await expect(page.locator('#preview table')).toHaveCount(4);
  await expect(page.locator('#preview pre')).toContainText('努法有限公司');
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載原文 .md' }).click();
  const download = await promise;
  expect(await readFile(await download.path())).toEqual(await readFile(samplePath));
  expect(download.suggestedFilename()).toBe('範例提案-原文.md');
  expect(errors).toEqual([]);
});

test('重新整理不保留文件', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles(samplePath);
  await page.reload();
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#preview')).toBeEmpty();
});

test('拖曳檔案與 UTF-8 BOM、CRLF 原樣匯出', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  const bytes = [239, 187, 191, ...Buffer.from('# 拖曳測試\r\n\r\n中文內容\r\n')];
  const data = await page.evaluateHandle(bytes => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], '拖曳.MD', { type: 'text/markdown' }));
    return transfer;
  }, bytes);
  await page.locator('#drop-zone').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.locator('#preview h1')).toHaveText('拖曳測試');
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載原文 .md' }).click();
  const download = await promise;
  expect(await readFile(await download.path())).toEqual(Buffer.from(bytes));
});

test('沒有檔案也能按「模擬測試」載入範例提案，閱讀中不顯示', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.getByRole('button', { name: '模擬測試' }).click();
  await expect(page.locator('#preview h1')).toHaveText('青年 AI 實作培力計畫提案書');
  await expect(page.locator('#sample')).toBeHidden();
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載原文 .md' }).click();
  expect((await promise).suggestedFilename()).toBe('範例提案-原文.md');
});

test('錯誤檔案會顯示提示，空白 Markdown 可匯出', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  for (const [input, message] of [
    [file('錯誤.txt', '文字'), '請選擇 .md 檔案'],
    [file('過大.md', 'a'.repeat(2 * 1024 * 1024 + 1)), '檔案不可超過 2 MiB'],
    [{ name: '編碼.md', mimeType: '', buffer: Buffer.from([0xff, 0xfe]) }, 'UTF-8'],
    [file('二進位.md', '\u0000'), '文字檔'],
  ]) {
    await page.locator('#file-input').setInputFiles(input);
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#export')).toBeDisabled();
    await expect(page.locator('#preview')).toBeEmpty();
  }
  await page.locator('#file-input').setInputFiles(file('空白.md', ''));
  await expect(page.getByRole('status')).toContainText('空白文件');
  await expect(page.getByRole('button', { name: '下載原文 .md' })).toBeEnabled();
});

test('拒絕多檔拖曳', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  const data = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    for (const name of ['a.md', 'b.md']) transfer.items.add(new File(['# 文字'], name));
    return transfer;
  });
  await page.locator('#drop-zone').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.getByRole('alert')).toContainText('一次只能開啟一個檔案');
});

test('預覽不執行 HTML、不載入圖片、不產生可點外部連結、不外傳文件', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  const attack = '# 安全測試\n\n<script>window.pwned = true</script>\n\n<img src="https://example.invalid/steal" onerror="window.pwned=true">\n\n![圖片](https://example.invalid/track)\n\n[連結](https://example.invalid)\n\n[危險](javascript:alert(1))';
  await page.locator('#file-input').setInputFiles(file('安全.md', attack));
  await expect(page.locator('#preview h1')).toHaveText('安全測試');
  await expect(page.locator('#preview img, #preview script, #preview a[href]')).toHaveCount(0);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  expect(requests.filter(r => !r.url.startsWith('http://127.0.0.1:4175/') || (r.method !== 'GET' && !r.url.endsWith('/api/analyses')))).toEqual([]);
});

for (const width of [320, 768, 1280]) {
  test(`寬度 ${width} 可讀取範例且頁面不橫向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
    await page.locator('#file-input').setInputFiles(samplePath);
    await expect(page.locator('#preview h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `work/preview-${width}.png`, fullPage: true });
  });
}


test('中央提示可用鍵盤選檔', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await expect(page.getByRole('button', { name: '把 .md 拖進來' })).toBeFocused();
  const pending = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '把 .md 拖進來' }).press('Enter');
  await (await pending).setFiles(samplePath);
  await expect(page.locator('#preview h1')).toHaveText('青年 AI 實作培力計畫提案書');
});
