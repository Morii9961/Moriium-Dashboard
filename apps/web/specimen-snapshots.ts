/**
 * 只在开发服务器上生效的小插件：把本机的真实快照文件交给设计样张页。
 *
 * 文件路径来自 MORIIUM_SPECIMEN_SNAPSHOTS（环境变量，或 apps/web/.env.local，后者已被 .gitignore 排除），
 * 用系统的路径分隔符分开，Windows 上是分号。
 * 路径和文件内容都不进仓库，也不会进入构建产物（apply: 'serve'）。
 * 只读取列出的文件，不接受浏览器传来的任何路径。
 */
import { readFileSync } from 'node:fs';
import { basename, delimiter } from 'node:path';
import type { Plugin } from 'vite';

export const SPECIMEN_ENDPOINT = '/__specimen/snapshots';

export function specimenSnapshots(list: string | undefined): Plugin {
  return {
    name: 'moriium-specimen-snapshots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(SPECIMEN_ENDPOINT, (_req, res) => {
        const paths = (list ?? '')
          .split(delimiter)
          .map((p) => p.trim())
          .filter(Boolean);
        const files = paths.flatMap((path) => {
          try {
            return [{ fileName: basename(path), base64: readFileSync(path).toString('base64') }];
          } catch {
            return [];
          }
        });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(files));
      });
    },
  };
}
