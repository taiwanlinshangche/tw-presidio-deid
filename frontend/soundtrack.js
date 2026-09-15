const FILES = {
  intro: '01_拖入檔案_把檔案拖進來.wav',
  releaseOne: '02_放開_版本一.wav',
  releaseTwo: '03_放開_版本二.wav',
  processing: '04_開始處理_讓我幫你看看.wav',
  thinkOne: '05_思考中_嗯_版本一.wav',
  thinkTwo: '06_思考中_嗯_版本二.wav',
  complete: '07_完成_好了.wav',
};

// 單一播放器，任何時刻最多只有一句配音。換狀態後舊排程失效。
export function createSoundtrack(player) {
  let generation = 0;
  let phase = 'idle';
  let pending = null;
  let blocked = false;
  const waits = new Map();
  const report = status => { player.dataset.audioStatus = status; };
  player.src = `/audio/${encodeURIComponent(FILES.intro)}`;

  function interrupt() {
    player.pause();
    pending?.finish(false);
    try { player.currentTime = 0; } catch { /* 尚未載入媒體。 */ }
  }
  function begin(next, stopCurrent = true) {
    generation += 1;
    phase = next;
    blocked = false;
    for (const [timer, resolve] of waits) { clearTimeout(timer); resolve(false); }
    waits.clear();
    if (stopCurrent) interrupt();
    return generation;
  }
  function wait(ms, token) {
    if (token !== generation) return Promise.resolve(false);
    return new Promise(resolve => {
      const timer = setTimeout(() => { waits.delete(timer); resolve(token === generation); }, Math.max(0, ms));
      waits.set(timer, resolve);
    });
  }
  function play(clip, token) {
    if (token !== generation || blocked) return Promise.resolve(false);
    interrupt();
    let resolve;
    const done = new Promise(value => { resolve = value; });
    const record = {
      done,
      finish(success) {
        if (pending !== record) return;
        player.removeEventListener('ended', ended);
        player.removeEventListener('error', failed);
        pending = null;
        resolve(success);
      },
    };
    const ended = () => record.finish(true);
    const failed = () => {
      if (pending !== record) return;
      blocked = false;
      report('error');
      record.finish(false);
    };
    pending = record;
    player.addEventListener('ended', ended);
    player.addEventListener('error', failed);
    player.dataset.cue = clip;
    player.dispatchEvent(new CustomEvent('cue', { detail: clip })); // 畫面上的文字跟著配音換
    const src = `/audio/${encodeURIComponent(FILES[clip])}`;
    if (player.getAttribute('src') !== src) player.src = src;
    player.play().then(() => {
      if (pending === record) report('ready');
    }).catch(error => {
      if (pending !== record) return;
      blocked = error.name === 'NotAllowedError';
      report(blocked ? 'blocked' : 'error');
      record.finish(false);
    });
    return done;
  }
  async function dragging(token) {
    const start = Date.now();
    if (!await play('releaseOne', token)) return;
    if (!await wait(start + 2000 - Date.now(), token)) return;
    if (!await play('releaseTwo', token)) return;
    if (!await wait(start + 4000 - Date.now(), token)) return;
    await play('releaseOne', token);
  }
  // 「讓我幫你看看」→ 2 秒 → 「嗯」→ 2 秒是基本節奏；還沒好就每隔 1 秒換另一個「嗯」，直到完成。
  async function processing(token) {
    if (!await play('processing', token)) return;
    if (!await wait(2000, token)) return;
    if (!await play('thinkOne', token)) return;
    if (!await wait(2000, token)) return;
    let next = 'thinkTwo';
    while (await wait(1000, token)) {
      if (!await play(next, token)) return;
      next = next === 'thinkTwo' ? 'thinkOne' : 'thinkTwo';
      if (!await wait(2000, token)) return;
    }
  }
  const soundtrack = {
    start() {
      play('intro', begin('idle'));
    },
    dragStart() {
      if (phase !== 'drag') dragging(begin('drag'));
    },
    dragEnd() {
      if (phase === 'drag') begin('idle');
    },
    processing() { processing(begin('processing')); },
    // 「好了」要與閱讀畫面同時出現：立刻打斷還在播的「嗯」，不等它播完。
    complete() { play('complete', begin('complete')); },
    stop() { begin('idle'); },
    retryOnInteraction() {
      if (!blocked) return;
      blocked = false;
      if (phase === 'processing') soundtrack.processing();
      else if (phase === 'complete') soundtrack.complete();
      else if (phase === 'drag') dragging(begin('drag'));
      else play('intro', begin('idle'));
    },
  };
  return soundtrack;
}
