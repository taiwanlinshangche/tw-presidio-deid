import { renderMarkdown } from './document.js';
import { expandMatches } from './entity-matches.js';

const TYPES = { PERSON: '姓名', ORGANIZATION: '組織', LOCATION: '地點', TW_PHONE_NUMBER: '電話', TW_NATIONAL_ID: '身分證', TW_BUSINESS_ID: '統編', EMAIL_ADDRESS: '電子郵件' };

export async function analyzeText(text, signal) {
  if ([...text].length > 30_000) throw new Error('目前最多辨識 30,000 個字元，請拆分檔案後再試。');
  try {
    while (true) {
      signal.throwIfAborted();
      const health = await fetch('/api/health', { signal, cache: 'no-store' });
      if (!health.ok) throw new Error('本機辨識服務無法連線，請確認服務已啟動。');
      const state = await health.json();
      if (state.status === 'ready') break;
      if (state.status !== 'loading') throw new Error('本機模型尚未就緒，請依說明完成模型安裝後重新啟動。');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const response = await fetch('/api/analyses', {
      method: 'POST', signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Deid-Request': '1' },
      body: JSON.stringify({ text }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || '辨識失敗，請重新開啟文件。');
    return body;
  } catch (error) {
    if (error instanceof TypeError) throw new Error('無法連線至本機辨識服務，請確認服務已啟動。');
    if (error instanceof SyntaxError) throw new Error('本機服務回應異常，請重新啟動服務。');
    throw error;
  }
}

function validate(text, response) {
  const fail = () => { throw new Error('辨識結果格式不正確，未產生遮罩。'); };
  if (response?.offsetEncoding !== 'utf-16' || !Array.isArray(response.entities) || response.entities.length > 1200) fail();
  let end = 0;
  const ids = new Set();
  for (const item of response.entities) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || !Object.hasOwn(TYPES, item.type)
      || !Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < end || item.end <= item.start || item.end > text.length
      || !Number.isFinite(item.score) || item.score < 0 || item.score > 1) fail();
    // 不允許把 emoji 的 UTF-16 代理對切成兩半。
    for (const offset of [item.start, item.end]) {
      const code = text.charCodeAt(offset);
      if (code >= 0xDC00 && code <= 0xDFFF) fail();
    }
    end = item.end;
    ids.add(item.id);
  }
}

export function createRedaction(text, response) {
  validate(text, response);
  const aliases = new Map();
  const counts = {};
  const entities = expandMatches(text, response.entities).map((item, index) => {
    const original = text.slice(item.start, item.end);
    const key = original;
    if (!aliases.has(key)) {
      counts[item.type] = (counts[item.type] || 0) + 1;
      aliases.set(key, `〔${TYPES[item.type]} ${counts[item.type]}〕`);
    }
    return { ...item, id: String(index), original, masked: false, label: aliases.get(key), typeLabel: TYPES[item.type], buttons: [] };
  });
  let prefix;
  do { prefix = `PIITOKEN${crypto.randomUUID().replaceAll('-', '')}X`; } while (text.includes(prefix));
  const tokenFor = index => `${prefix}${index}Z`;

  function update(entity) {
    for (const button of entity.buttons) {
      button.textContent = entity.masked ? entity.label : entity.original;
      button.setAttribute('aria-pressed', String(entity.masked));
      button.setAttribute('aria-label', `${entity.typeLabel}，${entity.masked ? '已遮罩，點擊還原' : '疑似個資，點擊遮罩'}`);
    }
  }
  function buttonFor(entity) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pii-mark';
    button.dataset.piiId = entity.id;
    entity.buttons.push(button);
    update(entity);
    return button;
  }
  const source = document.createDocumentFragment();
  let cursor = 0;
  let tokenized = '';
  entities.forEach((entity, index) => {
    const before = text.slice(cursor, entity.start);
    source.append(document.createTextNode(before), buttonFor(entity));
    tokenized += before + tokenFor(index);
    cursor = entity.end;
  });
  source.append(document.createTextNode(text.slice(cursor)));
  tokenized += text.slice(cursor);
  const preview = renderMarkdown(tokenized);
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const pattern = new RegExp(`${prefix}(\\d+)Z`, 'g');
  for (const node of nodes) {
    const matches = [...node.data.matchAll(pattern)];
    if (!matches.length) continue;
    const fragment = document.createDocumentFragment();
    let position = 0;
    for (const match of matches) {
      fragment.append(document.createTextNode(node.data.slice(position, match.index)), buttonFor(entities[Number(match[1])]));
      position = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(node.data.slice(position)));
    node.replaceWith(fragment);
  }
  return {
    source, preview, entities,
    get(id) { return entities[Number(id)]; },
    // 閃電模式關閉時只切換被點的那一處。
    toggleOne(id) {
      const entity = entities[Number(id)];
      if (!entity) return;
      entity.masked = !entity.masked;
      update(entity);
    },
    // 閃電模式開啟（預設）：整份文件相同文字一起切換；有任一處未遮罩就補齊，全部已遮罩才還原。
    toggleAll(id) {
      const entity = entities[Number(id)];
      if (!entity) return;
      const members = entities.filter(e => e.original === entity.original);
      const next = !members.every(e => e.masked);
      for (const member of members) {
        member.masked = next;
        update(member);
      }
    },
    toggle(id) { this.toggleAll(id); },
    toggleCategory(type) {
      const members = entities.filter(e => e.type === type);
      const next = !members.every(e => e.masked);
      for (const member of members) { member.masked = next; update(member); }
    },
    get groups() {
      const groups = new Map();
      for (const entity of entities) {
        if (!groups.has(entity.original)) groups.set(entity.original, { id: entity.id, original: entity.original, type: entity.type, typeLabel: entity.typeLabel, count: 0, maskedCount: 0 });
        const group = groups.get(entity.original);
        group.count += 1;
        group.maskedCount += Number(entity.masked);
      }
      return [...groups.values()];
    },
    get maskedCount() { return entities.filter(e => e.masked).length; },
    serialize() {
      let result = '';
      let position = 0;
      for (const entity of entities) {
        result += text.slice(position, entity.start) + (entity.masked ? entity.label : entity.original);
        position = entity.end;
      }
      return result + text.slice(position);
    },
  };
}
