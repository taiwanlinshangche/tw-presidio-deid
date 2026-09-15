"""Validate the local Python runtime and model cache without network access."""
import argparse
import hashlib
import importlib
import importlib.metadata
import json
import sys
from contextlib import redirect_stdout
from dataclasses import dataclass
from pathlib import Path


REQUIREMENTS = Path(__file__).with_name('requirements.txt')
IMPORT_NAMES = {
    'presidio-analyzer': 'presidio_analyzer',
    'transformers': 'transformers',
    'torch': 'torch',
    'huggingface-hub': 'huggingface_hub',
}
REPORT_PACKAGES = (
    ('presidio', 'presidio-analyzer', 'presidio_analyzer'),
    ('torch', 'torch', 'torch'),
    ('transformers', 'transformers', 'transformers'),
    ('huggingface', 'huggingface-hub', 'huggingface_hub'),
)
REPORT_IDS = ('python', 'presidio', 'torch', 'transformers', 'huggingface', 'ckip', 'tokenizer')


def _read_pins(path=REQUIREMENTS):
    pins = {}
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if line and not line.startswith('#'):
            name, separator, version = line.partition('==')
            if not separator or not name or not version:
                raise ValueError(f'Only exact dependency pins are supported: {line}')
            pins[name] = version
    return pins


PINNED_DISTRIBUTIONS = _read_pins()


@dataclass(frozen=True)
class RequiredFile:
    name: str
    algorithm: str
    digest: str


@dataclass(frozen=True)
class Model:
    repo_id: str
    revision: str
    files: tuple[RequiredFile, ...]

    @property
    def allow_patterns(self):
        return tuple(file.name for file in self.files)


MODELS = (
    Model(
        'ckiplab/bert-base-chinese-ner',
        '50c5afc0a0131e8ab93f54d9ebf9575af04c22d5',
        (
            RequiredFile('config.json', 'git-sha1', '00c2c8daa6b2e307d479ba3bf21c24521c11ab34'),
            RequiredFile('pytorch_model.bin', 'sha256', 'f63373ccef4de549747b36a267f81eea553ecfa3476e2726ad689e430ddff491'),
        ),
    ),
    Model(
        'bert-base-chinese',
        '8f23c25b06e129b6c986331a13d8d025a92cf0ea',
        (
            RequiredFile('config.json', 'git-sha1', 'a521dc2845bdddbe822864290c6b928396fc5ee8'),
            RequiredFile('tokenizer_config.json', 'git-sha1', '2ba5de7675473164e07f3b3531748c9a6f113a2c'),
            RequiredFile('tokenizer.json', 'git-sha1', 'dd9401af0a4713df0e75066ae78d5bf6fa6c7116'),
            RequiredFile('vocab.txt', 'git-sha1', 'ca4f9781030019ab9b253c6dcb8c7878b6dc87a5'),
        ),
    ),
)


def _installed_version(distribution):
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return None


def _import_module(name):
    return importlib.import_module(name)


def check_dependencies():
    ok = sys.version_info[:2] == (3, 12)
    if not ok:
        print(f'Python 3.12 required; found {sys.version_info.major}.{sys.version_info.minor}', file=sys.stderr)

    for distribution, expected in PINNED_DISTRIBUTIONS.items():
        actual = _installed_version(distribution)
        if actual != expected:
            print(f'{distribution}=={expected} required; found {actual or "missing"}', file=sys.stderr)
            ok = False

    for distribution, module in IMPORT_NAMES.items():
        try:
            _import_module(module)
        except Exception as error:
            print(f'{distribution} import failed: {error}', file=sys.stderr)
            ok = False
    return ok


def _local_snapshot(model):
    from huggingface_hub import snapshot_download

    return snapshot_download(
        repo_id=model.repo_id,
        revision=model.revision,
        allow_patterns=list(model.allow_patterns),
        local_files_only=True,
    )


def file_digest(path, algorithm):
    path = Path(path)
    digest = hashlib.sha1() if algorithm == 'git-sha1' else hashlib.sha256()
    if algorithm == 'git-sha1':
        digest.update(f'blob {path.stat().st_size}\0'.encode('ascii'))
    elif algorithm != 'sha256':
        raise ValueError(f'Unsupported digest algorithm: {algorithm}')
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def invalid_model_files(model, snapshot):
    invalid = []
    snapshot = Path(snapshot)
    for required in model.files:
        path = snapshot / required.name
        if not path.is_file():
            invalid.append((required, 'missing'))
        elif file_digest(path, required.algorithm) != required.digest:
            invalid.append((required, 'corrupt'))
    return invalid


def check_models():
    ok = True
    for model in MODELS:
        try:
            snapshot = Path(_local_snapshot(model))
            invalid = invalid_model_files(model, snapshot)
            if invalid:
                details = ', '.join(f'{required.name} ({reason})' for required, reason in invalid)
                print(f'{model.repo_id}@{model.revision} invalid: {details}', file=sys.stderr)
                ok = False
        except Exception as error:
            print(f'{model.repo_id}@{model.revision} unavailable locally: {error}', file=sys.stderr)
            ok = False
    return ok


def _emit_report(item_id, status, detail=None):
    event = {'id': item_id, 'status': status}
    if detail:
        event['detail'] = detail
    print(json.dumps(event, ensure_ascii=False), flush=True)


def _report_package(item_id, distribution, module_name):
    _emit_report(item_id, 'checking')
    expected = PINNED_DISTRIBUTIONS[distribution]
    try:
        actual = _installed_version(distribution)
    except Exception:
        _emit_report(item_id, 'error', '無法讀取套件版本')
        return 'error', None
    if actual != expected:
        detail = '尚未安裝指定版本' if actual is None else '已安裝版本不符'
        _emit_report(item_id, 'missing', detail)
        return 'missing', None
    try:
        # Third-party imports occasionally print banners. NDJSON owns stdout.
        with redirect_stdout(sys.stderr):
            module = _import_module(module_name)
    except Exception:
        _emit_report(item_id, 'missing', '套件無法載入')
        return 'missing', None
    _emit_report(item_id, 'ready', f'版本 {actual}')
    return 'ready', module


def _report_model(item_id, model, hub_module):
    _emit_report(item_id, 'checking')
    try:
        snapshot = hub_module.snapshot_download(
            repo_id=model.repo_id,
            revision=model.revision,
            allow_patterns=list(model.allow_patterns),
            local_files_only=True,
        )
        invalid = invalid_model_files(model, snapshot)
    except Exception:
        _emit_report(item_id, 'missing', '本機模型快取不完整')
        return
    if invalid:
        _emit_report(item_id, 'missing', '本機模型檔案缺少或損毀')
    else:
        _emit_report(item_id, 'ready', '本機模型檔案完整')


def report():
    _emit_report('python', 'checking')
    if sys.version_info[:2] != (3, 12):
        _emit_report('python', 'missing', '需要 Python 3.12')
        for item_id in REPORT_IDS[1:]:
            _emit_report(item_id, 'checking')
            _emit_report(item_id, 'blocked', '需先安裝 Python 3.12')
        return
    _emit_report('python', 'ready', f'版本 {sys.version_info[0]}.{sys.version_info[1]}')

    package_results = {}
    for item_id, distribution, module_name in REPORT_PACKAGES:
        package_results[item_id] = _report_package(item_id, distribution, module_name)

    hub_status, hub_module = package_results['huggingface']
    if hub_status != 'ready':
        for item_id in REPORT_IDS[-2:]:
            _emit_report(item_id, 'checking')
            _emit_report(item_id, 'blocked', '需先安裝 Hugging Face Hub')
        return
    _report_model('ckip', MODELS[0], hub_module)
    _report_model('tokenizer', MODELS[1], hub_module)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('check', choices=('dependencies', 'models', 'report'))
    args = parser.parse_args(argv)
    if args.check == 'report':
        try:
            report()
            return 0
        except Exception:
            print('無法產生環境檢查報告', file=sys.stderr)
            return 1
    passed = check_dependencies() if args.check == 'dependencies' else check_models()
    if passed:
        print(f'{args.check}: ok')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
