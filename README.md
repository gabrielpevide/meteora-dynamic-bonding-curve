# Diamond Hands

Conviction pools on Meteora. A token launches on a bonding curve. After it graduates, holders lock their tokens as sell orders at the price they believe in, and earn SOL from trading fees while they wait. The lock is enforced by Meteora's DLMM program, not by us.

Built for the Meteora "Best use of Dynamic Bonding Curve" track at the Colosseum Crypto World's Fair.

## How it works

| Phase | Meteora program | What happens |
| --- | --- | --- |
| 1. Curve | DBC | Anyone buys on the bonding curve from the first block. |
| 2. Graduation | DAMM v2 | Liquidity moves to a locked pool where half the LP fees compound back into reserves. |
| 3. Conviction round | DLMM | Before the DLMM pool opens, holders lock tokens as sell orders at 2x, 3x, 5x or 10x the graduation price. |
| 4. Open | DLMM | Locked orders go live. They sell only inside their range; orders still above the price earn SOL from fees. |

### 1. Curve (DBC)

Every launch uses one config, created in [`scripts/spike.mts`](scripts/spike.mts):

- `buildCurveWithMarketCap`. On devnet the curve starts at MC 0.6 SOL and graduates at MC 3 SOL, after 0.93 SOL of buys. Mainnet values are not set yet.
- Exponential fee scheduler: 50% at launch, down to 1% after 120 seconds, plus the dynamic fee. Bots pay for speed.
- `creatorTradingFeePercentage: 50`. The platform's half funds the holder rewards.
- Buys go through `swap2` with `SwapMode.PartialFill`, so the buy that crosses the threshold fills up to it and refunds the rest. With `ExactIn` that buy reverts with `InsufficientLiquidity`.

### 2. Graduation (DAMM v2, compounding)

- `MigrationFeeOption.Customizable` with `MigratedCollectFeeMode.Compounding` and `compoundingFeeBps: 5000`. Half of the LP fees go back into the reserves; the other half stays claimable and funds rewards.
- LP split 50% partner and 50% creator, both permanently locked.

### 3. Conviction round (DLMM)

- Right after graduation, the platform creates a customizable permissionless DLMM pair (TOKEN/SOL, bin step 100, LimitOrder mode, `OnlyY` fees) with an activation point in the future.
- Before activation, a holder opens a position with `initializePositionByOperator` and a `lockReleasePoint`, then deposits single-sided tokens across 30 bins starting at the chosen multiple of the graduation price. The graduation price comes from `migrationSqrtPrice` in the DBC config, so targets don't move with the market.
- The DLMM program enforces the lock: `removeLiquidity` fails with `LiquidityLocked` (6055) until the release point. DLMM only accepts a lock before the pool opens, which is why the round is a launch phase.

### 4. Open

- At activation the locked orders go live. When the price reaches a range, the tokens sell for SOL and the position earns the swap fees.
- A keeper calls `go_to_a_bin` to keep the DLMM active bin next to the DAMM v2 price, so a fill doesn't cross dozens of empty bins and pay the maximum fee. The SDK's `syncWithMarketPrice` passes a bin array that doesn't exist, so [`lib/dlmm.ts`](lib/dlmm.ts) builds the instruction by hand.
- Rewards: platform fees (DBC partner fees and the partner LP position on DAMM v2) are paid in SOL to orders above the price, weighted by size and time. The snapshot and payout job is in progress.

## Devnet run

The whole lifecycle ran on devnet on October 1, 2026, with [`scripts/spike.mts`](scripts/spike.mts) and [`scripts/conviction.mts`](scripts/conviction.mts).

| Step | Transaction |
| --- | --- |
| Create the launch config | [TogeFG…gXM6u](https://explorer.solana.com/tx/TogeFGToxt5H9E7hoXsQXr5sYxbysDSjFjSysBghUU3SCC1fpcW9QQ2Bss6y5JNmaGJXwfnXujdawyAhwjgXM6u?cluster=devnet) |
| Launch the token | [3Nkir…zfdVvx](https://explorer.solana.com/tx/3NkirQMcAvjCvvbaZPdz95tow6GgqxSe5roo24SUjs6G3dkoSm4SsEdn9nxkyDEyT2b8ifeADrnYQ54x3SzfdVvx?cluster=devnet) |
| Last buy, partial fill to the threshold | [2WCvg…CuwC](https://explorer.solana.com/tx/2WCvgGvd62xUPwQ9pm1xAF9SbntEgSRQMaDg24knKxynrg7caPdggYCPrWGJKBTF9XZFRdKgpm6wX4g9rUoDCuwC?cluster=devnet) |
| Graduate to DAMM v2 (compounding) | [3xzzv…jECcA](https://explorer.solana.com/tx/3xzzvYNnG3c8Eo1MCnPzYqybsr3NRn9mQCutrDJYAtMFFwZzJQ9GyK3XKNU8V8eWUfkCwFwcrn2yJqVCw7YjECcA?cluster=devnet) |
| Create the DLMM pool, opening 15 minutes later | [3vaMk…88WqG](https://explorer.solana.com/tx/3vaMku6aNEPijyFtcNAi4S7nutf9Mej2HzqfhNAxAqG2n28YfHupkkTnpiNY96NhsvTyZA6eh2cBYddC3Zm88WqG?cluster=devnet) |
| Lock 20M tokens at 2x: open the locked position | [5SZPr…UbTgh](https://explorer.solana.com/tx/5SZPrxvJWFkCt5MiUrCkaK48Nn7rcTHGL9SpKwiNnzHhnoEiUPGkR2YdE571XQzWpCz7RsmUUufiB9p7GKxUbTgh?cluster=devnet) |
| Lock 20M tokens at 2x: deposit | [5C3Tj…zjj1T](https://explorer.solana.com/tx/5C3TjTNBgznh1Di9EKYesAsF9kYdxzWjjBJVncuLTP12XhviSJaZvmP9px6sBDbpo9pTo64QQiuhaEWYs7gzjj1T?cluster=devnet) |
| Lock 30M tokens at 3x: open and deposit | [NcVyQ…J5a2y](https://explorer.solana.com/tx/NcVyQCSeD8nq4Tt82MxBYT6BBSY2foAFpF5uF3vwoGF7Rpsd7Vk4MgqYgVJ6tT5AUaBUYC8x6vJBWaWEaMJ5a2y?cluster=devnet), [5JHHG…mu14D](https://explorer.solana.com/tx/5JHHGuQmSLVuQkGUiVvQgNitqQg4FAgCCNFqDC3Ab356GJ46QJWCMSCBkFYdarXNPrEigMKktwe8mop5jTm4u14D?cluster=devnet) |
| Early withdrawal attempt | Rejected in simulation with `LiquidityLocked` (6055) |
| Buy on DAMM v2, price to 2.2x | [43f2d…Aa9aJP](https://explorer.solana.com/tx/43f2dSXaz5E65NN34ZZSaTbxz1ycfaHpg87xTzmA9pVB8TDs4u5sRy7Ka9iqj6bmd1vFdt8vcPoqB1mSA5Aa9aJP?cluster=devnet) |
| Keeper: `go_to_a_bin` next to the first order | [22JGf…R7uLGTPV](https://explorer.solana.com/tx/22JGfq3U26FhmMzeVF92BToBtSdsex4dWpdKkQEAe6aQCvSwuj7EToQv8Tm7wwGG3o7J1zuLcPEeaFM7R6uLGTPV?cluster=devnet) |
| A buyer fills the 2x order: 7.7M tokens sold for 0.048 SOL | [28E6v…peNj9](https://explorer.solana.com/tx/28E6vm1Xamv3zWU2NvRh5rhWcSCthdKKYgqz1hA9vW9fyBmVHtxGgqvQ5wD7Fftf8oseGzz8iVMqPC3hUpPmeNj9?cluster=devnet) |

Accounts: config `5WNhv4t2rvkkEmKjTZZWkKEU7GDqcWyaAA6cHZiQKKZN`, mint `EqayHr7zV7jSkwSfVQjFCzn3YiJUFk915ZYoR5jJapDe`, DAMM v2 pool `4PzDW4m8qxYDH6nkpCneMYqeAkYHQc7j5jEszFnxonNp`, DLMM pair `wALjjzyQH1LKXsijEo9YQg5ZStbqKvx1vBaHcvmSE2c`.

## Code map

- [`app/`](app): Next.js 16 pages. Home, `/t/[mint]` (token page in every phase), `/launch`, and `/api/metadata`.
- [`lib/dbc.ts`](lib/dbc.ts): launch config, curve status, quotes, swaps and token launch.
- [`lib/damm.ts`](lib/damm.ts): DAMM v2 price, quotes and swaps.
- [`lib/dlmm.ts`](lib/dlmm.ts): conviction pool, locks, the wall scan, withdrawals and the keeper instruction.
- [`lib/launches.ts`](lib/launches.ts): the token list on the home page.
- [`scripts/`](scripts): the devnet end-to-end run.

## Run it

```bash
pnpm install
```

```bash
pnpm dev
```

Optional `.env.local`:

- `NEXT_PUBLIC_CLUSTER`: `devnet` (default) or `mainnet-beta`.
- `NEXT_PUBLIC_RPC_URL`: the public devnet RPC rate-limits the conviction wall scan; use a dedicated RPC.
- `NEXT_PUBLIC_DBC_CONFIG`: launch config address. Defaults to the devnet config above.

To repeat the devnet run, fund the wallet the first command prints, then go step by step:

```bash
pnpm tsx scripts/spike.mts wallet
```

```bash
pnpm tsx scripts/spike.mts config
```

The remaining steps are `pool`, `buy <sol>`, `status` and `migrate` in `spike.mts`, then `pool <minutes>`, `lock <tokens> <multiple> <minutes>`, `wall`, `withdraw <position>`, `dammbuy <sol>`, `sync` and `dlmmbuy <sol>` in `conviction.mts`.

The scripts keep keypairs in `.keys/`, which is git-ignored. This repository contains no keys or secrets.

## Status

Working on devnet: launch, curve trading with live quotes, graduation into compounding DAMM v2, the conviction round with on-chain locks, fills through the locked orders, and withdrawal after unlock.

Next:

- Rewards: snapshots of orders above the price, and daily SOL payouts from platform fees.
- Image upload for launches. Today the launch form takes an image link and serves the metadata from the URI itself.
- Mainnet launch config.
- Holders who arrive after the round: DLMM limit orders, where cancelling before the deadline forfeits the accrued rewards.
