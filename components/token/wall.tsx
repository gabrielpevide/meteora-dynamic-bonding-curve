import { TOTAL_SUPPLY } from "@/lib/dbc";
import { RANGE_BINS, type WallEntry } from "@/lib/dlmm";
import { fmtCompact, fmtMc, fmtMcRange, fmtMultiple, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

// Targets are multiples of the graduation price, so the bands stay put while the market moves.
export const LEVELS = [10, 5, 3, 2];
export const RANGE_WIDTH = Math.pow(1.01, RANGE_BINS - 1); // each order sells from its target up to ~1.35x it

export const nearestLevel = (multiple: number) =>
  LEVELS.reduce((best, m) => (Math.abs(Math.log(m / multiple)) < Math.abs(Math.log(best / multiple)) ? m : best));

export type WallPreview = { multiple: number; tokens: number };

export function Wall(props: {
  entries: WallEntry[];
  refPrice: number;
  market: number;
  preview?: WallPreview | null;
  compact?: boolean;
}) {
  const { entries, refPrice, market, preview, compact } = props;
  const bands = new Map(LEVELS.map((m) => [m, 0]));
  for (const e of entries) {
    const level = nearestLevel(e.lowerPrice / refPrice);
    bands.set(level, (bands.get(level) ?? 0) + e.tokensAbove);
  }
  const extra = (m: number) => (preview && preview.multiple === m ? preview.tokens : 0);
  const scale = Math.max(1, ...LEVELS.map((m) => (bands.get(m) ?? 0) + extra(m)));
  const total = entries.reduce((s, e) => s + e.tokensAbove, 0);
  const refMc = refPrice * TOTAL_SUPPLY;
  const now = market / refPrice;
  // Phones get two lines per row (labels, then the bar); wider screens get label · bar · amount.
  const row = cn(
    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5",
    compact ? "sm:grid-cols-[128px_minmax(0,1fr)_128px]" : "sm:grid-cols-[144px_minmax(0,1fr)_150px]",
  );
  const bar = "order-3 col-span-2 sm:order-2 sm:col-span-1";
  const amount = "order-2 text-right font-mono text-[13px] sm:order-3";

  const nowRow = (
    <div key="now" className={cn(row, "font-mono text-[13px] text-ice")}>
      <span className="order-1">NOW · {fmtMc(market * TOTAL_SUPPLY)}</span>
      <div className={cn(bar, "border-t border-dashed border-ice")} />
      <span className={amount}>{fmtMultiple(now)}</span>
    </div>
  );
  const rows = [];
  let nowPlaced = false;
  for (const m of LEVELS) {
    if (!nowPlaced && m <= now) {
      rows.push(nowRow);
      nowPlaced = true;
    }
    const tokens = bands.get(m) ?? 0;
    const mine = extra(m);
    const selling = now >= m && now < m * RANGE_WIDTH;
    rows.push(
      <div key={m} className={row}>
        <span className={cn("order-1 font-mono text-[13px]", tokens || mine ? "text-text-2" : "text-faint")}>
          {fmtMcRange(m * refMc, m * refMc * RANGE_WIDTH)}
        </span>
        <div className={cn(bar, "flex bg-surface-2", compact ? "h-4" : "h-[22px]")}>
          <div className="h-full bg-amber" style={{ width: `${(tokens / scale) * 100}%` }} />
          <div className="h-full bg-ice" style={{ width: `${(mine / scale) * 100}%` }} />
        </div>
        <span className={cn(amount, mine ? "text-ice" : tokens ? "text-text" : "text-faint")}>
          {m}x · {tokens ? fmtCompact(tokens) : "0"}
          {mine ? ` +${fmtCompact(mine)} yours` : selling ? " · selling" : ""}
        </span>
      </div>,
    );
  }
  if (!nowPlaced) rows.push(nowRow);

  return (
    <section
      aria-label="Conviction wall"
      className={cn("facet-card flex flex-col border border-line bg-surface", compact ? "gap-4 p-6" : "gap-[22px] p-7")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={cn("font-display font-semibold", compact ? "text-lg" : "text-[22px]")}>Conviction wall</h2>
        <span className="font-mono text-xs tracking-[0.12em] text-muted">
          {fmtCompact(total)} ABOVE THE PRICE · {fmtNumber((total / TOTAL_SUPPLY) * 100)}% OF SUPPLY
        </span>
      </div>
      <div className="flex flex-col gap-4">{rows}</div>
      {!compact && (
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-body">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 bg-amber" />
            Locked by holders
          </span>
          {preview && (
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="size-3 bg-ice" />
              Your order, before you sign
            </span>
          )}
        </div>
      )}
    </section>
  );
}
