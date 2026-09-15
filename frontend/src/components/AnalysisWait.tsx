import { useEffect, useState } from 'react';
import type { Phase } from '../types';

const CUE_TEXT: Record<string, string> = { processing: '讓我幫你看看…', thinkOne: '嗯…', thinkTwo: '嗯…' };

// 辨識中：文字跟著配音換（讓我幫你看看… → 嗯…），下面是由左往右滑的掃描條；等超過 8 秒才顯示「已等待 N 秒」。
// 辨識完成後先淡出辨識中的字、淡入「好了！」再淡出（done-pulse），animationend 才讓閱讀畫面進場。
// 元件常駐、以 hidden 切換，讓 CSS 能做進出場的交叉淡入淡出；隱藏時不計時。
export function AnalysisWait({ phase, onDoneShown }: { phase: Phase; onDoneShown: () => void }) {
  const active = phase === 'processing' || phase === 'done';
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState(CUE_TEXT.processing);
  const [was, setWas] = useState('');
  useEffect(() => {
    if (phase !== 'processing') { setSeconds(0); setText(CUE_TEXT.processing); setWas(''); return; }
    const start = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    const player = document.getElementById('ui-audio');
    const onCue = (event: Event) => { const next = CUE_TEXT[(event as CustomEvent<string>).detail]; if (next) setText(current => { if (current !== next) setWas(current); return next; }); };
    player?.addEventListener('cue', onCue);
    return () => { window.clearInterval(timer); player?.removeEventListener('cue', onCue); };
  }, [phase]);
  return (
    <div className="analysis-wait" hidden={!active} data-done={phase === 'done' || undefined}>
      <div className="analysis-slot">
        <div className="analysis-live">
          <div className="analysis-text">
            {was && <p className="analysis-text-was" key={`was-${was}-${text}`} aria-hidden="true">{was}</p>}
            <p id="loading" key={text}>{text}</p>
          </div>
          <div className="analysis-bar" aria-hidden="true"><i /></div>
          {seconds >= 8 && <p className="analysis-elapsed" aria-hidden="true">已等待 {seconds} 秒</p>}
        </div>
        {phase === 'done' && (
          <p className="analysis-done" onAnimationEnd={event => { if (event.animationName === 'done-pulse') onDoneShown(); }}>好了！</p>
        )}
      </div>
    </div>
  );
}
