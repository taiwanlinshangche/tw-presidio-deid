import { RUNTIME_ITEMS } from '../../frontend/runtime-catalog.js';

export function friendlyError(error) {
  const detail = String(error?.message || error);
  if (/ENOSPC|No space left|disk.+full/i.test(detail)) return '磁碟空間不足，請清出空間後重試。';
  if (/EACCES|EPERM|permission denied|access.+denied/i.test(detail)) return '無法寫入專案資料夾，請移到有寫入權限的位置後重試。';
  if (/fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|network|timed? ?out|下載失敗/i.test(detail)) return '下載或連線失敗，請確認網路後重試。已完成的安裝會保留。';
  return '這個步驟未完成，請重試。若再次失敗，可查看啟動視窗的錯誤訊息。';
}

export function runtimeReady(state) {
  return state.status === 'ready' && Array.isArray(state.items) && state.items.length === RUNTIME_ITEMS.length
    && RUNTIME_ITEMS.every(({ id }) => state.items.filter(item => item.id === id && item.status === 'ready').length === 1);
}

export class SetupManager {
  constructor(steps, start, inspect) {
    this.steps = steps;
    this.start = start;
    this.inspect = inspect;
    this.state = { status: 'checking', message: '正在檢查必要元件…', progress: null, items: this.emptyItems() };
    this.pending = null;
  }
  emptyItems() { return RUNTIME_ITEMS.map(({ id, label }) => ({ id, label, status: 'pending' })); }
  update(data) { this.state = { ...this.state, progress: null, ...data }; }
  setItem(result) {
    this.state = { ...this.state, items: this.state.items.map(item => item.id === result.id ? { id: item.id, label: item.label, ...result } : item) };
  }
  failAnalysis(message) {
    this.setItem({ id: 'analysis', status: 'error', detail: message });
    this.update({ status: 'error', message });
  }
  check() { return this.perform(false); }
  recheck() { return this.perform(false, true); }
  install() { return this.perform(true); }
  perform(install, force = false) {
    if (this.pending) return this.pending;
    if (!force && runtimeReady(this.state)) return Promise.resolve();
    this.update({ status: install ? 'installing' : 'checking', message: '正在檢查必要元件…' });
    this.pending = this.run(install).catch(error => {
      console.error(error.message);
      this.update({ status: 'error', message: friendlyError(error) });
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async scan() {
    this.update({ items: this.emptyItems(), message: '正在檢查必要元件…' });
    await this.inspect(item => this.setItem(item));
    this.setItem({ id: 'analysis', status: 'blocked', detail: '需先通過所有必要元件檢查' });
  }
  async run(install) {
    await this.scan();
    if (install) {
      for (const step of this.steps) {
        const affected = this.state.items.filter(item => step.itemIds.includes(item.id) && item.status !== 'ready');
        if (!affected.length || await step.check()) continue;
        this.update({ status: 'installing', step: step.id, message: `正在${step.label}…` });
        for (const item of affected) this.setItem({ id: item.id, status: 'checking', detail: '正在安裝' });
        try {
          await step.install(progress => this.update({ progress }));
          if (!await step.check()) throw new Error(`${step.id}: 安裝後檢查未通過`);
          // Frontend dependencies alone are not a usable build yet.
          if (step.id !== 'frontend') for (const item of affected) this.setItem({ id: item.id, status: 'ready' });
        } catch (error) {
          for (const item of affected) this.setItem({ id: item.id, status: 'error', detail: friendlyError(error) });
          throw error;
        }
      }
      await this.scan();
    }
    if (this.state.items.some(item => item.id !== 'analysis' && item.status !== 'ready')) {
      this.update({ status: 'missing', step: null, message: '必要元件尚未全部就緒，請安裝缺少的元件。' });
      return;
    }
    this.update({ message: '正在載入模型並測試辨識…', step: 'analysis' });
    this.setItem({ id: 'analysis', status: 'checking' });
    try { await this.start(); }
    catch (error) { this.failAnalysis('辨識測試未通過，請重試。'); throw error; }
    this.setItem({ id: 'analysis', status: 'ready' });
    this.update({ status: 'ready', step: null, message: '準備完成' });
  }
}
