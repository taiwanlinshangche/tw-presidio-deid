import { test, expect } from './fixtures.js';
import { RUNTIME_ITEMS } from '../frontend/runtime-catalog.js';

const cards = page => page.locator('#startup-checklist .boot-card');
const start = page => page.getByRole('button', { name: '開始', exact: true });
// role 查詢看不到 display:none 的元素；「隱藏且 disabled」的斷言改用 id。
const choose = page => page.locator('#choose');

test('missing card offers 安裝, install runs through the launcher, then one click opens drag entry', async ({ page }) => {
  let state = { status: 'missing', items: RUNTIME_ITEMS.map(({ id }) => ({ id, status: id === 'ckip' ? 'missing' : id === 'analysis' ? 'blocked' : 'ready', detail: id === 'ckip' ? '模型檔案不完整' : undefined })) };
  let installs = 0;
  await page.route('**/api/setup/status', route => route.fulfill({ json: state }));
  await page.route('**/api/setup/install', route => {
    installs += 1;
    expect(route.request().headers()['x-deid-setup']).toBe('1');
    state = { status: 'installing', message: '正在下載中文模型…', progress: { received: 25, total: 100 }, items: state.items.map(item => (item.id === 'ckip' ? { ...item, status: 'checking', detail: '正在安裝' } : item)) };
    route.fulfill({ status: 202, json: state });
  });
  await page.goto('/');
  await expect(cards(page)).toHaveCount(10);
  await expect(cards(page).nth(6)).toHaveAttribute('data-status', 'missing');
  await expect(cards(page).nth(6)).toContainText('模型檔案不完整');
  await expect(cards(page).nth(9)).toHaveAttribute('data-status', 'blocked');
  await expect(page.locator('#startup-message')).toBeHidden();
  await expect(page.locator('#setup-link')).toHaveCount(0);
  await expect(choose(page)).toBeHidden();
  await expect(choose(page)).toBeDisabled();
  await page.getByRole('button', { name: '安裝：CKIP 中文模型' }).click();
  expect(installs).toBe(1);
  await expect(cards(page).nth(6)).toContainText('安裝中 25%');
  await expect(page.locator('#drop-zone')).not.toContainText('正在下載中文模型…'); // 卡片下方沒有任何進度文字
  state = { status: 'ready', items: RUNTIME_ITEMS.map(({ id }) => ({ id, status: 'ready' })) };
  await expect(start(page)).toBeEnabled();
  await expect(page.locator('#startup-checklist .boot-card[data-status="ready"]')).toHaveCount(10);
  await expect(start(page)).toBeInViewport();
  await page.screenshot({ path: 'work/checklist/workbench-ready.png' });
  await start(page).click();
  await expect(page.getByRole('button', { name: '把 .md 拖進來' })).toBeVisible();
  await expect(page.getByRole('list', { name: '啟動檢查清單' })).toBeHidden();
});

test('unreachable or incomplete status never permits start', async ({ page }) => {
  await page.route('**/api/setup/status', route => route.fulfill({ json: { status: 'ready' } }));
  await page.goto('/');
  await expect(choose(page)).toBeDisabled();
  await expect(cards(page).first()).toHaveAttribute('data-status', 'checking');
  await page.unroute('**/api/setup/status');
  await page.route('**/api/setup/status', route => route.abort());
  await expect(page.locator('#startup-message')).toContainText('無法確認啟動狀態');
  await expect(choose(page)).toBeDisabled();
  await expect(choose(page)).toBeHidden();
});

test.describe('real pacing', () => {
  test.use({ fastMotion: false });
  test('cards settle one per second even when every check is already green', async ({ page }) => {
    await page.goto('/');
    await expect(cards(page).first()).toHaveAttribute('data-status', 'ready');
    await expect(cards(page).last()).toHaveAttribute('data-status', 'pending');
    await expect(start(page)).toBeHidden();
    await expect(start(page)).toBeVisible({ timeout: 15_000 });
    await expect(cards(page).last()).toHaveAttribute('data-status', 'ready');
  });
});
