import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { RUNTIME_ITEMS } from '../../runtime-catalog.js';
import { STATUS_LABELS } from '../../runtime-status.js';
import type { SetupState } from '../types';

const SETTLED = new Set(['ready', 'missing', 'error', 'blocked']);
const LABELS = STATUS_LABELS as Record<string, string>;

/**
 * 啟動檢查的節奏器：卡片一張接一張揭露，每張至少隔一個 --dur-check-step（預設 1s）。
 * 節拍來自 CSS 動畫的 animationend（真實時間），不用 setTimeout——測試的假時鐘不會卡住它。
 * 真實狀態隨時可能更新，但只有 shown 之前的卡片會顯示真實狀態；第 shown 張永遠顯示「檢查中」。
 */
export function useBootSequence(setup: SetupState | null) {
  const [shown, setShown] = useState(0);
  const [ended, setEnded] = useState(0);
  const items = setup?.items;
  const statusOf = (index: number) => {
    const status = items?.find(item => item.id === RUNTIME_ITEMS[index].id)?.status;
    return status && Object.hasOwn(LABELS, status) ? status : 'pending';
  };
  // 安裝時啟動器會整份重新掃描（所有項目先回到 pending）：已經揭露為「可用」的卡片不跟著退回，
  // 只有出現缺少／失敗才改變；避免卡片閃回「待檢查」又逐一變綠。
  const readySeen = useRef<boolean[]>([]);
  const displayed = RUNTIME_ITEMS.map((_, index) => {
    if (index > shown) return 'pending';
    if (index === shown) return 'checking';
    const real = statusOf(index);
    return (real === 'pending' || real === 'checking') && readySeen.current[index] ? 'ready' : real;
  });
  const nextSettled = shown < RUNTIME_ITEMS.length && SETTLED.has(statusOf(shown));
  useEffect(() => {
    if (nextSettled && ended === shown) setShown(shown + 1);
  }, [nextSettled, ended, shown]);
  // 啟動階段不播提示音（瀏覽器在使用者點擊前本來就會擋掉自動播放，聲音一律從「開始」之後才有）。
  useEffect(() => {
    displayed.forEach((status, index) => { readySeen.current[index] = status === 'ready'; });
  });
  const onSettleEnd = (index: number) => setEnded(count => (count === index ? index + 1 : count));
  return { shown, displayed, done: ended === RUNTIME_ITEMS.length, onSettleEnd };
}

export function BootChecklist({ setup, shown, displayed, onSettleEnd, onInstall, leaving, onLeft }: {
  setup: SetupState | null; shown: number; displayed: string[]; onSettleEnd: (index: number) => void; onInstall: () => void; leaving: boolean; onLeft: () => void;
}) {
  const installing = setup?.status === 'installing';
  const progress = setup?.progress;
  const percent = progress && progress.total > 0 ? Math.min(100, Math.floor(100 * progress.received / progress.total)) : null;
  return (
    <div className="boot" data-leaving={leaving || undefined} onAnimationEnd={event => { if (event.animationName === 'boot-leave' && event.target === event.currentTarget) onLeft(); }}>
      <ul id="startup-checklist" className="boot-cards" aria-label="啟動檢查清單">
        {RUNTIME_ITEMS.map((entry, index) => {
          const item = setup?.items?.find(candidate => candidate.id === entry.id);
          const status = displayed[index];
          const revealed = index < shown;
          const detail = revealed && status !== 'ready' && typeof item?.detail === 'string' ? item.detail.trim() : '';
          const actionable = revealed && (status === 'missing' || status === 'error');
          // 安裝進度直接寫在卡片裡（例如「安裝中 35%」），卡片下方不再有任何文字或進度列
          const label = installing && status === 'checking' && item?.detail === '正在安裝' ? (percent === null ? '安裝中' : `安裝中 ${percent}%`) : LABELS[status];
          return (
            <li
              key={entry.id}
              className="boot-card"
              style={{ '--i': index } as CSSProperties}
              data-status={status}
              data-shown={revealed || undefined}
              onAnimationEnd={event => { if (event.animationName === 'boot-settle') onSettleEnd(index); }}
            >
              <span className="boot-card-label">{entry.label}</span>
              <span className="boot-card-status">
                {revealed && <span className="boot-card-was" aria-hidden="true">{LABELS.checking}</span>}
                <span className="boot-card-text">
                  <span className="boot-card-dots" aria-hidden="true"><i /><i /><i /></span>
                  {actionable
                    ? <button type="button" className="boot-card-install" aria-label={`${status === 'error' ? '重試' : '安裝'}：${entry.label}`} onClick={onInstall} disabled={installing}>{status === 'error' ? '重試' : '安裝'}</button>
                    : label}
                </span>
              </span>
              {detail && status !== 'checking' && <span className="boot-card-detail">{detail}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
