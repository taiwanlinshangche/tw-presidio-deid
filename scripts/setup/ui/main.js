import { createChecklist, isReady } from './runtime-status.js';

const checklist = createChecklist(document.querySelector('#checklist'));
const status = document.querySelector('#status');
const button = document.querySelector('#install');
const area = document.querySelector('#progress-area');
const progress = document.querySelector('#progress');
const percent = document.querySelector('#percent');
let sending = false;
let pollTimer;
function render(state) {
  checklist.update(state.items);
  if (isReady(state)) { location.replace('/'); return; }
  if (status.textContent !== state.message) status.textContent = state.message;
  const actionable = ['missing', 'error'].includes(state.status);
  button.hidden = !actionable || sending;
  button.textContent = state.status === 'error' ? '重試' : '安裝缺少的元件';
  area.hidden = actionable && !sending;
  if (state.progress?.total > 0 && Number.isFinite(state.progress.received)) {
    const value = Math.min(100, Math.floor(100 * state.progress.received / state.progress.total));
    progress.value = value; percent.textContent = state.progress.unit === 'files' ? `${state.progress.received} / ${state.progress.total} 個檔案` : `${value}%`;
  } else { progress.removeAttribute('value'); percent.textContent = ''; }
}
async function poll() {
  clearTimeout(pollTimer);
  try {
    const response = await fetch('/api/setup/status', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error();
    render(await response.json());
  } catch { render({ status: 'error', message: '無法連線到啟動器，請確認啟動視窗仍開著，再重試。' }); }
  pollTimer = setTimeout(poll, 700);
}
button.addEventListener('click', async () => {
  if (sending) return;
  sending = true; clearTimeout(pollTimer);
  render({ status: 'installing', message: '正在準備安裝…' });
  try {
    const response = await fetch('/api/setup/install', { method: 'POST', headers: { 'X-Deid-Setup': '1' }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error();
  } catch { render({ status: 'error', message: '無法啟動安裝，請確認啟動視窗仍開著，再重試。' }); }
  finally { sending = false; await poll(); }
});
poll();
