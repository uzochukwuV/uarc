# TaskerOnChain - Sophisticated Adapters Guide

## Overview

This document provides a comprehensive guide to TaskerOnChain's sophisticated DeFi automation adapters. These adapters enable users to automate complex strategies without writing code.

---

## Adapter Architecture

All adapters implement the `IActionAdapter` interface with the following core functions:

```solidity
interface IActionAdapter {
    function execute(address vault, bytes calldata params) external returns (bool success, bytes memory result);
    function canExecute(bytes calldata params) external view returns (bool executable, string memory reason);
    function getTokenRequirements(bytes calldata params) external pure returns (address[] memory tokens, uint256[] memory amounts);
    function validateParams(bytes calldata params) external view returns (bool isValid, string memory errorMessage);
    function name() external view returns (string memory);
    function isProtocolSupported(address protocol) external view returns (bool);
}
```

---

## 1. DCA Adapter (Dollar-Cost Averaging)

### Purpose
Automates recurring token purchases at fixed intervals, regardless of price.

### Use Cases
- "Buy $100 of ETH every Monday for 52 weeks"
- "DCA into BTC with $500 every 2 weeks"
- "Accumulate governance tokens monthly"

### Parameters

```solidity
struct DCAParams {
    address tokenIn;            // Token to sell (e.g., USDC)
    address tokenOut;           // Token to buy (e.g., WETH)
    uint24 poolFee;             // Uniswap V3 pool fee (500, 3000, or 10000)
    uint256 amountPerPurchase;  // Fixed amount to spend each time
    uint256 interval;           // Time between purchases (seconds)
    uint256 lastExecutionTime;  // Timestamp of last purchase
    uint256 executionCount;     // How many purchases completed
    uint256 maxExecutions;      // Stop after N purchases (0 = unlimited)
    uint256 minAmountOut;       // Minimum tokens to receive (slippage protection)
    address recipient;          // Who receives purchased tokens
}
```

### How It Works

1. **Time Check**: Verifies `block.timestamp >= lastExecutionTime + interval`
2. **Execution Count**: Checks if `executionCount < maxExecutions`
3. **Balance Validation**: Ensures vault has enough `tokenIn`
4. **Swap Execution**: Uses Uniswap V3 `exactInputSingle`
5. **Slippage Protection**: Requires `amountOut >= minAmountOut`
6. **Counter Update**: Increments `executionCount` and updates `lastExecutionTime`

### Example Task Creation

```javascript
const dcaParams = {
    tokenIn: USDC_ADDRESS,
    tokenOut: WETH_ADDRESS,
    poolFee: 3000, // 0.3% pool
    amountPerPurchase: parseUnits("100", 6), // 100 USDC
    interval: 7 * 24 * 60 * 60, // 7 days
    lastExecutionTime: 0,
    executionCount: 0,
    maxExecutions: 52, // Run for 1 year
    minAmountOut: calculateMinOutput(100, currentPrice, 1), // 1% slippage
    recipient: userAddress
};

const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,uint24,uint256,uint256,uint256,uint256,uint256,uint256,address)"],
    [[
        dcaParams.tokenIn,
        dcaParams.tokenOut,
        dcaParams.poolFee,
        dcaParams.amountPerPurchase,
        dcaParams.interval,
        dcaParams.lastExecutionTime,
        dcaParams.executionCount,
        dcaParams.maxExecutions,
        dcaParams.minAmountOut,
        dcaParams.recipient
    ]]
);
```

### Gas Optimization Tips

- **Batch Multiple Intervals**: Instead of daily (365 executions/year), use weekly (52 executions/year) to save gas
- **Min Reward Threshold**: Set `minAmountOut` based on current gas prices to avoid executing when gas is too expensive
- **Pool Fee Selection**: Use 500 (0.05%) for stablecoin pairs, 3000 (0.3%) for most pairs, 10000 (1%) for exotic pairs

### Benefits

- Eliminates emotional trading
- Average purchase price over time
- Set-and-forget automation
- Gas-efficient through batching
- Transparent on-chain execution

---

## 2. Aave Liquidation Protection Adapter

### Purpose
Automatically protects Aave positions from liquidation by monitoring health factor.

### Use Cases
- "Protect my ETH collateral: If health factor < 1.5, repay debt"
- "Auto-deleverage: Sell collateral to repay loan when at risk"
- "Safety net: Prevent liquidation penalties"

### Strategies

#### Strategy 1: REPAY_FROM_VAULT
Uses vault's debt tokens to repay loan.

**Pros**: Simplest, no swaps needed
**Cons**: Requires vault to hold debt tokens

#### Strategy 2: SWAP_COLLATERAL
Withdraws collateral, swaps to debt token, repays.

**Pros**: Doesn't require debt tokens in vault
**Cons**: Requires price oracle, swap fees, user must delegate withdrawal rights

#### Strategy 3: ADD_COLLATERAL
Supplies more collateral to improve health factor.

**Pros**: Doesn't reduce debt, keeps leverage
**Cons**: Requires additional collateral in vault

### Parameters

```solidity
struct ProtectionParams {
    address user;                   // Aave position owner
    address collateralAsset;        // Collateral token (e.g., WETH)
    address debtAsset;              // Debt token (e.g., USDC)
    uint256 healthFactorThreshold;  // Trigger protection below this (e.g., 1.5e18)
    ProtectionStrategy strategy;    // Which strategy to use (0, 1, or 2)
    uint256 repayAmount;            // Amount to repay (0 = auto-calculate)
    uint24 swapPoolFee;             // Uniswap V3 pool fee (if swapping)
    uint256 minAmountOut;           // Minimum tokens from swap
}
```

### How It Works

1. **Health Factor Check**: Queries Aave `getUserAccountData()` for current health factor
2. **Threshold Validation**: Verifies `healthFactor < threshold` AND `healthFactor >= 1.1`
3. **Strategy Execution**:
   - **REPAY_FROM_VAULT**: Direct repayment from vault tokens
   - **SWAP_COLLATERAL**: Withdraw → Swap → Repay (atomic transaction)
   - **ADD_COLLATERAL**: Supply more collateral to Aave
4. **Post-Execution**: Health factor improved, liquidation risk reduced

### Example Task Creation

```javascript
const protectionParams = {
    user: userAddress,
    collateralAsset: WETH_ADDRESS,
    debtAsset: USDC_ADDRESS,
    healthFactorThreshold: parseEther("1.5"), // Trigger at HF < 1.5
    strategy: 0, // REPAY_FROM_VAULT
    repayAmount: parseUnits("1000", 6), // Repay 1000 USDC
    swapPoolFee: 3000, // Not used for REPAY_FROM_VAULT but required
    minAmountOut: 0 // Not used for REPAY_FROM_VAULT
};

const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,address,uint256,uint8,uint256,uint24,uint256)"],
    [[
        protectionParams.user,
        protectionParams.collateralAsset,
        protectionParams.debtAsset,
        protectionParams.healthFactorThreshold,
        protectionParams.strategy,
        protectionParams.repayAmount,
        protectionParams.swapPoolFee,
        protectionParams.minAmountOut
    ]]
);
```

### Health Factor Explained

```
Health Factor = (Collateral × Liquidation Threshold) / Total Debt

Examples:
- HF > 1: Position is safe
- HF = 1: At liquidation threshold
- HF < 1: Position can be liquidated

Recommended Thresholds:
- Conservative: 1.8+ (very safe)
- Moderate: 1.5 (safe)
- Aggressive: 1.3 (risky)
- Minimum: 1.1 (very risky, adapter won't execute below this)
```

### Benefits

- Prevents liquidation penalties (typically 5-10% loss)
- Automated 24/7 monitoring
- No manual intervention required
- Multiple protection strategies
- Gas-efficient atomic execution

---

## 3. Yield Auto-Compound Adapter

### Purpose
Automatically harvests yield farming rewards and re-deposits them to maximize returns.

### Use Cases
- "Auto-compound my Aave USDC yield daily"
- "Harvest and reinvest Yearn rewards every 12 hours"
- "Maximize returns through automated compounding"

### Parameters

```solidity
struct CompoundParams {
    address yieldVault;         // Yield-bearing vault (e.g., Aave aUSDC)
    address rewardDistributor;  // Where to claim rewards
    address rewardToken;        // Token received as rewards (e.g., AAVE)
    address baseAsset;          // Underlying asset (e.g., USDC)
    uint24 swapPoolFee;         // Uniswap V3 pool fee
    uint256 minRewardAmount;    // Don't compound if rewards < this
    uint256 minAmountOut;       // Slippage protection on swap
    uint256 compoundInterval;   // Time between compounds (seconds)
    uint256 lastCompoundTime;   // Timestamp of last compound
    address recipient;          // Who owns the compounded position
}
```

### How It Works

1. **Timing Check**: Verifies `block.timestamp >= lastCompoundTime + compoundInterval`
2. **Reward Check**: Queries `pendingRewards()` from distributor
3. **Threshold Validation**: Ensures `pendingRewards >= minRewardAmount`
4. **Claim**: Calls `claim()` on reward distributor
5. **Swap** (if needed): Converts reward token to base asset via Uniswap V3
6. **Re-deposit**: Supplies base asset back into yield vault
7. **Update**: Sets `lastCompoundTime = block.timestamp`

### Compounding Frequency Analysis

| Frequency | Compounds/Year | APY Boost (10% base) | Gas Cost/Year | Optimal For |
|-----------|---------------|---------------------|---------------|-------------|
| Hourly | 8,760 | ~10.52% (+5.2%) | $8,760 @ $1/tx | Large positions (>$100k) |
| Daily | 365 | ~10.52% (+5.2%) | $365 @ $1/tx | Medium positions ($10k-$100k) |
| Weekly | 52 | ~10.47% (+4.7%) | $52 @ $1/tx | Small positions ($1k-$10k) |
| Monthly | 12 | ~10.47% (+4.7%) | $12 @ $1/tx | Very small positions (<$1k) |

### Example Task Creation

```javascript
const compoundParams = {
    yieldVault: AAVE_AUSDC_ADDRESS,
    rewardDistributor: AAVE_INCENTIVES_CONTROLLER,
    rewardToken: AAVE_TOKEN_ADDRESS,
    baseAsset: USDC_ADDRESS,
    swapPoolFee: 3000,
    minRewardAmount: parseEther("1"), // Don't compound < 1 AAVE
    minAmountOut: calculateMinOutput(1, aavePrice, 2), // 2% slippage
    compoundInterval: 24 * 60 * 60, // Daily
    lastCompoundTime: 0,
    recipient: userAddress
};

const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,address,address,uint24,uint256,uint256,uint256,uint256,address)"],
    [[
        compoundParams.yieldVault,
        compoundParams.rewardDistributor,
        compoundParams.rewardToken,
        compoundParams.baseAsset,
        compoundParams.swapPoolFee,
        compoundParams.minRewardAmount,
        compoundParams.minAmountOut,
        compoundParams.compoundInterval,
        compoundParams.lastCompoundTime,
        compoundParams.recipient
    ]]
);
```

### Gas Optimization

```javascript
// Calculate optimal compounding frequency
function calculateOptimalFrequency(positionValue, baseAPY, gasPrice) {
    const hourlyGasCost = gasPrice * 300000 / 1e9; // ~$30 @ 100 gwei
    const hourlyYield = positionValue * (baseAPY / 8760) / 100;

    if (hourlyYield > hourlyGasCost * 2) {
        return "hourly"; // Compound every hour
    } else if (hourlyYield * 24 > hourlyGasCost * 2) {
        return "daily"; // Compound daily
    } else if (hourlyYield * 168 > hourlyGasCost * 2) {
        return "weekly"; // Compound weekly
    } else {
        return "monthly"; // Compound monthly
    }
}
```

### Benefits

- Maximizes returns through compounding
- No manual harvesting required
- Gas-efficient timing based on rewards
- Supports any ERC4626-compatible vault
- Transparent on-chain execution

---

## 4. Stop-Loss / Take-Profit Adapter

### Purpose
Automated price-based protective orders using Chainlink price feeds.

### Use Cases
- "Sell if ETH drops below $1500 (stop-loss)"
- "Sell if ETH rises above $3000 (take-profit)"
- "Sell 50% if price +20%, sell rest if price -10%"
- "Trailing stop-loss: Sell if price drops 15% from peak"

### Order Types

#### 1. STOP_LOSS
Triggers when price drops BELOW threshold.

**Use**: Protect against downside risk

#### 2. TAKE_PROFIT
Triggers when price rises ABOVE threshold.

**Use**: Lock in gains automatically

#### 3. TRAILING_STOP
Triggers when price drops X% from peak.

**Use**: Capture upside while protecting gains

### Parameters

```solidity
struct OrderParams {
    OrderType orderType;            // STOP_LOSS, TAKE_PROFIT, or TRAILING_STOP
    address tokenIn;                // Token to sell (e.g., WETH)
    address tokenOut;               // Token to buy (e.g., USDC)
    address priceFeed;              // Chainlink price feed address
    uint24 swapPoolFee;             // Uniswap V3 pool fee
    uint256 triggerPrice;           // Price that triggers execution (8 decimals)
    uint256 amountToSell;           // Amount of tokenIn to sell
    uint256 minAmountOut;           // Minimum tokenOut to receive
    uint256 trailingPercent;        // For trailing stop: % drop from peak
    uint256 peakPrice;              // For trailing stop: highest price seen
    bool isActive;                  // Can be paused by user
    address recipient;              // Who receives tokens after swap
}
```

### How It Works

#### Stop-Loss Flow
1. **Price Monitoring**: Executor continuously checks Chainlink price feed
2. **Trigger Check**: If `currentPrice <= triggerPrice`, trigger execution
3. **Swap Execution**: Sells `amountToSell` of tokenIn for tokenOut
4. **Slippage Protection**: Requires `amountOut >= minAmountOut`

#### Take-Profit Flow
1. **Price Monitoring**: Executor continuously checks Chainlink price feed
2. **Trigger Check**: If `currentPrice >= triggerPrice`, trigger execution
3. **Swap Execution**: Same as stop-loss

#### Trailing Stop Flow
1. **Peak Tracking**: On each canExecute call, update `peakPrice = max(peakPrice, currentPrice)`
2. **Trailing Calculation**: `trailingStopPrice = peakPrice * (100 - trailingPercent) / 100`
3. **Trigger Check**: If `currentPrice <= trailingStopPrice`, trigger execution
4. **Swap Execution**: Same as stop-loss

### Example Task Creation

```javascript
// Example 1: Stop-Loss at $1500
const stopLossParams = {
    orderType: 0, // STOP_LOSS
    tokenIn: WETH_ADDRESS,
    tokenOut: USDC_ADDRESS,
    priceFeed: ETH_USD_CHAINLINK_FEED,
    swapPoolFee: 3000,
    triggerPrice: 1500_00000000, // $1500 (8 decimals)
    amountToSell: parseEther("10"), // Sell 10 ETH
    minAmountOut: parseUnits("14850", 6), // Min $1485 per ETH (1% slippage)
    trailingPercent: 0, // Not used for stop-loss
    peakPrice: 0, // Not used for stop-loss
    isActive: true,
    recipient: userAddress
};

// Example 2: Trailing Stop at 15% from peak
const trailingStopParams = {
    orderType: 2, // TRAILING_STOP
    tokenIn: WETH_ADDRESS,
    tokenOut: USDC_ADDRESS,
    priceFeed: ETH_USD_CHAINLINK_FEED,
    swapPoolFee: 3000,
    triggerPrice: 0, // Not used for trailing stop
    amountToSell: parseEther("10"),
    minAmountOut: calculateMinOutput(10, currentPrice, 2), // 2% slippage
    trailingPercent: 15, // Trigger if price drops 15% from peak
    peakPrice: 2000_00000000, // Initial peak $2000
    isActive: true,
    recipient: userAddress
};
```

### Trailing Stop Example

```
Timeline of ETH Price Movement:

Day 1: Price = $2000 → peakPrice = $2000 → trailingStop = $1700 (15% below peak)
Day 2: Price = $2200 → peakPrice = $2200 → trailingStop = $1870 (15% below peak)
Day 3: Price = $2500 → peakPrice = $2500 → trailingStop = $2125 (15% below peak)
Day 4: Price = $2400 → peakPrice = $2500 → trailingStop = $2125 (peak unchanged)
Day 5: Price = $2100 → TRIGGER! (Below $2125 trailing stop)
        → Sell 10 ETH for USDC
        → Locked in gains from $2000 → $2100 (+5%)
        → Protected from further downside
```

### Benefits

- 24/7 automated monitoring
- No emotional trading
- Protects against flash crashes
- Uses decentralized Chainlink oracles
- Multiple order types for different strategies
- Trailing stops capture upside while protecting gains

---

## Gas Cost Comparison

| Adapter | Estimated Gas | Cost @ 50 gwei | Cost @ 100 gwei | Recommended Frequency |
|---------|--------------|----------------|-----------------|----------------------|
| DCA | 150,000 | $0.0075 ETH | $0.015 ETH | Weekly |
| Aave Liquidation Protection | 250,000 | $0.0125 ETH | $0.025 ETH | As needed (event-based) |
| Yield Auto-Compound | 300,000 | $0.015 ETH | $0.030 ETH | Daily (large positions) |
| Stop-Loss/Take-Profit | 180,000 | $0.009 ETH | $0.018 ETH | As needed (event-based) |

---

## Security Considerations

### All Adapters

1. **SafeERC20**: All token transfers use OpenZeppelin's SafeERC20
2. **ReentrancyGuard**: TaskLogic has reentrancy protection
3. **Parameter Validation**: Every adapter validates params before execution
4. **Slippage Protection**: All swaps have `minAmountOut` requirements
5. **Whitelist Validation**: `isProtocolSupported()` checks protocol addresses

### Price Feed Security (Stop-Loss, Liquidation Protection)

1. **Staleness Checks**: Prices older than 1 hour are rejected
2. **Round Validation**: Checks `answeredInRound >= roundId`
3. **Sanity Checks**: Prices must be > 0
4. **Multiple Oracles**: Can use multiple Chainlink feeds for verification

### Vault Security (All Adapters)

1. **Isolated Vaults**: Each task has its own vault (no co-mingling)
2. **Balance Checks**: Validates sufficient balance before execution
3. **Approval Limits**: Only approves exact amounts needed
4. **Pull Pattern**: Executors can't push malicious transactions

---

## Testing Checklist

### Before Mainnet Deployment

- [ ] Unit tests for all adapters (100% coverage)
- [ ] Integration tests with real protocols (Aave, Uniswap V3)
- [ ] Fuzzing tests for parameter validation
- [ ] Gas optimization benchmarks
- [ ] External security audit
- [ ] Testnet deployment for 30+ days
- [ ] Bug bounty program
- [ ] Price feed staleness tests
- [ ] Reentrancy attack tests
- [ ] Edge case handling (e.g., pool has no liquidity)

---

## Frontend Integration Guide

### Creating a DCA Task

```typescript
import { ethers } from 'ethers';
import { DCA_ADAPTER_ADDRESS, TASK_FACTORY_ADDRESS } from './addresses';

async function createDCATask(
    tokenIn: string,
    tokenOut: string,
    amountPerPurchase: bigint,
    intervalDays: number,
    maxExecutions: number
) {
    // 1. Encode DCA params
    const dcaParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,uint256,uint256,uint256,uint256,uint256,uint256,address)"],
        [[
            tokenIn,
            tokenOut,
            3000, // 0.3% pool
            amountPerPurchase,
            intervalDays * 24 * 60 * 60,
            0, // lastExecutionTime
            0, // executionCount
            maxExecutions,
            0, // minAmountOut (calculate based on current price)
            await signer.getAddress()
        ]]
    );

    // 2. Create task
    const taskFactory = new ethers.Contract(TASK_FACTORY_ADDRESS, factoryABI, signer);
    const tx = await taskFactory.createTaskWithTokens(
        {
            expiresAt: 0, // No expiry
            maxExecutions,
            recurringInterval: intervalDays * 24 * 60 * 60,
            rewardPerExecution: ethers.parseEther("0.01"),
            seedCommitment: ethers.ZeroHash
        },
        [
            {
                selector: "0x1cff79cd", // executeAction
                protocol: DCA_ADAPTER_ADDRESS,
                params: dcaParams
            }
        ],
        [
            {
                token: tokenIn,
                amount: amountPerPurchase * BigInt(maxExecutions)
            }
        ],
        { value: ethers.parseEther("0.01") * BigInt(maxExecutions) }
    );

    await tx.wait();
    console.log("DCA Task Created!");
}
```

### Monitoring Adapter Status

```typescript
async function checkAdapterStatus(adapterAddress: string, params: string) {
    const adapter = new ethers.Contract(adapterAddress, adapterABI, provider);

    const [canExecute, reason] = await adapter.canExecute(params);

    if (canExecute) {
        console.log("✅ Ready to execute:", reason);
    } else {
        console.log("⏳ Not ready:", reason);
    }

    return canExecute;
}
```

---

## Roadmap

### Phase 1: Core Adapters (Q1 2025) ✅
- [x] DCA Adapter
- [x] Aave Liquidation Protection
- [x] Yield Auto-Compound
- [x] Stop-Loss/Take-Profit

### Phase 2: Advanced Features (Q2 2025)
- [ ] Multi-token swaps (e.g., USDC → WETH → AAVE in one tx)
- [ ] Conditional logic (e.g., "DCA only if price < $X")
- [ ] Portfolio rebalancing adapter
- [ ] Limit order adapter (like dYdX)

### Phase 3: Protocol Integrations (Q3 2025)
- [ ] Compound V3 adapter
- [ ] Curve auto-compound adapter
- [ ] Convex auto-compound adapter
- [ ] Balancer rebalancing adapter

### Phase 4: Cross-Chain (Q4 2025)
- [ ] Cross-chain DCA (Polkadot XCM)
- [ ] Multi-chain yield optimization
- [ ] Cross-chain liquidation protection

---

## Support & Resources

- **Documentation**: [docs.taskeronchain.io](https://docs.taskeronchain.io)
- **Discord**: [discord.gg/taskerOnChain](https://discord.gg/taskerOnChain)
- **GitHub**: [github.com/taskerOnChain](https://github.com/taskerOnChain)
- **Support Email**: support@taskeronchain.io

---

**Version 1.0 | November 2025**
