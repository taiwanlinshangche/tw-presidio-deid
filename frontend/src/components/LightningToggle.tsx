import { Zap, ZapOff } from 'lucide-react';
import AnimatedToggle from './smoothui/animated-toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const HINT = {
  on: '閃電模式開啟：點一處，整份文件相同文字一起遮罩或還原',
  off: '閃電模式關閉：只遮罩或還原你點的那一處',
};

// 閃電模式：開啟時點一處即整份文件相同文字一起遮罩；關閉時只處理被點的那一處。
export function LightningToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Tooltip>
      <label className="lightning" data-on={on}>
        <span className="lightning-label">閃電模式</span>
        <TooltipTrigger
          render={
            <AnimatedToggle
              className="min-h-0 border-0"
              checked={on}
              onChange={onChange}
              label="閃電模式"
              size="md"
              variant="icon"
              icons={{ on: <Zap aria-hidden="true" />, off: <ZapOff aria-hidden="true" /> }}
            />
          }
        />
      </label>
      <TooltipContent side="bottom">{on ? HINT.on : HINT.off}</TooltipContent>
    </Tooltip>
  );
}
