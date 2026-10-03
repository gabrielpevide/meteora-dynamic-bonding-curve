// Devnet spike: DBC launch → buy to threshold → migrate into a compounding DAMM v2 pool.
// Usage: pnpm tsx scripts/spike.mts <wallet|config|pool|buy <sol>|status|migrate>
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, type Transaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import BN from "bn.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DammV2DynamicFeeMode,
  DynamicBondingCurveClient,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  SwapMode,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
  deriveDbcPoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

const conn = new Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const dbc = new DynamicBondingCurveClient(conn, "confirmed");

const KEYS = ".keys";
const STATE_FILE = process.env.STATE ?? `${KEYS}/spike-state.json`;
type State = { config?: string; pool?: string; mint?: string };
const state: State = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

function loadOrCreateKeypair(path: string): Keypair {
  if (existsSync(path)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
  mkdirSync(KEYS, { recursive: true });
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}
const admin = loadOrCreateKeypair(`${KEYS}/devnet-admin.json`);

async function send(tx: Transaction, signers: Keypair[]) {
  const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed" });
  console.log(`tx https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  return sig;
}

// Tiny caps so devnet SOL is enough to graduate (~0.93 SOL threshold).
// ponytail: mainnet caps/fees get decided with real numbers, not copied from here.
function convictionConfig() {
  return buildCurveWithMarketCap({
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: 9,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: 1_000_000_000,
      leftover: 0,
    },
    fee: {
      // Anti-sniper: 50% at launch decaying to 1% over 2 minutes.
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
        feeSchedulerParam: { startingFeeBps: 5000, endingFeeBps: 100, numberOfPeriod: 60, totalDuration: 120 },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 50,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      // Half of the LP fees compound back into reserves; the other half stays claimable and funds conviction rewards.
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.Compounding,
        dynamicFee: DammV2DynamicFeeMode.Enabled,
        poolFeeBps: 100,
        compoundingFeeBps: 5000,
      },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 50,
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 50,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: 0.6,
    migrationMarketCap: 3,
  });
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === "wallet") {
  console.log("admin", admin.publicKey.toBase58());
  const bal = await conn.getBalance(admin.publicKey);
  console.log("balance", bal / LAMPORTS_PER_SOL, "SOL");
  if (bal < LAMPORTS_PER_SOL) {
    try {
      const sig = await conn.requestAirdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      console.log("airdropped 2 SOL");
    } catch (e) {
      console.log("airdrop failed, fund this address at https://faucet.solana.com:", (e as Error).message);
    }
  }
} else if (cmd === "config") {
  const configKp = Keypair.generate();
  const params = convictionConfig();
  console.log("migrationQuoteThreshold", Number(params.migrationQuoteThreshold.toString()) / LAMPORTS_PER_SOL, "SOL");
  const tx = await dbc.partner.createConfig({
    ...params,
    config: configKp.publicKey,
    feeClaimer: admin.publicKey,
    leftoverReceiver: admin.publicKey,
    quoteMint: NATIVE_MINT,
    payer: admin.publicKey,
  });
  await send(tx, [admin, configKp]);
  state.config = configKp.publicKey.toBase58();
  save();
  console.log("config", state.config);
} else if (cmd === "pool") {
  if (!state.config) throw new Error("run config first");
  const mintKp = Keypair.generate();
  const tx = await dbc.creator.createPool({
    name: "Conviction Test",
    symbol: "CVT",
    uri: "https://example.com/cvt.json",
    payer: admin.publicKey,
    poolCreator: admin.publicKey,
    config: new PublicKey(state.config),
    baseMint: mintKp.publicKey,
  });
  await send(tx, [admin, mintKp]);
  state.mint = mintKp.publicKey.toBase58();
  state.pool = deriveDbcPoolAddress(NATIVE_MINT, mintKp.publicKey, new PublicKey(state.config)).toBase58();
  save();
  console.log("mint", state.mint, "pool", state.pool);
} else if (cmd === "buy") {
  if (!state.pool) throw new Error("run pool first");
  const lamports = new BN(Math.round(Number(arg ?? "0.1") * LAMPORTS_PER_SOL));
  // PartialFill stops at the migration threshold and refunds the rest; ExactIn reverts with InsufficientLiquidity.
  // ponytail: minimumAmountOut 0 is devnet-only; the app quotes with swapQuote2 + slippage.
  const tx = await dbc.pool.swap2({
    owner: admin.publicKey,
    pool: new PublicKey(state.pool),
    swapMode: SwapMode.PartialFill,
    amountIn: lamports,
    minimumAmountOut: new BN(0),
    swapBaseForQuote: false,
    referralTokenAccount: null,
  });
  await send(tx, [admin]);
} else if (cmd === "status") {
  if (!state.pool) throw new Error("run pool first");
  const pool = await dbc.state.getPool(state.pool);
  const progress = await dbc.state.getPoolQuoteTokenCurveProgress(state.pool);
  const threshold = await dbc.state.getPoolMigrationQuoteThreshold(state.pool);
  console.log({
    quoteReserve: Number(pool?.poolState.quoteReserve.toString()) / LAMPORTS_PER_SOL,
    threshold: Number(threshold.toString()) / LAMPORTS_PER_SOL,
    progress,
    isMigrated: pool?.poolState.isMigrated,
  });
} else if (cmd === "migrate") {
  if (!state.pool) throw new Error("run pool first");
  const { transaction, firstPositionNftKeypair, secondPositionNftKeypair } = await dbc.migration.migrateToDammV2({
    payer: admin.publicKey,
    pool: new PublicKey(state.pool),
    dammConfig: DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable],
  });
  await send(transaction, [admin, firstPositionNftKeypair, secondPositionNftKeypair]);
} else {
  console.log("usage: spike.mts <wallet|config|pool|buy <sol>|status|migrate>");
}
