"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, type Connection } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { curveStatus, launchConfig, TOTAL_SUPPLY, type LaunchConfig } from "@/lib/dbc";
import { marketPrice } from "@/lib/damm";
import { convictionPool, convictionWall, positionFees, type WallEntry } from "@/lib/dlmm";
import { fmtCompact, fmtCountdown, fmtDate, fmtMc, fmtNumber, fmtSol } from "@/lib/format";
import { tokenMetadata } from "@/lib/metadata";
import { rewardsPaid } from "@/lib/rewards";
import { CurvePanel } from "@/components/token/curve-panel";
import { LockForm } from "@/components/token/lock-form";
import { PhaseStepper, type Phase } from "@/components/token/phase-stepper";
import { TokenHeader } from "@/components/token/token-header";
import { TradeBox } from "@/components/token/trade-box";
import { Wall, type WallPreview } from "@/components/token/wall";
import { YourOrders } from "@/components/token/your-orders";

type Data = {
  cfg: LaunchConfig;
  curve: NonNullable<Awaited<ReturnType<typeof curveStatus>>> | null;
  market: number | null;
  pool: { opensAt: number; isOpen: boolean } | null;
  wall: WallEntry[];
  fees: Map<string, number>;
  rewards?: number; // SOL paid to the connected wallet; undefined when unknown
  balance: number;
};

async function load(conn: Connection, mint: PublicKey, owner: PublicKey | null): Promise<Data> {
  const [cfg, curve] = await Promise.all([launchConfig(conn), curveStatus(conn, mint)]);
  let market: number | null = null;
  let pool: Data["pool"] = null;
  let wall: WallEntry[] = [];
  let fees = new Map<string, number>();
  let rewards: number | undefined;
  if (curve?.graduated) {
    market = await marketPrice(conn, mint);
    const p = await convictionPool(conn, mint);
    if (p) {
      pool = { opensAt: p.opensAt, isOpen: p.isOpen };
      [wall, fees, rewards] = await Promise.all([
        convictionWall(conn, p, market),
        owner ? positionFees(p, owner) : fees,
        owner ? rewardsPaid(mint.toBase58(), owner.toBase58()).catch(() => undefined) : undefined,
      ]);
    }
  }
  let balance = 0;
  if (owner) {
    const { value } = await conn.getParsedTokenAccountsByOwner(owner, { mint });
    balance = value.reduce((s, a) => s + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
  }
  return { cfg, curve, market, pool, wall, fees, rewards, balance };
}

const FACTS = [
  ["A sell order, not a stake", "Your tokens sit in a DLMM position above the market price. If the price reaches your range, they sell."],
  ["Locked by Meteora", "The DLMM program rejects any withdrawal before your unlock date."],
  ["Paid while you wait", "Platform fees go to orders above the price each day, weighted by size and time."],
];

export function TokenView({ mint }: { mint: string }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [data, setData] = useState<Data | null>(null);
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof tokenMetadata>>>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [preview, setPreview] = useState<WallPreview | null>(null);

  useEffect(() => {
    tokenMetadata(connection, new PublicKey(mint)).then(setMeta).catch(() => {});
  }, [connection, mint]);

  const refresh = useCallback(() => {
    load(connection, new PublicKey(mint), publicKey)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [connection, mint, publicKey]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 15_000);
    const tick = setInterval(() => setNow(Date.now() / 1000), 1_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  // A failed poll keeps the last good data on screen; only a failed first load replaces the page.
  if (!data) {
    return (
      <p className={`container-page py-16 ${error ? "break-words text-amber" : "text-muted"}`}>{error ?? "Loading…"}</p>
    );
  }
  if (!data.curve) return <p className="container-page py-16 text-muted">This token wasn&apos;t launched here.</p>;

  const { cfg, curve, market, pool, wall, fees, balance } = data;
  const name = meta?.name || "Token";
  const symbol = meta?.symbol || "TOKEN";
  const phase: Phase = !curve.graduated ? "curve" : !pool ? "graduated" : pool.isOpen ? "open" : "round";
  const refPrice = cfg.graduationPrice;
  const lockedLeft = wall.reduce((s, e) => s + e.tokensLeft, 0);
  const above = wall.reduce((s, e) => s + e.tokensAbove, 0);
  const sold = wall.reduce((s, e) => s + e.solFilled, 0);
  const pct = (n: number) => `${fmtNumber((n / TOTAL_SUPPLY) * 100)}%`;
  const mc = (market ?? curve.price) * TOTAL_SUPPLY;
  const mine = publicKey ? wall.filter((e) => e.owner === publicKey.toBase58()).map((e) => ({ ...e, feeSol: fees.get(e.position) })) : [];

  const stats =
    phase === "curve"
      ? [
          { label: "MARKET CAP", value: fmtSol(mc) },
          { label: "RAISED", value: fmtSol(curve.raised) },
        ]
      : phase === "open"
        ? [
            { label: "MARKET CAP", value: fmtSol(mc) },
            { label: "ABOVE PRICE", value: `${fmtCompact(above)} · ${pct(above)}` },
            { label: "SOLD FROM LOCKS", value: fmtSol(sold) },
          ]
        : [
            { label: "MARKET CAP", value: fmtSol(mc) },
            { label: "LOCKED SO FAR", value: `${fmtCompact(lockedLeft)} · ${pct(lockedLeft)}` },
          ];
  const notes: [string, string, string, string] =
    phase === "curve"
      ? [`${fmtNumber(curve.progress * 100)}% to graduation`, `At ${fmtMc(refPrice * TOTAL_SUPPLY)}`, "Locks before the pool opens", "Orders go live"]
      : phase === "graduated"
        ? ["Filled", "Moved to DAMM v2", "Starts shortly", "Orders go live"]
        : phase === "round" && pool
          ? ["Filled", "Moved to DAMM v2", `Closes in ${fmtCountdown(pool.opensAt - now)}`, `DLMM pool opens ${fmtDate(pool.opensAt)}`]
          : ["Filled", "Moved to DAMM v2", `${fmtCompact(lockedLeft)} locked`, `Orders live since ${pool ? fmtDate(pool.opensAt) : ""}`];

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden="true" className="facet-bg absolute -right-[14%] -top-[300px] aspect-square w-[64%] max-w-[920px] bg-facet" />
      <section className="container-page relative flex flex-col gap-7 pt-10">
        <TokenHeader name={name} symbol={symbol} image={meta?.image} mint={mint} stats={stats} />
        <PhaseStepper phase={phase} notes={notes} />
        {error && <p className="break-words text-sm text-amber">Couldn&apos;t refresh ({error}). Retrying in 15s.</p>}
      </section>

      <div className="container-page relative grid grid-cols-[repeat(auto-fit,minmax(min(560px,100%),1fr))] items-start gap-6 pb-24 pt-7">
        {phase === "curve" && (
          <>
            <CurvePanel
              progress={curve.progress}
              raised={curve.raised}
              threshold={cfg.threshold}
              startPrice={cfg.startPrice}
              graduationPrice={cfg.graduationPrice}
            />
            <TradeBox mint={mint} symbol={symbol} venue="curve" balance={balance} onDone={refresh} />
          </>
        )}

        {phase === "graduated" && (
          <>
            <section className="facet-card flex flex-col gap-3 border border-line bg-surface p-7">
              <h2 className="font-display text-[22px] font-semibold">Graduated</h2>
              <p className="text-[15px] leading-relaxed text-body">
                The curve is full and its liquidity now sits in a Meteora DAMM v2 pool. The conviction round opens as soon as the DLMM pool
                is created.
              </p>
            </section>
            <TradeBox mint={mint} symbol={symbol} venue="damm" balance={balance} onDone={refresh} />
          </>
        )}

        {phase === "round" && pool && market !== null && (
          <>
            <Wall entries={wall} refPrice={refPrice} market={market} preview={preview} />
            <LockForm
              mint={mint}
              symbol={symbol}
              refPrice={refPrice}
              market={market}
              opensAt={pool.opensAt}
              now={now}
              balance={balance}
              onPreview={setPreview}
              onDone={refresh}
            />
            <section aria-label="What you are signing" className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
              {FACTS.map(([title, text]) => (
                <div key={title} className="flex flex-col gap-2 border border-line p-5">
                  <h3 className="font-display text-[17px] font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-body">{text}</p>
                </div>
              ))}
            </section>
            <TradeBox mint={mint} symbol={symbol} venue="damm" balance={balance} onDone={refresh} />
          </>
        )}

        {phase === "open" && market !== null && (
          <>
            <Wall entries={wall} refPrice={refPrice} market={market} />
            <YourOrders orders={mine} rewards={data.rewards} refPrice={refPrice} market={market} now={now} mint={mint} onDone={refresh} />
            <TradeBox mint={mint} symbol={symbol} venue="damm" balance={balance} onDone={refresh} />
          </>
        )}
      </div>
    </div>
  );
}
