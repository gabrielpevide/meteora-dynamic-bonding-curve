"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useEffect, useState } from "react";
import { curveQuote, curveSwapTx, TOKEN_DECIMALS } from "@/lib/dbc";
import { dammQuote, dammSwapTx } from "@/lib/damm";
import { fmtCompact, fmtSol } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { TxStatus } from "@/components/tx-status";
import { useSend } from "@/components/use-send";

const SIDES = [
  { label: "Buy", value: "buy" as const },
  { label: "Sell", value: "sell" as const },
];

// Before graduation it trades on the DBC curve, after on the DAMM v2 pool.
export function TradeBox(props: { mint: string; symbol: string; venue: "curve" | "damm"; balance: number; onDone: () => void }) {
  const { connection } = useConnection();
  const { send, status, publicKey } = useSend();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const buy = side === "buy";
  const value = Number(amount) || 0;

  useEffect(() => {
    if (!(value > 0)) return;
    // Quote after the user stops typing; a stale result is dropped if they keep going.
    let live = true;
    const t = setTimeout(() => {
      const amountIn = new BN(Math.round(value * (buy ? LAMPORTS_PER_SOL : 10 ** TOKEN_DECIMALS)));
      const p = { owner: PublicKey.default, mint: new PublicKey(props.mint), amountIn, buy };
      (props.venue === "curve" ? curveQuote(connection, p) : dammQuote(connection, p))
        .then((out) => {
          if (!live) return;
          const n = Number(out.toString());
          setQuote(buy ? `≈ ${fmtCompact(n / 10 ** TOKEN_DECIMALS)} ${props.symbol}` : `≈ ${fmtSol(n / LAMPORTS_PER_SOL)}`);
        })
        .catch(() => live && setQuote(null));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [value, buy, props.mint, props.venue, props.symbol, connection]);

  async function submit() {
    if (!publicKey || !(value > 0)) return;
    const amountIn = new BN(Math.round(value * (buy ? LAMPORTS_PER_SOL : 10 ** TOKEN_DECIMALS)));
    const p = { owner: publicKey, mint: new PublicKey(props.mint), amountIn, buy };
    const { tx } = props.venue === "curve" ? await curveSwapTx(connection, p) : await dammSwapTx(connection, p);
    await send(tx);
    setAmount("");
    props.onDone();
  }

  const quick = buy
    ? [0.1, 0.5, 1].map((n) => ({ label: `${n} SOL`, set: String(n) }))
    : [0.25, 0.5, 1].map((f) => ({ label: f === 1 ? "MAX" : `${f * 100}%`, set: String(Math.floor(props.balance * f)) }));

  return (
    <section aria-label={`Trade ${props.symbol}`} className="flex flex-col gap-[18px] border border-line-strong bg-surface p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[22px] font-semibold">{props.venue === "curve" ? "Buy on the curve" : `Trade ${props.symbol}`}</h2>
        <span className="font-mono text-xs tracking-[0.12em] text-muted">{props.venue === "curve" ? "METEORA DBC" : "METEORA DAMM v2"}</span>
      </div>
      <ChipGroup
        legend="SIDE"
        options={SIDES}
        value={side}
        onChange={(v) => {
          setSide(v);
          setAmount("");
          setQuote(null);
        }}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor={`trade-${props.venue}`} className="font-mono text-[11px] tracking-[0.16em] text-muted">
          {buy ? "YOU PAY" : `YOU SELL · BALANCE ${fmtCompact(props.balance)}`}
        </label>
        <div className="flex h-14 items-center border border-line-strong bg-field px-3.5">
          <input
            id={`trade-${props.venue}`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(",", "."))}
            placeholder="0"
            className="min-w-0 flex-1 bg-transparent font-mono text-[22px] text-text outline-none"
          />
          <span className="font-mono text-sm text-muted">{buy ? "SOL" : props.symbol}</span>
        </div>
        <div className="flex gap-2">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setAmount(q.set)}
              className="h-11 flex-1 cursor-pointer border border-line-strong font-mono text-[13px] text-text-2 hover:border-ice"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 border border-line bg-field p-4 font-mono text-[13px]">
        <dt className="text-muted">You receive</dt>
        <dd className="text-right">{value > 0 && quote ? quote : "—"}</dd>
      </dl>
      <button
        type="button"
        onClick={() => submit().catch(() => {})}
        disabled={!publicKey || !(value > 0) || status.kind === "pending"}
        className={buttonClass({ size: "lg", className: "text-[17px] font-bold tracking-[0.06em]" })}
      >
        {publicKey ? `${buy ? "BUY" : "SELL"} ${props.symbol}` : "CONNECT WALLET TO TRADE"}
      </button>
      <p className="text-[13px] leading-normal text-body">
        {props.venue === "curve"
          ? "The last buy before graduation fills up to the target and refunds the rest."
          : "Trades on the graduated Meteora DAMM v2 pool."}
      </p>
      <TxStatus status={status} />
    </section>
  );
}
