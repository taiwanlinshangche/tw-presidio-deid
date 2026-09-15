import { StartScreen } from './components/StartScreen';
import { Reader } from './components/Reader';
import { CloseDialog } from './components/CloseDialog';
import { DragOverlay } from './components/DragOverlay';
import { useWorkbench } from './hooks/useWorkbench';
import { TooltipProvider } from './components/ui/tooltip';
import type { Soundtrack } from './types';

export function App({ sounds }: { sounds: Soundtrack }) {
  const wb = useWorkbench(sounds);
  const { drag, status } = wb.state;
  return (
    <TooltipProvider delay={300}>
      <StartScreen wb={wb} />
      <input
        id="file-input"
        type="file"
        accept=".md,text/markdown"
        aria-label="選擇 Markdown 檔案"
        hidden
        ref={wb.refs.fileInputRef}
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length) wb.actions.openDocument(files);
        }}
      />
      <Reader wb={wb} />
      <DragOverlay label={drag} />
      <div id="pii-tooltip" role="tooltip" hidden ref={wb.refs.tooltipRef} />
      <p id="status" className="sr-only" role="status" aria-live="polite">{status}</p>
      <CloseDialog wb={wb} />
    </TooltipProvider>
  );
}
