import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
// 在產生 DOM 前移除圖片 URL 與連結目的地，避免任何自動載入。
markdown.renderer.rules.image = (tokens, index) =>
  `<span class="image-note">[圖片未載入：${markdown.utils.escapeHtml(tokens[index].content)}]</span>`;
markdown.renderer.rules.link_open = () => '<span class="inert-link">';
markdown.renderer.rules.link_close = () => '</span>';

// 頂層區塊記下原始行號範圍（data-lines="起-迄"，迄不含），預覽編輯時可以只換那幾行。
markdown.core.ruler.push('block_lines', state => {
  for (const token of state.tokens) {
    if (token.map && token.level === 0 && token.nesting !== -1) token.attrSet('data-lines', `${token.map[0]}-${token.map[1]}`);
  }
});

export function renderMarkdown(text) {
  return DOMPurify.sanitize(markdown.render(text), {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 's', 'blockquote', 'pre', 'code', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span'],
    ALLOWED_ATTR: ['class', 'start', 'data-lines'],
  });
}

export async function readDocument(files) {
  if (files.length !== 1) throw new Error('一次只能開啟一個檔案。');
  const file = files[0];
  if (!/\.md$/i.test(file.name)) throw new Error('請選擇 .md 檔案。');
  if (file.size > 2 * 1024 * 1024) throw new Error('檔案不可超過 2 MiB。');
  let text;
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('無法讀取，請確認檔案使用 UTF-8 編碼。');
  }
  if (text.includes('\0')) throw new Error('這不是可預覽的 Markdown 文字檔。');
  return { file, text, hasBom: bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 };
}
