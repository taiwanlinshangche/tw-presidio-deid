import { RUNTIME_ITEMS } from '../frontend/runtime-catalog.js';
import { test as base, expect } from '@playwright/test';
export const test = base.extend({
  // 測試預設把兩個節奏 token 調快（卡片逐張 1s、辨識最短停留 3s）；真實節奏由 checklist-gate 的專屬測試驗證。
  fastMotion: [true, { option: true }],
  localAnalysis: [async ({ page, fastMotion }, use) => {
    if (fastMotion) {
      await page.addInitScript(() => {
        const inject = () => {
          const style = document.createElement('style');
          style.textContent = ':root { --dur-check-step: 20ms; --dur-analysis-min: 0ms; --dur-done: 20ms; }';
          document.head.append(style);
        };
        if (document.head) inject();
        else new MutationObserver((_, observer) => { if (document.head) { inject(); observer.disconnect(); } }).observe(document, { childList: true, subtree: true });
      });
    }
    await page.route('**/api/setup/status', route => route.fulfill({ json: { status: 'ready', items: RUNTIME_ITEMS.map(({ id }) => ({ id, status: 'ready' })) } }));
    await page.route('**/api/health', route => route.fulfill({ json: { status: 'ready' } }));
    await page.route('**/api/analyses', route => route.fulfill({ json: { entities: [], offsetEncoding: 'utf-16' } }));
    await use();
  }, { auto: true }],
});
export { expect };
