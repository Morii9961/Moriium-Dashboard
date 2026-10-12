/**
 * 常见密钥与令牌的形态。导入快照（03 第 6.4 节）和仓库公开树审计共用。
 * 只返回行号，从不返回匹配到的内容。
 */

export interface SecretPattern {
  pattern: RegExp;
  /** 给人看的类别，不含任何匹配内容。 */
  label: string;
}

/** 令牌和私钥本身的形态，任何场合都算。 */
export const TOKEN_PATTERNS: readonly SecretPattern[] = [
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/, label: 'GitHub 令牌' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/, label: 'GitHub 细粒度令牌' },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}/, label: 'sk- 形式的 API key' },
  { pattern: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/, label: 'AWS 访问密钥' },
  { pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/, label: '私钥' },
  { pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, label: 'Slack 令牌' },
];

const SECRET_NAME = '(?:password|passwd|secret|api[_-]?key|access[_-]?key|token)';

/** 带引号的赋值，代码和快照里都适用。 */
export const QUOTED_ASSIGNMENT: SecretPattern = {
  pattern: new RegExp(String.raw`\b${SECRET_NAME}\s*[:=]\s*['"][^'"\s]{12,}['"]`, 'i'),
  label: '口令或密钥赋值',
};

/**
 * 快照文本里的 `password=xxxx` 形式。只在快照里用：
 * 代码里 `apiKey = process.env.API_KEY` 这种写法会误报。
 */
export const PROSE_ASSIGNMENT: SecretPattern = {
  pattern: new RegExp(String.raw`\b${SECRET_NAME}\s*=\s*[^\s"',;]{8,}`, 'i'),
  label: '口令或密钥赋值',
};

/** 环境变量文件形式，行首的 `XXX_TOKEN=...`。 */
export const ENV_ASSIGNMENT: SecretPattern = {
  pattern: /^\s*(?:export\s+)?[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*\S{8,}/,
  label: '环境变量形式的口令或密钥',
};

/** 导入快照时使用的完整规则。 */
export const SNAPSHOT_SECRET_PATTERNS: readonly SecretPattern[] = [
  ...TOKEN_PATTERNS,
  QUOTED_ASSIGNMENT,
  PROSE_ASSIGNMENT,
  ENV_ASSIGNMENT,
];

export interface SecretHit {
  /** 1 起算。 */
  line: number;
  label: string;
}

/** 逐行扫描文本，每行最多报一次。 */
export function scanSecrets(
  text: string,
  patterns: readonly SecretPattern[] = SNAPSHOT_SECRET_PATTERNS,
): SecretHit[] {
  const hits: SecretHit[] = [];
  text.split(/\r\n|\r|\n/).forEach((content, index) => {
    const found = patterns.find(({ pattern }) => pattern.test(content));
    if (found) hits.push({ line: index + 1, label: found.label });
  });
  return hits;
}
