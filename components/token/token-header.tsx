import { shortAddr } from "@/lib/format";
import { CLUSTER } from "@/lib/solana";
import { cn } from "@/lib/utils";

export function TokenAvatar({ image, symbol, className }: { image?: string | null; symbol: string; className?: string }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- token images come from arbitrary hosts
    return <img src={image} alt="" className={cn("hex object-cover", className)} />;
  }
  return (
    <span aria-hidden="true" className={cn("hex grid place-items-center bg-amber font-display font-bold text-amber-ink", className)}>
      {symbol.slice(0, 1) || "?"}
    </span>
  );
}

export function TokenHeader(props: {
  name: string;
  symbol: string;
  image?: string | null;
  mint: string;
  stats: { label: string; value: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-5">
      <div className="flex items-center gap-4">
        <TokenAvatar image={props.image} symbol={props.symbol} className="size-14 text-2xl" />
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-[34px] font-bold leading-none">
            {props.name} <span className="font-medium text-muted">${props.symbol}</span>
          </h1>
          <span className="font-mono text-[13px] text-muted">
            Mint {shortAddr(props.mint)} · Solana {CLUSTER === "devnet" ? "devnet" : "mainnet"}
          </span>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-10 gap-y-3">
        {props.stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <dt className="font-mono text-[11px] tracking-[0.16em] text-muted">{s.label}</dt>
            <dd className="font-mono text-[22px]">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
