"""僅下載官方模型與分詞器；不讀取使用者文件。"""
import json
import io
import os
import sys
import time
from pathlib import Path

# The runtime is offline, but this explicit installer process must reach the Hub.
os.environ.pop('HF_HUB_OFFLINE', None)
os.environ.pop('TRANSFORMERS_OFFLINE', None)
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'

from huggingface_hub import snapshot_download
from huggingface_hub import hf_hub_download
from tqdm.auto import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.setup_check import MODELS, invalid_model_files


class JsonProgress(tqdm):
    """Hugging Face's supported tqdm hook, rendered as throttled JSON lines."""

    min_interval = 0.1

    def __init__(self, *args, **kwargs):
        self._last_emit = 0.0
        self._json_closed = False
        self._sink = io.StringIO()
        kwargs['disable'] = False
        kwargs['file'] = self._sink
        super().__init__(*args, **kwargs)
        self._emit(force=True)

    def update(self, n=1):
        displayed = super().update(n)
        self._emit()
        return displayed

    def close(self):
        if getattr(self, '_json_closed', False):
            return
        self._json_closed = True
        if hasattr(self, 'n'):
            self._emit(force=True)
        super().close()

    def _emit(self, force=False):
        now = time.monotonic()
        if force or now - self._last_emit >= self.min_interval:
            print(json.dumps({
                'type': 'progress',
                'unit': 'files',
                'received': int(self.n),
                'total': int(self.total) if self.total is not None else 0,
            }, separators=(',', ':')), flush=True)
            self._last_emit = now


def repair_model(model, local_snapshot=None, download_file=hf_hub_download, download_snapshot=snapshot_download):
    try:
        snapshot = local_snapshot or download_snapshot(
            repo_id=model.repo_id,
            revision=model.revision,
            allow_patterns=list(model.allow_patterns),
            local_files_only=True,
        )
    except Exception:
        snapshot = None

    if snapshot is not None:
        for required, reason in invalid_model_files(model, snapshot):
            download_file(
                repo_id=model.repo_id,
                filename=required.name,
                revision=model.revision,
                force_download=reason == 'corrupt',
            )

    return download_snapshot(
        repo_id=model.repo_id,
        revision=model.revision,
        allow_patterns=list(model.allow_patterns),
        tqdm_class=JsonProgress,
    )


def main():
    for model in MODELS:
        repair_model(model)
    print('模型已下載，可以離線執行本機辨識。')


if __name__ == '__main__':
    main()
