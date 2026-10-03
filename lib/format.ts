const LOCALE = "en-US";
const nf = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
// Market caps read as "MC 6–8 SOL": whole numbers from 10 up, one decimal below.
const mcNum = (n: number) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: n >= 10 ? 0 : n >= 1 ? 1 : 2 }).format(n);

export const fmtNumber = (n: number) => nf.format(n);
export const fmtCompact = (n: number) => compact.format(n);
export const fmtSol = (n: number) => `${new Intl.NumberFormat(LOCALE, { maximumSignificantDigits: 4 }).format(n)} SOL`;
export const fmtMultiple = (n: number) => `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(n)}x`;
export const fmtMc = (mc: number) => `MC ${mcNum(mc)} SOL`;
export const fmtMcRange = (low: number, high: number) => `MC ${mcNum(low)}–${mcNum(high)} SOL`;
export const fmtDate = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleString(LOCALE, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function fmtCountdown(seconds: number) {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${h}h` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}
