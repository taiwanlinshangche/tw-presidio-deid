import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import './styles/app.css';
import { createSoundtrack } from '../soundtrack.js';
import { App } from './App';

// 配音播放器與手勢重試監聽放在 React 之外，確保「開始」的點擊手勢能直接觸發播放。
const audio = document.createElement('audio');
audio.id = 'ui-audio';
audio.preload = 'auto';
audio.hidden = true;
document.body.append(audio);
const sounds = createSoundtrack(audio);
for (const name of ['pointerdown', 'keydown', 'click', 'touchend']) {
  window.addEventListener(name, event => { if (event.isTrusted) sounds.retryOnInteraction(); }, { capture: true, passive: true });
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={{ ease: [0.23, 1, 0.32, 1], duration: 0.25 }}>
      <App sounds={sounds} />
    </MotionConfig>
  </StrictMode>,
);
