# Sophisticated Adapter Test Scripts

This directory contains comprehensive test scripts for all sophisticated DeFi automation adapters. These scripts run against an Ethereum mainnet fork to test with real protocol integrations.

---

## Prerequisites

### 1. Ethereum Mainnet Fork Setup

Your `hardhat.config.ts` should have an Ethereum mainnet fork configured. You have:

```typescript
etherum: {
    url: "https://virtual.mainnet.eu.rpc.tenderly.co/82c86106-662e-4d7f-a974-c311987358ff",
    accounts: vars.has('TEST_ACC_PRIVATE_KEY') ? [vars.get('TEST_ACC_PRIVATE_KEY')] : [],
    chainId: 8
}
```

### 2. Compile Contracts

```bash
npx hardhat compile
```

---

## Test Scripts Overview

### 1. DCA Adapter Test (`test-dca-adapter.ts`)

**Purpose:** Tests Dollar-Cost Averaging automation with Uniswap V3

**What it tests:**
- Deploying DCA adapter
- Setting up weekly USDC → WETH purchases
- Parameter validation
- Time-based execution triggers
- Slippage protection
- Multiple execution cycles
- Max execution limits

**Run:**
```bash
npx hardhat run scripts/test-dca-adapter.ts --network etherum
```

**Expected Output:**
```
✅ DCA Adapter deployed to: 0x...
✅ User USDC balance: 10000 USDC
✅ DCA params encoded
✅ Parameters validated successfully
✅ DCA purchase executed!
USDC spent: 100 USDC
WETH received: 0.04 WETH
Effective price: 2500 USDC/WETH
✅ Slippage protection: PASSED
```

---

### 2. Aave Liquidation Protection Test (`test-aave-liquidation-protection.ts`)

**Purpose:** Tests automated liquidation protection for Aave positions

**What it tests:**
- Creating Aave V3 position (supply + borrow)
- Monitoring health factor
- REPAY_FROM_VAULT strategy
- ADD_COLLATERAL strategy
- Protection trigger conditions
- Health factor improvement tracking

**Run:**
```bash
npx hardhat run scripts/test-aave-liquidation-protection.ts --network etherum
```

**Expected Output:**
```
✅ Adapter deployed to: 0x...
✅ Supplied 10 WETH as collateral
✅ Borrowed 12000 USDC
Health Factor: 1.85
Protection threshold: 1.5
✅ Protection executed!
Health factor improved by: 0.15
```

---

### 3. Yield Auto-Compound Test (`test-yield-auto-compound.ts`)

**Purpose:** Tests automated yield compounding for Aave and other protocols

**What it tests:**
- Creating yield position (Aave aUSDC)
- Reward accrual simulation
- Compounding frequency analysis
- Gas cost vs reward calculations
- Parameter validation for different scenarios
- Token requirement checks

**Run:**
```bash
npx hardhat run scripts/test-yield-auto-compound.ts --network etherum
```

**Expected Output:**
```
✅ Adapter deployed to: 0x...
✅ Supplied to Aave, received aUSDC: 10000
Compounding Benefits:
  Daily (365x/year): +5.2% APY boost
  Weekly (52x/year): +4.7% APY boost
  Monthly (12x/year): +4.7% APY boost
```

---

### 4. Stop-Loss/Take-Profit Test (`test-stop-loss-take-profit.ts`)

**Purpose:** Tests price-based protective orders using Chainlink oracles

**What it tests:**
- Stop-loss order configuration
- Take-profit order configuration
- Trailing stop order configuration
- Chainlink price feed integration
- Trigger condition evaluation
- Helper function testing (wouldTrigger, calculateMinAmountOut)
- Edge case validation

**Run:**
```bash
npx hardhat run scripts/test-stop-loss-take-profit.ts --network etherum
```

**Expected Output:**
```
✅ Adapter deployed to: 0x...
Current ETH/USD price: 2000
Stop-loss trigger price: 1900 USD
Take-profit trigger price: 2200 USD
Trailing stop: Peak 2400 USD, 15% trailing
✅ All order types validated successfully
```

---

## Running All Tests

To run all adapter tests sequentially:

```bash
npm run test:adapters
```

Or manually:

```bash
npx hardhat run scripts/test-dca-adapter.ts --network etherum
npx hardhat run scripts/test-aave-liquidation-protection.ts --network etherum
npx hardhat run scripts/test-yield-auto-compound.ts --network etherum
npx hardhat run scripts/test-stop-loss-take-profit.ts --network etherum
```

---

## What Each Script Does

### Common Pattern

All scripts follow this structure:

1. **Deploy Adapter** - Deploy the adapter contract to mainnet fork
2. **Get Test Tokens** - Impersonate whale accounts to get tokens
3. **Setup Test Scenario** - Configure realistic DeFi positions
4. **Validate Parameters** - Test parameter validation
5. **Check Execution Conditions** - Test canExecute logic
6. **Execute (if applicable)** - Run the adapter execution
7. **Verify Results** - Check outcomes and state changes
8. **Test Edge Cases** - Validate error handling
9. **Summary Report** - Print comprehensive test results

---

## Protocol Integrations Tested

| Script | Protocols | Contracts Used |
|--------|-----------|----------------|
| DCA | Uniswap V3 | SwapRouter, Quoter, USDC, WETH |
| Liquidation Protection | Aave V3, Uniswap V3 | Aave Pool, SwapRouter, WETH, USDC |
| Auto-Compound | Aave V3, Uniswap V3 | Aave Pool, aUSDC, AAVE token, SwapRouter |
| Stop-Loss/Take-Profit | Chainlink, Uniswap V3 | ETH/USD Price Feed, SwapRouter, WETH, USDC |

---

## Mainnet Contract Addresses (Used in Tests)

### Tokens
```
USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
WETH: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
AAVE: 0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9
```

### Uniswap V3
```
SwapRouter: 0xE592427A0AEce92De3Edee1F18E0157C05861564
Quoter: 0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6
```

### Aave V3
```
Pool: 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2
aUSDC: 0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c
IncentivesController: 0x8164Cc65827dcFe994AB23944CBC90e0aa80bFcb
```

### Chainlink
```
ETH/USD Feed: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
```

---

## Troubleshooting

### Issue: "Insufficient funds for gas"
**Solution:** Ensure your test account has ETH. The scripts use `deployer.sendTransaction` to fund whale accounts.

### Issue: "Compilation failed"
**Solution:** Run `npx hardhat clean && npx hardhat compile` to rebuild from scratch.

### Issue: "Transaction reverted without a reason"
**Solution:** Check that the mainnet fork is up and running. Tenderly virtual testnets sometimes need to be restarted.

### Issue: "Price feed staleness error"
**Solution:** Mainnet fork may be using outdated data. This is expected in some test scenarios.

### Issue: "Impersonate account failed"
**Solution:** Ensure you're running on a fork network that supports `hardhat_impersonateAccount`.

---

## Gas Cost Estimates

Based on mainnet fork testing:

| Adapter | Deployment | Single Execution | Notes |
|---------|-----------|------------------|-------|
| DCA | ~1.2M gas | ~150k gas | Per swap execution |
| Liquidation Protection | ~1.8M gas | ~250k gas | REPAY_FROM_VAULT strategy |
| Liquidation Protection | ~1.8M gas | ~400k gas | SWAP_COLLATERAL strategy |
| Auto-Compound | ~1.5M gas | ~300k gas | Including swap + deposit |
| Stop-Loss | ~1.4M gas | ~180k gas | Simple stop-loss |
| Trailing Stop | ~1.4M gas | ~200k gas | With peak tracking |

*Gas costs at 50 gwei: Add ~$0.0075 ETH per 100k gas*

---

## Next Steps

1. **Integration Testing** - Test adapters with full TaskFactory integration
2. **Mainnet Deployment** - Deploy to actual mainnet after audit
3. **Executor Network** - Set up automated executor monitoring
4. **Frontend Integration** - Connect adapters to user-facing UI
5. **Monitoring** - Set up analytics for adapter performance

---

## Support

- **Documentation:** [SOPHISTICATED_ADAPTERS_GUIDE.md](../SOPHISTICATED_ADAPTERS_GUIDE.md)
- **Discord:** discord.gg/taskerOnChain
- **Issues:** github.com/taskerOnchain/issues

---

**Last Updated:** November 2025
**Version:** 1.0
