// 真實本機模型驗收：此檔案不使用 route mock。
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('真實政府提案：辨識、標記、hover、遮罩、下載與重新開檔', async ({ page, baseURL }) => {
  const requests = [];
  const errors = [];
  page.on('request', r => requests.push(r.url()));
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.screenshot({ path: 'work/live-empty.png', animations: 'disabled' });
  const pending = page.waitForResponse(r => r.url().endsWith('/api/analyses'));
  await page.locator('#file-input').setInputFiles('frontend/public/examples/範例提案.md');
  const analysis = await (await pending).json();
  expect(analysis.entities.length).toBeGreaterThan(5);
  await expect(page.locator('#preview h1')).toHaveText('青年 AI 實作培力計畫提案書');
  await page.screenshot({ path: 'work/live-marks.png', animations: 'disabled' });
  const original = await readFile('frontend/public/examples/範例提案.md', 'utf-8');
  const fields = analysis.entities.map(e => ({ ...e, value: original.slice(e.start, e.end) }));
  for (const value of ['努法有限公司', '青嶼市青年發展局', '王沛安', '陳語彤', '0912-345-678', '02-2712-3456', 'plan@nuva.example', '12345675', 'A123456789']) {
    expect(fields.some(e => e.value === value)).toBe(true);
  }
  expect(fields.every(e => !/[\r\n]/.test(e.value))).toBe(true);
  const company = page.locator('#preview .pii-mark').filter({ hasText: /^努法有限公司$/ }).first();
  await company.hover();
  await expect(page.getByRole('tooltip')).toBeHidden();
  await company.click();
  const masked = page.locator('#preview .pii-mark[aria-pressed="true"]').first();
  await expect(masked).toHaveText(/〔組織 \d+〕/);
  await expect(page.getByRole('tooltip')).toContainText('努法有限公司');
  await page.screenshot({ path: 'work/live-mask-tooltip.png', animations: 'disabled' });
  const label = await masked.textContent();
  const expected = original.replaceAll('努法有限公司', label);
  const downloadPending = page.waitForEvent('download');
  await page.locator('#export').click();
  const download = await downloadPending;
  expect(await readFile(await download.path(), 'utf-8')).toBe(expected);
  expect(download.suggestedFilename()).toBe('[去識別] 範例提案.md');
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.getByRole('button', { name: '把 .md 拖進來' })).toBeVisible();
  await page.locator('#file-input').setInputFiles(await download.path());
  // Playwright 臨時下載檔沒有 .md 副檔名，介面應拒絕；改用標準檔名驗證重開。
  await expect(page.getByRole('alert')).toContainText('.md');
  await page.locator('#file-input').setInputFiles({ name: '[去識別] 範例提案.md', mimeType: 'text/markdown', buffer: Buffer.from(expected) });
  await expect(page.locator('#preview h1')).toHaveText('青年 AI 實作培力計畫提案書');
  expect(requests.every(url => url.startsWith(`${baseURL}/`))).toBe(true);
  expect(errors).toEqual([]);
});


test('真實模型的臺灣格式辨識與 emoji 位置正確', async ({ request }) => {
  const text = '😀 聯絡人：王小明。\n公司名稱：努法有限公司\n電話：0912-345-678\n統一編號：04595257\n身分證：A123456789\n電子郵件：pii@example.invalid';
  const response = await request.post('/api/analyses', { headers: { 'X-Deid-Request': '1' }, data: { text } });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  const found = body.entities.map(e => [text.slice(e.start, e.end), e.type]);
  for (const entry of [['王小明', 'PERSON'], ['努法有限公司', 'ORGANIZATION'], ['0912-345-678', 'TW_PHONE_NUMBER'], ['04595257', 'TW_BUSINESS_ID'], ['A123456789', 'TW_NATIONAL_ID'], ['pii@example.invalid', 'EMAIL_ADDRESS']]) expect(found).toContainEqual(entry);
});
