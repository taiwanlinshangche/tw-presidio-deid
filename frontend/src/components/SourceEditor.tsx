import { useEffect, useRef, useState } from 'react';

// 原始碼視圖就是編輯框：邊看邊改，停止輸入 800ms 或失焦就套用（立刻重排、背景重新辨識）。
export function SourceEditor({ text, onCommit, textareaRef }: { text: string; onCommit: (next: string) => void; textareaRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const [draft, setDraft] = useState(text.replace(/\r\n/g, '\n')); // textarea 只會給 \n
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setDraft(text.replace(/\r\n/g, '\n')); }, [text]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const restore = (value: string) => (text.includes('\r\n') ? value.replace(/\r?\n/g, '\r\n') : value); // 沿用文件原本的換行
  const commit = (value: string) => { window.clearTimeout(timer.current); onCommit(restore(value)); };
  return (
    <textarea
      id="source"
      className="source source-editor"
      aria-label="原始碼"
      spellCheck={false}
      value={draft}
      ref={textareaRef}
      onChange={event => {
        const value = event.currentTarget.value;
        setDraft(value);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => onCommit(restore(value)), 800);
      }}
      onBlur={event => commit(event.currentTarget.value)}
    />
  );
}
