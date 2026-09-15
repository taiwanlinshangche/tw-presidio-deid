import { useState } from 'react';
import { AnalysisWait } from './AnalysisWait';
import { ErrorAlert } from './ErrorAlert';
import { BootChecklist, useBootSequence } from './BootChecklist';
import { DropZoneButton } from './smoothui/animated-file-upload';
import StaggerFromEdges from './smoothui/stagger-from-edges';
import type { Workbench } from '../hooks/useWorkbench';

export function StartScreen({ wb }: { wb: Workbench }) {
  const { phase, started, runtimeReady, setup, error } = wb.state;
  const sequence = useBootSequence(setup);
  // 十張卡片都揭露完、且真實狀態全綠，背景才模糊、浮出「開始」。
  const bootDone = sequence.done && runtimeReady;
  const stageHidden = !started && !bootDone;
  // 按下開始：卡片淡出、模糊退掉、按鈕從實心小方塊撐開成虛線框；卡片淡完才卸載（測試要 region 隱藏）。
  const [cardsGone, setCardsGone] = useState(false);

  return (
    <main id="drop-zone" className="drop-zone" hidden={phase === 'reading'}>
      {!cardsGone && <BootChecklist setup={setup} shown={sequence.shown} displayed={sequence.displayed} done={sequence.done} onSettleEnd={sequence.onSettleEnd} onInstall={wb.actions.install} leaving={started} onLeft={() => setCardsGone(true)} />}
      {/* 卡片本身就會顯示缺項與安裝按鈕；只有聯絡不到啟動器時才需要一行說明 */}
      <p id="startup-message" role="status" hidden={started || setup !== null}>無法確認啟動狀態，請使用專案啟動檔重新開啟。</p>
      <div className="start-stage" hidden={stageHidden} data-blur={!started}>
        {/* 拖曳入口與「辨識中」疊在同一格：換場時原地交叉淡入淡出，不跳位 */}
        <div className="stage-slot">
          <DropZoneButton
            id="choose"
            className={started ? undefined : 'start-button'}
            disabled={stageHidden}
            hidden={phase === 'processing' || phase === 'done' || phase === 'reading' || stageHidden}
            onClick={wb.actions.choose}
            ref={wb.refs.chooseRef}
          >
            {started
              ? <><span className="drop-prompt-was" aria-hidden="true">開始</span><span className="drop-prompt-label">把 .md 拖進來</span></>
              : <StaggerFromEdges delay={350} stagger={90}>開始</StaggerFromEdges>}
          </DropZoneButton>
          <AnalysisWait phase={phase} onDoneShown={wb.actions.doneShown} />
        </div>
        {/* 沒有檔案也能看介面：載入內建的範例提案 */}
        <button id="sample" className="sample-link" hidden={!started || phase !== 'idle'} onClick={() => void wb.actions.openSample()}>模擬測試</button>
        <ErrorAlert message={error} />
      </div>
    </main>
  );
}
