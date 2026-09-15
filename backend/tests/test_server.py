import http.client
import io
import json
import threading
import unittest
from contextlib import redirect_stdout
from unittest import mock
from backend.server import AnalysisServer, main, prepare_analyzer


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calls = []
        cls.server = AnalysisServer(('127.0.0.1', 0))
        cls.server.analyze = lambda text: cls.calls.append(text) or {'entities': [], 'offsetEncoding': 'utf-16'}
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, body='{"text":"測試"}', headers=None, method='POST', path='/api/analyses'):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        defaults = {'Content-Type': 'application/json', 'X-Deid-Request': '1', 'Origin': 'http://127.0.0.1:4173'}
        defaults.update(headers or {})
        connection.request(method, path, body.encode('utf-8'), defaults)
        response = connection.getresponse()
        status, data, cache = response.status, json.loads(response.read()), response.getheader('Cache-Control')
        connection.close()
        self.assertEqual(cache, 'no-store')
        return status, data

    def test_valid_input_and_no_storage(self):
        status, result = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(result['entities'], [])

    def test_reject_foreign_origin_and_host(self):
        self.assertEqual(self.request(headers={'Origin': 'https://example.invalid'})[0], 403)
        self.assertEqual(self.request(headers={'Host': 'example.invalid'})[0], 403)

    def test_reject_simple_form_and_missing_header(self):
        self.assertEqual(self.request(headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertEqual(self.request(headers={'X-Deid-Request': ''})[0], 403)

    def test_reject_bad_json_type_and_large_input(self):
        for body in ['invalid', '[]', '{"text":1}', '{"text":"\\u0000"}', '{"text":"\\ud800"}']:
            self.assertEqual(self.request(body)[0], 400)
        self.assertEqual(self.request(json.dumps({'text': 'a' * 30_001}))[0], 413)

    def test_busy_request_is_explicit(self):
        self.server.analysis_lock.acquire()
        try:
            self.assertEqual(self.request()[0], 429)
        finally:
            self.server.analysis_lock.release()

    def test_health_has_no_document(self):
        status, result = self.request('', method='GET', path='/api/health')
        self.assertEqual(status, 200)
        self.assertEqual(result, {'status': 'ready'})


class StartupTests(unittest.TestCase):
    def test_analyzer_is_not_returned_without_expected_email_span(self):
        analyze = lambda engine, text: {'entities': []}
        with self.assertRaises(RuntimeError):
            prepare_analyzer(create=lambda: object(), analyze=analyze)

    def test_analyzer_is_returned_after_synthetic_smoke(self):
        def analyze(engine, text):
            if 'setup@example.test' not in text:
                return {'entities': []}
            start = text.index('setup@example.test')
            return {'entities': [{'type': 'EMAIL_ADDRESS', 'start': start, 'end': start + len('setup@example.test')}]}

        ready = prepare_analyzer(create=lambda: object(), analyze=analyze)
        self.assertEqual(ready('一般文字'), analyze(object(), '一般文字'))

    def test_port_zero_prints_bound_port(self):
        class FakeServer:
            server_port = 54321

            def __init__(self, *args, **kwargs):
                pass

            def serve_forever(self):
                raise KeyboardInterrupt

            def server_close(self):
                pass

        output = io.StringIO()
        with mock.patch('backend.server.AnalysisServer', FakeServer), \
                mock.patch('backend.server.threading.Thread') as thread, \
                mock.patch('backend.server.argparse.ArgumentParser.parse_args', return_value=mock.Mock(port=0, ui_port=4173)), \
                redirect_stdout(output):
            thread.return_value.start.side_effect = lambda: print('loader started')
            main()
        self.assertTrue(output.getvalue().startswith('DEID_SERVER_PORT=54321\n'))
        thread.assert_called_once()
        self.assertIn('DEID_SERVER_PORT=54321\n', output.getvalue())
