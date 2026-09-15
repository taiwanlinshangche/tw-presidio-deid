// 發布前執行：`npm run build:release`（先 vite build，再寫 frontend-build.json）。
import { resolve } from 'node:path';
import { writeBuildManifest, SHIPPED_MANIFEST } from './setup/installer.mjs';
const root = resolve(import.meta.dirname, '..');
await writeBuildManifest(root);
console.log(`已寫入 ${SHIPPED_MANIFEST}`);
