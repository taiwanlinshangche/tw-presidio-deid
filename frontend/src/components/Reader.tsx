import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Download, Tags } from 'lucide-react';
import { motion } from 'motion/react';
import { LightningToggle } from './LightningToggle';
import { SourceEditor } from './SourceEditor';
import { CategoryPanel } from './CategoryPanel';
import { exportTitle } from '../hooks/useWorkbench';
import { usePreviewEditor } from '../hooks/usePreviewEditor';
import type { Workbench } from '../hooks/useWorkbench';
import type { View } from '../types';

export function Reader({ wb }: { wb: Workbench }) {
  const { phase, current, view, panelOpen } = wb.state;
  const { refs, actions } = wb;
  const maskedCount = current?.redaction.maskedCount ?? 0;
  const exportLabel = maskedCount ? '下載遮罩版 .md' : current?.edited ? '下載編輯版 .md' : '下載原文 .md';
  const title = current ? exportTitle(current) : '下載原文 .md';

  const onTabKey = (own: View) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next: View = event.key === 'Home' ? 'source' : event.key === 'End' ? 'preview' : own === 'source' ? 'preview' : 'source';
    actions.selectView(next, true);
  };

  // 進場：#reader 淡入、兩個面板由下往上滑入；滑入結束後標記 settled，切換頁籤時不再重播。
  const [settled, setSettled] = useState(false);
  useEffect(() => { if (phase !== 'reading') setSettled(false); }, [phase]);
  // 用 ref 讀最新文字，讓 hook 的依賴保持穩定：套用後不會重掛監聽、關掉剛打開的編輯框
  const textRef = useRef('');
  textRef.current = current?.text ?? '';
  const getText = useCallback(() => textRef.current, []);
  usePreviewEditor(refs.previewRef, getText, actions.commitText);

  const pill = <motion.span className="view-pill" layoutId="view-pill" transition={{ type: 'tween', duration: 0.2, ease: [0.77, 0, 0.175, 1] }} aria-hidden="true" />;

  const openPanel = () => {
    if (panelOpen) { actions.setPanel(false); return; }
    actions.setPanel(true);
    document.querySelector<HTMLButtonElement>('#category-panel button')?.focus();
  };

  return (
    <main id="reader" hidden={phase !== 'reading'} data-settled={settled || undefined} ref={refs.readerRef} onAnimationEnd={event => { if (event.animationName === 'slide-up') setSettled(true); }}>
      <header className="reader-toolbar">
        <button id="close" className="quiet-button" onClick={actions.requestClose}><span aria-hidden="true">×</span> 關閉</button>
        <div className="view-switch" role="tablist" aria-label="文件檢視">
          <button id="source-tab" role="tab" aria-selected={view === 'source'} aria-controls="source-panel" tabIndex={view === 'source' ? 0 : -1} ref={refs.sourceTabRef} onClick={() => actions.selectView('source')} onKeyDown={onTabKey('source')}>{view === 'source' && pill}原始碼</button>
          <button id="preview-tab" role="tab" aria-selected={view === 'preview'} aria-controls="preview-panel" tabIndex={view === 'preview' ? 0 : -1} ref={refs.previewTabRef} onClick={() => actions.selectView('preview')} onKeyDown={onTabKey('preview')}>{view === 'preview' && pill}預覽</button>
        </div>
        <div className="toolbar-actions">
          {phase === 'reading' && <LightningToggle on={wb.state.lightning} onChange={actions.setLightning} />}
          <button id="categories" className="quiet-button icon-button" aria-label="分類快速遮罩" title="分類快速遮罩" aria-expanded={panelOpen} aria-controls="category-panel" onClick={openPanel} ref={refs.categoriesRef}>
            <Tags aria-hidden="true" focusable="false" />
          </button>
          <button id="export" className="quiet-button icon-button" aria-label={exportLabel} title={title} disabled={!current} onClick={actions.exportCurrent}>
            <Download aria-hidden="true" focusable="false" />
          </button>
          <CategoryPanel wb={wb} />
        </div>
      </header>
      <section id="source-panel" className="reading-panel" role="tabpanel" aria-labelledby="source-tab" tabIndex={0} hidden={view !== 'source'} ref={refs.sourcePanelRef}>
        <p className="edit-hint">直接在這裡修改，停止輸入後會自動套用並重新辨識；之前遮罩過的文字會再次遮罩。</p>
        <SourceEditor text={current?.text ?? ''} onCommit={actions.commitText} textareaRef={refs.sourceRef} />
      </section>
      <section id="preview-panel" className="reading-panel" role="tabpanel" aria-labelledby="preview-tab" tabIndex={0} hidden={view !== 'preview'} ref={refs.previewPanelRef}>
        <article id="preview" className="markdown" ref={refs.previewRef} />
        <p id="empty-document" className="empty-document" hidden={!current || Boolean(current.text.trim())}>這是一份空白文件。</p>
      </section>
    </main>
  );
}
