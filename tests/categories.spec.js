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

test('僅辨識一處公司也能全文同步遮罩與下載，圖示仍保留', async ({ page }) => {
  await open(page);
  await expect(page.locator('#export svg')).toBeVisible();
  const companies = page.locator('#preview .pii-mark').filter({ hasText: /^努法有限公司$/ });
  await expect(companies).toHaveCount(3);
  await companies.first().click();
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(3);
  await expect(page.locator('#export svg')).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載遮罩版 .md' }).click();
  const download = await pending;
  expect(await readFile(await download.path(), 'utf-8')).toBe(text.replaceAll('努法有限公司', '〔組織 1〕'));
  await page.locator('#preview .pii-mark[aria-pressed="true"]').first().click();
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(0);
});

test('分類全選與個別標籤同步，部分遮罩顯示混合狀態', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '分類快速遮罩' }).click();
  const panel = page.getByRole('region', { name: '個資分類' });
  const organization = panel.getByRole('button', { name: '整類切換：組織' });
  const company = panel.getByRole('button', { name: '切換全文：努法有限公司' });
  await company.click();
  await expect(company).toHaveAttribute('aria-pressed', 'true');
  await expect(organization).toHaveAttribute('aria-pressed', 'mixed');
  await organization.click();
  await expect(organization).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(4);
  await expect(panel.getByRole('button', { name: '切換全文：0912-345-678' })).toHaveAttribute('aria-pressed', 'false');
  await organization.click();
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(0);
  await expect(organization).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: 'work/categories.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: '分類快速遮罩' })).toBeFocused();
});

test('分類面板在窄螢幕不溢出，關閉文件清除舊標籤', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await open(page);
  await page.getByRole('button', { name: '分類快速遮罩' }).click();
  const panel = page.locator('#category-panel');
  const bounds = await panel.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: 'work/categories-mobile.png', animations: 'disabled' });
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.locator('#reader')).toBeHidden();
  await expect(panel).toBeEmpty();
});

test('沒有辨識到內容時，分類面板顯示空白狀態', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles({ name: '空白.md', mimeType: '', buffer: Buffer.from('') });
  await expect(page.locator('#reader')).toBeVisible();
  await page.getByRole('button', { name: '分類快速遮罩' }).click();
  await expect(page.locator('#category-panel')).toContainText('這份文件沒有辨識到標籤');
});
