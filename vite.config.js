import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
const proxy = { '/api': { target: 'http://127.0.0.1:8765', changeOrigin: true } };
export default defineConfig({
  root: 'frontend',
  plugins: [tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./frontend/src', import.meta.url)) } },
  // 不使用 @vitejs/plugin-react：Oxc 原生轉譯 TSX，不設 refresh 就不會注入 inline script（CSP script-src 'self'）。
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  server: { port: 4173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
  build: { outDir: '../dist', emptyOutDir: true },
});
