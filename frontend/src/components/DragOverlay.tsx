import { useRef } from 'react';
import { FileDown, FileX } from 'lucide-react';
import type { DragLabel } from '../types';

// 拖曳回饋：置中卡片，進出場都只做淡入淡出（CSS transition + allow-discrete）。
// hidden 由 React 同步翻轉；離場期間保留最後一次的文字，讓文字跟著一起淡出。
export function DragOverlay({ label }: { label: DragLabel | null }) {
  const lastRef = useRef<DragLabel>('放開即可開啟');
  if (label) lastRef.current = label;
  const shown = label ?? lastRef.current;
  const blocked = shown === '請先關閉目前文件';
  return (
    <div id="drag-feedback" className="drag-feedback" hidden={!label} data-blocked={blocked}>
      <div className="drag-card">
        <span aria-hidden="true">{blocked ? <FileX /> : <FileDown />}</span>
        <p id="drag-label">{shown}</p>
      </div>
    </div>
  );
}
