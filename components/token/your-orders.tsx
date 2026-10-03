"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOTAL_SUPPLY } from "@/lib/dbc";
import { withdrawLockTxs, type WallEntry } from "@/lib/dlmm";
import { fmtCompact, fmtDate, fmtMcRange, fmtMultiple, fmtSol } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";
import { TxStatus } from "@/components/tx-status";
import { useSend } from "@/components/use-send";
import { cn } from "@/lib/utils";

export type Order = WallEntry & { feeSol?: number };

export function YourOrders(props: {
  orders: Order[];
  rewards?: number;
  refPrice: number;
  market: number;
  now: number;
  mint: string;
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const { send, status, publicKey } = useSend();

  async function withdraw(position: string) {
    if (!publicKey) return;
    const txs = await withdrawLockTxs(connection, { owner: publicKey, mint: new PublicKey(props.mint), position: new PublicKey(position) });
    for (const tx of txs) await send(tx, [], "Withdrawing…");
    props.onDone();
  }

  return (
    <section aria-label="Your orders" className="flex flex-col gap-4 border border-line-strong bg-surface p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[22px] font-semibold">Your orders</h2>
        <span className="font-mono text-xs tracking-[0.12em] text-muted">REWARDS PAID DAILY IN SOL</span>
      </div>
      {!publicKey && <p className="text-sm text-body">Connect your wallet to see your orders.</p>}
      {publicKey && props.orders.length === 0 && <p className="text-sm text-body">You have no locked orders on this token.</p>}
      {props.orders.length > 0 && (
        <p className="flex flex-wrap items-baseline justify-between gap-2 border border-line bg-field px-[18px] py-3.5">
          <span className="font-mono text-[11px] tracking-[0.14em] text-muted">REWARDS PAID TO YOU</span>
          <span className="font-mono text-base">{props.rewards === undefined ? "—" : fmtSol(props.rewards)}</span>
        </p>
      )}
      {props.orders.map((o) => {
        const unlocked = props.now >= o.lockReleasePoint;
        const state =
          props.market >= o.upperPrice ? "sold" : props.market >= o.lowerPrice ? "selling" : "waiting";
        return (
          <article key={o.position} className="flex flex-col gap-3.5 border border-line bg-field p-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[15px]">
                {fmtMcRange(o.lowerPrice * TOTAL_SUPPLY, o.upperPrice * TOTAL_SUPPLY)} · {fmtMultiple(o.lowerPrice / props.refPrice)}
              </span>
              <span
                className={cn(
                  "border px-2 py-1 font-mono text-[11px] tracking-[0.14em]",
                  state === "selling" && "border-amber-line text-amber",
                  state === "sold" && "border-ice-line text-ice",
                  state === "waiting" && "border-line-strong text-text-2",
                )}
              >
                {state === "selling" ? "SELLING NOW" : state === "sold" ? "SOLD OUT" : `${fmtMultiple(o.lowerPrice / props.market)} ABOVE PRICE`}
              </span>
            </div>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(120px,100%),1fr))] gap-3">
              {[
                ["TOKENS LEFT", fmtCompact(o.tokensLeft)],
                ["RECEIVED", fmtSol(o.solFilled)],
                ["SWAP FEES", o.feeSol === undefined ? "—" : fmtSol(o.feeSol)],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <dt className="font-mono text-[11px] tracking-[0.14em] text-muted">{label}</dt>
                  <dd className="font-mono text-base">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              {unlocked ? (
                <>
                  <span className="text-sm text-body">Unlocked since {fmtDate(o.lockReleasePoint)}</span>
                  <button
                    type="button"
                    onClick={() => withdraw(o.position).catch(() => {})}
                    disabled={status.kind === "pending"}
                    className={buttonClass({ className: "facet-btn-sm h-11 px-[18px] text-sm" })}
                  >
                    Withdraw tokens and SOL
                  </button>
                </>
              ) : (
                <span className="flex items-center gap-2.5 text-sm text-body">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <rect x="2.5" y="6" width="9" height="6.5" stroke="var(--amber)" strokeWidth="1.3" />
                    <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="var(--amber)" strokeWidth="1.3" />
                  </svg>
                  Locked until {fmtDate(o.lockReleasePoint)} by Meteora DLMM
                </span>
              )}
            </div>
          </article>
        );
      })}
      <TxStatus status={status} />
    </section>
  );
}
