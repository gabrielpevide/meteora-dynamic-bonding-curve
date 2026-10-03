"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { launchConfig } from "@/lib/dbc";
import { marketPrice } from "@/lib/damm";
import { convictionPool, convictionWall, type WallEntry } from "@/lib/dlmm";
import { fmtSol } from "@/lib/format";
import type { LaunchSummary } from "@/lib/launches";
import { buttonClass } from "@/components/ui/button";
import { PhaseChip } from "@/components/home/phase-chip";
import { useLaunches } from "@/components/home/use-launches";
import { useNow } from "@/components/home/use-now";
import { TokenAvatar } from "@/components/token/token-header";
import { Wall } from "@/components/token/wall";

const PRIORITY = { round: 0, open: 1, graduated: 2, curve: 3 };

// The hero shows one live token, preferring an open conviction round.
export function FeaturedRound() {
  const { connection } = useConnection();
  const { launches, error } = useLaunches();
  const now = useNow();
  const featured = launches?.slice().sort((a, b) => PRIORITY[a.phase] - PRIORITY[b.phase])[0];
  const [wall, setWall] = useState<{ entries: WallEntry[]; refPrice: number; market: number } | null>(null);

  useEffect(() => {
    if (!featured || (featured.phase !== "round" && featured.phase !== "open")) return;
    const mint = new PublicKey(featured.mint);
    Promise.all([launchConfig(connection), marketPrice(connection, mint), convictionPool(connection, mint)])
      .then(async ([cfg, market, pool]) => {
        if (!pool) return;
        setWall({ entries: await convictionWall(connection, pool, market), refPrice: cfg.graduationPrice, market });
      })
      .catch(() => {});
  }, [featured, connection]);

  if (error) return <p className="break-words text-sm text-amber">Couldn&apos;t load launches ({error}).</p>;
  if (!launches) return <div className="facet-card h-[420px] border border-line bg-surface" aria-label="Loading" />;
  if (!featured) return <EmptyLaunches />;

  return (
    <div className="flex flex-col gap-3">
      <TokenStrip launch={featured} now={now} />
      {wall ? (
        <Wall entries={wall.entries} refPrice={wall.refPrice} market={wall.market} compact />
      ) : (
        <div className="facet-card flex flex-col gap-3 border border-line bg-surface p-6">
          <span className="font-mono text-[11px] tracking-[0.14em] text-muted">TO GRADUATION</span>
          <div className="h-2 bg-surface-2">
            <div className="h-2 bg-ice" style={{ width: `${featured.progress * 100}%` }} />
          </div>
        </div>
      )}
      <Link href={`/t/${featured.mint}`} className="self-end font-mono text-[13px] tracking-[0.08em] text-ice hover:text-ice-hover">
        {featured.phase === "round" ? `Lock your ${featured.symbol} →` : "View token →"}
      </Link>
    </div>
  );
}

function TokenStrip({ launch, now }: { launch: LaunchSummary; now: number }) {
  return (
    <Link href={`/t/${launch.mint}`} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-4">
      <span className="flex items-center gap-3.5">
        <TokenAvatar image={launch.image} symbol={launch.symbol} className="size-11 text-xl" />
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-xl font-semibold text-text">{launch.name}</span>
          <span className="font-mono text-[13px] text-muted">
            ${launch.symbol} · MC {fmtSol(launch.marketCap)}
          </span>
        </span>
      </span>
      <PhaseChip launch={launch} now={now} />
    </Link>
  );
}

export function EmptyLaunches() {
  return (
    <div className="facet-card flex flex-col items-start gap-4 border border-line bg-surface p-7">
      <p className="text-body">No launches yet. The first token launched here opens the first conviction round.</p>
      <Link href="/launch" className={buttonClass()}>
        Launch a token
      </Link>
    </div>
  );
}
