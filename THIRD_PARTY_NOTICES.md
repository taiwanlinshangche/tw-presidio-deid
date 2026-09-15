# 第三方元件與模型

此文件記錄直接使用的主要元件，不替代各元件原始 LICENSE／NOTICE。本專案自身以 MIT 授權釋出（見 `LICENSE`）。元件由原始來源下載，不把 Python 環境或模型權重提交到 Git。

| 元件 | 專案使用方式 | 原始來源與授權 |
| --- | --- | --- |
| Node.js | 首次啟動、網頁與本機 API | [Node.js](https://github.com/nodejs/node/blob/main/LICENSE)，MIT 與內含第三方聲明 |
| uv | 專用 Python 與套件安裝 | [uv](https://github.com/astral-sh/uv#license)，MIT 或 Apache-2.0 |
| Python | 本機辨識執行環境 | [Python](https://docs.python.org/3/license.html)，PSF 與內含第三方聲明；uv 使用 python-build-standalone 發行檔 |
| Presidio Analyzer | 辨識框架與臺灣格式規則 | [Presidio](https://github.com/microsoft/presidio/blob/main/LICENSE)，MIT |
| Transformers、Hugging Face Hub | 模型載入、官方模型下載 | [Transformers](https://github.com/huggingface/transformers/blob/main/LICENSE)、[Hub](https://github.com/huggingface/huggingface_hub/blob/main/LICENSE)，Apache-2.0 |
| PyTorch | CPU 模型推論 | [PyTorch](https://github.com/pytorch/pytorch/blob/main/LICENSE)，BSD-style 與內含第三方聲明 |
| CKIP bert-base-chinese-ner | 本機中文實體辨識權重 | [模型卡](https://huggingface.co/ckiplab/bert-base-chinese-ner)，標示 GPL-3.0 |
| bert-base-chinese | 分詞器與設定 | [模型卡](https://huggingface.co/google-bert/bert-base-chinese)，Apache-2.0 |
| markdown-it | Markdown 預覽 | [markdown-it](https://github.com/markdown-it/markdown-it/blob/master/LICENSE)，MIT |
| DOMPurify | 預覽清理 | [DOMPurify](https://github.com/cure53/DOMPurify/blob/main/LICENSE)，Apache-2.0 或 MPL-2.0 |
| React、React DOM | 前端畫面 | [React](https://github.com/facebook/react/blob/main/LICENSE)，MIT |
| Motion | 介面動效 | [Motion](https://github.com/motiondivision/motion/blob/main/LICENSE.md)，MIT |
| Tailwind CSS | 樣式工具類 | [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE)，MIT |
| Base UI、shadcn/ui | 按鈕、提示、警示元件（原始碼複製進 `frontend/src/components/ui/`） | [Base UI](https://github.com/mui/base-ui/blob/master/LICENSE)，MIT；[shadcn/ui](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)，MIT |
| Smooth UI | AI Loader、Animated Toggle、Stagger from Edges、Animated File Upload（原始碼複製並改寫於 `frontend/src/components/smoothui/`） | [SmoothUI](https://github.com/educlopez/smoothui/blob/main/LICENSE)，MIT |
| Lucide | 介面圖示 | [Lucide](https://github.com/lucide-icons/lucide/blob/main/LICENSE)，ISC |
| Vite、Playwright | 建置與開發測試 | [Vite](https://github.com/vitejs/vite/blob/main/LICENSE)，MIT；[Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE)，Apache-2.0 |

Python 直接依賴版本在 `backend/requirements.txt`；前端依賴與其完整版本在 `package-lock.json`。首次下載固定的 Node.js／uv 版本與 SHA-256 位於啟動腳本及 `scripts/setup/installer.mjs`，模型 revision 與檔案校驗在 `backend/setup_check.py`。

## 授權說明

- 本專案程式碼、文件與 `frontend/public/audio/` 七段配音（林上哲本人錄製）以 MIT 授權釋出。
- CKIP `bert-base-chinese-ner` 模型權重為 GPL-3.0。本專案不包含、不散布權重，由使用者第一次啟動時自行從 Hugging Face 下載至本機 `.runtime/`；程式只在執行時載入。若將權重連同程式打包散布，須依 GPL-3.0 處理。
- `frontend/public/examples/範例提案.md` 為示範文件：「青嶼市青年發展局」為虛構機關，人名、聯絡方式與數字均為合成資料。
