import unittest
from backend.tw_recognizers import TaiwanDivisionRecognizer


class DivisionTests(unittest.TestCase):
    def test_city_names_with_and_without_suffix(self):
        text = '新北青年 AI 計畫；主辦：新北市青年局；地點在臺中市與花蓮縣。'
        found = sorted((r.start, text[r.start:r.end]) for r in TaiwanDivisionRecognizer().analyze(text, ['LOCATION']))
        self.assertEqual([value for _, value in found], ['新北', '新北市', '臺中市', '花蓮縣'])
        self.assertTrue(all(r.score < 1 for r in TaiwanDivisionRecognizer().analyze(text, ['LOCATION'])))
