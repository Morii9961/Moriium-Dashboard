/**
 * 每日 Token 账单：从出纸口一行一行印出来，拖动（或点「撕下」）把纸条撕走，然后弹出保存图片的面板。
 * 动效只动 transform / opacity；减少动画偏好下不走纸、不飞走，只淡入淡出。
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

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 拖过这么远就算撕下。 */
const TEAR_X = 72;
const TEAR_Y = 96;

/** 热敏打印机的走纸：一段一段往下送，每段之间停一下。 */
function feedFrames(steps: number): Keyframe[] {
  const frames: Keyframe[] = [{ transform: 'translateY(-100%)', offset: 0 }];
  for (let i = 1; i <= steps; i++) {
    const y = `translateY(${-100 + (100 * i) / steps}%)`;
    frames.push({ transform: y, offset: (i - 0.4) / steps }, { transform: y, offset: i / steps });
  }
  return frames;
}

function fitScale(height: number): number {
  const availH = window.innerHeight - 24 - 22 - 112;
  const availW = window.innerWidth - 48;
  return Math.max(0.4, Math.min(1, availH / height, availW / RECEIPT_WIDTH));
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
  const paper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const feed = useRef<Animation | null>(null);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const [stage, setStage] = useState<Stage>('printing');
  const [size, setSize] = useState({ width: RECEIPT_WIDTH, height: 0, scale: 1 });

  const close = useCallback(() => dialog.current?.close(), []);

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
      const scale = fitScale(height);
      setSize({ width, height, scale });
      if (reduced()) {
        paper.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' });
        setStage('printed');
        return;
      }
      const duration = Math.min(3200, Math.max(1800, receiptHeight(rows) * 3.2));
      const shake = slot.current?.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(0.6px)' }, { transform: 'translateY(0)' }],
        { duration: 90, iterations: Number.POSITIVE_INFINITY },
      );
      const anim = paper.current.animate(feedFrames(18), { duration, easing: 'linear' });
      feed.current = anim;
      anim.finished
        .then(() => !cancelled && setStage('printed'))
        .catch(() => {})
        .finally(() => shake?.cancel());
    });
    return () => {
      cancelled = true;
      feed.current?.cancel();
    };
  }, [rowsFor, locale]);

  useEffect(() => {
    const target =
      stage === 'printing' ? '.receipt-bar .text-btn' : stage === 'printed' ? '.receipt-tear' : null;
    if (target) dialog.current?.querySelector<HTMLButtonElement>(target)?.focus();
  }, [stage]);

  const tear = useCallback(
    (dx: number, dy: number) => {
      const el = paper.current;
      const c = canvas.current;
      if (!el || !c) return;
      setStage('torn');
      // 撕下以后，纸条上边也变成撕口。
      paintReceipt(c, rowsFor('cost'), locale, { tornTop: true });
      const done = () => setStage('sheet');
      if (reduced()) {
        el.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 180,
          easing: 'ease',
          fill: 'forwards',
        }).finished.then(done, done);
        return;
      }
      const dir = dx === 0 ? -1 : Math.sign(dx);
      const from = getComputedStyle(el).transform;
      el.animate(
        [
          { transform: from === 'none' ? 'none' : from },
          {
            transform: `translate(${dx * 2 + dir * 360}px, ${Math.max(dy, 0) + window.innerHeight}px) rotate(${dir * 32}deg)`,
          },
        ],
        { duration: 560, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
      ).finished.then(done, done);
    },
    [rowsFor, locale],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (stage !== 'printed' || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    const el = paper.current;
    if (!start || start.id !== e.pointerId || !el) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > TEAR_X || dy > TEAR_Y) {
      drag.current = null;
      tear(dx, dy);
      return;
    }
    // 还连在出纸口上：绕上沿转一点，往下拉会被拽长一点。
    const rot = Math.max(-10, Math.min(10, dx * 0.08));
    el.style.transform = `translateY(${Math.max(0, dy) * 0.25}px) rotate(${rot}deg)`;
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = paper.current;
    if (!drag.current || drag.current.id !== e.pointerId || !el) return;
    drag.current = null;
    const from = el.style.transform;
    el.style.transform = '';
    if (from && !reduced())
      el.animate([{ transform: from }, { transform: 'none' }], {
        duration: 260,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      });
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
            <div className="printer-feed" style={{ height: size.height * size.scale + 24 }}>
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
                <button type="button" className="btn receipt-tear" onClick={() => tear(0, 0)}>
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
