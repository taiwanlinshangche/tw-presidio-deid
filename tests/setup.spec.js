import { RUNTIME_ITEMS } from '../frontend/runtime-catalog.js';
import { test, expect } from '@playwright/test';

test('first-run screen installs once, shows honest progress and recovers errors', async ({ page }) => {
  const items = RUNTIME_ITEMS.map(({ id }) => ({ id, status: id === 'ckip' ? 'missing' : id === 'analysis' ? 'blocked' : 'ready' }));
  let state = { items, status: 'missing', message: '第一次使用，需要下載並安裝必要元件。', progress: null };
  let posts = 0;
  await page.route('**/api/setup/status', route => route.fulfill({ json: { ...state, items } }));
  await page.route('**/api/setup/install', async route => {
    posts++;
    state = { status: 'installing', message: '正在下載中文模型…', progress: { received: 25, total: 100 } };
    await route.fulfill({ status: 202, json: { ...state, items } });
  });
  await page.goto('/setup/');
  await expect(page.getByRole('button', { name: '安裝缺少的元件' })).toBeVisible();
  await expect(page.getByText('已就緒 8／10 項')).toBeVisible();
  await expect(page.locator('[data-component-id=tokenizer]')).toContainText('✓ 可用');
  await page.screenshot({ path: 'work/checklist/setup-missing.png' });
  await page.getByRole('button', { name: '安裝缺少的元件' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '25');
  await expect(page.getByRole('button', { name: '安裝缺少的元件' })).toBeHidden();
  await expect(page.getByRole('button', { name: '開始', exact: true })).toBeDisabled();
  expect(posts).toBe(1);
  state = { status: 'installing', message: '正在安裝辨識套件…', progress: null };
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('value');
  state = { status: 'installing', message: '正在下載中文模型…', progress: { received: 1, total: 3, unit: 'files' } };
  await expect(page.getByText('1 / 3 個檔案')).toBeVisible();
  state = { status: 'error', message: '下載失敗，請確認網路後重試。' };
  await expect(page.getByRole('button', { name: '重試' })).toBeVisible();
  await page.getByRole('button', { name: '重試' }).click(); expect(posts).toBe(2);
});

test('small screen and keyboard can start installation', async ({ page }) => {
  const items = RUNTIME_ITEMS.map(({ id }) => ({ id, status: id === 'ckip' ? 'missing' : id === 'analysis' ? 'blocked' : 'ready' }));
  await page.setViewportSize({ width: 375, height: 700 });
  await page.route('**/api/setup/status', route => route.fulfill({ json: { status: 'missing', message: '第一次使用，需要下載並安裝必要元件。' } }));
  await page.route('**/api/setup/install', route => route.fulfill({ status: 202, json: { status: 'installing', message: '正在準備 Python…' } }));
  await page.goto('/setup/');
  await page.getByRole('button', { name: '安裝缺少的元件' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('progressbar')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
