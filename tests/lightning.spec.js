import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';
const text = '# 計畫\n\n努法有限公司與示範有限公司。\n\n努法有限公司\n\n```text\n努法有限公司\n```\n\n電話：0912-345-678';
async function open(page) {
  await page.route('**/api/analyses', route => {
    const types = { '努法有限公司': 'ORGANIZATION', '示範有限公司': 'ORGANIZATION', '0912-345-678': 'TW_PHONE_NUMBER' };
    const entities = Object.entries(types).map(([value, type], i) => ({ id: String(i), start: text.indexOf(value), end: text.indexOf(value) + value.length, type, score: .9 }));
    return route.fulfill({ json: { entities, offsetEncoding: 'utf-16' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles({ name: '提案.md', mimeType: '', buffer: Buffer.from(text) });
  await expect(page.locator('#preview h1')).toHaveText('計畫');
}
const lightning = page => page.getByRole('switch', { name: '閃電模式' });
const companies = page => page.locator('#preview .pii-mark').filter({ hasText: /^努法有限公司$/ });

test('閃電模式預設開啟，開檔前不存在', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await expect(lightning(page)).toHaveCount(0);
  await open(page);
  await expect(lightning(page)).toBeVisible();
  await expect(lightning(page)).toHaveAttribute('aria-checked', 'true');
});

test('關閉閃電模式後只遮罩被點的那一處，分類面板顯示混合並可補齊整組', async ({ page }) => {
  await open(page);
  await lightning(page).click();
  await expect(lightning(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#status')).toHaveText('閃電模式已關閉');
  await companies(page).first().click();
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: '分類快速遮罩' }).click();
  const panel = page.getByRole('region', { name: '個資分類' });
  const tag = panel.getByRole('button', { name: '切換全文：努法有限公司' });
  await expect(tag).toHaveAttribute('aria-pressed', 'mixed');
  await expect(panel.getByRole('button', { name: '整類切換：組織' })).toHaveAttribute('aria-pressed', 'mixed');
  await tag.click();
  await expect(tag).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(3);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載遮罩版 .md' }).click();
  expect(await readFile(await (await pending).path(), 'utf-8')).toBe(text.replaceAll('努法有限公司', '〔組織 1〕'));
});

test('部分遮罩後重新開啟閃電模式，點一處會先補齊再整組還原', async ({ page }) => {
  await open(page);
  await lightning(page).click();
  await companies(page).first().click();
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(1);
  await lightning(page).focus();
  await page.keyboard.press('Space');
  await expect(lightning(page)).toHaveAttribute('aria-checked', 'true');
  await companies(page).nth(1).click();
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(3);
  await page.locator('#preview .pii-mark[aria-pressed="true"]').nth(1).click();
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(0);
});
