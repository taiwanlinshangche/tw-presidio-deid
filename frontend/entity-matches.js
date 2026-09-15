// 先處理所有較長完整標籤，再補較短文字，避免跨起點的重疊吞掉完整實體。
export function expandMatches(text, detected) {
  const labels = new Map();
  for (const entity of detected) {
    const original = text.slice(entity.start, entity.end);
    if (!labels.has(original)) labels.set(original, entity);
  }
  const occupied = new Uint8Array(text.length);
  const matches = [];
  for (const original of [...labels.keys()].sort((a, b) => b.length - a.length)) {
    for (let start = text.indexOf(original); start !== -1; start = text.indexOf(original, start + 1)) {
      const end = start + original.length;
      const overlap = occupied.indexOf(1, start);
      if (overlap !== -1 && overlap < end) continue;
      if (matches.length >= 1200) throw new Error('相同文字展開後超過 1,200 處，請拆分檔案後再試。');
      occupied.fill(1, start, end);
      matches.push({ ...labels.get(original), start, end });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}
