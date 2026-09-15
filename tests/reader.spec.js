import { test, expect } from './fixtures.js';
const samplePath = 'frontend/public/examples/範例提案.md';
const newFile = { name: '另一份.md', mimeType: 'text/markdown', buffer: Buffer.from('# 新文件') };

async function transfer(page) {
  return page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['# 拖曳文件'], '拖曳.md', { type: 'text/markdown' }));
    return data;
  });
}

test('空白畫面只保留中央入口，拖曳回饋在放開後消失', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await expect(page.getByRole('button', { name: '把 .md 拖進來' })).toBeVisible();
  await expect(page.locator('#reader')).toBeHidden();
  const data = await transfer(page);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: data });
  await expect(page.getByText('放開即可開啟', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'work/reader-drag.png' });
  await page.locator('body').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.locator('#drop-zone')).toBeHidden();
  await expect(page.locator('#drag-feedback')).toBeHidden();
  await expect(page.locator('#preview h1')).toHaveText('拖曳文件');
});

test('原始碼與預覽互斥，鍵盤左右鍵能切換', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles(samplePath);
  const previewTab = page.getByRole('tab', { name: '預覽', exact: true });
  const sourceTab = page.getByRole('tab', { name: '原始碼' });
  await expect(previewTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#source-panel')).toBeHidden();
  await sourceTab.click();
  await expect(page.locator('#preview-panel')).toBeHidden();
  await expect(page.locator('#source')).toHaveValue(/# 青年 AI 實作培力計畫提案書/);
  await page.keyboard.press('ArrowRight');
  await expect(previewTab).toBeFocused();
  await expect(previewTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#preview-panel')).toBeVisible();
});

test('取消和 Escape 保留閱讀位置，確認關閉後可讀新檔', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles(samplePath);
  await page.locator('#preview-panel').evaluate(el => { el.scrollTop = 300; });
  const scroll = await page.locator('#preview-panel').evaluate(el => el.scrollTop);
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '確定要關閉嗎？' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '取消' })).toBeFocused();
  await page.screenshot({ path: 'work/reader-confirm.png' });
  await dialog.getByRole('button', { name: '取消' }).click();
  expect(await page.locator('#preview-panel').evaluate(el => el.scrollTop)).toBe(scroll);
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#preview h1')).toHaveText('青年 AI 實作培力計畫提案書');
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  await dialog.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#source')).toHaveValue('');
  await expect(page.locator('#preview')).toBeEmpty();
  await expect(page.getByRole('button', { name: '把 .md 拖進來' })).toBeFocused();
  await page.locator('#file-input').setInputFiles(newFile);
  await expect(page.locator('#preview h1')).toHaveText('新文件');
});

test('閱讀中拖曳新檔不取代目前內容', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  await page.locator('#file-input').setInputFiles(samplePath);
  await expect(page.locator('#reader')).toBeVisible();
  const data = await transfer(page);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: data });
  await expect(page.getByText('請先關閉目前文件', { exact: true })).toBeVisible();
  await page.locator('body').dispatchEvent('drop', { dataTransfer: data });
  await expect(page.locator('#drag-feedback')).toBeHidden();
  await expect(page.locator('#preview h1')).toHaveText('青年 AI 實作培力計畫提案書');
});

test('跨過子元素拖曳不閃爍，離開視窗後回復', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '開始', exact: true }).click();
  const data = await transfer(page);
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer: data });
  await page.locator('#drop-zone').dispatchEvent('dragenter', { dataTransfer: data });
  await page.locator('body').dispatchEvent('dragleave', { dataTransfer: data });
  await expect(page.locator('#drag-feedback')).toBeVisible();
  await page.locator('#drop-zone').dispatchEvent('dragleave', { dataTransfer: data });
  await expect(page.locator('#drag-feedback')).toBeHidden();
});
