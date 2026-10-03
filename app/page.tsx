import Link from "next/link";
import { FeaturedRound } from "@/components/home/featured-round";
import { TokenGrid } from "@/components/home/token-grid";
import { buttonClass } from "@/components/ui/button";

const PHASES = [
  {
    n: "01",
    tag: "METEORA DBC",
    title: "Curve",
    text: "Anyone buys on the bonding curve from the first block. Launch fees start high and fall within minutes, so bots pay for speed.",
  },
  {
    n: "02",
    tag: "METEORA DAMM v2",
    title: "Graduation",
    text: "When the curve fills, liquidity moves to a DAMM v2 pool and stays locked. Half of its trading fees compound back into the pool.",
  },
  {
    n: "03",
    tag: "METEORA DLMM",
    title: "Conviction round",
    text: "Before the DLMM pool opens, holders lock tokens as sell orders at 2x to 10x the graduation price. Meteora's program refuses any withdrawal before the unlock date.",
  },
  {
    n: "04",
    tag: "REWARDS",
    title: "Open",
    text: "Orders sell only inside their range. Every order still above the price earns SOL from trading fees, paid daily.",
  },
];

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden="true" className="facet-bg absolute -right-[12%] -top-[240px] aspect-square w-[72%] max-w-[1040px] bg-facet" />

      <section className="container-page relative grid grid-cols-[repeat(auto-fit,minmax(min(540px,100%),1fr))] items-center gap-16 pb-[104px] pt-[72px]">
        <div className="flex flex-col">
          <p className="font-mono text-[13px] tracking-[0.18em] text-ice">CONVICTION POOLS · BUILT ON METEORA</p>
          <h1 className="mt-[22px] text-balance font-display text-[clamp(44px,5.2vw,76px)] font-bold leading-none tracking-[-0.01em]">
            Lock at a <span className="text-amber">target price</span>. Earn SOL while you wait.
          </h1>
          <p className="mt-7 max-w-[560px] text-[19px] leading-relaxed text-body">
            Launch on a bonding curve. After it graduates, holders lock their tokens as sell orders at the price they believe in. Meteora
            enforces every lock on-chain, and trading fees pay the holders every day.
          </p>
          <div className="mt-9 flex flex-wrap gap-3.5">
            <Link href="/launch" className={buttonClass({ size: "lg" })}>
              Launch a token
            </Link>
            <Link href="#tokens" className={buttonClass({ variant: "outline", size: "lg" })}>
              Browse tokens
            </Link>
          </div>
        </div>
        <FeaturedRound />
      </section>

      <section id="how" className="relative border-t border-rule bg-deep">
        <div className="container-page flex flex-col gap-10 py-[88px]">
          <div className="flex max-w-[720px] flex-col gap-3.5">
            <p className="font-mono text-[13px] tracking-[0.18em] text-ice">HOW IT WORKS</p>
            <h2 className="font-display text-[clamp(32px,3.4vw,46px)] font-bold leading-[1.08]">Four phases, three Meteora programs.</h2>
          </div>
          <ol className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-4">
            {PHASES.map((p) => (
              <li key={p.n} className="facet-card-sm flex flex-col gap-3 border border-line bg-surface p-6">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] text-amber">{p.n}</span>
                  <span className="font-mono text-[11px] tracking-[0.14em] text-ice">{p.tag}</span>
                </div>
                <h3 className="font-display text-[22px] font-semibold">{p.title}</h3>
                <p className="text-[15px] leading-relaxed text-body">{p.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="tokens" className="relative scroll-mt-4 border-t border-rule">
        <div className="container-page py-[88px]">
          <TokenGrid />
        </div>
      </section>

      <section className="relative border-t border-rule bg-deep">
        <div className="container-page grid grid-cols-[repeat(auto-fit,minmax(min(480px,100%),1fr))] items-center gap-x-16 gap-y-8 py-24">
          <h2 className="text-balance font-display text-[clamp(34px,3.8vw,54px)] font-bold leading-[1.04]">
            Launch a token your holders commit to.
          </h2>
          <div className="flex flex-col items-start gap-6">
            <p className="text-lg leading-relaxed text-body">
              Your token trades on a Meteora bonding curve from the first block. After graduation, holders lock sell orders at their price and
              earn from the fees while they wait.
            </p>
            <Link href="/launch" className={buttonClass({ size: "lg" })}>
              Launch a token
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
