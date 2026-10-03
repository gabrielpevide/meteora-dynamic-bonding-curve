import * as dlmmPkg from "@meteora-ag/dlmm";
import { NATIVE_MINT } from "@solana/spl-token";
import { Keypair, PublicKey, Transaction, type Connection } from "@solana/web3.js";
import BN from "bn.js";
import { TOKEN_DECIMALS } from "@/lib/dbc";
import { CLUSTER } from "@/lib/solana";

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
// Bundlers hand us the class as `default`; tsx's ESM interop nests it one level deeper.
const interop = dlmmPkg as unknown as { default: typeof dlmmPkg.default & { default?: typeof dlmmPkg.default } };
const DLMM = interop.default.default ?? interop.default;

const opt = { cluster: CLUSTER };
export const BIN_STEP = 100; // 1% per bin: 2x ≈ +70 bins, 3x ≈ +110
export const RANGE_BINS = 30; // each lock sells across ~35% of price above its target
const POSITION_WIDTH = 70; // the SDK hardcodes 70 in initializePositionByOperator but derives the PDA from this value

export const lbPairFor = (mint: PublicKey) =>
  deriveCustomizablePermissionlessLbPair(mint, NATIVE_MINT, new PublicKey(LBCLMM_PROGRAM_IDS[CLUSTER]))[0];
export const binForPrice = (price: number) =>
  DLMM.getBinIdFromPrice(DLMM.getPricePerLamport(TOKEN_DECIMALS, 9, price), BIN_STEP, true);
export const priceOfBin = (binId: number) => Math.pow(1 + BIN_STEP / 10_000, binId) * 10 ** (TOKEN_DECIMALS - 9);

export async function convictionPool(conn: Connection, mint: PublicKey) {
  const lbPair = lbPairFor(mint);
  if (!(await conn.getAccountInfo(lbPair))) return null;
  const dlmm = await DLMM.create(conn, lbPair, opt);
  const opensAt = dlmm.lbPair.activationPoint.toNumber();
  return { dlmm, lbPair, opensAt, isOpen: Date.now() / 1000 >= opensAt };
}

// The conviction round: the pool opens `opensAt`; locks can only be set before that.
// The creator must already hold at least one base unit of the token.
export async function createConvictionPoolTx(
  conn: Connection,
  p: { creator: PublicKey; mint: PublicKey; price: number; opensAt: number },
) {
  return DLMM.createCustomizablePermissionlessLbPair2(
    conn,
    new BN(BIN_STEP),
    p.mint,
    NATIVE_MINT,
    new BN(binForPrice(p.price)),
    new BN(100), // 1% base fee
    ActivationType.Timestamp,
    false,
    p.creator,
    new BN(p.opensAt),
    false,
    ConcreteFunctionType.LimitOrder,
    CollectFeeMode.OnlyY,
    opt,
  );
}

// Step 1 of a lock: an empty position, starting at `targetPrice`, whose liquidity can't be removed before `lockUntil`.
export async function initLockTx(
  conn: Connection,
  p: { owner: PublicKey; mint: PublicKey; targetPrice: number; lockUntil: number },
) {
  const pool = await convictionPool(conn, p.mint);
  if (!pool) throw new Error("The conviction round hasn't started yet");
  if (pool.isOpen) throw new Error("The conviction round is over: locks are only possible before the pool opens");
  const lowerBinId = Math.max(pool.dlmm.lbPair.activeId + 1, binForPrice(p.targetPrice));
  const base = Keypair.generate();
  const tx = await pool.dlmm.initializePositionByOperator({
    lowerBinId: new BN(lowerBinId),
    positionWidth: new BN(POSITION_WIDTH),
    owner: p.owner,
    feeOwner: p.owner,
    operator: p.owner,
    payer: p.owner,
    base: base.publicKey,
    lockReleasePoint: new BN(p.lockUntil),
  });
  const [position] = derivePosition(pool.lbPair, base.publicKey, new BN(lowerBinId), new BN(POSITION_WIDTH), pool.dlmm.program.programId);
  return { tx, base, position, lowerBinId };
}

// Step 2: spread the tokens evenly across the target range, all above the current price.
export async function fundLockTx(
  conn: Connection,
  p: { owner: PublicKey; mint: PublicKey; position: PublicKey; lowerBinId: number; amount: BN },
) {
  const pool = await convictionPool(conn, p.mint);
  if (!pool) throw new Error("Conviction pool not found");
  return pool.dlmm.addLiquidityByStrategy({
    positionPubKey: p.position,
    user: p.owner,
    totalXAmount: p.amount,
    totalYAmount: new BN(0),
    strategy: { minBinId: p.lowerBinId, maxBinId: p.lowerBinId + RANGE_BINS - 1, strategyType: StrategyType.Spot },
    slippage: 1,
  });
}

// After the lock expires: pull tokens and SOL out, claim fees and close the position (rent comes back).
export async function withdrawLockTxs(conn: Connection, p: { owner: PublicKey; mint: PublicKey; position: PublicKey }) {
  const pool = await convictionPool(conn, p.mint);
  if (!pool) throw new Error("Conviction pool not found");
  const { positionData } = await pool.dlmm.getPosition(p.position);
  return pool.dlmm.removeLiquidity({
    user: p.owner,
    position: p.position,
    fromBinId: positionData.lowerBinId,
    toBinId: positionData.upperBinId,
    bps: new BN(10_000),
    shouldClaimAndClose: true,
  });
}

export type WallEntry = {
  position: string;
  owner: string;
  tokensLeft: number; // unsold tokens anywhere in the range
  tokensAbove: number; // unsold tokens above the market price
  solFilled: number; // SOL already received from fills
  lowerPrice: number;
  upperPrice: number;
  lockReleasePoint: number;
};

// Every position in the pool and how much of it still sits above market. ponytail: one getProgramAccounts
// scan per call; cache server-side once traffic matters (mainnet needs a paid RPC for this anyway).
export async function convictionWall(
  conn: Connection,
  pool: NonNullable<Awaited<ReturnType<typeof convictionPool>>>,
  marketPrice: number,
): Promise<WallEntry[]> {
  const { dlmm, lbPair } = pool;
  const pid = dlmm.program.programId;
  const marketBin = binForPrice(marketPrice);
  const [accounts, binArrays] = await Promise.all([
    conn.getProgramAccounts(pid, { filters: [positionV2Filter(), positionLbPairFilter(lbPair)] }),
    dlmm.getBinArrays(),
  ]);
  const arrays = new Map(binArrays.map((b) => [b.publicKey.toBase58(), b.account]));
  return accounts.map(({ pubkey, account }) => {
    const p = wrapPosition(dlmm.program, pubkey, account);
    const shares = p.liquidityShares();
    let x = new BN(0);
    let xAbove = new BN(0);
    let y = new BN(0);
    for (let id = p.lowerBinId().toNumber(), i = 0; id <= p.upperBinId().toNumber(); id++, i++) {
      if (shares[i].isZero()) continue;
      const array = arrays.get(deriveBinArray(lbPair, binIdToBinArrayIndex(new BN(id)), pid)[0].toBase58());
      if (!array) continue;
      const bin = getBinFromBinArray(id, array);
      const binX = shares[i].mul(bin.amountX).div(bin.liquiditySupply);
      x = x.add(binX);
      if (id > marketBin) xAbove = xAbove.add(binX);
      y = y.add(shares[i].mul(bin.amountY).div(bin.liquiditySupply));
    }
    const lower = p.lowerBinId().toNumber();
    return {
      position: pubkey.toBase58(),
      owner: p.owner().toBase58(),
      tokensLeft: x.toNumber() / 10 ** TOKEN_DECIMALS,
      tokensAbove: xAbove.toNumber() / 10 ** TOKEN_DECIMALS,
      solFilled: y.toNumber() / 1e9,
      lowerPrice: priceOfBin(lower),
      upperPrice: priceOfBin(lower + RANGE_BINS - 1),
      lockReleasePoint: p.lockReleasePoint().toNumber(),
    };
  });
}

// Unclaimed swap fees (SOL) per position for one owner; the fee math lives in the SDK.
export async function positionFees(pool: NonNullable<Awaited<ReturnType<typeof convictionPool>>>, owner: PublicKey) {
  const { userPositions } = await pool.dlmm.getPositionsByUserAndLbPair(owner);
  return new Map(userPositions.map((p) => [p.publicKey.toBase58(), Number(p.positionData.feeY.toString()) / 1e9]));
}

// Keeper: walk the active bin toward the DAMM v2 price so fills don't pay the cross-empty-bins fee.
// go_to_a_bin refuses to jump over liquidity, so stop right below the first ask and let swaps fill it.
// The SDK's syncWithMarketPrice passes a nonexistent fromBinArray, hence the hand-built instruction.
export async function syncActiveBinTx(conn: Connection, mint: PublicKey, marketPrice: number, payer: PublicKey) {
  const pool = await convictionPool(conn, mint);
  if (!pool?.isOpen) return null;
  const { dlmm, lbPair } = pool;
  const active = dlmm.lbPair.activeId;
  let target = binForPrice(marketPrice);
  if (target > active) {
    const { bins } = await dlmm.getBinsBetweenLowerAndUpperBound(active + 1, target);
    const firstAsk = bins.find((b) => !new BN(b.xAmount.toString()).isZero());
    if (firstAsk) target = firstAsk.binId - 1;
  }
  if (target === active) return null;
  const pid = dlmm.program.programId;
  const arr = (id: number) => deriveBinArray(lbPair, binIdToBinArrayIndex(new BN(id)), pid)[0];
  const live = async (k: PublicKey) => ((await conn.getAccountInfo(k)) ? k : null);
  const ix = await dlmm.program.methods
    .goToABin(target)
    .accountsPartial({ lbPair, binArrayBitmapExtension: null, fromBinArray: await live(arr(active)), toBinArray: await live(arr(target)) })
    .instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = payer;
  return tx;
}
