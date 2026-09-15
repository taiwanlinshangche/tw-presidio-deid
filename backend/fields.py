"""提案常見明確欄位補充；不猜沒有欄位標籤的任意數字或詞語。"""
import re
from backend.entities import Span

FIELDS = {
    'PERSON': {'提案窗口', '聯絡人', '姓名', '執行協調', '負責人', '承辦人'},
    'ORGANIZATION': {'提案單位', '提案對象', '公司名稱', '公司', '協力單位'},
    'TW_BUSINESS_ID': {'統編', '統一編號', '公司統一編號', '統編格式樣本'},
}


def field_spans(text):
    values = set()
    for line in text.splitlines():
        if line.lstrip().startswith('|'):
            cells = line.split('|')
            pair = cells[1:3]
        else:
            match = re.match(r'\s*(?:[-*]\s+)?(.{2,20}?)\s*[：:]\s*(.+)', line)
            pair = list(match.groups()) if match else []
        if len(pair) != 2:
            continue
        key, value = (s.strip().strip('*').strip() for s in pair)
        value = re.split(r'[（(]', value)[0].strip()
        for kind, labels in FIELDS.items():
            if key not in labels:
                continue
            pattern = r'[\u4e00-\u9fff]{2,4}' if kind == 'PERSON' else r'[0-9]{8}' if kind == 'TW_BUSINESS_ID' else r'[\u4e00-\u9fffA-Za-z0-9· ]{2,40}'
            if re.fullmatch(pattern, value):
                values.add((kind, value))
    return [Span(m.start(), m.end(), kind, .6, priority=10) for kind, value in sorted(values) for m in re.finditer(re.escape(value), text)]
