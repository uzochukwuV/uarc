# MetaYieldVault — Design Document

**AutonomYield: The Self-Driving Yield Engine on BNB Chain**

---

## Overview

MetaYieldVault is a fully autonomous ERC4626 yield vault that manages USDT across three yield layers on BNB Chain — AsterDEX Earn, PancakeSwap LP + MasterChef farming, and an Aster Perps delta-neutral hedge — without any human operator in the execution path.

It is paired with **TaskerOnChain**, a permissionless on-chain keeper network, which provides scheduled automation when the vault is idle. Together they form a complete self-driving yield infrastructure.

---

## Main Features

### 1. Three-Layer Yield Architecture

| Layer | Protocol | Mechanism | Yield Source |
|---|---|---|---|
| Stable Earn | AsterDEX | USDT → USDF → asUSDF | asUSDF exchange rate appreciation (6–9% base APY) |
| LP + Farm | PancakeSwap V2 | USDT → CAKE/WBNB LP → MasterChef V2 | Trading fees + CAKE emissions |
| Perp Hedge | Aster Perps | BNB short (collateralised by USDT) | Delta-neutral: neutralises BNB price risk on LP leg |

### 2. APR-Proportional Dynamic Allocation

Capital is not split at a fixed 60/40 ratio. After each harvest cycle, the vault observes the live APRs of both legs and reweights capital proportionally:

```
targetEarnBps = earnAprBps / (earnAprBps + lpAprBps) × available
```

This means in bull markets (high LP yield), more capital flows to PancakeSwap. In low-volatility periods (high stable yield), more flows to asUSDF. Allocation bounds (`minEarnBps`, `maxEarnBps`) prevent extreme concentration.

### 3. Autonomous Regime Switching

The vault reads BNB spot price from PancakeSwap's WBNB/USDT pool on every deposit and withdrawal. Three operating modes:

| Regime | Trigger | Allocation Bias |
|---|---|---|
| `NORMAL` | Price stable, no clear APR winner | APR-proportional |
| `DEFENSIVE` | BNB price moved ≥ 3% since last check | 80% to stable asUSDF earn |
| `AGGRESSIVE` | BNB stable + LP APR > Earn APR | 70% to LP + farm |

A hysteresis band (middle third) prevents regime thrashing on marginal price moves.

### 4. Gas-Gated Auto-Harvest

Harvest fires automatically on every deposit and withdrawal (via `_maybeHarvest()`), but only if gas-profitable:

```
CAKE value must cover 3× the estimated gas cost
```

Gas cost is computed on-chain using `block.basefee` and the current BNB/USDT price — no off-chain oracle required. Unprofitable harvests are silently skipped; the deposit still completes normally.

### 5. Non-Custodial ERC4626 Shares

Users receive `MYV` shares representing their proportional claim on the vault's NAV. As yield accrues, each share is worth more USDT. The vault never holds user funds in an admin-controlled address — all positions are held directly by the vault contract.

### 6. TaskerOnChain Keeper Integration

`MetaYieldVaultKeeperAdapter` bridges the vault to the TaskerOnChain keeper network. Two on-chain tasks are registered at deployment:

- **HARVEST task** — calls `harvest()` if `shouldHarvest()` returns true (hourly cadence)
- **REBALANCE task** — calls `rebalance()` if allocation has drifted from target (daily cadence)

Any staked executor can call these tasks and earn BNB micro-rewards. The vault itself needs no admin to operate.

### 7. Permissionless Execution

Both `harvest()` and `rebalance()` are public, `nonReentrant` functions with no access control. Anyone can call them at any time. The keeper network provides scheduling; it is not a gatekeeper.

---

## 1. Why It Was Designed This Way

Most yield vaults require an operator: someone to press "harvest", someone to rebalance, someone to respond when volatility spikes. The moment the operator is offline, yield bleeds.

MetaYieldVault removes the operator entirely from the execution path. Every deposit triggers a harvest check and a volatility check inline — no external scheduler needed, no keeper dependency for day-to-day operation. The keeper network (TaskerOnChain) exists as an optional supplementary layer, not as a load-bearing dependency.

The second motivation was capital efficiency. Fixed allocation vaults leave yield on the table: when one strategy outperforms, the vault keeps funding the laggard at the same ratio. MetaYieldVault observes live APRs on every harvest cycle and shifts capital toward whichever leg is winning, within owner-set bounds.

Third: resilience under stress. LP positions carry BNB price exposure. During volatility events, a vault that continues depositing 40% into a CAKE/WBNB LP is actively destroying NAV. MetaYieldVault detects BNB price moves on-chain, switches to DEFENSIVE regime, and reroutes new capital to the stable-yield asUSDF leg automatically.

---

## 2. Core Strategy and Execution Logic

### Capital Flow

```
User deposits USDT
        │
        ▼
  MetaYieldVault (ERC4626, MYV shares)
        │
   ┌────┴────────────────────────┐
   │ 5% buffer (liquid USDT)     │  small withdrawals never touch LP
   └────┬────────────────────────┘
        │
   ┌────┴────────────────────────────────────────────────────┐
   │                                                         │
   ▼ earnBps (default 60%)                      lpBps (default 35%)
   │                                                         │
   │  AsterDEXEarnAdapter                    PancakeSwap Flow
   │  USDT → USDF (AsterDEX swap)            ├── USDT/2 → CAKE  (PancakeRouter)
   │  USDF → asUSDF (SimpleEarn deposit)     ├── USDT/2 → WBNB  (PancakeRouter)
   │  asUSDF held in vault                   ├── addLiquidity(CAKE, WBNB) → LP token
   │  Yield: exchange rate appreciation      └── MasterChef V2.deposit(pool=2, LP)
   │  6–9% base APY                               Yield: CAKE emissions
   │                                         │
   └─────────────────┬───────────────────────┘
                     │
              harvest() [permissionless]
              ├── MasterChef.deposit(0) → harvest CAKE
              ├── PancakeRouter.swap CAKE → USDT
              ├── _allocate(usdtReceived)     [redeployed per regime]
              ├── _updateAprTracking()        [observe new CAKE/USDT rate]
              └── _autoAdjustAllocation()     [update earnBps / lpBps state]

              rebalance() [permissionless]
              ├── Measure current earnValue vs lpValue
              ├── If drift >= 5%: unwind overweight leg
              └── Reallocate to target via _computeTargetAlloc()
```

### Allocation Logic (`_computeTargetAlloc`)

```
if dynamicAlloc = false  →  return (earnBps, lpBps)  [static, backward-compatible]

available = 10000 - bufferBps    // deployable basis points

if regime = DEFENSIVE:    targetEarnBps = available × 80%
if regime = AGGRESSIVE:   targetEarnBps = available × 30%
if regime = NORMAL:       targetEarnBps = earnAprBps / (earnAprBps + lpAprBps) × available

clamp to [minEarnBps, maxEarnBps]
targetLpBps = available - targetEarnBps
```

### Harvest Logic

`harvest()` is public. `_maybeHarvest()` is the internal hook on every deposit/withdrawal.

```
pending = MasterChef.pendingCake(pool=2, vault)
if pending < minHarvestCake  →  skip

cakeValueUsdt = PancakeRouter.getAmountsOut(pending, [CAKE, USDT])
gasPrice      = block.basefee + 1 gwei   (fallback: 5 gwei on legacy chains)
bnbCostWei    = gasPrice × 350_000
gasCostUsdt   = bnbCostWei × BNB_price_USDT / 1e18

execute only if: cakeValueUsdt × 100 >= gasCostUsdt × 300
                 (CAKE value must cover ≥ 3× the estimated gas cost)
```

When profitable:
```
1. farmAdapter.execute(HARVEST, pool=2)         → CAKE lands in vault
2. PancakeRouter.swapExactTokensForTokens       → CAKE → USDT
3. _allocate(usdtReceived)                      → redeploy per _computeTargetAlloc
4. _updateAprTracking()                         → record new USDT-per-CAKE rate
5. _autoAdjustAllocation()                      → nudge earnBps/lpBps toward optimal
6. emit AutoHarvested(cake, usdt)
```

### Regime Switching

```
currentBnbPrice = PancakeRouter.getAmountsOut(1 BNB, [WBNB, USDT])

volatilityBps = |currentBnbPrice - lastBnbPrice| × 10000 / lastBnbPrice

if volatilityBps >= 300 (3%):      newRegime = DEFENSIVE
elif volatilityBps <= 100 (1%):    newRegime = AGGRESSIVE  (if lpAprBps > earnAprBps)
                                               NORMAL       (otherwise)
else:                               hold current regime  ← hysteresis, prevents thrashing

lastBnbPrice = currentBnbPrice
emit RegimeSwitched(newRegime, volatilityBps)  [if changed]
```

---

## 3. PancakeSwap Integration

### LP Provision (PancakeSwapV2LPAdapter)

The LP adapter wraps PancakeSwap V2's `IUniswapV2Router02` interface with action-encoded calls:

| Action | Flow | Key parameters |
|---|---|---|
| `ADD_LIQUIDITY` | `router.addLiquidity(CAKE, WBNB, amtA, amtB, minA, minB, recipient, deadline)` | Slippage set by `slippageBps` (default 50 = 0.5%) |
| `REMOVE_LIQUIDITY` | `router.removeLiquidity(CAKE, WBNB, liquidity, minA, minB, recipient, deadline)` | LP token transferred to adapter before call |
| `SWAP_EXACT_IN` | `router.swapExactTokensForTokens(amtIn, minOut, path, recipient, deadline)` | Used for CAKE→USDT during harvest |

The vault splits the LP allocation 50/50: half USDT is swapped to CAKE, half to WBNB, then both are deposited as liquidity. This avoids relying on an exact pool ratio — any excess token is returned to the vault as buffer.

### MasterChef V2 Farming (PancakeSwapFarmAdapter)

| Action | MasterChef call | Notes |
|---|---|---|
| `DEPOSIT` | `masterChef.deposit(poolId, amount)` | Stakes LP token; auto-harvests CAKE if pending |
| `WITHDRAW` | `masterChef.withdraw(poolId, amount)` | Unstakes LP; CAKE auto-sent to vault |
| `HARVEST` | `masterChef.deposit(poolId, 0)` | Zero-deposit trick: claims pending CAKE without staking |

Pool ID 2 = CAKE/WBNB pool on BSC mainnet MasterChef V2.

Pending CAKE is queryable via:
```solidity
IMasterChefV2View(MASTERCHEF_V2).pendingCake(CAKE_WBNB_POOL, address(this))
```

This is the primary yield signal used by `_shouldHarvest()` before committing any gas.

### NAV Accounting for LP

Total assets includes the LP position's value:
```
lpTokensStaked   = MasterChef.userInfo(pool=2, vault).amount
lpTotalSupply    = CAKE_WBNB_LP.totalSupply()
(cakeReserve, wbnbReserve) = CAKE_WBNB_LP.getReserves()

lpValueUsdt = (cakeReserve × cakePrice + wbnbReserve × bnbPrice)
              × lpTokensStaked / lpTotalSupply
```

---

## 4. Delta-Neutral Hedge (Aster Perps)

### Why Hedge

The CAKE/WBNB LP position has embedded BNB price exposure. If BNB drops 20%, the LP value falls even if the fee APR remains constant. A short BNB position on Aster Perps offsets this exposure — the vault earns from both LP fees and the short P&L during drawdowns.

### Interface

Aster Perps exposes a Diamond proxy (`TradingPortalFacet`) at `0x5553F3B5E2fAD83edA4031a3894ee59e25ee90bF` on BSC mainnet. The vault interacts via `IAsterPerp`:

```solidity
// Open a short BNB position (delta-neutral hedge on LP leg)
IAsterPerp(asterPerpRouter).openMarketTrade(OpenDataInput {
    pairBase   : WBNB,
    isLong     : false,       // SHORT — we are already long BNB via LP
    tokenIn    : USDT,        // collateral in USDT
    amountIn   : collateral,  // sized as lpValue × hedgeBps / 10000
    qty        : qty_1e10,    // qty = collateral_1e18 / bnbPrice_1e8
    price      : 0,           // market order
    stopLoss   : 0,
    takeProfit : 0,
    broker     : 0
})
```

Qty unit: `1e10` — so 1 BNB short = `10_000_000_000`. Formula:
```
qty_1e10 = collateralUsdt_1e18 / bnbPrice_1e8
```

### Hedge Sizing

```
lpValue    = NAV estimate of LP position in USDT
collateral = lpValue × hedgeBps / 10_000
collateral = min(collateral, lpValue / 2)   ← capped at 50% of LP value
```

`hedgeBps` defaults to `0` — hedge is off by default and must be explicitly enabled by the owner. This makes the hedge additive and opt-in, not a default dependency.

### Lifecycle

| Event | Action |
|---|---|
| `openHedge()` called by owner | Opens BNB short, stores `openHedgeKey` and `hedgeCollateralUsdt` |
| `closeHedge()` called by owner | Closes position via `IAsterPerp.closeTrade(openHedgeKey)` |
| Aster Perps call fails | `try/catch` — vault never reverts, hedge key stays 0, deposit completes |
| Withdrawal reduces LP value | Owner should `closeHedge()` and re-size before next `openHedge()` |

BNB spot price for sizing is fetched via a low-level `staticcall` to the Aster Perps Diamond's `getPriceFromCacheOrOracle(WBNB)` — avoiding ABI coupling while still using the same oracle as the perp engine.

---

## 5. Key Assumptions Challenged

**"Keepers are necessary for vault automation."**
Harvest and rebalance are triggered by the vault's own deposit/withdraw hooks. The vault is self-sustaining as long as users interact. TaskerOnChain adds cadence when idle — not required for correctness.

**"Fixed allocation is safe allocation."**
APR-proportional allocation routes capital to where it earns more, continuously. A 60/40 fixed split ignores that earn APR and LP APR diverge over time.

**"Harvesting on a fixed schedule is efficient."**
`_shouldHarvest()` enforces a 3× safety margin. Harvest executes only when CAKE value exceeds 3× gas cost. This adapts to reward accumulation rate and network congestion simultaneously.

**"Delta-neutral hedging belongs in a separate system."**
Because the vault directly controls the LP position, it knows the BNB exposure at all times. Embedding the hedge inside the vault means sizing is always proportional to actual LP value — no synchronisation lag.

**"Regime detection needs a Chainlink oracle."**
PancakeSwap's WBNB/USDT pool has deep liquidity and provides spot price via `getAmountsOut` at zero marginal cost. For detecting a 3% BNB price move (coarse regime signal), AMM spot price is sufficient with no oracle subscription cost.

---

## 6. Sustainability, Resilience, Elegance

### Sustainability

- Yield compounds on every deposit (gas permitting), not on a fixed schedule
- APR tracking adjusts allocation over time — vault does not stay over-committed to an underperforming leg
- Gas gate prevents spending more on harvest than is earned — unprofitable harvests are silently skipped
- 5% liquid USDT buffer means small withdrawals never unwind LP positions

### Resilience

Every external call that can fail is wrapped in `try/catch`:

| Call | Failure path |
|---|---|
| `_shouldHarvest()` price oracle | Returns `false` — harvest skipped, deposit continues |
| `_updateRegime()` price oracle | Returns early, keeps current regime |
| `IAsterPerp.openMarketTrade()` | `try/catch` — vault never reverts, hedge key stays 0 |
| `ISimpleEarnView.exchangePrice()` | Falls back to 1e18 — NAV estimate degrades gracefully |
| `MasterChef.pendingCake()` | If 0 or below threshold, harvest is skipped cleanly |

`nonReentrant` on all public state-changing functions. `_maybeHarvest()` and `_updateRegime()` are `internal` — the outer public function already holds the lock.

### Elegance

**Single allocation function, three behaviours.** `_computeTargetAlloc()` returns `(earnBps, lpBps)`. All callers — `_allocate()`, `rebalance()`, `_autoAdjustAllocation()` — consume that pair without knowing which regime produced it. Adding a fourth regime is one `else if` branch.

**Backward-compatible dynamic allocation.** When `dynamicAlloc = false` (the default), `_computeTargetAlloc()` returns the static `(earnBps, lpBps)` set by the owner. All 22 pre-upgrade fork tests pass unchanged.

**ERC4626 as the integration surface.** Composable with any protocol that understands the standard vault interface — aggregators, dashboards, position managers — without custom integration work.

**TaskerOnChain integration without coupling.** `MetaYieldVaultKeeperAdapter` knows the vault interface; the vault knows nothing about TaskerOnChain. The keeper layer is additive — removing it leaves the vault fully functional.

---

## 7. Contract Map

```
contracts/
  core/
    MetaYieldVault.sol              Main vault (ERC4626 + Ownable + ReentrancyGuard)
    TaskFactory.sol                 EIP-1167 clone factory for keeper tasks
    TaskLogicV2.sol                 Execution engine for keeper tasks
    ExecutorHub.sol                 Staking + reward distribution for executors
  adapters/
    AsterDEXEarnAdapter.sol         USDF / asUSDF deposit + withdraw
    PancakeSwapV2LPAdapter.sol      CAKE/WBNB addLiquidity / removeLiquidity
    PancakeSwapFarmAdapter.sol      MasterChef V2 stake, unstake, harvest
    MetaYieldVaultKeeperAdapter.sol TaskerOnChain keeper bridge (canExecute + execute)
  interfaces/
    IMetaYieldVault.sol             External view surface
    IAsterPerp.sol                  Aster Perps TradingPortalFacet (real on-chain ABI)

test/
  MetaYieldVault.test.ts            22 fork tests (deposit, withdraw, harvest, rebalance)
  MetaYieldVaultUpgrades.test.ts    53 fork tests (all 5 upgrades, hedge, keeper adapter)
  BscForkAdapters.test.ts           28 fork tests (adapter unit coverage)

scripts/
  deploy-bnb.ts                     Full mainnet deploy: TaskerOnChain + MetaYieldVault + wiring
  demo.ts                           7-step BSC fork demo (terminal output, no slides)
```

**Total: 103 fork tests, all passing against BSC mainnet state.**

---

## 8. BSC Mainnet Constants

| Constant | Address |
|---|---|
| USDT | `0x55d398326f99059fF775485246999027B3197955` |
| USDF | `0x5A110fC00474038f6c02E89C707D638602EA44B5` |
| asUSDF | `0x917AF46B3C3c6e1Bb7286B9F59637Fb7C65851Fb` |
| asUSDF minter | `0xdB57a53C428a9faFcbFefFB6dd80d0f427543695` |
| CAKE | `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| PancakeSwap Router V2 | `0x10ED43C718714eb63d5aA57B78B54704E256024E` |
| MasterChef V2 | `0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652` |
| CAKE/WBNB Pool ID | `2` |
| Aster Perps Diamond | `0x5553F3B5E2fAD83edA4031a3894ee59e25ee90bF` |

---

## 9. Running the Tests

```bash
# Terminal 1 — start BSC fork
npx hardhat node --fork <BSC_ARCHIVE_RPC_URL>

# Terminal 2 — run all vault tests
npx hardhat test test/MetaYieldVault.test.ts --network bscFork
npx hardhat test test/MetaYieldVaultUpgrades.test.ts --network bscFork
npx hardhat test test/BscForkAdapters.test.ts --network bscFork

# Run the terminal demo (7 steps, ~90 seconds)
npx hardhat run scripts/demo.ts --network bscFork
```

Expected:
```
MetaYieldVault Fork Tests         22 passing
MetaYieldVault Upgrades Tests     53 passing
BSC Fork Adapter Tests            28 passing
```
