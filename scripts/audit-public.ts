/**
 * 公开树审计：仓库是公开的，这里拦下不该公开的东西。
 *
 * 检查对象是 Git 跟踪的文件，加上未被忽略的新文件（即将提交的）。
 * 发现问题时只报「文件:行 规则」，不回显匹配到的内容。
 *
 * 用法：node scripts/audit-public.ts
 * 例外登记在 scripts/audit-public.allow.json，每条都要写理由。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Rule = 'forbidden-file' | 'secret' | 'ip-literal' | 'local-path' | 'email';

export interface Finding {
  path: string;
  /** 1 起算；文件级问题为 0。 */
  line: number;
  rule: Rule;
  detail: string;
}

export interface AllowEntry {
  /** 精确路径，或以 / 结尾的目录前缀。 */
  path: string;
  rule: Rule;
  reason: string;
}

const FORBIDDEN_FILES: { pattern: RegExp; detail: string }[] = [
  { pattern: /\.(sqlite3?|db)(-journal|-wal|-shm)?$/i, detail: '数据库文件' },
  { pattern: /(^|\/)\.env(\.(?!example$)[^/]*)?$/, detail: '环境变量文件（只允许 .env.example）' },
  { pattern: /(^|\/)moriium-dashboard-export-[^/]*$/i, detail: '导出包' },
  { pattern: /\.(pem|p12|pfx|key)$/i, detail: '密钥或证书文件' },
  { pattern: /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.pub)?$/, detail: 'SSH 密钥' },
];

const SECRET_PATTERNS: { pattern: RegExp; detail: string }[] = [
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/, detail: 'GitHub 令牌形态' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/, detail: 'GitHub 细粒度令牌形态' },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/, detail: 'sk- 形式的 API key' },
  { pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/, detail: 'AWS 访问密钥形态' },
  { pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/, detail: '私钥' },
  { pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, detail: 'Slack 令牌形态' },
  {
    pattern: /\b(password|passwd|secret|api[_-]?key|access[_-]?key|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i,
    detail: '带引号的口令或密钥赋值',
  },
  {
    pattern: /^\s*(export\s+)?[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|API_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*\S{8,}/,
    detail: '环境变量形式的口令或密钥',
  },
];

/** 本机回环、未指定地址，以及 RFC 5737 文档专用网段。 */
const ALLOWED_IPV4 = [/^127\.0\.0\.1$/, /^0\.0\.0\.0$/, /^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./];

const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.])/g;

const LOCAL_PATH_PATTERNS: { pattern: RegExp; detail: string }[] = [
  { pattern: /(?<![A-Za-z0-9])[A-Za-z]:[\\/](?![\\/])/, detail: '盘符绝对路径' },
  { pattern: /\/(Users|home)\/[^/\s]+/, detail: '用户目录路径' },
  { pattern: /\\Users\\[^\\\s]+/, detail: '用户目录路径' },
];

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;

const ALLOWED_EMAILS = new Set(['noreply@anthropic.com']);
const ALLOWED_EMAIL_DOMAINS = [
  /^example\.(com|org|net)$/i,
  /\.example$/i,
  /\.test$/i,
  /^users\.noreply\.github\.com$/i,
];

function isAllowedIp(ip: string): boolean {
  return ALLOWED_IPV4.some((re) => re.test(ip));
}

function isAllowedEmail(address: string, domain: string): boolean {
  return ALLOWED_EMAILS.has(address.toLowerCase()) || ALLOWED_EMAIL_DOMAINS.some((re) => re.test(domain));
}

/** 把文件内容解码成文本；无法当作文本的（二进制）返回 null。 */
export function decodeText(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) return null;
  return new TextDecoder('utf-8').decode(bytes);
}

export function auditFile(path: string, bytes: Uint8Array): Finding[] {
  const findings: Finding[] = [];

  for (const { pattern, detail } of FORBIDDEN_FILES) {
    if (pattern.test(path)) findings.push({ path, line: 0, rule: 'forbidden-file', detail });
  }

  const text = decodeText(bytes);
  if (text === null) return findings;

  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((content, index) => {
    const line = index + 1;

    for (const { pattern, detail } of SECRET_PATTERNS) {
      if (pattern.test(content)) findings.push({ path, line, rule: 'secret', detail });
    }

    for (const match of content.matchAll(IPV4)) {
      const octets = match.slice(1, 5).map(Number);
      if (octets.some((o) => o > 255)) continue;
      if (!isAllowedIp(match[0])) {
        findings.push({ path, line, rule: 'ip-literal', detail: 'IPv4 地址字面量' });
        break;
      }
    }

    for (const { pattern, detail } of LOCAL_PATH_PATTERNS) {
      if (pattern.test(content)) {
        findings.push({ path, line, rule: 'local-path', detail });
        break;
      }
    }

    for (const match of content.matchAll(EMAIL)) {
      if (!isAllowedEmail(match[0], match[1] ?? '')) {
        findings.push({ path, line, rule: 'email', detail: '邮箱地址' });
        break;
      }
    }
  });

  return findings;
}

export function isAllowed(finding: Finding, allow: readonly AllowEntry[]): boolean {
  return allow.some(
    (entry) =>
      entry.rule === finding.rule &&
      (entry.path.endsWith('/') ? finding.path.startsWith(entry.path) : finding.path === entry.path),
  );
}

export function formatFinding(finding: Finding): string {
  const where = finding.line > 0 ? `${finding.path}:${finding.line}` : finding.path;
  return `${where}  ${finding.rule}  ${finding.detail}`;
}

function listPublicFiles(cwd: string): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // --cached 包含已删除但未暂存的文件，读不到时跳过。
  return [...new Set(out.split('\0').filter(Boolean))];
}

function loadAllowList(cwd: string): AllowEntry[] {
  const raw = readFileSync(`${cwd}/scripts/audit-public.allow.json`, 'utf8');
  const entries = JSON.parse(raw) as AllowEntry[];
  for (const entry of entries) {
    if (!entry.reason?.trim()) throw new Error(`例外登记缺少理由：${entry.path}`);
  }
  return entries;
}

function main(): number {
  const cwd = process.cwd();
  const allow = loadAllowList(cwd);
  const files = listPublicFiles(cwd);
  const findings: Finding[] = [];

  for (const path of files) {
    let bytes: Uint8Array;
    try {
      bytes = readFileSync(`${cwd}/${path}`);
    } catch {
      continue;
    }
    for (const finding of auditFile(path, bytes)) {
      if (!isAllowed(finding, allow)) findings.push(finding);
    }
  }

  if (findings.length === 0) {
    console.log(`公开树审计通过：检查了 ${files.length} 个文件。`);
    return 0;
  }

  console.error(`公开树审计发现 ${findings.length} 处问题（不显示匹配内容）：`);
  for (const finding of findings) console.error(`  ${formatFinding(finding)}`);
  console.error('确认是误报时，在 scripts/audit-public.allow.json 登记路径、规则和理由。');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
