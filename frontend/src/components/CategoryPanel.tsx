import { useEffect, useRef } from 'react';
import type { Workbench } from '../hooks/useWorkbench';

// 分類快速遮罩面板：分類列與標籤永遠整組切換，不受閃電模式影響。
export function CategoryPanel({ wb }: { wb: Workbench }) {
  const { current, panelOpen } = wb.state;
  const panelRef = useRef<HTMLElement>(null);
  const trigger = wb.refs.categoriesRef;
  const { setPanel, masksChanged } = wb.actions;

  useEffect(() => {
    if (!panelOpen) return;
    const panel = panelRef.current;
    const outside = (event: Event) => {
      if (event.target instanceof Node && !panel?.contains(event.target) && !trigger.current?.contains(event.target)) setPanel(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPanel(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen, setPanel, trigger]);

  const groups = current?.redaction.groups ?? [];
  const types = [...new Set(groups.map(group => group.type))];
  const pressed = (masked: number, total: number) => (masked === total ? 'true' : masked ? 'mixed' : 'false');

  return (
    <section id="category-panel" className="category-panel" role="region" aria-label="個資分類" hidden={!panelOpen} ref={panelRef}>
      {current && !groups.length && <p className="category-empty">這份文件沒有辨識到標籤。</p>}
      {current && groups.length > 0 && (
        <>
          <h2>快速遮罩</h2>
          {types.map(type => {
            const members = groups.filter(group => group.type === type);
            const total = members.reduce((sum, group) => sum + group.count, 0);
            const masked = members.reduce((sum, group) => sum + group.maskedCount, 0);
            return (
              <div className="category-section" key={type}>
                <button
                  className="category-toggle"
                  data-category={type}
                  aria-label={`整類切換：${members[0].typeLabel}`}
                  aria-pressed={pressed(masked, total)}
                  onClick={() => { current.redaction.toggleCategory(type); masksChanged(); }}
                >
                  {members[0].typeLabel}<small>{masked} / {total} 處</small>
                </button>
                <div className="category-tags">
                  {members.map(group => (
                    <button
                      className="category-tag"
                      data-group-id={group.id}
                      aria-label={`切換全文：${group.original}`}
                      aria-pressed={pressed(group.maskedCount, group.count)}
                      key={group.id}
                      onClick={() => { current.redaction.toggleAll(group.id); masksChanged(); }}
                    >
                      {group.original}<small>×{group.count}</small>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
