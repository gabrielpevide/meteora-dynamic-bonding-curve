import { TOTAL_SUPPLY } from "@/lib/dbc";
import { fmtMc, fmtNumber, fmtSol } from "@/lib/format";
import { cn } from "@/lib/utils";

const BARS = 24;
// Price rises along the curve; the bars sketch that shape, the filled ones are what has been bought.
const HEIGHTS = Array.from({ length: BARS }, (_, i) => 18 + 82 * Math.pow(i / (BARS - 1), 1.6));

export function CurvePanel(props: { progress: number; raised: number; threshold: number; startPrice: number; graduationPrice: number }) {
  const filled = Math.round(Math.min(props.progress, 1) * BARS);
  return (
    <section aria-label="Bonding curve" className="facet-card flex flex-col gap-[22px] border border-line bg-surface p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[22px] font-semibold">Bonding curve</h2>
        <span className="font-mono text-xs tracking-[0.12em] text-muted">METEORA DBC</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="font-display text-6xl font-bold leading-none text-ice">{fmtNumber(props.progress * 100)}%</span>
        <span className="text-base text-body">
          to graduation · {fmtSol(props.raised)} of {fmtSol(props.threshold)} raised
        </span>
      </div>
      <div aria-hidden="true" className="flex h-[220px] items-end gap-[5px] border-b border-line-strong">
        {HEIGHTS.map((h, i) => (
          <div key={i} className={cn("flex-1", i < filled ? "bg-ice" : "bg-surface-2")} style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="flex justify-between gap-3 font-mono text-xs tracking-[0.1em] text-faint">
        <span>STARTS AT {fmtMc(props.startPrice * TOTAL_SUPPLY)}</span>
        <span>GRADUATES AT {fmtMc(props.graduationPrice * TOTAL_SUPPLY)}</span>
      </div>
      <p className="text-[15px] leading-relaxed text-body">
        When the curve fills, liquidity moves to a Meteora DAMM v2 pool and the conviction round opens. That round is your window to lock
        tokens at a target price.
      </p>
    </section>
  );
}
