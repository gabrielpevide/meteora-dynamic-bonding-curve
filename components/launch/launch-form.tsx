"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createTokenTx, launchConfig, TOTAL_SUPPLY, type LaunchConfig } from "@/lib/dbc";
import { fmtMc, fmtNumber, fmtSol } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";
import { TokenAvatar } from "@/components/token/token-header";
import { TxStatus } from "@/components/tx-status";
import { useSend } from "@/components/use-send";

const MAX_URI = 200; // Metaplex metadata URI limit

// Metadata lives in the URI itself (see app/api/metadata); the description is trimmed to whatever room is left.
function metadataUri(origin: string, name: string, symbol: string, image: string, description: string) {
  const base = `${origin}/api/metadata?n=${encodeURIComponent(name)}&s=${encodeURIComponent(symbol)}&i=${encodeURIComponent(image)}`;
  let d = description;
  while (d && `${base}&d=${encodeURIComponent(d)}`.length > MAX_URI) d = d.slice(0, -1);
  const uri = d ? `${base}&d=${encodeURIComponent(d)}` : base;
  if (uri.length > MAX_URI) throw new Error("That image link is too long. Use a shorter link.");
  return uri;
}

export function LaunchForm() {
  const { connection } = useConnection();
  const router = useRouter();
  const { send, status, publicKey } = useSend();
  const [cfg, setCfg] = useState<LaunchConfig | null>(null);
  const [form, setForm] = useState({ image: "", name: "", symbol: "", description: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: k === "symbol" ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") : e.target.value }));

  useEffect(() => {
    launchConfig(connection).then(setCfg).catch(() => {});
  }, [connection]);

  async function submit() {
    if (!publicKey) return;
    const name = form.name.trim();
    const image = form.image.trim();
    if (!name || !form.symbol) throw new Error("Add a name and a ticker");
    if (image && !image.startsWith("https://")) throw new Error("The image link must start with https://");
    const uri = metadataUri(window.location.origin, name, form.symbol, image, form.description.trim());
    const { tx, mint } = await createTokenTx(connection, { creator: publicKey, name, symbol: form.symbol, uri });
    await send(tx, [mint], "Launching your token…");
    router.push(`/t/${mint.publicKey.toBase58()}`);
  }

  const field = "border border-line-strong bg-field px-3.5 text-text outline-none focus:border-ice";
  const label = "font-mono text-[11px] tracking-[0.16em] text-muted";
  const preset: [string, string][] = cfg
    ? [
        ["CURVE", `Starts at ${fmtMc(cfg.startPrice * TOTAL_SUPPLY)} and graduates at ${fmtMc(cfg.graduationPrice * TOTAL_SUPPLY)}, after ${fmtSol(cfg.threshold)} of buys.`],
        ["LAUNCH FEE", "50% in the first block, down to 1% within two minutes."],
        ["YOUR SHARE", `${fmtNumber(cfg.creatorFeeShare * 100)}% of the curve's trading fees.`],
        ["GRADUATION", "Liquidity moves to Meteora DAMM v2 and stays locked. Half of its fees compound into the pool."],
        ["CONVICTION ROUND", "Opens at graduation. Holders lock sell orders before the DLMM pool goes live."],
        ["PLATFORM FEES", "Paid to holders whose orders sit above the price."],
      ]
    : [];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(560px,100%),1fr))] items-start gap-6">
      <section aria-label="Token details" className="facet-card flex flex-col gap-5 border border-line bg-surface p-7">
        <div className="flex items-center gap-[18px] border border-dashed border-line-strong p-[18px]">
          {form.image.startsWith("https://") ? (
            <TokenAvatar image={form.image} symbol={form.symbol} className="size-[72px] flex-none" />
          ) : (
            <span aria-hidden="true" className="hex grid size-[72px] flex-none place-items-center bg-surface-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14" stroke="var(--ice)" strokeWidth="1.6" strokeLinecap="square" />
              </svg>
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label htmlFor="token-image" className="font-display text-[17px] font-semibold">
              Image link
            </label>
            <input
              id="token-image"
              value={form.image}
              onChange={set("image")}
              placeholder="https://… (PNG or JPG, square works best)"
              className={`h-11 font-mono text-sm ${field}`}
            />
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="token-name" className={label}>
              NAME
            </label>
            <input id="token-name" maxLength={32} value={form.name} onChange={set("name")} placeholder="Conviction Test" className={`h-[50px] text-[17px] ${field}`} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="token-ticker" className={label}>
              TICKER
            </label>
            <div className={`flex h-[50px] items-center ${field}`}>
              <span aria-hidden="true" className="font-mono text-[17px] text-muted">
                $
              </span>
              <input
                id="token-ticker"
                maxLength={10}
                value={form.symbol}
                onChange={set("symbol")}
                placeholder="CVT"
                className="ml-1 min-w-0 flex-1 bg-transparent font-mono text-[17px] outline-none"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="token-about" className={label}>
            DESCRIPTION
          </label>
          <textarea
            id="token-about"
            rows={4}
            maxLength={200}
            value={form.description}
            onChange={set("description")}
            placeholder="What is this token for?"
            className={`resize-y py-3 text-base leading-normal ${field}`}
          />
        </div>
      </section>

      <aside aria-label="Launch preset" className="flex flex-col gap-5 border border-line-strong bg-surface p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[22px] font-semibold">What you get</h2>
          <span className="font-mono text-xs tracking-[0.12em] text-muted">SAME RULES FOR EVERY TOKEN</span>
        </div>
        <dl className="flex flex-col">
          {preset.map(([k, v], i) => (
            <div
              key={k}
              className={`grid grid-cols-[150px_minmax(0,1fr)] gap-4 border-t border-line py-3.5 ${i === preset.length - 1 ? "border-b" : ""}`}
            >
              <dt className="font-mono text-xs tracking-[0.1em] text-amber">{k}</dt>
              <dd className="text-[15px] leading-normal">{v}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={() => submit().catch(() => {})}
          disabled={!publicKey || status.kind === "pending"}
          className={buttonClass({ size: "lg", className: "text-[17px] font-bold tracking-[0.06em]" })}
        >
          {publicKey ? "LAUNCH TOKEN" : "CONNECT WALLET TO LAUNCH"}
        </button>
        <p className="text-[13px] leading-normal text-body">You sign one transaction and pay the network fee.</p>
        <TxStatus status={status} />
      </aside>
    </div>
  );
}
