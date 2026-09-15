import { useEffect, type RefObject } from 'react';

// 預覽直接編輯：點任一頂層區塊（不是辨識標記）就在原位換成該區塊的 Markdown 編輯框。
// 失焦或 Cmd/Ctrl+Enter 送出（只替換那幾行），Escape 取消；編輯中點另一段會先送出再打開那一段。
// 換行符號沿用文件原本的樣式。區塊的行號範圍由 renderMarkdown 寫在 data-lines 上。
export function usePreviewEditor(ref: RefObject<HTMLElement | null>, getText: () => string, onCommit: (next: string) => void) {
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let open: { block: HTMLElement; editor: HTMLTextAreaElement; text: string } | null = null;
    const blocks = () => [...host.querySelectorAll<HTMLElement>(':scope > [data-lines]')];
    function close(commit: boolean) {
      if (!open) return;
      const { block, editor, text } = open;
      open = null;
      const [start, end] = (block.dataset.lines ?? '0-0').split('-').map(Number);
      const value = editor.value;
      editor.remove();
      block.hidden = false;
      if (commit) {
        const newline = text.includes('\r\n') ? '\r\n' : '\n';
        const lines = text.split(/\r?\n/);
        const next = [...lines.slice(0, start), ...value.split(/\r?\n/), ...lines.slice(end)].join(newline);
        if (next !== text) onCommit(next);
      }
    }
    function openBlock(block: HTMLElement) {
      const text = getText();
      const [start, end] = (block.dataset.lines ?? '0-0').split('-').map(Number);
      const editor = document.createElement('textarea');
      editor.className = 'block-editor';
      editor.setAttribute('aria-label', '編輯這一段');
      editor.spellcheck = false;
      editor.value = text.split(/\r?\n/).slice(start, end).join('\n');
      editor.rows = Math.max(1, end - start);
      editor.addEventListener('blur', () => close(true));
      editor.addEventListener('keydown', keyEvent => {
        if (keyEvent.key === 'Escape') { keyEvent.preventDefault(); close(false); }
        if (keyEvent.key === 'Enter' && (keyEvent.metaKey || keyEvent.ctrlKey)) { keyEvent.preventDefault(); close(true); }
      });
      block.before(editor);
      block.hidden = true;
      open = { block, editor, text };
      editor.focus();
    }
    function blockOf(event: Event) {
      if (!(event.target instanceof Element) || event.target.closest('.pii-mark, textarea')) return null;
      const block = event.target.closest<HTMLElement>('[data-lines]');
      return block && block.parentElement === host ? block : null;
    }
    // 編輯中按下另一段：mousedown 先擋掉焦點搬移（舊編輯框不會提前失焦），click 時才送出並打開那一段
    const onMouseDown = (event: Event) => { if (open && blockOf(event)) event.preventDefault(); };
    const onClick = (event: Event) => {
      const block = blockOf(event);
      if (!block) return;
      if (!open) { openBlock(block); return; }
      const index = blocks().indexOf(block);
      close(true);
      const target = blocks()[index];
      if (target) openBlock(target);
    };
    host.addEventListener('click', onClick);
    host.addEventListener('mousedown', onMouseDown);
    return () => {
      close(false);
      host.removeEventListener('click', onClick);
      host.removeEventListener('mousedown', onMouseDown);
    };
  }, [ref, getText, onCommit]);
}
