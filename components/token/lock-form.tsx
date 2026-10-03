"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { useEffect, useState } from "react";
import { TOKEN_DECIMALS, TOTAL_SUPPLY } from "@/lib/dbc";
import { fundLockTx, initLockTx } from "@/lib/dlmm";
import { fmtCompact, fmtCountdown, fmtDate, fmtMcRange, fmtNumber } from "@/lib/format";
import { CLUSTER } from "@/lib/solana";
import { buttonClass } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { RANGE_WIDTH, type WallPreview } from "@/components/token/wall";
import { TxStatus } from "@/components/tx-status";
import { useSend } from "@/components/use-send";

const MULTIPLES = [2, 3, 5, 10];
// Devnet gets short locks so a full lock-and-withdraw cycle fits in one test session.
const DURATIONS =
  CLUSTER === "devnet"
    ? [
        { label: "30 min", value: 1_800 },
        { label: "2 hours", value: 7_200 },
        { label: "1 day", value: 86_400 },
      ]
    : [
        { label: "7 days", value: 7 * 86_400 },
        { label: "14 days", value: 14 * 86_400 },
        { label: "30 days", value: 30 * 86_400 },
      ];
const MIN_DISTANCE = 1.2; // a target must sit at least 20% above the market, or it would sell on opening

export function LockForm(props: {
  mint: string;
  symbol: string;
  refPrice: number;
  market: number;
  opensAt: number;
  now: number;
  balance: number;
  onPreview: (preview: WallPreview | null) => void;
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const { send, status, publicKey } = useSend();
  const options = MULTIPLES.map((m) => ({
    label: `${m}x`,
    value: m,
    disabled: props.refPrice * m < props.market * MIN_DISTANCE,
  }));
  const [amount, setAmount] = useState("");
  const [multiple, setMultiple] = useState(() => options.find((o) => !o.disabled && o.value >= 3)?.value ?? 10);
  const [duration, setDuration] = useState(DURATIONS[1].value);
  const tokens = Number(amount) || 0;
  const target = props.refPrice * multiple;
  // The commitment starts when the pool opens: until then nothing can trade anyway.
  const lockUntil = props.opensAt + duration;
  const { onPreview } = props;

  useEffect(() => {
    onPreview(tokens > 0 ? { multiple, tokens } : null);
  }, [tokens, multiple, onPreview]);

  async function submit() {
    if (!publicKey) return;
    if (!(tokens > 0) || tokens > props.balance) throw new Error("Enter an amount up to your balance");
    const mint = new PublicKey(props.mint);
    const lock = await initLockTx(connection, { owner: publicKey, mint, targetPrice: target, lockUntil });
    await send(lock.tx, [lock.base], "Step 1 of 2: creating the locked position…");
    const fund = await fundLockTx(connection, {
      owner: publicKey,
      mint,
      position: lock.position,
      lowerBinId: lock.lowerBinId,
      amount: new BN(Math.floor(tokens * 10 ** TOKEN_DECIMALS)),
    });
    await send(fund, [], "Step 2 of 2: depositing your tokens…");
    setAmount("");
    props.onDone();
  }

  return (
    <section aria-label="Lock tokens" className="flex flex-col gap-5 border border-line-strong bg-surface p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[22px] font-semibold">Lock tokens</h2>
        <span className="font-mono text-xs tracking-[0.12em] text-amber">
          ROUND CLOSES IN {fmtCountdown(props.opensAt - props.now)}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="lock-amount" className="font-mono text-[11px] tracking-[0.16em] text-muted">
          AMOUNT · BALANCE {fmtNumber(props.balance)}
        </label>
        <div className="flex gap-2.5">
          <div className="flex h-[52px] min-w-0 flex-1 items-center border border-line-strong bg-field px-3.5">
            <input
              id="lock-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", "."))}
              placeholder="0"
              className="min-w-0 flex-1 bg-transparent font-mono text-xl text-text outline-none"
            />
            <span className="font-mono text-sm text-muted">{props.symbol}</span>
          </div>
          <button
            type="button"
            onClick={() => setAmount(String(Math.floor(props.balance)))}
            className="h-[52px] cursor-pointer border border-line-strong px-4 font-mono text-[13px] tracking-[0.1em] text-text-2 hover:border-ice"
          >
            MAX
          </button>
        </div>
      </div>
      <ChipGroup legend="START SELLING AT" tone="amber" options={options} value={multiple} onChange={setMultiple} />
      <ChipGroup legend="LOCKED FOR" options={DURATIONS} value={duration} onChange={setDuration} />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 border border-line bg-field p-4 font-mono text-[13px]">
        <dt className="text-muted">Sells between</dt>
        <dd className="text-right">{fmtMcRange(target * TOTAL_SUPPLY, target * RANGE_WIDTH * TOTAL_SUPPLY)}</dd>
        <dt className="text-muted">Unlocks</dt>
        <dd className="text-right">{fmtDate(lockUntil)}</dd>
        <dt className="text-muted">Earns</dt>
        <dd className="text-right">SOL from fees, paid daily</dd>
      </dl>
      <button
        type="button"
        onClick={() => submit().catch(() => {})}
        disabled={!publicKey || status.kind === "pending"}
        className={buttonClass({ size: "lg", className: "text-[17px] font-bold tracking-[0.06em]" })}
      >
        {publicKey ? `LOCK ${tokens > 0 ? fmtCompact(tokens) : ""} ${props.symbol}`.replace("  ", " ") : "CONNECT WALLET TO LOCK"}
      </button>
      <p className="text-[13px] leading-normal text-body">
        Meteora DLMM holds the lock. Nobody can withdraw before {fmtDate(lockUntil)}, including you.
      </p>
      <TxStatus status={status} />
    </section>
  );
}
