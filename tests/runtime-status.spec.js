import { test, expect } from '@playwright/test';

async function openWidget(page) {
  await page.route('**/widget-test', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="zh-Hant"><head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/runtime-status.css">
    </head><body><main><div id="checklist"></div></main>
      <script type="module">
        import { createChecklist, isReady } from '/runtime-status.js';
        window.widgets = { checklist: createChecklist(document.querySelector('#checklist')), isReady };
      </script></body></html>`,
  }));
  await page.goto('/widget-test');
}

test('固定顯示十項並以安全文字原地更新狀態', async ({ page }) => {
  await openWidget(page);
  const rows = page.locator('.runtime-checklist li');
  await expect(rows).toHaveCount(10);
  await expect(page.getByRole('heading', { name: '啟動檢查' })).toBeVisible();
  await expect(page.getByText('已就緒 0／10 項')).toHaveAttribute('aria-live', 'polite');
  await rows.nth(0).evaluate(element => { element.dataset.identity = 'kept'; });
  await page.evaluate(() => window.widgets.checklist.update([
    { id: 'node', status: 'ready', detail: '<img src=x onerror=window.pwned=1>' },
    { id: 'python', status: 'checking' },
    { id: 'presidio', status: 'missing' },
    { id: 'torch', status: 'blocked' },
    { id: 'transformers', status: 'error' },
  ]));
  await expect(page.getByText('已就緒 1／10 項')).toBeVisible();
  await expect(rows.nth(0)).toContainText('✓ 可用');
  await expect(rows.nth(0)).toContainText('<img src=x');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await expect(rows.nth(0)).toHaveAttribute('data-identity', 'kept');
});

test('isReady 對整體狀態、缺項、重複與未知項採 fail closed', async ({ page }) => {
  await openWidget(page);
  const result = await page.evaluate(async () => {
    const { RUNTIME_ITEMS } = await import('/runtime-catalog.js');
    const ready = RUNTIME_ITEMS.map(({ id }) => ({ id, status: 'ready' }));
    return {
      complete: window.widgets.isReady({ status: 'ready', items: ready }),
      overallNotReady: window.widgets.isReady({ status: 'checking', items: ready }),
      missing: window.widgets.isReady({ status: 'ready', items: ready.slice(0, 9) }),
      duplicate: window.widgets.isReady({ status: 'ready', items: [...ready.slice(0, 9), ready[0]] }),
      unknown: window.widgets.isReady({ status: 'ready', items: [...ready, { id: 'git', status: 'ready' }] }),
      incomplete: window.widgets.isReady({ status: 'ready', items: ready.map((item, i) => i ? item : { ...item, status: 'checking' }) }),
    };
  });
  expect(result).toEqual({ complete: true, overallNotReady: false, missing: false, duplicate: false, unknown: false, incomplete: false });
});
