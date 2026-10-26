/**
 * 每日 AI 对账单：从出纸口顺滑地送出来，拉住纸条往下或往旁边扯，撕下后纸条跟着手走，松手按甩出的速度和重力飞出去，
 * 然后弹出保存图片的面板。没扯断就松手，纸条像挂在出纸口上一样晃几下回正。
 * 只动 transform / opacity（物理用 requestAnimationFrame 逐帧算）；减少动画偏好下不走纸、不摆、不飞，只淡入淡出。
 */
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Segmented } from '../components/Segmented.tsx';
import { ZONES } from '../design/tokens.ts';
import { useI18n } from '../i18n/i18n.tsx';
import {
  loadReceiptFonts,
  paintReceipt,
  RECEIPT_WIDTH,
  type ReceiptMode,
  type ReceiptRow,
  receiptHeight,
  receiptPoster,
} from './receipt-draw.ts';
import './receipt.css';

type Rows = ReceiptRow[];
type Stage = 'printing' | 'printed' | 'torn' | 'sheet';
type Phase = 'printing' | 'hanging' | 'held' | 'falling' | 'done';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 往下扯过这么远、往旁边扯过这么远，或者甩得够快，就撕下。 */
const TEAR_DOWN = 84;
const TEAR_SIDE = 130;
const TEAR_SPEED = 2200;
const GRAVITY = 3200;
/** 挂着时的弹簧：略欠阻尼，松手会晃两下。 */
const HANG_K = 260;
const HANG_C = 11;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function fitScale(height: number): number {
  const availH = window.innerHeight - 24 - 22 - 112;
  const availW = window.innerWidth - 48;
  return Math.max(0.4, Math.min(1, availH / height, availW / RECEIPT_WIDTH));
}

type Sample = { t: number; x: number; y: number };

/** 最近 90ms 里手的平均速度（px/s）。 */
function velocity(s: Sample[]): { vx: number; vy: number } {
  const end = s[s.length - 1];
  const start = s.find((p) => end && end.t - p.t <= 90) ?? s[0];
  if (!end || !start || end.t === start.t) return { vx: 0, vy: 0 };
  const dt = (end.t - start.t) / 1000;
  return { vx: (end.x - start.x) / dt, vy: (end.y - start.y) / dt };
}

/** 撕口：纸条上沿裁成锯齿（和画在纸上的下沿同样的齿）。 */
function tornClip(width: number, scale: number): string {
  const tooth = 9 * scale;
  const depth = 6 * scale;
  const teeth = Math.floor(width / tooth);
  const step = width / teeth;
  const pts = [`0 ${depth}px`];
  for (let i = 0; i < teeth; i++) pts.push(`${step * (i + 0.5)}px 0`, `${step * (i + 1)}px ${depth}px`);
  pts.push('100% 100%', '0 100%');
  return `polygon(${pts.join(', ')})`;
}

export function ReceiptDialog({
  rowsFor,
  label,
  fileName,
  onClose,
}: {
  rowsFor: (mode: ReceiptMode) => Rows;
  label: string;
  fileName: string;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const feedBox = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const feed = useRef<Animation | null>(null);
  const [stage, setStage] = useState<Stage>('printing');
  const [size, setSize] = useState({ width: RECEIPT_WIDTH, height: 0, scale: 1 });

  // 物理状态都放在 ref 里，逐帧改 style，不经过 React 渲染。
  const phase = useRef<Phase>('printing');
  const hang = useRef({ a: 0, va: 0, s: 0, vs: 0, at: 0, st: 0, grabY: 1, dragging: false, x0: 0, y0: 0 });
  const body = useRef({ x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0, gx: 0, gy: 0, tx: 0, ty: 0, born: 0 });
  const samples = useRef<Sample[]>([]);
  const raf = useRef(0);
  const last = useRef(0);

  const close = useCallback(() => dialog.current?.close(), []);

  const loop = useCallback(() => {
    const step = (now: number) => {
      const el = paper.current;
      if (!el) return;
      const dt = Math.min(1 / 30, (now - (last.current || now)) / 1000);
      last.current = now;
      const p = phase.current;
      if (p === 'hanging') {
        const h = hang.current;
        h.va += (HANG_K * (h.at - h.a) - HANG_C * h.va) * dt;
        h.a += h.va * dt;
        h.vs += (420 * (h.st - h.s) - 40 * h.vs) * dt;
        h.s += h.vs * dt;
        el.style.transform = `translateY(${h.s}px) rotate(${h.a}rad)`;
        const settled =
          !h.dragging && Math.abs(h.a) < 0.0005 && Math.abs(h.va) < 0.005 && Math.abs(h.s) < 0.1;
        if (settled) {
          el.style.transform = '';
          raf.current = 0;
          return;
        }
      } else if (p === 'held' || p === 'falling') {
        const b = body.current;
        if (p === 'held') {
          const { vx } = velocity(samples.current);
          b.x += (b.tx - b.x) * Math.min(1, dt * 30);
          b.y += (b.ty - b.y) * Math.min(1, dt * 30);
          const lean = clamp(vx * 0.00035, -0.5, 0.5);
          b.va += (120 * (lean - b.a) - 14 * b.va) * dt;
          b.a += b.va * dt;
        } else {
          b.vy += GRAVITY * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.a += b.va * dt;
          b.va *= 1 - 0.4 * dt;
        }
        el.style.transform = `translate(${b.x - b.gx}px, ${b.y - b.gy}px) rotate(${b.a}rad)`;
        const w = el.offsetWidth;
        const gone =
          p === 'falling' &&
          (b.y - b.gy > window.innerHeight + 60 ||
            b.x < -w * 1.2 ||
            b.x > window.innerWidth + w * 1.2 ||
            now - b.born > 2600);
        if (gone) {
          phase.current = 'done';
          raf.current = 0;
          setStage('sheet');
          return;
        }
      } else {
        raf.current = 0;
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    if (!raf.current) {
      last.current = 0;
      raf.current = requestAnimationFrame(step);
    }
  }, []);

  // 打开：画纸条，等字体，然后开始走纸。
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    const rows = rowsFor('cost');
    let cancelled = false;
    void loadReceiptFonts(rows, locale).then(() => {
      if (cancelled || !canvas.current || !paper.current) return;
      const { width, height } = paintReceipt(canvas.current, rows, locale);
      setSize({ width, height, scale: fitScale(height) });
      const printed = () => {
        if (cancelled) return;
        phase.current = 'hanging';
        setStage('printed');
      };
      if (reduced()) {
        paper.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' });
        printed();
        return;
      }
      // 连续送纸：起步稍快、收尾放慢，纸面带一点几乎察觉不到的机器震动。
      const duration = clamp(receiptHeight(rows) * 2.1, 1500, 2400);
      const hum = canvas.current.animate(
        [
          { transform: 'translate(0, 0)' },
          { transform: 'translate(0.35px, 0.1px)' },
          { transform: 'translate(-0.25px, -0.1px)' },
          { transform: 'translate(0, 0)' },
        ],
        { duration: 120, iterations: Number.POSITIVE_INFINITY },
      );
      const shake = slot.current?.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(0.5px)' }, { transform: 'translateY(0)' }],
        { duration: 95, iterations: Number.POSITIVE_INFINITY },
      );
      const anim = paper.current.animate(
        [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }],
        {
          duration,
          easing: 'cubic-bezier(0.32, 0.18, 0.28, 1)',
        },
      );
      feed.current = anim;
      anim.finished
        .then(printed)
        .catch(() => {})
        .finally(() => {
          hum.cancel();
          shake?.cancel();
        });
    });
    return () => {
      cancelled = true;
      feed.current?.cancel();
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [rowsFor, locale]);

  useEffect(() => {
    const target =
      stage === 'printing' ? '.receipt-bar .text-btn' : stage === 'printed' ? '.receipt-tear' : null;
    if (target) dialog.current?.querySelector<HTMLButtonElement>(target)?.focus();
  }, [stage]);

  /** 从出纸口撕下：(px, py) 是手抓住的位置（屏幕坐标）。fling 给了就直接飞出去，否则跟着手走。 */
  const tearAt = useCallback(
    (px: number, py: number, fling?: { vx: number; vy: number; va: number }) => {
      const el = paper.current;
      const box = feedBox.current;
      if (!el || !box) return;
      setStage('torn');
      if (navigator.vibrate) navigator.vibrate(8);
      if (reduced()) {
        phase.current = 'done';
        el.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 180,
          easing: 'ease',
          fill: 'forwards',
        }).finished.then(
          () => setStage('sheet'),
          () => setStage('sheet'),
        );
        return;
      }
      const h = hang.current;
      const w = el.offsetWidth;
      const rect = box.getBoundingClientRect();
      // 纸条挂着时绕上沿中点转了 a、往下拉长了 s：把手的位置换算回纸面上的点。
      const tcx = rect.left + el.offsetLeft + w / 2;
      const tcy = rect.top + el.offsetTop + h.s;
      const dx = px - tcx;
      const dy = py - tcy;
      const lx = dx * Math.cos(h.a) + dy * Math.sin(h.a);
      const ly = -dx * Math.sin(h.a) + dy * Math.cos(h.a);
      const b = body.current;
      b.gx = w / 2 + lx;
      b.gy = ly;
      b.x = b.tx = px;
      b.y = b.ty = py;
      b.a = h.a;
      b.va = h.va;
      b.born = performance.now();
      box.classList.add('is-torn');
      el.style.clipPath = tornClip(w, size.scale);
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.top = '0';
      el.style.transformOrigin = `${b.gx}px ${b.gy}px`;
      el.style.transform = `translate(${b.x - b.gx}px, ${b.y - b.gy}px) rotate(${b.a}rad)`;
      if (fling) {
        b.vx = fling.vx;
        b.vy = fling.vy;
        b.va = fling.va;
        phase.current = 'falling';
      } else {
        phase.current = 'held';
      }
      loop();
    },
    [loop, size.scale],
  );

  const tearButton = () => {
    const el = paper.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    tearAt(r.left + r.width / 2, r.top + r.height * 0.55, { vx: -150, vy: -420, va: -1.6 });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (phase.current !== 'hanging' || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const h = hang.current;
    const top = e.currentTarget.getBoundingClientRect().top;
    h.dragging = true;
    h.x0 = e.clientX;
    h.y0 = e.clientY;
    h.grabY = Math.max(60, e.clientY - top);
    samples.current = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
    loop();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = samples.current;
    s.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (s.length > 12) s.shift();
    if (phase.current === 'held') {
      body.current.tx = e.clientX;
      body.current.ty = e.clientY;
      return;
    }
    const h = hang.current;
    if (phase.current !== 'hanging' || !h.dragging) return;
    const dx = e.clientX - h.x0;
    const dy = e.clientY - h.y0;
    const { vx, vy } = velocity(samples.current);
    if (dy > TEAR_DOWN || Math.abs(dx) > TEAR_SIDE || Math.hypot(vx, vy) > TEAR_SPEED) {
      h.dragging = false;
      tearAt(e.clientX, e.clientY);
      return;
    }
    // 还挂在出纸口上：绕上沿转，转角让抓住的那一点跟着手；往下拉会被拽长一点，越拉越紧。
    h.at = clamp(Math.atan2(-dx, h.grabY), -0.4, 0.4);
    h.st = 28 * (1 - Math.exp(-Math.max(0, dy) / 60));
  };

  const onPointerUp = () => {
    const h = hang.current;
    if (phase.current === 'held') {
      const { vx, vy } = velocity(samples.current);
      const b = body.current;
      const w = paper.current?.offsetWidth ?? RECEIPT_WIDTH;
      b.vx = clamp(vx, -4000, 4000);
      b.vy = clamp(vy, -4000, 4000);
      // 抓在偏一侧甩出去会转起来。
      b.va = clamp(b.va + vx * 0.002 + ((w / 2 - b.gx) / w) * (vy / 400), -9, 9);
      b.born = performance.now();
      phase.current = 'falling';
      loop();
      return;
    }
    if (!h.dragging) return;
    h.dragging = false;
    h.at = 0;
    h.st = 0;
    loop();
  };

  return (
    <dialog
      ref={dialog}
      className="receipt-dialog"
      aria-label={label}
      onClose={onClose}
      onCancel={(e) => {
        // 打印中按 Esc：先跳过打印，不直接关掉。
        if (stage === 'printing' && feed.current) {
          e.preventDefault();
          feed.current.finish();
        }
      }}
    >
      {stage !== 'sheet' ? (
        <>
          <div className="printer" style={{ width: size.width * size.scale + 40 }}>
            <div className="printer-slot" ref={slot} aria-hidden="true" />
            <div className="printer-feed" ref={feedBox} style={{ height: size.height * size.scale + 24 }}>
              <div
                ref={paper}
                className="paper"
                role="img"
                aria-label={label}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                data-stage={stage}
              >
                <canvas
                  ref={canvas}
                  style={{ width: size.width * size.scale, height: size.height * size.scale }}
                />
              </div>
            </div>
          </div>
          <div className="receipt-bar" aria-live="polite">
            {stage === 'printing' ? (
              <>
                <span>{t('receipt.printing')}</span>
                <button type="button" className="text-btn" onClick={() => feed.current?.finish()}>
                  {t('receipt.skip')}
                </button>
              </>
            ) : stage === 'printed' ? (
              <>
                <span>{t('receipt.tearHint')}</span>
                <button type="button" className="btn receipt-tear" onClick={tearButton}>
                  {t('receipt.tear')}
                </button>
                <button type="button" className="text-btn" onClick={close}>
                  {t('common.close')}
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <ReceiptSheet rowsFor={rowsFor} label={label} fileName={fileName} onClose={close} />
      )}
    </dialog>
  );
}

/** 撕下以后：选背景（只用灰阶）和显示费用还是 Token，保存或复制图片。 */
function ReceiptSheet({
  rowsFor,
  label,
  fileName,
  onClose,
}: {
  rowsFor: (mode: ReceiptMode) => Rows;
  label: string;
  fileName: string;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<ReceiptMode>('cost');
  const [zone, setZone] = useState(2);
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const poster = useRef<HTMLCanvasElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), []);

  useEffect(() => {
    const rows = rowsFor(mode);
    let cancelled = false;
    void loadReceiptFonts(rows, locale).then(() => {
      if (cancelled) return;
      const c = receiptPoster(rows, locale, ZONES.light[zone]?.fill ?? '#333');
      poster.current = c;
      setUrl(c.toDataURL('image/png'));
    });
    return () => {
      cancelled = true;
    };
  }, [rowsFor, locale, mode, zone]);

  const blob = () =>
    new Promise<Blob | null>((resolve) => {
      if (!poster.current) return resolve(null);
      poster.current.toBlob(resolve, 'image/png');
    });

  const save = async () => {
    const b = await blob();
    if (!b) return;
    const href = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  const canCopy = typeof ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write);
  const copy = async () => {
    const b = await blob();
    if (!b) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="receipt-sheet" aria-labelledby="receipt-sheet-title">
      <header className="receipt-sheet-head">
        <h2 id="receipt-sheet-title" ref={heading} tabIndex={-1}>
          {t('receipt.sheet')}
        </h2>
        <button type="button" className="text-btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </header>
      <div className="receipt-preview">{url ? <img src={url} alt={label} /> : null}</div>
      <Segmented
        legend={t('receipt.mode')}
        name="receipt-mode"
        value={mode}
        options={[
          ['cost', t('receipt.cost')],
          ['tokens', t('receipt.tokens')],
        ]}
        onChange={setMode}
        showLegend
      />
      <fieldset className="receipt-swatches">
        <legend>{t('receipt.background')}</legend>
        <div>
          {ZONES.light.map((z, i) => (
            <label key={z.fill} style={{ '--sw': z.fill } as CSSProperties}>
              <input
                type="radio"
                name="receipt-bg"
                checked={zone === i}
                onChange={() => setZone(i)}
                aria-label={t('receipt.zone', { n: i })}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="receipt-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!url}>
          {t('receipt.save')}
        </button>
        {canCopy ? (
          <button type="button" className="btn" onClick={copy} disabled={!url}>
            {copied ? t('receipt.copied') : t('receipt.copy')}
          </button>
        ) : null}
      </div>
    </section>
  );
}
