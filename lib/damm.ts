import { CpAmm, getPriceFromSqrtPrice } from "@meteora-ag/cp-amm-sdk";
import { DAMM_V2_MIGRATION_FEE_ADDRESS, MigrationFeeOption, deriveDammV2PoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { type Connection, type PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { TOKEN_DECIMALS } from "@/lib/dbc";

// Graduated pools land on the customizable DAMM v2 config (compounding fees), with the token as A and SOL as B.
export const dammPoolFor = (mint: PublicKey) =>
  deriveDammV2PoolAddress(DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable], mint, NATIVE_MINT);

// SOL per whole token. Every conviction target and reward is measured against this price.
export async function marketPrice(conn: Connection, mint: PublicKey) {
  const state = await new CpAmm(conn).fetchPoolState(dammPoolFor(mint));
  return getPriceFromSqrtPrice(state.sqrtPrice, TOKEN_DECIMALS, 9).toNumber();
}

type SwapInput = { owner: PublicKey; mint: PublicKey; amountIn: BN; buy: boolean; slippageBps?: number };

async function quoteOnDamm(conn: Connection, p: SwapInput) {
  const cpAmm = new CpAmm(conn);
  const pool = dammPoolFor(p.mint);
  const state = await cpAmm.fetchPoolState(pool);
  const slot = await conn.getSlot();
  const blockTime = (await conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
  const quote = cpAmm.getQuote({
    inAmount: p.amountIn,
    inputTokenMint: p.buy ? NATIVE_MINT : p.mint,
    slippage: (p.slippageBps ?? 100) / 100,
    poolState: state,
    currentTime: blockTime,
    currentSlot: slot,
    tokenADecimal: TOKEN_DECIMALS,
    tokenBDecimal: 9,
  });
  return { cpAmm, pool, state, quote };
}

// Output in base units: token units when buying, lamports when selling.
export async function dammQuote(conn: Connection, p: SwapInput) {
  const { quote } = await quoteOnDamm(conn, p);
  return quote.swapOutAmount;
}

export async function dammSwapTx(conn: Connection, p: SwapInput) {
  const { cpAmm, pool, state, quote } = await quoteOnDamm(conn, p);
  const tx = await cpAmm.swap({
    payer: p.owner,
    pool,
    inputTokenMint: p.buy ? NATIVE_MINT : p.mint,
    outputTokenMint: p.buy ? p.mint : NATIVE_MINT,
    amountIn: p.amountIn,
    minimumAmountOut: quote.minSwapOutAmount,
    tokenAMint: state.tokenAMint,
    tokenBMint: state.tokenBMint,
    tokenAVault: state.tokenAVault,
    tokenBVault: state.tokenBVault,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    referralTokenAccount: null,
    poolState: state,
  });
  return { tx, quote };
}
