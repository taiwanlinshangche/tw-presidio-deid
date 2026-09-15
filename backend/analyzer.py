"""不保存輸入；模型與分詞器只從本機快取載入。"""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'

from presidio_analyzer import AnalyzerEngine, RecognizerRegistry, PatternRecognizer, Pattern
from presidio_analyzer.nlp_engine import NoOpNlpEngine
from backend.ckip import CKIPRecognizer
from backend.entities import Span, TYPES, to_response
from backend.fields import field_spans
from backend.tw_recognizers import TaiwanNationalIdRecognizer, TaiwanBusinessIdRecognizer, TaiwanPhoneRecognizer, TaiwanDivisionRecognizer

MAX_CHARACTERS = 30_000


def create_analyzer():
    registry = RecognizerRegistry(supported_languages=['zh'])
    for recognizer in [CKIPRecognizer(), TaiwanNationalIdRecognizer(), TaiwanBusinessIdRecognizer(), TaiwanPhoneRecognizer(), TaiwanDivisionRecognizer()]:
        registry.add_recognizer(recognizer)
    registry.add_recognizer(PatternRecognizer(
        supported_entity='EMAIL_ADDRESS', supported_language='zh',
        patterns=[Pattern('email', r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}", .85)],
    ))
    return AnalyzerEngine(registry=registry, nlp_engine=NoOpNlpEngine(models=[{'lang_code': 'zh', 'model_name': 'none'}]), supported_languages=['zh'])


def analyze_document(engine, text):
    if len(text) > MAX_CHARACTERS:
        raise ValueError('目前最多辨識 30,000 個字元，請拆分檔案後再試。')
    if not text.strip():
        return to_response(text, [])
    results = engine.analyze(text=text, language='zh', entities=list(TYPES), score_threshold=.5)
    spans = [
        Span(r.start, r.end, r.entity_type, r.score) for r in results
        if r.entity_type not in ('PERSON', 'ORGANIZATION', 'LOCATION')
        or not any(c in text[r.start:r.end] for c in '\r\n|*`[]#')
    ]
    return to_response(text, spans + field_spans(text))
