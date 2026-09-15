import { RUNTIME_ITEMS } from './runtime-catalog.js';

export const STATUS_LABELS = Object.freeze({
  pending: '待檢查',
  checking: '檢查中',
  ready: '✓ 可用',
  missing: '缺少或損壞',
  blocked: '尚無法檢查',
  error: '檢查失敗',
});

// 十項全部通過才算就緒；缺項、重複、未知項目或整體狀態不是 ready 一律視為未就緒（fail closed）。
export function isReady(state) {
  if (!state || state.status !== 'ready' || !Array.isArray(state.items) || state.items.length !== RUNTIME_ITEMS.length) return false;
  const required = new Set(RUNTIME_ITEMS.map(item => item.id));
  const seen = new Set();
  for (const item of state.items) {
    if (!item || !required.has(item.id) || seen.has(item.id) || item.status !== 'ready') return false;
    seen.add(item.id);
  }
  return seen.size === required.size;
}
