/**
 * 每日 Token 账单的排版与绘制（Canvas 2D）。屏幕上打印出来的纸条和保存的图片走同一套排版，
 * 所以两者一模一样。纸是物理的：正片、负片下都是浅纸黑字。字体用页面已经加载的 Archivo（收窄）+ Noto。
 */
import type { TokensCiDay } from '@moriium-dashboard/protocol/tokens-ci-types';
import type { Locale } from '../i18n/locale.ts';
import { clientName, compact, integer, usd } from './ledger-format.ts';

export const RECEIPT_WIDTH = 340;
const PAD = 24;
const TOOTH = 8;
const TOOTH_H = 5;
export const PAPER = '#F4F4F4';
const INK = '#161616';
const DIM = '#5E5E5E';

export type ReceiptMode = 'cost' | 'tokens';

export interface ReceiptLabels {
  title: string;
  brand: string;
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
  source: string;
  keep: string;
}

export interface ReceiptData {
  day: TokensCiDay;
  rank: number | null;
  dateText: string;
  issuedText: string;
  ratio: number | null;
}

export type ReceiptRow = Row;

type Row =
  | { k: 'title'; text: string }
  | { k: 'sub'; text: string }
  | { k: 'kv'; left: string; right: string; strong?: boolean; dim?: boolean; indent?: boolean }
  | { k: 'rule' }
  | { k: 'big'; text: string }
  | { k: 'note'; text: string; dim?: boolean; weight?: number }
  | { k: 'gap'; h: number };

const HEIGHT: Record<Row['k'], number> = { title: 34, sub: 18, kv: 23, rule: 22, big: 58, note: 19, gap: 0 };

function family(locale: Locale) {
  const cjk = locale === 'ja' ? '"Noto Sans JP Variable"' : '"Noto Sans SC Variable"';
  return `"Archivo Variable", ${cjk}, sans-serif`;
}

function font(row: Row, locale: Locale): string {
  const f = family(locale);
  switch (row.k) {
    case 'title':
      return `600 21px ${f}`;
    case 'sub':
      return `500 10px ${f}`;
    case 'big':
      return `300 46px ${f}`;
    case 'note':
      return `${row.weight ?? 400} 11px ${f}`;
    case 'kv':
      return `${row.strong ? 600 : 400} ${row.indent ? 12 : 13}px ${f}`;
    default:
      return `400 12px ${f}`;
  }
}

export function receiptRows(data: ReceiptData, l: ReceiptLabels, mode: ReceiptMode, locale: Locale): Row[] {
  const d = data.day;
  const value = (cost: number, tokens: number) =>
    mode === 'cost' ? usd(cost, locale) : compact(tokens, locale);
  const rows: Row[] = [
    { k: 'gap', h: 10 },
    { k: 'title', text: l.title },
    { k: 'sub', text: l.brand },
    { k: 'gap', h: 10 },
  ];
  if (data.rank) rows.push({ k: 'kv', left: l.rank, right: `#${data.rank}` });
  rows.push(
    { k: 'kv', left: l.date, right: data.dateText },
    { k: 'kv', left: l.issued, right: data.issuedText },
    { k: 'rule' },
    { k: 'note', text: mode === 'cost' ? l.costHead : l.tokensHead, weight: 600 },
    { k: 'big', text: mode === 'cost' ? usd(d.cost, locale) : compact(d.tokens, locale) },
    { k: 'note', text: mode === 'cost' ? l.estimate : l.tokensSub, dim: true },
    { k: 'rule' },
    { k: 'kv', left: l.streak, right: l.streakValue },
    { k: 'kv', left: l.messages, right: integer(d.messages, locale) },
  );
  if (data.ratio != null) rows.push({ k: 'kv', left: l.vsAverage, right: `${data.ratio}×` });
  rows.push(
    { k: 'rule' },
    { k: 'kv', left: l.clients, right: mode === 'cost' ? l.cost : l.tokens, dim: true },
  );
  for (const c of d.clients) {
    rows.push({
      k: 'kv',
      left: clientName(c.client).toUpperCase(),
      right: value(c.cost, c.tokens),
      strong: true,
    });
    for (const m of c.models)
      rows.push({ k: 'kv', left: `· ${m.model}`, right: value(m.cost, m.tokens), indent: true, dim: true });
  }
  rows.push(
    { k: 'rule' },
    { k: 'kv', left: l.total, right: compact(d.tokens, locale) },
    { k: 'kv', left: l.input, right: compact(d.input, locale) },
    { k: 'kv', left: l.output, right: compact(d.output, locale) },
    { k: 'rule' },
    { k: 'note', text: l.source, dim: true },
    { k: 'gap', h: 6 },
    { k: 'note', text: l.keep, weight: 600 },
    { k: 'gap', h: 18 },
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
  for (const r of rows) {
    const text = r.k === 'kv' ? r.left + r.right : 'text' in r ? r.text : '';
    if (!text) continue;
    const f = font(r, locale);
    byFont.set(f, (byFont.get(f) ?? '') + text);
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

/** 在 (x, y) 画一张纸条，宽 RECEIPT_WIDTH。 */
export function drawReceipt(
  ctx: CanvasRenderingContext2D,
  rows: Row[],
  locale: Locale,
  x: number,
  y: number,
  opts: { tornTop?: boolean; outline?: boolean } = {},
) {
  const w = RECEIPT_WIDTH;
  const h = receiptHeight(rows);
  paperPath(ctx, x, y, w, h, Boolean(opts.tornTop));
  ctx.fillStyle = PAPER;
  ctx.fill();
  if (opts.outline) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const c = ctx as CanvasRenderingContext2D & { fontStretch?: string; letterSpacing?: string };
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
    ctx.font = font(r, locale);
    c.fontStretch = r.k === 'big' ? 'expanded' : r.k === 'title' ? 'normal' : 'semi-condensed';
    c.letterSpacing = r.k === 'title' ? '4px' : r.k === 'sub' ? '2px' : '0px';
    ctx.fillStyle = 'dim' in r && r.dim ? DIM : INK;
    if (r.k === 'rule') {
      ctx.strokeStyle = DIM;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(left, Math.round(cy) + 0.5);
      ctx.lineTo(right, Math.round(cy) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (r.k === 'kv') {
      ctx.textAlign = 'right';
      ctx.fillText(r.right, right, cy);
      const rw = ctx.measureText(r.right).width;
      ctx.textAlign = 'left';
      const lx = left + (r.indent ? 14 : 0);
      ctx.fillText(fit(ctx, r.left, right - rw - 16 - lx), lx, cy);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(fit(ctx, r.text, w - PAD * 2), mid, cy);
    }
    top += rh;
  }
  c.letterSpacing = '0px';
  c.fontStretch = 'normal';
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
  const margin = 44;
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
