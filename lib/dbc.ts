import {
  DynamicBondingCurveClient,
  SwapMode,
  TokenDecimal,
  deriveDbcPoolAddress,
  getCurrentPoint,
  getPriceFromSqrtPrice,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, type Connection } from "@solana/web3.js";
import BN from "bn.js";

export const TOKEN_DECIMALS = 6;
export const TOTAL_SUPPLY = 1_000_000_000; // fixed by the launch config
// The platform's launch config: we are its fee claimer, and those fees fund conviction rewards.
export const DBC_CONFIG = new PublicKey(
  process.env.NEXT_PUBLIC_DBC_CONFIG ?? "5WNhv4t2rvkkEmKjTZZWkKEU7GDqcWyaAA6cHZiQKKZN",
);

const client = (conn: Connection) => new DynamicBondingCurveClient(conn, "confirmed");
export const priceOf = (sqrtPrice: BN) => getPriceFromSqrtPrice(sqrtPrice, TokenDecimal.SIX, 9).toNumber();
export const dbcPoolFor = (mint: PublicKey) => deriveDbcPoolAddress(NATIVE_MINT, mint, DBC_CONFIG);

export type LaunchConfig = {
  startPrice: number; // SOL per token at the first buy
  graduationPrice: number; // SOL per token when the curve completes; conviction targets are multiples of it
  threshold: number; // SOL raised to graduate
  creatorFeeShare: number; // 0..1 of the curve's trading fees
};

let configCache: Promise<LaunchConfig> | null = null;

// The config account is immutable, so one fetch per page load is enough.
export function launchConfig(conn: Connection): Promise<LaunchConfig> {
  configCache ??= client(conn)
    .state.getPoolConfig(DBC_CONFIG)
    .then((c) => {
      if (!c) throw new Error("Launch config not found");
      return {
        startPrice: priceOf(c.sqrtStartPrice),
        graduationPrice: priceOf(c.migrationSqrtPrice),
        threshold: Number(c.migrationQuoteThreshold.toString()) / LAMPORTS_PER_SOL,
        creatorFeeShare: c.creatorTradingFeePercentage / 100,
      };
    })
    .catch((e) => {
      configCache = null;
      throw e;
    });
  return configCache;
}

export async function listLaunches(conn: Connection) {
  return client(conn).state.getPoolsByConfig(DBC_CONFIG);
}

export async function curveStatus(conn: Connection, mint: PublicKey) {
  const dbc = client(conn);
  const pool = dbcPoolFor(mint);
  const state = await dbc.state.getPool(pool);
  if (!state) return null;
  return {
    pool,
    creator: state.poolState.creator,
    graduated: state.poolState.isMigrated === 1,
    progress: await dbc.state.getPoolQuoteTokenCurveProgress(pool),
    raised: Number(state.poolState.quoteReserve.toString()) / LAMPORTS_PER_SOL,
    price: priceOf(state.poolState.sqrtPrice),
  };
}

export async function createTokenTx(conn: Connection, p: { creator: PublicKey; name: string; symbol: string; uri: string }) {
  const mint = Keypair.generate();
  const tx = await client(conn).creator.createPool({
    ...p,
    payer: p.creator,
    poolCreator: p.creator,
    config: DBC_CONFIG,
    baseMint: mint.publicKey,
  });
  return { tx, mint };
}

type SwapInput = { owner: PublicKey; mint: PublicKey; amountIn: BN; buy: boolean; slippageBps?: number };

// PartialFill so the buy that crosses the graduation threshold fills up to it and refunds the rest;
// ExactIn would revert with InsufficientLiquidity.
async function quoteOnCurve(conn: Connection, p: SwapInput) {
  const dbc = client(conn);
  const pool = dbcPoolFor(p.mint);
  const [virtualPool, config] = await Promise.all([dbc.state.getPool(pool), dbc.state.getPoolConfig(DBC_CONFIG)]);
  if (!virtualPool || !config) throw new Error("Pool not found");
  const quote = dbc.pool.swapQuote2({
    virtualPool,
    config,
    swapBaseForQuote: !p.buy,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: await getCurrentPoint(conn, config.activationType),
    slippageBps: p.slippageBps ?? 100,
    swapMode: SwapMode.PartialFill,
    amountIn: p.amountIn,
  });
  return { dbc, pool, quote };
}

// Output in base units: token units when buying, lamports when selling.
export async function curveQuote(conn: Connection, p: SwapInput) {
  const { quote } = await quoteOnCurve(conn, p);
  return quote.outputAmount;
}

export async function curveSwapTx(conn: Connection, p: SwapInput) {
  const { dbc, pool, quote } = await quoteOnCurve(conn, p);
  const tx = await dbc.pool.swap2({
    owner: p.owner,
    pool,
    swapBaseForQuote: !p.buy,
    referralTokenAccount: null,
    swapMode: SwapMode.PartialFill,
    amountIn: p.amountIn,
    minimumAmountOut: quote.minimumAmountOut ?? new BN(0),
  });
  return { tx, quote };
}
