// Keeper. Railway runs it every 5 minutes and it exits. For every launch on our config:
//  1. a curve that reached its threshold graduates into DAMM v2;
//  2. a token that just graduated gets its conviction round: a DLMM pool that opens ROUND seconds later;
//  3. once the round is open, the DLMM active bin follows the DAMM v2 price;
//  4. locked tokens above the price accrue reward weight (tokens × seconds) for their owner, and every
//     PAYOUT_EVERY seconds the platform's fees for that token are claimed and paid out in SOL by weight.
// Env: KEEPER_KEY (secret key as a JSON array; must be the launch config's fee claimer), KEEPER_DB_SECRET,
// NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_KEY. PAYOUT_EVERY (seconds) defaults
// to one day; lower it only for demos.
import { CpAmm, getUnClaimLpFee } from "@meteora-ag/cp-amm-sdk";
import { DAMM_V2_MIGRATION_FEE_ADDRESS, DynamicBondingCurveClient, MigrationFeeOption } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import BN from "bn.js";
import { dammPoolFor, dammSwapTx, marketPrice } from "../lib/damm";
import { DBC_CONFIG, listLaunches } from "../lib/dbc";
import { convictionPool, convictionWall, createConvictionPoolTx, syncActiveBinTx } from "../lib/dlmm";
import { supabase } from "../lib/rewards";
import { CLUSTER, connection as conn } from "../lib/solana";

const ROUND = CLUSTER === "devnet" ? 30 * 60 : 24 * 3600; // how long holders have to lock before the pool opens
const PAYOUT_EVERY = Number(process.env.PAYOUT_EVERY ?? 24 * 3600);
const MIN_PAYOUT = 1_000_000; // lamports. Smaller shares roll over; it also covers rent if a wallet is empty.
const BATCH = 20; // transfers per transaction

const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.KEEPER_KEY ?? "[]")));
const dbc = new DynamicBondingCurveClient(conn, "confirmed");
const cpAmm = new CpAmm(conn);
const now = () => Math.floor(Date.now() / 1000);
const send = (tx: Transaction, signers: Keypair[] = []) =>
  sendAndConfirmTransaction(conn, tx, [keeper, ...signers], { commitment: "confirmed" });
const rpc = (fn: string, args: object) => supabase(`rpc/${fn}`, { secret: process.env.KEEPER_DB_SECRET, ...args });
type Round = NonNullable<Awaited<ReturnType<typeof convictionPool>>>;

async function graduate(curvePool: PublicKey) {
  const { transaction, firstPositionNftKeypair, secondPositionNftKeypair } = await dbc.migration.migrateToDammV2({
    payer: keeper.publicKey,
    pool: curvePool,
    dammConfig: DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable],
  });
  return send(transaction, [firstPositionNftKeypair, secondPositionNftKeypair]);
}

// DLMM only lets a holder of the token create its pool, so the keeper buys a crumb first.
async function openRound(mint: PublicKey) {
  const held = await conn.getTokenAccountBalance(getAssociatedTokenAddressSync(mint, keeper.publicKey)).catch(() => null);
  if (!held || held.value.amount === "0") {
    const { tx } = await dammSwapTx(conn, { owner: keeper.publicKey, mint, amountIn: new BN(100_000), buy: true });
    await send(tx);
  }
  const price = await marketPrice(conn, mint);
  return send(await createConvictionPoolTx(conn, { creator: keeper.publicKey, mint, price, opensAt: now() + ROUND }));
}

// Weight goes only to orders that are still locked, for their tokens above the price.
async function accrue(mint: PublicKey, round: Round, price: number) {
  const t = now();
  const tokens = new Map<string, number>();
  for (const e of await convictionWall(conn, round, price)) {
    if (e.lockReleasePoint > t && e.tokensAbove > 0) tokens.set(e.owner, (tokens.get(e.owner) ?? 0) + e.tokensAbove);
  }
  await rpc("dh_accrue", { p_mint: mint.toBase58(), p_rows: [...tokens].map(([owner, n]) => ({ owner, tokens: n })) });
}

// The platform's fees for this token, in SOL: its share of the curve's trading fees, and the fees on its
// locked LP in the DAMM v2 pool.
async function claimFees(mint: PublicKey, curvePool: PublicKey) {
  let lamports = 0;
  const { current } = await dbc.state.getPoolFeeMetrics(curvePool);
  if (!current.partnerQuoteFee.isZero()) {
    const tx = await dbc.partner.claimPartnerTradingFee({
      feeClaimer: keeper.publicKey,
      payer: keeper.publicKey,
      pool: curvePool,
      maxBaseAmount: current.partnerBaseFee,
      maxQuoteAmount: current.partnerQuoteFee,
    });
    console.log(mint.toBase58(), "claimed curve fees", await send(tx));
    lamports += Number(current.partnerQuoteFee.toString());
  }
  const pool = dammPoolFor(mint);
  const state = await cpAmm.fetchPoolState(pool);
  for (const p of await cpAmm.getUserPositionByPool(pool, keeper.publicKey)) {
    const { feeTokenB } = getUnClaimLpFee(state, p.positionState);
    if (feeTokenB.isZero()) continue;
    const tx = await cpAmm.claimPositionFee({
      owner: keeper.publicKey,
      position: p.position,
      pool,
      positionNftAccount: p.positionNftAccount,
      tokenAMint: state.tokenAMint,
      tokenBMint: state.tokenBMint,
      tokenAVault: state.tokenAVault,
      tokenBVault: state.tokenBVault,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
    });
    console.log(mint.toBase58(), "claimed LP fees", await send(tx));
    lamports += Number(feeTokenB.toString());
  }
  return lamports;
}

async function payout(mint: PublicKey, curvePool: PublicKey) {
  const key = mint.toBase58();
  const [round] = await supabase<{ paid_at: string; owed: number }[]>(`dh_rounds?mint=eq.${key}&select=paid_at,owed`);
  if (!round || Date.parse(round.paid_at) / 1000 + PAYOUT_EVERY > now()) return;
  const claimed = await claimFees(mint, curvePool);
  await rpc("dh_claimed", { p_mint: key, p_lamports: claimed });
  const owed = Number(round.owed) + claimed;
  const weights = await supabase<{ owner: string; weight: number }[]>(`dh_accruals?mint=eq.${key}&weight=gt.0&select=owner,weight`);
  const total = weights.reduce((s, w) => s + w.weight, 0);
  if (!total) return;
  const shares = weights
    .map((w) => ({ owner: w.owner, lamports: Math.floor((owed * w.weight) / total) }))
    .filter((s) => s.lamports >= MIN_PAYOUT);
  for (let i = 0; i < shares.length; i += BATCH) {
    const batch = shares.slice(i, i + BATCH);
    const tx = new Transaction().add(
      ...batch.map((s) => SystemProgram.transfer({ fromPubkey: keeper.publicKey, toPubkey: new PublicKey(s.owner), lamports: s.lamports })),
    );
    const signature = await send(tx);
    await rpc("dh_paid", { p_mint: key, p_signature: signature, p_rows: batch });
    console.log(key, `paid ${batch.length} holders`, signature);
  }
}

const config = await dbc.state.getPoolConfig(DBC_CONFIG);
if (!config) throw new Error("Launch config not found");
for (const { publicKey: curvePool, account } of await listLaunches(conn)) {
  const s = account.poolState;
  const mint = s.baseMint;
  try {
    if (s.isMigrated !== 1) {
      if (s.quoteReserve.gte(config.migrationQuoteThreshold)) console.log(mint.toBase58(), "graduated", await graduate(curvePool));
      continue;
    }
    const round = await convictionPool(conn, mint);
    if (!round) {
      console.log(mint.toBase58(), "opened the conviction round", await openRound(mint));
      continue;
    }
    if (!round.isOpen) continue;
    const price = await marketPrice(conn, mint);
    const sync = await syncActiveBinTx(conn, mint, price, keeper.publicKey);
    if (sync) console.log(mint.toBase58(), "moved the active bin", await send(sync));
    await accrue(mint, round, price);
    await payout(mint, curvePool);
  } catch (e) {
    console.error(mint.toBase58(), e instanceof Error ? e.message : e);
  }
}
process.exit(0); // web3.js keeps a websocket open after confirmations
