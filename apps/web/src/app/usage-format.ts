/** Money stays decimal text through final rounding, even above Number.MAX_SAFE_INTEGER. */
export function usageMoney(value: string | null, currency: 'USD' | 'CNY', locale: string): string {
  if (value === null) return '—';
  const [whole = '0', fraction = ''] = value.split('.');
  const cents =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(3, '0').slice(0, 2)) +
    (Number(fraction.padEnd(3, '0')[2]) >= 5 ? 1n : 0n);
  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(cents / 100n);
  return parts
    .map((p) => (p.type === 'fraction' ? (cents % 100n).toString().padStart(2, '0') : p.value))
    .join('');
}
export const usageNumber = (value: string | null, locale: string) =>
  value === null ? '—' : new Intl.NumberFormat(locale).format(BigInt(value));
export function shanghaiMonday(now = new Date()) {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const day = new Date(`${local}T00:00:00Z`),
    weekday = day.getUTCDay();
  return new Date(day.getTime() - ((weekday + 6) % 7) * 86400000).toISOString().slice(0, 10);
}
