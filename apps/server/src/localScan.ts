/**
 * 本机仓库扫描（P7 · L2，规划 06 第 2 节）。只在本机实例可用：开启认证或对外提供时不挂载。
 * 扫描目录记在数据目录的 local-repositories.json，不进数据库、导出包或日志。
 * 每个目录本身和它下一层的子目录里，只读固定的 docs/status/project-status.json；找到的快照仍走导入预览和确认。
 */
import { lstatSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

export const SCAN_FILE = 'local-repositories.json';
export const MAX_ROOTS = 20;
const MAX_CHILDREN = 500;
export const MAX_FOUND = 100;
const MAX_BYTES = 1024 * 1024;
const STATUS_PATH = ['docs', 'status', 'project-status.json'] as const;

export type ScanErrorCode = 'invalid_root' | 'too_many_roots' | 'invalid_request';

export class ScanError extends Error {
  readonly code: ScanErrorCode;
  readonly field: string | undefined;
  constructor(code: ScanErrorCode, field?: string) {
    super(code);
    this.code = code;
    this.field = field;
  }
}

/** 读不到或内容不对时当作还没设置，不报错。 */
export function readRoots(file: string): string[] {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    const roots = (value as { roots?: unknown }).roots;
    return Array.isArray(roots)
      ? roots.filter((r): r is string => typeof r === 'string' && isAbsolute(r)).slice(0, MAX_ROOTS)
      : [];
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 校验并保存。每一项必须是已存在目录的绝对路径；去重后最多 MAX_ROOTS 个。 */
export function saveRoots(file: string, input: unknown): string[] {
  if (!Array.isArray(input)) throw new ScanError('invalid_request');
  const roots: string[] = [];
  input.forEach((value, index) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw || raw.length > 1024 || !isAbsolute(raw) || !isDirectory(raw)) {
      throw new ScanError('invalid_root', String(index));
    }
    const normalized = resolve(raw);
    if (!roots.includes(normalized)) roots.push(normalized);
  });
  if (roots.length > MAX_ROOTS) throw new ScanError('too_many_roots');
  const tmp = `${file}.partial`;
  writeFileSync(tmp, `${JSON.stringify({ roots }, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
  return roots;
}

export interface FoundSnapshot {
  /** 仓库目录名，只用来在导入卡片上认出是哪一个仓库。 */
  name: string;
  base64: string;
}

/** 目录本身和下一层子目录；跳过隐藏目录和链接，不再往下走。 */
function candidates(roots: readonly string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  const add = (dir: string) => {
    const key = resolve(dir);
    if (!seen.has(key)) {
      seen.add(key);
      list.push(key);
    }
  };
  for (const root of roots) {
    if (!isDirectory(root)) continue;
    add(root);
    let children: string[] = [];
    try {
      children = readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.isSymbolicLink() && !d.name.startsWith('.'))
        .map((d) => d.name)
        .sort()
        .slice(0, MAX_CHILDREN);
    } catch {}
    for (const child of children) add(join(root, child));
  }
  return list;
}

export function findSnapshots(roots: readonly string[]): {
  files: FoundSnapshot[];
  scanned: number;
  truncated: boolean;
} {
  const dirs = candidates(roots);
  const files: FoundSnapshot[] = [];
  let truncated = false;
  for (const dir of dirs) {
    const path = join(dir, ...STATUS_PATH);
    try {
      const info = lstatSync(path);
      if (!info.isFile() || info.size > MAX_BYTES) continue;
      if (files.length >= MAX_FOUND) {
        truncated = true;
        break;
      }
      files.push({
        name: `${basename(dir) || dir} · project-status.json`,
        base64: readFileSync(path).toString('base64'),
      });
    } catch {
      // 没有状态文件或读不了：这个目录不是要找的仓库。
    }
  }
  return { files, scanned: dirs.length, truncated };
}
