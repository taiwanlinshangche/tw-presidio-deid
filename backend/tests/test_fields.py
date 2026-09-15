import unittest
from backend.fields import field_spans


class FieldTests(unittest.TestCase):
    def test_explicit_fields_find_repeated_values(self):
        text = '| 提案窗口 | 林測試 |\n\n林測試聯絡公司。\n- **提案單位：** 努法有限公司\n努法有限公司\n| 統編格式樣本 | 00000000 |'
        spans = field_spans(text)
        self.assertEqual([text[s.start:s.end] for s in spans if s.type == 'PERSON'], ['林測試', '林測試'])
        self.assertEqual([text[s.start:s.end] for s in spans if s.type == 'ORGANIZATION'], ['努法有限公司', '努法有限公司'])
        self.assertEqual([text[s.start:s.end] for s in spans if s.type == 'TW_BUSINESS_ID'], ['00000000'])

    def test_no_guesses_from_unlabelled_numbers_or_paragraphs(self):
        self.assertEqual(field_spans('預算 54000000\n這是一般文字\n姓名：這是一段很長的描述'), [])
