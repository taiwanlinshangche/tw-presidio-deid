import io
import importlib.util
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from backend import setup_check


class DependencyCheckTests(unittest.TestCase):
    def test_missing_distribution_fails(self):
        with mock.patch.object(setup_check, '_installed_version', return_value=None), \
                mock.patch.object(setup_check, '_import_module'):
            self.assertFalse(setup_check.check_dependencies())

    def test_wrong_distribution_version_fails(self):
        versions = {
            'presidio-analyzer': '2.2.364',
            'transformers': '0.0.0',
            'torch': '2.14.0',
            'huggingface-hub': '0.36.2',
        }
        with mock.patch.object(setup_check.sys, 'version_info', (3, 12, 0)), \
                mock.patch.object(setup_check, '_installed_version', side_effect=versions.get), \
                mock.patch.object(setup_check, '_import_module'):
            self.assertFalse(setup_check.check_dependencies())

    def test_matching_distributions_and_imports_pass(self):
        versions = dict(setup_check.PINNED_DISTRIBUTIONS)
        with mock.patch.object(setup_check.sys, 'version_info', (3, 12, 0)), \
                mock.patch.object(setup_check, '_installed_version', side_effect=versions.get), \
                mock.patch.object(setup_check, '_import_module') as import_module:
            self.assertTrue(setup_check.check_dependencies())
        self.assertEqual(
            [call.args[0] for call in import_module.call_args_list],
            ['presidio_analyzer', 'transformers', 'torch', 'huggingface_hub'],
        )


class ModelCheckTests(unittest.TestCase):
    @staticmethod
    def fixture_model(contents):
        files = []
        for name, content in contents.items():
            digest = setup_check.hashlib.sha1(f'blob {len(content)}\0'.encode('ascii') + content).hexdigest()
            files.append(setup_check.RequiredFile(name, 'git-sha1', digest))
        return setup_check.Model('fixture/model', 'a' * 40, tuple(files))

    def test_missing_cached_file_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            model = self.fixture_model({'config.json': b'good'})
            with mock.patch.object(setup_check, 'MODELS', (model,)), \
                    mock.patch.object(setup_check, '_local_snapshot', return_value=directory):
                self.assertFalse(setup_check.check_models())

    def test_sha256_file_digest(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'weight.bin'
            path.write_bytes(b'weight')
            self.assertEqual(
                setup_check.file_digest(path, 'sha256'),
                setup_check.hashlib.sha256(b'weight').hexdigest(),
            )

    def test_all_cached_files_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model = self.fixture_model({'config.json': b'good', 'vocab.txt': b'tokens'})
            for name, content in {'config.json': b'good', 'vocab.txt': b'tokens'}.items():
                (root / name).write_bytes(content)
            with mock.patch.object(setup_check, 'MODELS', (model,)), \
                    mock.patch.object(setup_check, '_local_snapshot', return_value=root):
                self.assertTrue(setup_check.check_models())

    def test_corrupt_cached_file_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            model = self.fixture_model({'config.json': b'good'})
            (Path(directory) / 'config.json').write_bytes(b'corrupt')
            with mock.patch.object(setup_check, 'MODELS', (model,)), \
                    mock.patch.object(setup_check, '_local_snapshot', return_value=directory):
                self.assertFalse(setup_check.check_models())

    def test_cache_lookup_error_fails(self):
        with mock.patch.object(setup_check, '_local_snapshot', side_effect=RuntimeError('missing')):
            self.assertFalse(setup_check.check_models())


class CliTests(unittest.TestCase):
    def test_unknown_check_is_rejected(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            setup_check.main(['unknown'])

    def test_failed_check_returns_nonzero(self):
        with mock.patch.object(setup_check, 'check_models', return_value=False), redirect_stdout(io.StringIO()):
            self.assertEqual(setup_check.main(['models']), 1)


class ReportTests(unittest.TestCase):
    @staticmethod
    def terminal_events(output):
        return {
            event['id']: event
            for event in map(json.loads, output.getvalue().splitlines())
            if event['status'] != 'checking'
        }

    def test_one_package_failure_does_not_stop_independent_packages(self):
        versions = dict(setup_check.PINNED_DISTRIBUTIONS)

        def import_module(name):
            if name == 'presidio_analyzer':
                raise ImportError('private failure detail')
            return mock.Mock(snapshot_download=mock.Mock(return_value='/cache'))

        output = io.StringIO()
        with mock.patch.object(setup_check.sys, 'version_info', (3, 12, 0)), \
                mock.patch.object(setup_check, '_installed_version', side_effect=versions.get), \
                mock.patch.object(setup_check, '_import_module', side_effect=import_module), \
                mock.patch.object(setup_check, 'invalid_model_files', return_value=[]), \
                redirect_stdout(output):
            self.assertEqual(setup_check.main(['report']), 0)

        events = self.terminal_events(output)
        self.assertEqual(events['presidio']['status'], 'missing')
        self.assertEqual(events['torch']['status'], 'ready')
        self.assertEqual(events['transformers']['status'], 'ready')
        self.assertNotIn('private failure detail', output.getvalue())

    def test_missing_ckip_does_not_block_ready_tokenizer(self):
        modules = {
            name: mock.Mock(snapshot_download=mock.Mock())
            for name in setup_check.IMPORT_NAMES.values()
        }
        modules['huggingface_hub'].snapshot_download.side_effect = ['/ckip', '/tokenizer']
        output = io.StringIO()
        with mock.patch.object(setup_check.sys, 'version_info', (3, 12, 0)), \
                mock.patch.object(setup_check, '_installed_version', side_effect=setup_check.PINNED_DISTRIBUTIONS.get), \
                mock.patch.object(setup_check, '_import_module', side_effect=modules.get), \
                mock.patch.object(setup_check, 'invalid_model_files', side_effect=[[('file', 'missing')], []]), \
                redirect_stdout(output):
            self.assertEqual(setup_check.main(['report']), 0)

        events = self.terminal_events(output)
        self.assertEqual(events['ckip']['status'], 'missing')
        self.assertEqual(events['tokenizer']['status'], 'ready')

    def test_wrong_python_blocks_every_remaining_item(self):
        output = io.StringIO()
        with mock.patch.object(setup_check.sys, 'version_info', (3, 11, 0)), \
                mock.patch.object(setup_check, '_installed_version') as version, \
                mock.patch.object(setup_check, '_import_module') as import_module, \
                redirect_stdout(output):
            self.assertEqual(setup_check.main(['report']), 0)

        events = self.terminal_events(output)
        self.assertEqual(events['python']['status'], 'missing')
        self.assertTrue(all(events[item]['status'] == 'blocked' for item in setup_check.REPORT_IDS[1:]))
        version.assert_not_called()
        import_module.assert_not_called()

    def test_missing_hub_blocks_models_only(self):
        versions = dict(setup_check.PINNED_DISTRIBUTIONS)

        def import_module(name):
            if name == 'huggingface_hub':
                raise ImportError('missing')
            return mock.Mock()

        output = io.StringIO()
        with mock.patch.object(setup_check.sys, 'version_info', (3, 12, 0)), \
                mock.patch.object(setup_check, '_installed_version', side_effect=versions.get), \
                mock.patch.object(setup_check, '_import_module', side_effect=import_module), \
                redirect_stdout(output):
            self.assertEqual(setup_check.main(['report']), 0)

        events = self.terminal_events(output)
        self.assertEqual(events['huggingface']['status'], 'missing')
        self.assertEqual(events['ckip']['status'], 'blocked')
        self.assertEqual(events['tokenizer']['status'], 'blocked')

    def test_report_emits_valid_ndjson_and_imports_each_package_once(self):
        modules = {
            name: mock.Mock(snapshot_download=mock.Mock(return_value='/cache'))
            for name in setup_check.IMPORT_NAMES.values()
        }
        output = io.StringIO()
        with mock.patch.object(setup_check.sys, 'version_info', (3, 12, 0)), \
                mock.patch.object(setup_check, '_installed_version', side_effect=setup_check.PINNED_DISTRIBUTIONS.get), \
                mock.patch.object(setup_check, '_import_module', side_effect=modules.get) as import_module, \
                mock.patch.object(setup_check, 'invalid_model_files', return_value=[]), \
                redirect_stdout(output):
            self.assertEqual(setup_check.main(['report']), 0)

        events = list(map(json.loads, output.getvalue().splitlines()))
        self.assertEqual([event['id'] for event in events[::2]], list(setup_check.REPORT_IDS))
        self.assertTrue(all(event['status'] == 'checking' for event in events[::2]))
        self.assertTrue(all(event['status'] == 'ready' for event in events[1::2]))
        self.assertEqual(import_module.call_count, 4)


class DownloadProgressTests(unittest.TestCase):
    @staticmethod
    def load_script():
        script = Path(__file__).parents[2] / 'scripts' / 'download-model.py'
        spec = importlib.util.spec_from_file_location('download_model', script)
        module = importlib.util.module_from_spec(spec)
        with mock.patch.dict(os.environ, dict(os.environ), clear=True):
            spec.loader.exec_module(module)
        return module

    def test_real_tqdm_progress_counts_completed_files(self):
        module = self.load_script()

        output = io.StringIO()
        with redirect_stdout(output):
            progress = module.JsonProgress(total=3)
            progress.min_interval = 0
            progress.update(1)
            progress.update(2)
            progress.close()

        events = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([event['received'] for event in events], [0, 1, 3, 3])
        self.assertTrue(all(event['type'] == 'progress' for event in events))
        self.assertTrue(all(event['unit'] == 'files' for event in events))
        self.assertTrue(all(event['total'] == 3 for event in events))

    def test_repair_forces_only_corrupt_cached_files(self):
        module = self.load_script()
        contents = {'good.txt': b'good', 'bad.txt': b'expected', 'missing.txt': b'missing'}
        model = ModelCheckTests.fixture_model(contents)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'good.txt').write_bytes(b'good')
            (root / 'bad.txt').write_bytes(b'corrupt')
            file_calls = []
            snapshot_calls = []

            def download_file(**kwargs):
                file_calls.append(kwargs)

            def download_snapshot(**kwargs):
                snapshot_calls.append(kwargs)
                return str(root)

            module.repair_model(
                model,
                local_snapshot=root,
                download_file=download_file,
                download_snapshot=download_snapshot,
            )

        self.assertEqual(
            [(call['filename'], call['force_download']) for call in file_calls],
            [('bad.txt', True), ('missing.txt', False)],
        )
        self.assertEqual(len(snapshot_calls), 1)
        self.assertEqual(snapshot_calls[0]['revision'], 'a' * 40)


if __name__ == '__main__':
    unittest.main()
