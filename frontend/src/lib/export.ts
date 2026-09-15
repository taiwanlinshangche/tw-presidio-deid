import type { Current } from '../types';

// 有遮罩或編輯過才產生新檔，否則下載原始位元組。遮罩版檔名沿用原檔名並加上「[去識別] 」前綴（使用者指定）；
// 編輯過但沒有遮罩，用原檔名。
export function exportDocument(current: Current) {
  const hasMasks = current.redaction.maskedCount > 0;
  const file = hasMasks || current.edited
    ? new Blob([(current.hasBom ? '﻿' : '') + current.redaction.serialize()], { type: 'text/markdown;charset=utf-8' })
    : current.file;
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = hasMasks ? `[去識別] ${current.file.name}` : current.edited ? current.file.name : current.file.name.replace(/\.md$/i, '-原文.md');
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
