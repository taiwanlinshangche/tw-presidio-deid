import { useEffect, useRef, type RefObject } from 'react';
import type { Redaction } from '../types';

// 移植自原 deid-interactions.js：事件委派在 #reader 上；浮出原文只在已遮罩時顯示，內容永遠以純文字放入。
export function usePiiMarks(
  rootRef: RefObject<HTMLElement | null>,
  tooltipRef: RefObject<HTMLDivElement | null>,
  getRedaction: () => Redaction | undefined,
  lightningRef: RefObject<boolean>,
  onChange: () => void,
) {
  const hideRef = useRef<() => void>(() => {});
  useEffect(() => {
    const root = rootRef.current;
    const tooltip = tooltipRef.current;
    if (!root || !tooltip) return;
    let activeButton: HTMLButtonElement | null = null;
    function hide() {
      if (activeButton) activeButton.removeAttribute('aria-describedby');
      activeButton = null;
      tooltip!.hidden = true;
      tooltip!.replaceChildren();
    }
    function show(button: HTMLButtonElement) {
      hide();
      const item = getRedaction()?.get(button.dataset.piiId ?? '');
      if (!item?.masked) return;
      activeButton = button;
      const original = document.createElement('span');
      original.textContent = item.original;
      const hint = document.createElement('small');
      hint.textContent = `${item.typeLabel} · 點擊還原`;
      tooltip!.replaceChildren(original, hint);
      tooltip!.hidden = false;
      button.setAttribute('aria-describedby', 'pii-tooltip');
      const rect = button.getBoundingClientRect();
      tooltip!.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - tooltip!.offsetWidth - 12))}px`;
      tooltip!.style.top = `${Math.max(12, rect.bottom + tooltip!.offsetHeight + 12 < innerHeight ? rect.bottom + 8 : rect.top - tooltip!.offsetHeight - 8)}px`;
    }
    function target(event: Event): HTMLButtonElement | null {
      return event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.pii-mark') : null;
    }
    const onClick = (event: Event) => {
      const button = target(event);
      if (!button) { hide(); return; }
      const redaction = getRedaction();
      const id = button.dataset.piiId ?? '';
      if (lightningRef.current) redaction?.toggleAll(id); else redaction?.toggleOne(id);
      onChange();
      show(button);
    };
    const onEnter = (event: Event) => { const button = target(event); if (button) show(button); };
    const onLeave = (event: Event) => {
      const button = target(event);
      const related = (event as PointerEvent | FocusEvent).relatedTarget;
      if (button && !(related instanceof Node && button.contains(related))) hide();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    root.addEventListener('click', onClick);
    root.addEventListener('pointerover', onEnter);
    root.addEventListener('focusin', onEnter);
    root.addEventListener('pointerout', onLeave);
    root.addEventListener('focusout', onLeave);
    root.addEventListener('keydown', onKey);
    root.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    hideRef.current = hide;
    return () => {
      hide();
      root.removeEventListener('click', onClick);
      root.removeEventListener('pointerover', onEnter);
      root.removeEventListener('focusin', onEnter);
      root.removeEventListener('pointerout', onLeave);
      root.removeEventListener('focusout', onLeave);
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      hideRef.current = () => {};
    };
  }, [rootRef, tooltipRef, getRedaction, lightningRef, onChange]);
  return hideRef;
}
