/**
 * 每日 AI 对账单的排版与绘制（Canvas 2D）。屏幕上打印出来的纸条和保存的图片走同一套排版，两者一模一样。
 * 纸是物理的：正片、负片下都是浅纸黑字。数字和英文用等宽的 JetBrains Mono（可变字重），中日文落到 Noto；
 * 字重拉开层次：标题 900、金额 700、客户端 700、正文 500、模型 400。客户端与模型前面的小图标用路径画成黑色。
 */
import '@fontsource-variable/jetbrains-mono';
import type { TokensCiDay } from '@moriium-dashboard/protocol/tokens-ci-types';
import type { Locale } from '../i18n/locale.ts';
import { clientName, compact, integer, usd } from './ledger-format.ts';

export const RECEIPT_WIDTH = 420;
const PAD = 34;
const TOOTH = 9;
const TOOTH_H = 6;
export const PAPER = '#F6F6F4';
const INK = '#141414';
const DIM = '#6A6A6A';

export type ReceiptMode = 'cost' | 'tokens';

export interface ReceiptLabels {
  title: string;
  tagline: string;
  rank: string;
  date: string;
  issued: string;
  costHead: string;
  tokensHead: string;
  estimate: string;
  tokensSub: string;
  streak: string;
  streakValue: string;
  messages: string;
  vsAverage: string;
  clients: string;
  cost: string;
  tokens: string;
  total: string;
  input: string;
  output: string;
  cacheRate: string;
  footer: string;
  footerSub: string;
}

export interface ReceiptData {
  day: TokensCiDay;
  rank: number | null;
  dateText: string;
  issuedText: string;
  ratio: number | null;
}

type Icon = 'claude-code' | 'codex' | 'claude-model' | 'openai-model' | 'other';

type Row =
  | { k: 'title'; text: string }
  | { k: 'tagline'; text: string }
  | { k: 'kv'; left: string; right: string; dim?: boolean }
  | { k: 'client'; left: string; right: string; icon: Icon }
  | { k: 'model'; left: string; right: string; icon: Icon }
  | { k: 'rule' }
  | { k: 'head'; text: string }
  | { k: 'big'; text: string }
  | { k: 'note'; text: string }
  | { k: 'footer'; text: string; strong?: boolean }
  | { k: 'gap'; h: number };

export type ReceiptRow = Row;

const HEIGHT: Record<Row['k'], number> = {
  title: 50,
  tagline: 26,
  kv: 27,
  client: 38,
  model: 30,
  rule: 28,
  head: 26,
  big: 74,
  note: 22,
  footer: 22,
  gap: 0,
};

function family(locale: Locale) {
  const cjk = locale === 'ja' ? '"Noto Sans JP Variable"' : '"Noto Sans SC Variable"';
  return `"JetBrains Mono Variable", ${cjk}, ui-monospace, monospace`;
}

function font(row: Row, locale: Locale, side: 'left' | 'right' = 'left'): string {
  const f = family(locale);
  switch (row.k) {
    case 'title':
      return `900 27px ${f}`;
    case 'tagline':
      return `400 11.5px ${f}`;
    case 'head':
      return `600 12.5px ${f}`;
    case 'big':
      return `700 52px ${f}`;
    case 'note':
      return `500 11px ${f}`;
    case 'client':
      return `700 14.5px ${f}`;
    case 'model':
      return `${side === 'right' ? 500 : 400} 12.5px ${f}`;
    case 'footer':
      return `${row.strong ? 600 : 400} 11.5px ${f}`;
    case 'kv':
      return `${side === 'right' ? 500 : row.dim ? 400 : 500} 13px ${f}`;
    default:
      return `400 12px ${f}`;
  }
}

const iconFor = (client: string): Icon =>
  client === 'claude' ? 'claude-code' : client === 'codex' ? 'codex' : 'other';
const modelIcon = (model: string): Icon =>
  /^claude/i.test(model)
    ? 'claude-model'
    : /^(gpt|o\d|codex|chatgpt)/i.test(model)
      ? 'openai-model'
      : 'other';

export function receiptRows(data: ReceiptData, l: ReceiptLabels, mode: ReceiptMode, locale: Locale): Row[] {
  const d = data.day;
  const value = (cost: number, tokens: number) =>
    mode === 'cost' ? usd(cost, locale) : compact(tokens, locale);
  const cacheBase = (d.input ?? 0) + (d.cacheRead ?? 0) + (d.cacheWrite ?? 0);
  const rows: Row[] = [
    { k: 'gap', h: 18 },
    { k: 'title', text: l.title },
    { k: 'tagline', text: l.tagline },
    { k: 'gap', h: 12 },
  ];
  if (data.rank) rows.push({ k: 'kv', left: l.rank, right: `#${data.rank}` });
  rows.push(
    { k: 'kv', left: l.date, right: data.dateText },
    { k: 'kv', left: l.issued, right: data.issuedText },
    { k: 'rule' },
    { k: 'head', text: mode === 'cost' ? l.costHead : l.tokensHead },
    { k: 'big', text: mode === 'cost' ? usd(d.cost, locale) : compact(d.tokens, locale) },
    { k: 'note', text: mode === 'cost' ? l.estimate : l.tokensSub },
    { k: 'rule' },
    { k: 'kv', left: l.streak, right: l.streakValue },
    { k: 'kv', left: l.messages, right: integer(d.messages, locale) },
  );
  if (data.ratio != null) rows.push({ k: 'kv', left: l.vsAverage, right: `${data.ratio}×` });
  rows.push(
    { k: 'rule' },
    { k: 'kv', left: l.clients, right: mode === 'cost' ? l.cost : l.tokens, dim: true },
    { k: 'gap', h: 4 },
  );
  for (const c of d.clients) {
    rows.push({
      k: 'client',
      left: clientName(c.client).toUpperCase(),
      right: value(c.cost, c.tokens),
      icon: iconFor(c.client),
    });
    for (const m of c.models)
      rows.push({
        k: 'model',
        left: m.model.toUpperCase(),
        right: value(m.cost, m.tokens),
        icon: modelIcon(m.model),
      });
  }
  rows.push(
    { k: 'gap', h: 4 },
    { k: 'rule' },
    { k: 'kv', left: l.total, right: compact(d.tokens, locale) },
    { k: 'kv', left: l.input, right: compact(d.input, locale) },
    { k: 'kv', left: l.output, right: compact(d.output, locale) },
  );
  if (cacheBase > 0)
    rows.push({
      k: 'kv',
      left: l.cacheRate,
      right: `${Math.round(((d.cacheRead ?? 0) / cacheBase) * 100)}%`,
    });
  rows.push(
    { k: 'rule' },
    { k: 'gap', h: 2 },
    { k: 'footer', text: l.footer, strong: true },
    { k: 'gap', h: 4 },
    { k: 'footer', text: l.footerSub },
    { k: 'gap', h: 26 },
  );
  return rows;
}

export function receiptHeight(rows: Row[]): number {
  return rows.reduce((h, r) => h + (r.k === 'gap' ? r.h : HEIGHT[r.k]), 0) + TOOTH_H;
}

/** 等所有用到的字（含按 unicode-range 分片的中日文）都加载好，免得画出来是后备字体。 */
export async function loadReceiptFonts(rows: Row[], locale: Locale): Promise<void> {
  if (!('fonts' in document)) return;
  const byFont = new Map<string, string>();
  const add = (f: string, text: string) => byFont.set(f, (byFont.get(f) ?? '') + text);
  for (const r of rows) {
    if ('left' in r) {
      add(font(r, locale, 'left'), r.left);
      add(font(r, locale, 'right'), r.right);
    } else if ('text' in r) add(font(r, locale), r.text);
  }
  await Promise.all([...byFont].map(([f, text]) => document.fonts.load(f, text).catch(() => [])));
}

/** 纸的轮廓：下边（可选上边）是锯齿。 */
function paperPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tornTop: boolean,
) {
  const teeth = Math.floor(w / TOOTH);
  const step = w / teeth;
  ctx.beginPath();
  if (tornTop) {
    ctx.moveTo(x, y + TOOTH_H);
    for (let i = 0; i < teeth; i++) {
      ctx.lineTo(x + step * (i + 0.5), y);
      ctx.lineTo(x + step * (i + 1), y + TOOTH_H);
    }
  } else {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
  }
  ctx.lineTo(x + w, y + h - TOOTH_H);
  for (let i = teeth; i > 0; i--) {
    ctx.lineTo(x + step * (i - 0.5), y + h);
    ctx.lineTo(x + step * (i - 1), y + h - TOOTH_H);
  }
  ctx.closePath();
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** 小图标，以 (cx, cy) 为中心、边长约 s。全部用墨色画。 */
function drawIcon(ctx: CanvasRenderingContext2D, icon: Icon, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  if (icon === 'claude-code') {
    // 像素小螃蟹：身体、两只眼睛的空洞、两侧小臂、四条腿。
    const map = [
      '..########..',
      '..########..',
      '..#..##..#..',
      '############',
      '############',
      '..########..',
      '..########..',
      '..#.#..#.#..',
      '..#.#..#.#..',
    ];
    const px = s / 12;
    const x0 = cx - s / 2;
    const y0 = cy - (map.length * px) / 2;
    map.forEach((line, row) => {
      for (let col = 0; col < line.length; col++)
        if (line[col] === '#') ctx.fillRect(x0 + col * px, y0 + row * px, px + 0.15, px + 0.15);
    });
  } else if (icon === 'codex') {
    // 黑色云朵底，上面一个反白的「>_」。
    const r = s * 0.3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.moveTo(cx + Math.cos(a) * r * 0.75 + r * 0.62, cy + Math.sin(a) * r * 0.75);
      ctx.arc(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75, r * 0.62, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = s * 0.09;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy - s * 0.14);
    ctx.lineTo(cx - s * 0.06, cy);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.14);
    ctx.moveTo(cx + s * 0.02, cy + s * 0.15);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.15);
    ctx.stroke();
  } else if (icon === 'claude-model') {
    // 十二道细长的放射线。
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = s * (i % 2 ? 0.4 : 0.48);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-s * 0.045, 0);
      ctx.lineTo(0, -len);
      ctx.lineTo(s * 0.045, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else if (icon === 'openai-model') {
    // 六片花瓣绕成的结。
    ctx.lineWidth = s * 0.075;
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i / 6) * Math.PI * 2);
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.2, s * 0.13, s * 0.26, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    ctx.fillRect(cx - s * 0.22, cy - s * 0.22, s * 0.44, s * 0.44);
  }
  ctx.restore();
}

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

/** 在 (x, y) 画一张纸条，宽 RECEIPT_WIDTH。 */
export function drawReceipt(
  ctx: CanvasRenderingContext2D,
  rows: Row[],
  locale: Locale,
  x: number,
  y: number,
  opts: { tornTop?: boolean; outline?: boolean } = {},
) {
  const c = ctx as Ctx;
  const w = RECEIPT_WIDTH;
  const h = receiptHeight(rows);
  paperPath(ctx, x, y, w, h, Boolean(opts.tornTop));
  ctx.fillStyle = PAPER;
  ctx.fill();
  if (opts.outline) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  let top = y + (opts.tornTop ? TOOTH_H : 0);
  const left = x + PAD;
  const right = x + w - PAD;
  const mid = x + w / 2;
  ctx.textBaseline = 'middle';
  for (const r of rows) {
    if (r.k === 'gap') {
      top += r.h;
      continue;
    }
    const rh = HEIGHT[r.k];
    const cy = top + rh / 2;
    c.letterSpacing = r.k === 'head' || r.k === 'note' ? '2px' : r.k === 'title' ? '1px' : '0px';
    ctx.fillStyle =
      r.k === 'tagline' || (r.k === 'kv' && r.dim) || (r.k === 'footer' && !r.strong) ? DIM : INK;
    if (r.k === 'rule') {
      // 虚线按整段排满，两端都落在一整段上，不留半截。
      const n = Math.floor((right - left + 4) / 9);
      const dash = (right - left - (n - 1) * 4) / n;
      ctx.fillStyle = DIM;
      for (let i = 0; i < n; i++) ctx.fillRect(left + i * (dash + 4), Math.round(cy), dash, 1);
    } else if ('left' in r) {
      ctx.font = font(r, locale, 'right');
      ctx.textAlign = 'right';
      ctx.fillText(r.right, right, cy);
      const rw = ctx.measureText(r.right).width;
      ctx.font = font(r, locale, 'left');
      ctx.textAlign = 'left';
      let lx = left;
      if (r.k === 'client') {
        drawIcon(ctx, r.icon, left + 9, cy, 18);
        lx = left + 28;
      } else if (r.k === 'model') {
        drawIcon(ctx, r.icon, left + 36, cy, 13);
        lx = left + 50;
      }
      ctx.fillText(fit(ctx, r.left, right - rw - 18 - lx), lx, cy);
    } else {
      ctx.font = font(r, locale);
      ctx.textAlign = 'center';
      ctx.fillText(fit(ctx, r.text, w - PAD * 2), mid, cy);
    }
    top += rh;
  }
  c.letterSpacing = '0px';
}

/** 屏幕上的纸条：按设备像素比画进 canvas，返回 CSS 尺寸。 */
export function paintReceipt(
  canvas: HTMLCanvasElement,
  rows: Row[],
  locale: Locale,
  opts: { tornTop?: boolean } = {},
): { width: number; height: number } {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const width = RECEIPT_WIDTH;
  const height = receiptHeight(rows);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawReceipt(ctx, rows, locale, 0, 0, opts);
  }
  return { width, height };
}

/** 保存用的图片：纸条（上下都是撕口）放在一块灰阶底色上，3 倍分辨率。 */
export function receiptPoster(rows: Row[], locale: Locale, background: string): HTMLCanvasElement {
  const scale = 3;
  const margin = 52;
  const h = receiptHeight(rows) + TOOTH_H;
  const canvas = document.createElement('canvas');
  canvas.width = (RECEIPT_WIDTH + margin * 2) * scale;
  canvas.height = (h + margin * 2) * scale;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(scale, scale);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, RECEIPT_WIDTH + margin * 2, h + margin * 2);
    drawReceipt(ctx, rows, locale, margin, margin, { tornTop: true, outline: true });
  }
  return canvas;
}
