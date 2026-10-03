"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtCountdown, fmtSol } from "@/lib/format";
import type { LaunchPhase } from "@/lib/launches";
import { ChipGroup } from "@/components/ui/chip-group";
import { EmptyLaunches } from "@/components/home/featured-round";
import { PhaseChip } from "@/components/home/phase-chip";
import { useLaunches } from "@/components/home/use-launches";
import { useNow } from "@/components/home/use-now";
import { TokenAvatar } from "@/components/token/token-header";

const FILTERS: { label: string; value: "all" | LaunchPhase }[] = [
  { label: "All", value: "all" },
  { label: "On curve", value: "curve" },
  { label: "Round", value: "round" },
  { label: "Open", value: "open" },
];

const CTA: Record<LaunchPhase, string> = {
  curve: "Buy on the curve →",
  graduated: "View token →",
  round: "Open the round →",
  open: "View token →",
};

export function TokenGrid() {
  const { launches, error } = useLaunches();
  const now = useNow();
  const [filter, setFilter] = useState<"all" | LaunchPhase>("all");
  const shown = launches?.filter((l) => filter === "all" || l.phase === filter) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-[clamp(32px,3.4vw,46px)] font-bold leading-[1.08]">Tokens</h2>
        <div className="w-full max-w-[460px]">
          <ChipGroup legend="FILTER BY PHASE" options={FILTERS} value={filter} onChange={setFilter} />
        </div>
      </div>
      {error && <p className="break-words text-sm text-amber">Couldn&apos;t load launches ({error}).</p>}
      {!launches && !error && <p className="text-muted">Loading launches…</p>}
      {launches && launches.length === 0 && <EmptyLaunches />}
      {launches && launches.length > 0 && shown.length === 0 && <p className="text-body">No tokens in this phase right now.</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(360px,100%),1fr))] gap-4">
        {shown.map((l) => (
          <Link
            key={l.mint}
            href={`/t/${l.mint}`}
            className="facet-card-sm flex flex-col gap-5 border border-line bg-surface p-6 text-text hover:border-line-strong"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <TokenAvatar image={l.image} symbol={l.symbol} className="size-10 text-lg" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-display text-lg font-semibold">{l.name}</span>
                  <span className="font-mono text-xs text-muted">${l.symbol}</span>
                </span>
              </span>
              <PhaseChip launch={l} now={now} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[11px] tracking-[0.14em] text-muted">MARKET CAP</span>
                <span className="font-mono text-lg">{fmtSol(l.marketCap)}</span>
              </div>
              <div className="flex flex-col gap-1">
                {l.phase === "curve" && (
                  <>
                    <span className="font-mono text-[11px] tracking-[0.14em] text-muted">TO GRADUATION</span>
                    <span className="mt-2 h-2 bg-surface-2">
                      <span className="block h-2 bg-ice" style={{ width: `${l.progress * 100}%` }} />
                    </span>
                  </>
                )}
                {l.phase === "round" && (
                  <>
                    <span className="font-mono text-[11px] tracking-[0.14em] text-muted">LOCKING CLOSES</span>
                    <span className="font-mono text-lg text-amber">{fmtCountdown((l.opensAt ?? now) - now)}</span>
                  </>
                )}
                {(l.phase === "open" || l.phase === "graduated") && (
                  <>
                    <span className="font-mono text-[11px] tracking-[0.14em] text-muted">ORDERS</span>
                    <span className="font-mono text-lg">{l.phase === "open" ? "Live" : "Round soon"}</span>
                  </>
                )}
              </div>
            </div>
            <span className="font-mono text-[13px] text-ice">{CTA[l.phase]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
