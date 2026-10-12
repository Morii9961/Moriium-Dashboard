/**
 * OKLCH → sRGB 与 WCAG 对比度。设计 token 用 OKLCH 写（DESIGN.md 4.2），
 * 对比度要能算出来，而不是看着差不多。
 * 公式：Björn Ottosson 的 OKLab 定义；WCAG 2.x 相对亮度。
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/;

export function parseOklch(value: string): Oklch {
  const m = OKLCH.exec(value.trim());
  if (!m) throw new Error(`不是 oklch(L C H) 写法：${value}`);
  return { l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) };
}

/** 返回 0 到 1 的 sRGB（已压缩到色域内）。 */
export function oklchToSrgb({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  return lin.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  }) as [number, number, number];
}

export function toHex(value: string): string {
  return `#${oklchToSrgb(parseOklch(value))
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function luminance(value: string): number {
  const [r, g, b] = oklchToSrgb(parseOklch(value)).map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
