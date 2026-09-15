import unittest
from backend.entities import Span, merge_predictions, chunks, to_response


class EntityTests(unittest.TestCase):
    def test_bies_and_confidence(self):
        predictions = [
            {"entity": "B-PERSON", "start": 0, "end": 1, "score": .9},
            {"entity": "I-PERSON", "start": 1, "end": 2, "score": .9},
            {"entity": "E-PERSON", "start": 2, "end": 3, "score": .9},
            {"entity": "S-ORG", "start": 4, "end": 5, "score": .8},
            {"entity": "E-PERSON", "start": 6, "end": 7, "score": .1},
        ]
        result = merge_predictions(predictions, '王小明 公司 測')
        self.assertEqual([(s.start, s.end, s.type) for s in result], [(0, 3, 'PERSON'), (4, 5, 'ORGANIZATION')])

    def test_entity_does_not_bridge_newlines(self):
        # 換行兩側各是半個實體（只有 B、只有 E）：不能接成一個，也不留下片段。
        text = '摘要\n\n公司'
        preds = [{'entity': 'B-ORG', 'start': 0, 'end': 2, 'score': .9}, {'entity': 'E-ORG', 'start': 4, 'end': 6, 'score': .9}]
        self.assertEqual([(s.start, s.end) for s in merge_predictions(preds, text)], [])
        whole = [{'entity': 'B-ORG', 'start': 4, 'end': 5, 'score': .9}, {'entity': 'E-ORG', 'start': 5, 'end': 6, 'score': .9}]
        self.assertEqual([(s.start, s.end) for s in merge_predictions(whole, text)], [(4, 6)])

    def test_unclosed_fragment_is_dropped(self):
        # 「新北青年 AI」在文件脈絡裡被標成 B-I-I 後中斷（年為 O）：沒有 E 的片段不輸出。
        text = '新北青年 AI 計畫'
        preds = [{'entity': f'{p}-ORG', 'start': i, 'end': i + 1, 'score': .9} for i, p in enumerate('BII')]
        self.assertEqual(merge_predictions(preds, text), [])
        closed = preds + [{'entity': 'E-ORG', 'start': 3, 'end': 4, 'score': .9}]
        self.assertEqual([(s.start, s.end, s.type) for s in merge_predictions(closed, text)], [(0, 4, 'ORGANIZATION')])

    def test_fixed_chunks_cover_unbroken_chinese_with_overlap(self):
        result = list(chunks('中' * 1250))
        self.assertTrue(all(len(text) <= 300 for _, text in result))
        self.assertEqual(result[-1][0] + len(result[-1][1]), 1250)
        self.assertTrue(all(next_start <= start + len(text) - 60 for (start, text), (next_start, _) in zip(result, result[1:])))

    def test_utf16_and_overlap_union(self):
        text = '😀 王小明電話0912345678'
        spans = [Span(2, 5, 'PERSON', .9), Span(7, 17, 'TW_PHONE_NUMBER', .85), Span(9, 17, 'TW_BUSINESS_ID', 1)]
        result = to_response(text, spans)
        self.assertEqual(result['offsetEncoding'], 'utf-16')
        entities = result['entities']
        self.assertEqual([(e['start'], e['end'], e['type']) for e in entities], [(3, 6, 'PERSON'), (8, 18, 'TW_PHONE_NUMBER')])

    def test_skip_dates_and_invalid_spans(self):
        result = to_response('今天', [Span(0, 2, 'DATE_TIME', .9), Span(-1, 3, 'PERSON', .9)])
        self.assertEqual(result['entities'], [])


if __name__ == '__main__':
    unittest.main()
