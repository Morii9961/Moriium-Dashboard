import { describe, expect, it } from 'vitest';
import { auditFile, decodeText, formatFinding, isAllowed } from './audit-public.ts';

// 违规样本在运行时拼出来，避免本文件自己被审计拦下。
const j = (...parts: string[]) => parts.join('');
const text = (s: string) => new TextEncoder().encode(s);
const rules = (path: string, content: string) => auditFile(path, text(content)).map((f) => f.rule);

describe('forbidden files', () => {
  it.each([
    'data/app.sqlite',
    'x/dashboard.db',
    'x/dashboard.db-wal',
    '.env',
    'apps/server/.env.local',
    'moriium-dashboard-export-2026-10-11.zip',
    'deploy/server.pem',
    'id_ed25519',
  ])('rejects %s', (path) => {
    expect(rules(path, '')).toContain('forbidden-file');
  });

  it.each(['.env.example', 'apps/server/.env.example', 'src/db.ts', 'docs/export.md'])(
    'allows %s',
    (path) => {
      expect(rules(path, '')).not.toContain('forbidden-file');
    },
  );
});

describe('secrets', () => {
  it.each([
    ['GitHub token', j('gh', 'p_', 'A'.repeat(36))],
    ['fine-grained token', j('github', '_pat_', 'B'.repeat(30))],
    ['sk- key', j('s', 'k-', 'c'.repeat(24))],
    ['AWS key', j('AK', 'IA', 'ABCDEFGHIJKLMNOP')],
    ['private key', j('-----BEGIN ', 'OPENSSH PRIVATE', ' KEY-----')],
    ['quoted assignment', j('pass', 'word = "', 'x'.repeat(16), '"')],
    ['env assignment', j('MORIIUM_', 'TOKEN=', 'y'.repeat(20))],
  ])('detects %s', (_name, line) => {
    expect(rules('a.txt', `ok\n${line}\n`)).toContain('secret');
  });

  it('does not flag ordinary code or prose', () => {
    const content = [
      'const token = generateToken();',
      'apiKey = process.env.API_KEY',
      'token: string;',
      '扫描 `sk-` 形式的 API key 与 `-----BEGIN ... PRIVATE KEY-----`',
      'MORIIUM_DASHBOARD_DATA=',
    ].join('\n');
    expect(rules('a.ts', content)).not.toContain('secret');
  });
});

describe('IP literals', () => {
  it('flags public and private addresses', () => {
    expect(rules('a.md', j('10', '.0.0.', '5'))).toContain('ip-literal');
    expect(rules('a.md', j('8.8', '.4.4'))).toContain('ip-literal');
  });

  it('allows loopback, unspecified and documentation ranges', () => {
    expect(rules('a.md', '127.0.0.1 0.0.0.0 192.0.2.10 203.0.113.7')).toEqual([]);
  });

  it('ignores version strings and out-of-range octets', () => {
    expect(rules('a.md', 'v1.2.3 and 3.51.3 and 999.1.1.1 and 1.2.3.4.5')).toEqual([]);
  });
});

describe('local paths', () => {
  it.each([
    j('E', ':\\', 'Projects\\x'),
    j('C', ':/', 'Users/x'),
    j('/Us', 'ers/', 'someone/x'),
    j('/ho', 'me/', 'someone'),
  ])('flags %s', (line) => {
    expect(rules('a.md', line)).toContain('local-path');
  });

  it('ignores URLs, home shorthand and server paths', () => {
    expect(rules('a.md', 'https://example.com/x ~/.claude/skills /var/lib/moriium-dashboard/')).toEqual([]);
  });
});

describe('emails', () => {
  it('flags real-looking addresses', () => {
    expect(rules('a.md', j('someone', '@', 'mail.cn'))).toContain('email');
  });

  it('allows example domains and the commit trailer address', () => {
    expect(rules('a.md', 'demo@example.com a@b.test noreply@anthropic.com @biomejs/biome')).toEqual([]);
  });
});

describe('decodeText', () => {
  it('decodes UTF-16 with BOM so its content is still scanned', () => {
    const body = j('gh', 'p_', 'D'.repeat(36));
    const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from(body, 'utf16le')]);
    expect(decodeText(utf16)).toBe(body);
    expect(auditFile('f.json', utf16).map((f) => f.rule)).toContain('secret');
  });

  it('treats NUL-containing files without BOM as binary', () => {
    expect(decodeText(new Uint8Array([0x89, 0x50, 0x00, 0x01]))).toBeNull();
  });
});

describe('reporting', () => {
  it('never echoes the matched content', () => {
    const secret = j('gh', 'p_', 'E'.repeat(36));
    const [line] = auditFile('a.txt', text(secret)).map(formatFinding);
    expect(line).not.toContain(secret);
    expect(line).toBe('a.txt:1  secret  GitHub 令牌形态');
  });

  it('applies allow entries by exact path or directory prefix and rule', () => {
    const finding = { path: 'fixtures/protocol/secret/a.json', line: 3, rule: 'secret' as const, detail: '' };
    expect(isAllowed(finding, [{ path: 'fixtures/protocol/secret/', rule: 'secret', reason: 'r' }])).toBe(
      true,
    );
    expect(isAllowed(finding, [{ path: 'fixtures/protocol/secret/', rule: 'email', reason: 'r' }])).toBe(
      false,
    );
    expect(isAllowed(finding, [{ path: 'fixtures/protocol/', rule: 'secret', reason: 'r' }])).toBe(true);
    expect(
      isAllowed(finding, [{ path: 'fixtures/protocol/secret/b.json', rule: 'secret', reason: 'r' }]),
    ).toBe(false);
  });
});
