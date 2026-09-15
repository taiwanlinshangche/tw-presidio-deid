import { RUNTIME_ITEMS } from './runtime-catalog.js';

export const STATUS_LABELS = Object.freeze({
  pending: '待檢查',
  checking: '檢查中',
  ready: '✓ 可用',
  missing: '缺少或損壞',
  blocked: '尚無法檢查',
  error: '檢查失敗',
});

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

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createChecklist(container) {
  container.classList.add('runtime-checklist');
  // 標題逐字拆成 aria-hidden 的 span 做「從兩側聚合」進場；accessible name 由 aria-label 提供。
  const heading = element('h1', 'runtime-checklist-heading');
  heading.setAttribute('aria-label', '啟動檢查');
  for (const char of '啟動檢查') {
    const span = element('span', 'reveal-char', char);
    span.setAttribute('aria-hidden', 'true');
    heading.append(span);
  }
  const summary = element('p', 'runtime-checklist-summary', `已就緒 0／${RUNTIME_ITEMS.length} 項`);
  summary.setAttribute('aria-live', 'polite');
  summary.setAttribute('aria-atomic', 'true');
  const list = element('ul', 'runtime-checklist-list');
  const rows = new Map();

  for (const item of RUNTIME_ITEMS) {
    const row = element('li', 'runtime-checklist-item');
    row.dataset.componentId = item.id;
    const copy = element('span', 'runtime-checklist-copy');
    const label = element('span', 'runtime-checklist-label', item.label);
    const detail = element('span', 'runtime-checklist-detail');
    detail.hidden = true;
    copy.append(label, detail);
    // 狀態欄：固定三顆圓點（只在 checking 顯示）＋ 專用文字節點；update() 只改文字節點。
    const status = element('span', 'runtime-checklist-status');
    status.dataset.status = 'pending';
    const dots = element('span', 'runtime-checklist-dots');
    dots.setAttribute('aria-hidden', 'true');
    dots.append(element('i'), element('i'), element('i'));
    const text = element('span', 'runtime-checklist-status-text', STATUS_LABELS.pending);
    status.append(dots, text);
    row.append(copy, status);
    list.append(row);
    rows.set(item.id, { row, status, text, detail });
  }
  container.replaceChildren(heading, summary, list);

  function update(items) {
    const supplied = new Map();
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item && rows.has(item.id) && !supplied.has(item.id)) supplied.set(item.id, item);
      }
    }
    let readyCount = 0;
    for (const catalogItem of RUNTIME_ITEMS) {
      const nodes = rows.get(catalogItem.id);
      const item = supplied.get(catalogItem.id);
      const statusName = item && Object.hasOwn(STATUS_LABELS, item.status) ? item.status : 'pending';
      nodes.status.dataset.status = statusName;
      if (nodes.text.textContent !== STATUS_LABELS[statusName]) nodes.text.textContent = STATUS_LABELS[statusName];
      nodes.row.dataset.status = statusName;
      const detail = typeof item?.detail === 'string' ? item.detail.trim() : '';
      if (nodes.detail.textContent !== detail) nodes.detail.textContent = detail;
      nodes.detail.hidden = !detail || statusName === 'ready';
      if (statusName === 'ready') readyCount += 1;
    }
    const message = `已就緒 ${readyCount}／${RUNTIME_ITEMS.length} 項`;
    if (summary.textContent !== message) summary.textContent = message;
  }

  return { update };
}
