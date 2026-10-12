/**
 * JSON 语法错误定位。
 *
 * JSON.parse 的报错在不同引擎里措辞不同，有的不带位置，而且会引用文件内容。
 * 这里按 RFC 8259 自己扫一遍，只在 JSON.parse 失败后调用，给出稳定的位置和原因。
 */

export type JsonSyntaxReason =
  | 'unexpected_end'
  | 'unexpected_character'
  | 'trailing_comma'
  | 'missing_comma'
  | 'missing_colon'
  | 'property_name_not_string'
  | 'unterminated_string'
  | 'control_character_in_string'
  | 'invalid_escape'
  | 'invalid_number'
  | 'trailing_content'
  | 'empty';

export interface JsonSyntaxError {
  reason: JsonSyntaxReason;
  /** 字符偏移（UTF-16 码元）。 */
  offset: number;
  /** 1 起算。 */
  line: number;
  /** 1 起算，按码位计。 */
  column: number;
}

class Fail extends Error {
  readonly reason: JsonSyntaxReason;
  readonly offset: number;
  constructor(reason: JsonSyntaxReason, offset: number) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

// 粘性匹配：从当前位置开始，不复制剩余文本。
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function locateJsonSyntaxError(text: string): JsonSyntaxError | null {
  let i = 0;
  const n = text.length;

  const ws = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;
  };

  const value = (): void => {
    ws();
    if (i >= n) throw new Fail('unexpected_end', i);
    const c = text[i];
    if (c === '{') {
      object();
      return;
    }
    if (c === '[') {
      array();
      return;
    }
    if (c === '"') {
      string();
      return;
    }
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) {
      number();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, i)) {
        i += literal.length;
        return;
      }
    }
    throw new Fail('unexpected_character', i);
  };

  const object = () => {
    i++; // {
    ws();
    if (text[i] === '}') {
      i++;
      return;
    }
    for (;;) {
      ws();
      if (i >= n) throw new Fail('unexpected_end', i);
      if (text[i] === '}') throw new Fail('trailing_comma', i);
      if (text[i] !== '"') throw new Fail('property_name_not_string', i);
      string();
      ws();
      if (i >= n) throw new Fail('unexpected_end', i);
      if (text[i] !== ':') throw new Fail('missing_colon', i);
      i++;
      value();
      ws();
      if (i >= n) throw new Fail('unexpected_end', i);
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return;
      }
      throw new Fail('missing_comma', i);
    }
  };

  const array = () => {
    i++; // [
    ws();
    if (text[i] === ']') {
      i++;
      return;
    }
    for (;;) {
      ws();
      if (text[i] === ']') throw new Fail('trailing_comma', i);
      value();
      ws();
      if (i >= n) throw new Fail('unexpected_end', i);
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return;
      }
      throw new Fail('missing_comma', i);
    }
  };

  const string = () => {
    const start = i;
    i++; // "
    while (i < n) {
      const code = text.charCodeAt(i);
      if (code === 0x22) {
        i++;
        return;
      }
      if (code < 0x20) throw new Fail('control_character_in_string', i);
      if (code === 0x5c) {
        const next = text[i + 1];
        if (next === undefined) break;
        if ('"\\/bfnrt'.includes(next)) {
          i += 2;
          continue;
        }
        if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
          i += 6;
          continue;
        }
        throw new Fail('invalid_escape', i);
      }
      i++;
    }
    throw new Fail('unterminated_string', start);
  };

  const number = () => {
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(text);
    if (!match) throw new Fail('invalid_number', i);
    i += match[0].length;
  };

  try {
    ws();
    if (i >= n) throw new Fail('empty', 0);
    value();
    ws();
    if (i < n) throw new Fail('trailing_content', i);
    return null;
  } catch (error) {
    // 嵌套过深时递归会耗尽调用栈：说不出具体位置，就报在开头。
    if (error instanceof RangeError) return { reason: 'unexpected_character', offset: 0, line: 1, column: 1 };
    if (!(error instanceof Fail)) throw error;
    return { reason: error.reason, offset: error.offset, ...lineAndColumn(text, error.offset) };
  }
}

export function lineAndColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const lines = before.split(/\r\n|\r|\n/);
  const last = lines[lines.length - 1] ?? '';
  return { line: lines.length, column: [...last].length + 1 };
}

const FENCE = /^\s*```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```\s*$/;

/** 内容整个被一个 Markdown 代码块包着时，返回代码块里的文本。 */
export function extractCodeFence(text: string): { inner: string; lineOffset: number } | null {
  const match = FENCE.exec(text);
  if (!match || match[1] === undefined) return null;
  const inner = match[1];
  const before = text.slice(0, text.indexOf(inner));
  return { inner, lineOffset: before.split(/\r\n|\r|\n/).length - 1 };
}
