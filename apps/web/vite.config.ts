import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { specimenSnapshots } from './specimen-snapshots.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'MORIIUM_');
  return {
    plugins: [react(), specimenSnapshots(env.MORIIUM_SPECIMEN_SNAPSHOTS)],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // 允许读取仓库根目录下的 docs/status（Dashboard 自己的快照）。
      fs: { allow: [resolve(import.meta.dirname, '..', '..')] },
      // 开发时 /api 转给本机服务（pnpm server，默认 5180 端口）。changeOrigin 让 Host 头变成服务端接受的地址。
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${env.MORIIUM_DASHBOARD_PORT || 5180}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      // 不把小文件内联成 data: 地址：严格 CSP 的 font-src 'self' 会拦掉内联字体。
      assetsInlineLimit: 0,
      rollupOptions: {
        input: {
          app: resolve(import.meta.dirname, 'index.html'),
          specimen: resolve(import.meta.dirname, 'specimen.html'),
        },
      },
    },
  };
});
