"""位置處理不依賴 AI 模型，可獨立測試。Python 位置統一轉成 UTF-16。"""
from dataclasses import dataclass

TYPES = {
    'PERSON': 1, 'LOCATION': 2, 'ORGANIZATION': 3,
    'TW_BUSINESS_ID': 4, 'TW_PHONE_NUMBER': 5,
    'TW_NATIONAL_ID': 6, 'EMAIL_ADDRESS': 7,
}
MODEL_LABELS = {'PERSON': 'PERSON', 'ORG': 'ORGANIZATION', 'LOC': 'LOCATION', 'GPE': 'LOCATION', 'FAC': 'LOCATION'}


@dataclass
class Span:
    start: int
    end: int
    type: str
    score: float
    priority: int = 0


def chunks(text, size=300, overlap=60):
    for start in range(0, len(text), size - overlap):
        yield start, text[start:start + size]
        if start + size >= len(text):
            break


def merge_predictions(predictions, text, threshold=.5):
    """合併 BIES 標籤。只接受 B…E（或單字 S）完整閉合的實體：模型在文件脈絡裡
    偶爾會標出 B-I-I 之後就中斷（例如「新北青年 AI」被標成「新北青」），這種沒有 E 的片段
    代表模型自己也不確定邊界，直接丟棄；被分塊切到的實體會在下一塊（重疊 60 字）完整出現。"""
    result = []
    current = None

    def flush():
        nonlocal current
        if current and current['opened'] and current['closed']:
            score = sum(current['scores']) / len(current['scores'])
            if score >= threshold:
                result.append(Span(current['start'], current['end'], current['type'], score))
        current = None

    for pred in predictions:
        prefix, _, label = pred.get('entity', '').partition('-')
        entity_type = MODEL_LABELS.get(label)
        if not entity_type or prefix not in ('B', 'I', 'E', 'S'):
            flush()
            continue
        start, end = int(pred['start']), int(pred['end'])
        score = float(pred['score'])
        if not 0 <= start < end <= len(text):
            flush()
            continue
        adjacent = current and current['type'] == entity_type and (start == current['end'] or (start > current['end'] and all(c in ' \t' for c in text[current['end']:start])))
        if prefix in ('B', 'S') or not adjacent:
            flush()
            current = {'start': start, 'end': end, 'type': entity_type, 'scores': [score], 'opened': prefix in ('B', 'S'), 'closed': False}
        else:
            current['end'] = end
            current['scores'].append(score)
        if prefix in ('E', 'S'):
            current['closed'] = True
            flush()
    flush()
    return result


def to_response(text, spans):
    valid = sorted(
        (s for s in spans if s.type in TYPES and 0 <= s.start < s.end <= len(text)),
        key=lambda s: (s.start, -s.end, -TYPES[s.type]),
    )
    merged = []
    for span in valid:
        if merged and span.start < merged[-1].end:
            previous = merged[-1]
            previous.end = max(previous.end, span.end)
            previous.score = max(previous.score, span.score)
            if (span.priority, TYPES[span.type]) > (previous.priority, TYPES[previous.type]):
                previous.type = span.type
                previous.priority = span.priority
        else:
            merged.append(Span(span.start, span.end, span.type, span.score, span.priority))
    if len(merged) > 1200:
        raise ValueError('候選資料超過 1,200 處，請拆分檔案後再試。')
    positions = [0]
    for character in text:
        positions.append(positions[-1] + (2 if ord(character) > 0xFFFF else 1))
    return {
        'offsetEncoding': 'utf-16',
        'entities': [
            {'id': str(i), 'start': positions[s.start], 'end': positions[s.end], 'type': s.type, 'score': round(s.score, 4)}
            for i, s in enumerate(merged)
        ],
    }
