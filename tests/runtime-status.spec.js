import { test, expect } from '@playwright/test';

test('isReady 對整體狀態、缺項、重複與未知項採 fail closed', async ({ page }) => {
  await page.route('**/widget-test', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="zh-Hant"><body><script type="module">
        import { isReady } from '/runtime-status.js';
        window.isReady = isReady;
      </script></body></html>`,
  }));
  await page.goto('/widget-test');
  const result = await page.evaluate(async () => {
    const { RUNTIME_ITEMS } = await import('/runtime-catalog.js');
    const ready = RUNTIME_ITEMS.map(({ id }) => ({ id, status: 'ready' }));
    return {
      complete: window.isReady({ status: 'ready', items: ready }),
      overallNotReady: window.isReady({ status: 'checking', items: ready }),
      missing: window.isReady({ status: 'ready', items: ready.slice(0, 9) }),
      duplicate: window.isReady({ status: 'ready', items: [...ready.slice(0, 9), ready[0]] }),
      unknown: window.isReady({ status: 'ready', items: [...ready, { id: 'git', status: 'ready' }] }),
      incomplete: window.isReady({ status: 'ready', items: ready.map((item, i) => i ? item : { ...item, status: 'checking' }) }),
    };
  });
  expect(result).toEqual({ complete: true, overallNotReady: false, missing: false, duplicate: false, unknown: false, incomplete: false });
});
