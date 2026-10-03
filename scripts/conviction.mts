// Devnet spike, part 2: DLMM conviction round on top of the graduated DAMM v2 pool from spike.mts.
// Usage: pnpm tsx scripts/conviction.mts <damm|pool [minutes]|lock <tokens> <multiple> <lockMinutes>|wall|sync|withdraw <position>|dammbuy <sol>|dlmmbuy <sol>>
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, type Transaction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { readFileSync, writeFileSync } from "node:fs";
import { CpAmm, getPriceFromSqrtPrice } from "@meteora-ag/cp-amm-sdk";
import { DAMM_V2_MIGRATION_FEE_ADDRESS, MigrationFeeOption, deriveDammV2PoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import * as dlmmPkg from "@meteora-ag/dlmm";

const {
  ActivationType,
  CollectFeeMode,
  ConcreteFunctionType,
  LBCLMM_PROGRAM_IDS,
  StrategyType,
  binIdToBinArrayIndex,
  deriveBinArray,
  deriveCustomizablePermissionlessLbPair,
  derivePosition,
  getBinFromBinArray,
  positionLbPairFilter,
  positionV2Filter,
  wrapPosition,
} = dlmmPkg;
// The package's default export is the DLMM class under tsx's ESM interop.
const interop = dlmmPkg as unknown as { default: typeof dlmmPkg.default & { default?: typeof dlmmPkg.default } };
const DLMM = interop.default.default ?? interop.default;

const conn = new Connection(process.env.RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const opt = { cluster: "devnet" as const };
const cpAmm = new CpAmm(conn);

const STATE_FILE = process.env.STATE ?? ".keys/spike-state.json";
const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as { mint: string; lbPair?: string };
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(".keys/devnet-admin.json", "utf8"))));

const mint = new PublicKey(state.mint);
const TOKEN_DECIMALS = 6;
const BIN_STEP = 100; // 1% per bin: 2x ≈ +70 bins, 3x ≈ +110
const RANGE_BINS = 30; // each lock spreads over ~35% of price above its target
const dammPool = deriveDammV2PoolAddress(DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable], mint, NATIVE_MINT);

async function send(tx: Transaction, signers: Keypair[]) {
  const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed" });
  console.log(`tx https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

// SOL per whole token on the graduated DAMM v2 pool: the reference price for every target and reward.
async function marketPrice() {
  const s = await cpAmm.fetchPoolState(dammPool);
  return getPriceFromSqrtPrice(s.sqrtPrice, TOKEN_DECIMALS, 9).toNumber();
}
const binForPrice = (price: number) => DLMM.getBinIdFromPrice(DLMM.getPricePerLamport(TOKEN_DECIMALS, 9, price), BIN_STEP, true);
const binsForMultiple = (m: number) => Math.round(Math.log(m) / Math.log(1 + BIN_STEP / 10_000));

function lbPair() {
  if (!state.lbPair) throw new Error("run `pool` first");
  return new PublicKey(state.lbPair);
}

const [cmd, a1, a2, a3] = process.argv.slice(2);
const now = Math.floor(Date.now() / 1000);

if (cmd === "damm") {
  const s = await cpAmm.fetchPoolState(dammPool);
  console.log({
    dammPool: dammPool.toBase58(),
    collectFeeMode: s.collectFeeMode,
    priceSolPerToken: await marketPrice(),
    liquidity: s.liquidity.toString(),
  });
} else if (cmd === "pool") {
  // Conviction round: the pool opens `minutes` from now; locks can only be set before that.
  const minutes = Number(a1 ?? "15");
  const price = await marketPrice();
  const activeId = binForPrice(price);
  const tx = await DLMM.createCustomizablePermissionlessLbPair2(
    conn,
    new BN(BIN_STEP),
    mint,
    NATIVE_MINT,
    new BN(activeId),
    new BN(100), // 1% base fee
    ActivationType.Timestamp,
    false,
    admin.publicKey,
    new BN(now + minutes * 60),
    false,
    ConcreteFunctionType.LimitOrder,
    CollectFeeMode.OnlyY,
    opt,
  );
  await send(tx, [admin]);
  state.lbPair = deriveCustomizablePermissionlessLbPair(mint, NATIVE_MINT, new PublicKey(LBCLMM_PROGRAM_IDS.devnet))[0].toBase58();
  save();
  console.log({ lbPair: state.lbPair, activeId, price, opensAt: new Date((now + minutes * 60) * 1000).toISOString() });
} else if (cmd === "lock") {
  const tokens = Number(a1 ?? "1000000");
  const multiple = Number(a2 ?? "2");
  const lockMinutes = Number(a3 ?? "60");
  const dlmm = await DLMM.create(conn, lbPair(), opt);
  const target = binForPrice(await marketPrice()) + binsForMultiple(multiple);
  const lower = Math.max(dlmm.lbPair.activeId + 1, target);
  const base = Keypair.generate();
  // positionWidth must be 70: the SDK hardcodes 70 in the instruction but derives the PDA from this value.
  const init = await dlmm.initializePositionByOperator({
    lowerBinId: new BN(lower),
    positionWidth: new BN(70),
    owner: admin.publicKey,
    feeOwner: admin.publicKey,
    operator: admin.publicKey,
    payer: admin.publicKey,
    base: base.publicKey,
    lockReleasePoint: new BN(now + lockMinutes * 60),
  });
  await send(init, [admin, base]);
  const [position] = derivePosition(lbPair(), base.publicKey, new BN(lower), new BN(70), dlmm.program.programId);
  const add = await dlmm.addLiquidityByStrategy({
    positionPubKey: position,
    user: admin.publicKey,
    totalXAmount: new BN(tokens).mul(new BN(10 ** TOKEN_DECIMALS)),
    totalYAmount: new BN(0),
    strategy: { minBinId: lower, maxBinId: lower + RANGE_BINS - 1, strategyType: StrategyType.Spot },
    slippage: 1,
  });
  await send(add, [admin]);
  console.log({ position: position.toBase58(), bins: [lower, lower + RANGE_BINS - 1], unlocksAt: new Date((now + lockMinutes * 60) * 1000).toISOString() });
} else if (cmd === "wall") {
  const dlmm = await DLMM.create(conn, lbPair(), opt);
  const pid = dlmm.program.programId;
  const marketBin = binForPrice(await marketPrice());
  const accounts = await conn.getProgramAccounts(pid, { filters: [positionV2Filter(), positionLbPairFilter(lbPair())] });
  const arrays = new Map((await dlmm.getBinArrays()).map((b) => [b.publicKey.toBase58(), b.account]));
  for (const { pubkey, account } of accounts) {
    const p = wrapPosition(dlmm.program, pubkey, account);
    const shares = p.liquidityShares();
    let xAbove = new BN(0);
    for (let id = p.lowerBinId().toNumber(), i = 0; id <= p.upperBinId().toNumber(); id++, i++) {
      if (id <= marketBin || shares[i].isZero()) continue;
      const array = arrays.get(deriveBinArray(lbPair(), binIdToBinArrayIndex(new BN(id)), pid)[0].toBase58());
      if (!array) continue;
      const bin = getBinFromBinArray(id, array);
      xAbove = xAbove.add(shares[i].mul(bin.amountX).div(bin.liquiditySupply));
    }
    console.log({
      position: pubkey.toBase58(),
      owner: p.owner().toBase58(),
      tokensAboveMarket: xAbove.toNumber() / 10 ** TOKEN_DECIMALS,
      lockReleasePoint: p.lockReleasePoint().toString(),
    });
  }
  console.log({ marketBin, activeId: dlmm.lbPair.activeId });
} else if (cmd === "sync") {
  // Keeper: walk the DLMM active bin to the DAMM v2 price so fills don't pay the cross-empty-bins fee.
  // SDK's syncWithMarketPrice passes a nonexistent fromBinArray, so build the instruction directly.
  const dlmm = await DLMM.create(conn, lbPair(), opt);
  const pid = dlmm.program.programId;
  let marketBin = binForPrice(await marketPrice());
  // go_to_a_bin refuses to jump over liquidity, so when the market is past the first ask, stop right below it
  // and let the next swap fill the asks in price order.
  if (marketBin > dlmm.lbPair.activeId) {
    const { bins } = await dlmm.getBinsBetweenLowerAndUpperBound(dlmm.lbPair.activeId + 1, marketBin);
    const firstAsk = bins.find((b) => !new BN(b.xAmount.toString()).isZero());
    if (firstAsk) marketBin = firstAsk.binId - 1;
  }
  if (marketBin === dlmm.lbPair.activeId) {
    console.log("already in sync at", marketBin);
    process.exit(0);
  }
  const arr = (id: number) => deriveBinArray(lbPair(), binIdToBinArrayIndex(new BN(id)), pid)[0];
  const live = async (k: PublicKey) => ((await conn.getAccountInfo(k)) ? k : null);
  const ix = await dlmm.program.methods
    .goToABin(marketBin)
    .accountsPartial({
      lbPair: lbPair(),
      binArrayBitmapExtension: null,
      fromBinArray: await live(arr(dlmm.lbPair.activeId)),
      toBinArray: await live(arr(marketBin)),
    })
    .instruction();
  const { Transaction } = await import("@solana/web3.js");
  await send(new Transaction().add(ix), [admin]);
  console.log({ from: dlmm.lbPair.activeId, to: marketBin });
} else if (cmd === "withdraw") {
  // Must fail with LiquidityLocked (6055) until the lock release point.
  const dlmm = await DLMM.create(conn, lbPair(), opt);
  const position = new PublicKey(a1);
  const p = await dlmm.getPosition(position);
  const txs = await dlmm.removeLiquidity({
    user: admin.publicKey,
    position,
    fromBinId: p.positionData.lowerBinId,
    toBinId: p.positionData.upperBinId,
    bps: new BN(10_000),
    shouldClaimAndClose: true,
  });
  for (const tx of txs) await send(tx, [admin]);
} else if (cmd === "dammbuy") {
  // Pushes the market price up on DAMM v2, as a real buyer would.
  const s = await cpAmm.fetchPoolState(dammPool);
  const tx = await cpAmm.swap({
    payer: admin.publicKey,
    pool: dammPool,
    inputTokenMint: NATIVE_MINT,
    outputTokenMint: mint,
    amountIn: new BN(Math.round(Number(a1 ?? "0.1") * LAMPORTS_PER_SOL)),
    minimumAmountOut: new BN(0), // ponytail: devnet-only; the app quotes with getQuote + slippage
    tokenAMint: s.tokenAMint,
    tokenBMint: s.tokenBMint,
    tokenAVault: s.tokenAVault,
    tokenBVault: s.tokenBVault,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    referralTokenAccount: null,
  });
  await send(tx, [admin]);
  console.log({ priceSolPerToken: await marketPrice() });
} else if (cmd === "dlmmbuy") {
  // Buys through the DLMM asks, filling locked positions in price order.
  const dlmm = await DLMM.create(conn, lbPair(), opt);
  const inAmount = new BN(Math.round(Number(a1 ?? "0.05") * LAMPORTS_PER_SOL));
  const binArrays = await dlmm.getBinArrayForSwap(false, 10);
  const quote = dlmm.swapQuote(inAmount, false, new BN(100), binArrays);
  const tx = await dlmm.swap({
    inToken: NATIVE_MINT,
    outToken: mint,
    inAmount,
    minOutAmount: quote.minOutAmount,
    lbPair: lbPair(),
    user: admin.publicKey,
    binArraysPubkey: quote.binArraysPubkey,
  });
  await send(tx, [admin]);
  console.log({ outTokens: quote.outAmount.toNumber() / 10 ** TOKEN_DECIMALS, fee: quote.fee.toString() });
} else {
  console.log("usage: conviction.mts <damm|pool [minutes]|lock <tokens> <multiple> <lockMinutes>|wall|sync|dammbuy <sol>|dlmmbuy <sol>>");
}
