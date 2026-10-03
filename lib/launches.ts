import { LAMPORTS_PER_SOL, type Connection } from "@solana/web3.js";
import { launchConfig, listLaunches, priceOf, TOTAL_SUPPLY } from "@/lib/dbc";
import { marketPrice } from "@/lib/damm";
import { convictionPool } from "@/lib/dlmm";
import { tokenMetadata } from "@/lib/metadata";

export type LaunchPhase = "curve" | "graduated" | "round" | "open";

export type LaunchSummary = {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  phase: LaunchPhase;
  marketCap: number; // SOL
  progress: number; // 0..1 of the curve
  opensAt?: number; // when the DLMM pool opens (round and open phases)
};

// Newest launches on our config with their phase. ponytail: a few RPC calls per token, fine for a
// handful of launches; index launches server-side before the list grows past a page.
export async function launchSummaries(conn: Connection, limit = 12): Promise<LaunchSummary[]> {
  const [cfg, pools] = await Promise.all([launchConfig(conn), listLaunches(conn)]);
  const newest = [...pools]
    .sort((a, b) => b.account.poolState.activationPoint.cmp(a.account.poolState.activationPoint))
    .slice(0, limit);
  return Promise.all(
    newest.map(async ({ account }) => {
      const s = account.poolState;
      const mint = s.baseMint;
      const meta = await tokenMetadata(conn, mint).catch(() => null);
      const summary: LaunchSummary = {
        mint: mint.toBase58(),
        name: meta?.name || "Unnamed",
        symbol: meta?.symbol || "TOKEN",
        image: meta?.image ?? null,
        phase: "curve",
        marketCap: priceOf(s.sqrtPrice) * TOTAL_SUPPLY,
        progress: Math.min(1, Number(s.quoteReserve.toString()) / LAMPORTS_PER_SOL / cfg.threshold),
      };
      if (s.isMigrated !== 1) return summary;
      const [price, pool] = await Promise.all([marketPrice(conn, mint), convictionPool(conn, mint)]);
      summary.marketCap = price * TOTAL_SUPPLY;
      summary.phase = !pool ? "graduated" : pool.isOpen ? "open" : "round";
      summary.opensAt = pool?.opensAt;
      return summary;
    }),
  );
}
