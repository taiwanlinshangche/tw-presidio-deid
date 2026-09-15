import { useCallback, useEffect, useReducer, useRef } from 'react';
import { flushSync } from 'react-dom';
import { isReady } from '../../runtime-status.js';
import { readDocument } from '../../document.js';
import { analyzeText, createRedaction } from '../../deid.js';
import { exportDocument } from '../lib/export';
import { usePiiMarks } from './usePiiMarks';
import type { Current, DragLabel, Phase, Redaction, SetupState, Soundtrack, View } from '../types';

export interface WorkbenchState {
  phase: Phase;
  started: boolean;
  runtimeReady: boolean;
  setup: SetupState | null; // null＝聯絡不到啟動器
  error: string;
  status: string;
  current: Current | null;
  drag: DragLabel | null;
  view: View;
  panelOpen: boolean;
  lightning: boolean;
  version: number;
}

type Action =
  | { type: 'READINESS'; ready: boolean; setup: SetupState | null }
  | { type: 'START' }
  | { type: 'OPEN_BEGIN' }
  | { type: 'OPEN_DONE' }
  | { type: 'OPEN_SUCCESS'; current: Current }
  | { type: 'OPEN_FAIL'; error: string }
  | { type: 'CLEAR' }
  | { type: 'DRAG'; label: DragLabel | null }
  | { type: 'VIEW'; view: View }
  | { type: 'PANEL'; open: boolean }
  | { type: 'LIGHTNING'; on: boolean }
  | { type: 'MASKS_CHANGED' }
  | { type: 'TEXT_CHANGED'; current: Current; note?: string };

const initial: WorkbenchState = {
  phase: 'boot', started: false, runtimeReady: false, setup: { status: 'checking' },
  error: '', status: '', current: null, drag: null, view: 'preview', panelOpen: false, lightning: true, version: 0,
};

// 辨識至少停留 --dur-analysis-min（預設 7s＝配音的基本節奏，減少動態時為 0）：讓「正在辨識」有被看見的時間。
// 取消（abort）時立即放行；token 為 0 時不建立計時器（測試的假時鐘下 0ms 計時器也不會觸發）。
function tokenMs(name: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  return raw.endsWith('ms') ? value : value * 1000; // 建置時壓縮器會把 3000ms 改寫成 3s
}
function minimumWait(signal: AbortSignal) {
  const ms = tokenMs('--dur-analysis-min');
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise<void>(resolve => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { window.clearTimeout(timer); resolve(); }, { once: true });
  });
}

export function exportTitle(current: Current) {
  return `已遮罩 ${current.redaction.maskedCount}／${current.redaction.entities.length} 處，其餘仍為原文。辨識可能有遺漏。`;
}

function reducer(state: WorkbenchState, action: Action): WorkbenchState {
  switch (action.type) {
    case 'READINESS':
      if (state.runtimeReady === action.ready && state.setup === action.setup) return state;
      return { ...state, runtimeReady: action.ready, setup: action.setup };
    case 'START': return { ...state, started: true, phase: 'idle' };
    case 'OPEN_BEGIN': return { ...state, phase: 'processing', error: '', status: '正在辨識個資…' };
    case 'OPEN_DONE': return { ...state, phase: 'done', status: '辨識完成' };
    case 'OPEN_SUCCESS':
      return { ...state, phase: 'reading', current: action.current, view: 'preview', version: 0, status: action.current.text.length ? exportTitle(action.current) : '空白文件' };
    case 'OPEN_FAIL': return { ...state, phase: 'idle', error: action.error, status: '未載入文件。' };
    case 'CLEAR': return { ...state, phase: state.started ? 'idle' : 'boot', current: null, error: '', status: '', drag: null, panelOpen: false, version: 0 };
    case 'DRAG': return state.drag === action.label ? state : { ...state, drag: action.label };
    case 'VIEW': return state.view === action.view ? state : { ...state, view: action.view };
    case 'PANEL': return state.panelOpen === action.open ? state : { ...state, panelOpen: action.open };
    case 'LIGHTNING': return { ...state, lightning: action.on, status: action.on ? '閃電模式已開啟' : '閃電模式已關閉' };
    case 'MASKS_CHANGED': return state.current ? { ...state, version: state.version + 1, status: exportTitle(state.current) } : state;
    case 'TEXT_CHANGED': return { ...state, current: action.current, version: 0, status: action.note ?? `已更新。${exportTitle(action.current)}` };
  }
}

export function useWorkbench(sounds: Soundtrack) {
  const [state, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lightningRef = useRef(state.lightning);
  lightningRef.current = state.lightning;

  const ticketRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const dragDepthRef = useRef(0);
  const readinessTimerRef = useRef<number | undefined>(undefined);
  const readinessStoppedRef = useRef(false);
  const doneShownRef = useRef<(() => void) | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const readerRef = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const previewPanelRef = useRef<HTMLElement>(null);
  const sourcePanelRef = useRef<HTMLElement>(null);
  const previewTabRef = useRef<HTMLButtonElement>(null);
  const sourceTabRef = useRef<HTMLButtonElement>(null);
  const categoriesRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const getRedaction = useCallback((): Redaction | undefined => stateRef.current.current?.redaction, []);
  const masksChanged = useCallback(() => dispatch({ type: 'MASKS_CHANGED' }), []);
  const hideTooltip = usePiiMarks(readerRef, tooltipRef, getRedaction, lightningRef, masksChanged);

  // 啟動檢查輪詢：每 700ms 一次，按下「開始」後停止。
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (cancelled || readinessStoppedRef.current) return;
      try {
        const response = await fetch('/api/setup/status', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as SetupState;
        if (cancelled) return;
        dispatch({ type: 'READINESS', ready: isReady(data), setup: data });
      } catch {
        if (cancelled) return;
        dispatch({ type: 'READINESS', ready: false, setup: null });
      }
      if (!cancelled && !readinessStoppedRef.current) readinessTimerRef.current = window.setTimeout(check, 700);
    }
    check();
    const onPageHide = () => { clearTimeout(readinessTimerRef.current); sounds.stop(); };
    window.addEventListener('pagehide', onPageHide);
    return () => { cancelled = true; clearTimeout(readinessTimerRef.current); window.removeEventListener('pagehide', onPageHide); };
  }, [sounds]);

  const resetDrag = useCallback(() => {
    dragDepthRef.current = 0;
    dispatch({ type: 'DRAG', label: null });
    sounds.dragEnd();
  }, [sounds]);

  const clear = useCallback(() => {
    sounds.stop();
    ticketRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    editControllerRef.current?.abort();
    doneShownRef.current?.();
    doneShownRef.current = null;
    hideTooltip.current();
    previewRef.current?.replaceChildren();
    if (fileInputRef.current) fileInputRef.current.value = '';
    flushSync(() => dispatch({ type: 'CLEAR' }));
    resetDrag();
  }, [sounds, hideTooltip, resetDrag]);

  const openDocument = useCallback(async (files: File[]) => {
    const snapshot = stateRef.current;
    if (!snapshot.started || snapshot.current || dialogRef.current?.open) return;
    clear();
    const ticket = ticketRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 180_000);
    dispatch({ type: 'OPEN_BEGIN' });
    const floor = minimumWait(controller.signal);
    try {
      const result = await readDocument(files);
      if (ticket !== ticketRef.current) return;
      sounds.processing();
      const [analysis] = await Promise.all([analyzeText(result.text, controller.signal), floor]);
      if (ticket !== ticketRef.current) return;
      const redaction = createRedaction(result.text, analysis) as Redaction;
      // 「辨識完成」與「好了」同時出現；等它淡出（animationend，真實時間）再讓閱讀畫面進場。
      flushSync(() => dispatch({ type: 'OPEN_DONE' }));
      sounds.complete();
      await new Promise<void>(resolve => { doneShownRef.current = resolve; });
      doneShownRef.current = null;
      if (ticket !== ticketRef.current) return;
      previewRef.current?.replaceChildren(redaction.preview);
      const current: Current = { ...result, redaction };
      flushSync(() => dispatch({ type: 'OPEN_SUCCESS', current }));
      previewTabRef.current?.focus();
      if (previewPanelRef.current) previewPanelRef.current.scrollTop = 0;
      if (sourcePanelRef.current) sourcePanelRef.current.scrollTop = 0;
    } catch (error) {
      if (ticket !== ticketRef.current) return;
      sounds.stop();
      dispatch({ type: 'OPEN_FAIL', error: controller.signal.aborted ? '辨識逾時，請拆分檔案後再試。' : (error as Error).message });
    } finally {
      clearTimeout(timeout);
    }
  }, [clear, sounds]);

  // 拖曳監聽掛在 window：測試會從 body、#drop-zone、#choose 派發事件。
  useEffect(() => {
    function showDrag(event: DragEvent) {
      if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes('Files')) return false;
      event.preventDefault();
      const snapshot = stateRef.current;
      if (!snapshot.started) return false;
      dispatch({ type: 'DRAG', label: snapshot.current ? '請先關閉目前文件' : '放開即可開啟' });
      if (!snapshot.current && snapshot.phase !== 'processing' && snapshot.phase !== 'done') sounds.dragStart();
      event.dataTransfer.dropEffect = snapshot.current ? 'none' : 'copy';
      return true;
    }
    const onEnter = (event: DragEvent) => { if (showDrag(event)) dragDepthRef.current += 1; };
    const onOver = (event: DragEvent) => { showDrag(event); };
    const onLeave = () => {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (!dragDepthRef.current) resetDrag();
    };
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      resetDrag();
      if (stateRef.current.current) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) openDocument(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', resetDrag);
    window.addEventListener('blur', resetDrag);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', resetDrag);
      window.removeEventListener('blur', resetDrag);
    };
  }, [sounds, resetDrag, openDocument]);

  const choose = useCallback(() => {
    const snapshot = stateRef.current;
    if (snapshot.started) { fileInputRef.current?.click(); return; }
    if (!snapshot.runtimeReady) return;
    readinessStoppedRef.current = true;
    clearTimeout(readinessTimerRef.current);
    flushSync(() => dispatch({ type: 'START' }));
    sounds.start();
  }, [sounds]);

  const doneShown = useCallback(() => { doneShownRef.current?.(); }, []);
  // 「模擬測試」：沒有檔案也能看介面，載入內建的範例提案。
  const openSample = useCallback(async () => {
    try {
      const response = await fetch('/examples/範例提案.md', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      await openDocument([new File([blob], '範例提案.md', { type: 'text/markdown' })]);
    } catch {
      dispatch({ type: 'OPEN_FAIL', error: '無法載入範例文件。' });
    }
  }, [openDocument]);
  // 卡片上的「安裝」：交給啟動器安裝缺少的元件，進度由既有的輪詢帶回來。
  const install = useCallback(async () => {
    try { await fetch('/api/setup/install', { method: 'POST', headers: { 'X-Deid-Setup': '1' }, signal: AbortSignal.timeout(5000) }); } catch { /* 下一次輪詢會反映狀態 */ }
  }, []);

  // 邊看邊改：原始碼 textarea 或預覽段落改完後，先用已知的實體文字立刻重排（相同文字全部找出來、遮罩照舊），
  // 再在背景重新辨識一次補上新出現的個資。
  const editControllerRef = useRef<AbortController | null>(null);
  const applyText = useCallback((previous: Current, text: string, analysis: unknown, maskedBefore: Set<string>, note?: string) => {
    const redaction = createRedaction(text, analysis) as Redaction;
    for (const entity of redaction.entities) if (maskedBefore.has(entity.original)) redaction.toggleOne(entity.id);
    hideTooltip.current();
    previewRef.current?.replaceChildren(redaction.preview);
    flushSync(() => dispatch({ type: 'TEXT_CHANGED', current: { ...previous, text, redaction, edited: true }, note }));
  }, [hideTooltip]);
  const commitText = useCallback((text: string) => {
    const previous = stateRef.current.current;
    if (!previous || text === previous.text) return;
    const maskedBefore = new Set(previous.redaction.groups.filter(group => group.maskedCount > 0).map(group => group.original));
    // 已知實體各找一個不重疊的位置當種子，createRedaction 會把相同文字全部展開。
    const occupied = new Uint8Array(text.length);
    const seeds: { id: string; start: number; end: number; type: string; score: number }[] = [];
    for (const group of [...previous.redaction.groups].sort((a, b) => b.original.length - a.original.length)) {
      for (let at = text.indexOf(group.original); at !== -1; at = text.indexOf(group.original, at + 1)) {
        const end = at + group.original.length;
        if (occupied.subarray(at, end).some(Boolean)) continue;
        occupied.fill(1, at, end);
        seeds.push({ id: String(seeds.length), start: at, end, type: group.type, score: 1 });
        break;
      }
    }
    seeds.sort((a, b) => a.start - b.start);
    try { applyText(previous, text, { offsetEncoding: 'utf-16', entities: seeds.map((seed, index) => ({ ...seed, id: String(index) })) }, maskedBefore); }
    catch { applyText(previous, text, { offsetEncoding: 'utf-16', entities: [] }, maskedBefore); }
    editControllerRef.current?.abort();
    const controller = new AbortController();
    editControllerRef.current = controller;
    const ticket = ticketRef.current;
    analyzeText(text, controller.signal).then(analysis => {
      const latest = stateRef.current.current;
      if (ticket !== ticketRef.current || controller.signal.aborted || !latest || latest.text !== text) return;
      if (previewRef.current?.querySelector('.block-editor')) return; // 使用者正在改下一段：不換掉畫面，下一次套用會再辨識
      const maskedNow = new Set(latest.redaction.groups.filter(group => group.maskedCount > 0).map(group => group.original));
      try { applyText(latest, text, analysis, maskedNow); } catch { /* 保留立即重排的結果 */ }
    }).catch(error => {
      if (ticket !== ticketRef.current || controller.signal.aborted) return;
      dispatch({ type: 'TEXT_CHANGED', current: stateRef.current.current!, note: `重新辨識失敗：${(error as Error).message}` });
    });
  }, [applyText]);

  const selectView = useCallback((view: View, focus = false) => {
    flushSync(() => dispatch({ type: 'VIEW', view }));
    if (focus) (view === 'preview' ? previewTabRef : sourceTabRef).current?.focus();
  }, []);

  const requestClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.returnValue = '';
    dialog.showModal();
    cancelRef.current?.focus();
  }, []);

  const onDialogClose = useCallback(() => {
    if (dialogRef.current?.returnValue === 'confirm') { clear(); chooseRef.current?.focus(); }
  }, [clear]);

  const exportCurrent = useCallback(() => { if (stateRef.current.current) exportDocument(stateRef.current.current); }, []);
  const setPanel = useCallback((open: boolean) => { flushSync(() => dispatch({ type: 'PANEL', open })); }, []);
  const setLightning = useCallback((on: boolean) => dispatch({ type: 'LIGHTNING', on }), []);

  return {
    state, sounds,
    refs: { fileInputRef, chooseRef, dialogRef, cancelRef, readerRef, previewRef, sourceRef, previewPanelRef, sourcePanelRef, previewTabRef, sourceTabRef, categoriesRef, tooltipRef },
    actions: { choose, openDocument, openSample, doneShown, install, selectView, requestClose, onDialogClose, exportCurrent, setPanel, setLightning, masksChanged, commitText },
  };
}

export type Workbench = ReturnType<typeof useWorkbench>;
