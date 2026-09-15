import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';

const text = '# 提案\n\n聯絡人：王小明，任職努法有限公司。\n\n第二段沒有個資。\n';
function response(input) {
  const types = { '王小明': 'PERSON', '努法有限公司': 'ORGANIZATION', '陳範例': 'PERSON' };
  const entities = [];
  for (const [word, type] of Object.entries(types)) {
    for (const match of input.matchAll(new RegExp(word, 'g'))) entities.push({ start: match.index, end: match.index + word.length, type, score: .9 });
  }
  entities.sort((a, b) => a.start - b.start);
  return { entities: entities.map((e, i) => ({ ...e, id: String(i) })), offsetEncoding: 'utf-16' };
}
async function open(page) {
  await page.route('**/api/analyses', route => route.fulfill({ json: response(route.request().postDataJSON().text) }));
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles({ name: '提案.md', mimeType: 'text/markdown', buffer: Buffer.from(text) });
  await expect(page.locator('#preview h1')).toHaveText('提案');
}
const source = page => page.locator('#source');
const blockEditor = page => page.getByRole('textbox', { name: '編輯這一段' });

test('原始碼直接改：停止輸入就套用，遮罩過的文字再次遮罩，新個資背景辨識後補上，下載反映編輯', async ({ page }) => {
  await open(page);
  await page.locator('#preview .pii-mark').filter({ hasText: '王小明' }).click();
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole('tab', { name: '原始碼' }).click();
  await expect(source(page)).toHaveValue(text);
  const edited = text + '\n副聯絡人：陳範例，王小明也會出席。\n';
  await source(page).fill(edited);
  await expect(page.locator('#status')).toContainText('已更新');
  await page.getByRole('tab', { name: '預覽' }).click();
  await expect(page.locator('#preview .pii-mark')).toHaveCount(4);
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]')).toHaveCount(2);
  await expect(page.locator('#preview .pii-mark[aria-pressed="true"]').first()).toHaveText('〔姓名 1〕');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載遮罩版 .md' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('[去識別] 提案.md');
  expect(await readFile(await download.path(), 'utf-8')).toBe(edited.replaceAll('王小明', '〔姓名 1〕'));
});

test('預覽直接改：點段落就地改 Markdown，點標記仍是遮罩，Escape 取消、失焦套用，原始碼同步', async ({ page }) => {
  await open(page);
  const preview = page.locator('#preview');
  await preview.locator('p').last().click();
  await expect(blockEditor(page)).toHaveValue('第二段沒有個資。');
  await blockEditor(page).fill('被取消的修改');
  await page.keyboard.press('Escape');
  await expect(blockEditor(page)).toHaveCount(0);
  await expect(preview.locator('p').last()).toHaveText('第二段沒有個資。');
  await preview.locator('.pii-mark').first().click();
  await expect(blockEditor(page)).toHaveCount(0);
  await expect(preview.locator('.pii-mark[aria-pressed="true"]')).toHaveCount(1);
  await preview.locator('h1').click();
  await expect(blockEditor(page)).toHaveValue('# 提案');
  await blockEditor(page).fill('# 新標題');
  await preview.locator('p').first().click();
  await expect(preview.locator('h1')).toHaveText('新標題');
  await expect(preview.locator('.pii-mark[aria-pressed="true"]')).toHaveCount(1);
  await expect(blockEditor(page)).toHaveValue('聯絡人：王小明，任職努法有限公司。');
  await blockEditor(page).fill('聯絡人：陳範例。');
  await page.keyboard.press('Control+Enter');
  await expect(preview.locator('p').first()).toHaveText(/聯絡人：陳範例。/);
  await expect(preview.locator('.pii-mark')).toHaveCount(1);
  await expect(preview.locator('.pii-mark')).toHaveText('陳範例');
  await page.getByRole('tab', { name: '原始碼' }).click();
  await expect(source(page)).toHaveValue('# 新標題\n\n聯絡人：陳範例。\n\n第二段沒有個資。\n');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載編輯版 .md' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('提案.md');
  expect(await readFile(await download.path(), 'utf-8')).toBe('# 新標題\n\n聯絡人：陳範例。\n\n第二段沒有個資。\n');
});
