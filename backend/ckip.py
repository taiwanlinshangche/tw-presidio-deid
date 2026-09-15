"""本機 CKIP NER，固定分塊並自行合併 BIES 標籤。"""
from presidio_analyzer import LocalRecognizer, RecognizerResult
from backend.entities import chunks, merge_predictions


class CKIPRecognizer(LocalRecognizer):
    def __init__(self):
        self.pipeline = None
        super().__init__(supported_entities=['PERSON', 'ORGANIZATION', 'LOCATION'], supported_language='zh', name='CKIPLocalRecognizer')

    def load(self):
        if self.pipeline is not None:
            return
        from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline
        import torch
        torch.set_num_threads(4)
        model = AutoModelForTokenClassification.from_pretrained('ckiplab/bert-base-chinese-ner', revision='50c5afc0a0131e8ab93f54d9ebf9575af04c22d5', local_files_only=True)
        tokenizer = AutoTokenizer.from_pretrained('bert-base-chinese', revision='8f23c25b06e129b6c986331a13d8d025a92cf0ea', local_files_only=True)
        self.pipeline = pipeline('token-classification', model=model, tokenizer=tokenizer, aggregation_strategy='none', device=-1)

    def analyze(self, text, entities, nlp_artifacts=None):
        results = []
        for start, chunk in chunks(text):
            for span in merge_predictions(self.pipeline(chunk), chunk):
                if span.type in entities:
                    results.append(RecognizerResult(entity_type=span.type, start=start + span.start, end=start + span.end, score=span.score))
        return results
