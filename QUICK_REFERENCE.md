# Quick Reference - TimeBasedTransfer Task Creation Fix

## TL;DR

**Problem:** Frontend transactions failing due to TaskLogicV2 expecting 6-parameter Uniswap format.

**Solution:**
1. ✅ Updated adapter to use 6 parameters
2. ✅ Updated frontend encoding (4 → 6 params)
3. ✅ Fixed protocol field (adapter → token address)
4. ✅ Added ETH buffer for gas reimbursement

## Critical Changes

### Adapter Parameters (MUST be 6!)

```typescript
// ❌ WRONG - Old 4-parameter format
["address", "address", "uint256", "uint256"]
[tokenAddress, recipientAddress, transferAmount, executeAfter]

// ✅ CORRECT - New 6-parameter format
["address", "address", "address", "uint256", "uint256", "address"]
[
  ethers.ZeroAddress,      // router (ignored)
  tokenAddress,            // tokenIn - TaskLogicV2 needs this!
  ethers.ZeroAddress,      // tokenOut (ignored)
  transferAmount,          // amountIn - TaskLogicV2 needs this!
  executeAfter,            // minAmountOut - repurposed as timestamp
  recipientAddress,        // recipient
]
```

### Protocol Field

```typescript
// ❌ WRONG
protocol: adapterAddress

// ✅ CORRECT
protocol: tokenAddress  // For simple adapters without external protocols
```

### ETH Value

```typescript
// ❌ WRONG - Only reward
const value = rewardPerExecution * maxExecutions;

// ✅ CORRECT - Reward + gas buffer
const value = (rewardPerExecution * maxExecutions) + parseEther("0.09");
```

## Files Changed

| File | Change |
|------|--------|
| `contracts/adapters/TimeBasedTransferAdapter.sol` | 6-param struct |
| `client/src/pages/create-task.tsx` | All 3 fixes |
| `client/src/templates/TimeBasedTransfer/config.ts` | 6-param encoding |

## Deployment Steps

```bash
# 1. Compile updated adapter
npx hardhat compile

# 2. Deploy to Polkadot Hub
npx hardhat run scripts/deploy-updated-timebased-adapter.ts --network polkadotHubTestnet

# 3. Update addresses.ts with new adapter address

# 4. Approve Mock USDC as protocol in ActionRegistry
# (Use Hardhat console or Etherscan)

# 5. Test from frontend!
```

## Test Checklist

- [ ] Adapter deployed to testnet
- [ ] Adapter registered in ActionRegistry
- [ ] Mock USDC approved as protocol
- [ ] Frontend updated with new adapter address
- [ ] Create test task (100 USDC, 1 hour delay)
- [ ] Verify task created successfully
- [ ] Wait 1 hour
- [ ] Execute task
- [ ] Verify recipient received 100 USDC
- [ ] Verify executor received reward + gas

## Key Learnings

1. **Always 6 params** - TaskLogicV2 hardcoded to Uniswap format
2. **Positions 1 & 3 critical** - tokenIn and amountIn extracted by TaskLogicV2
3. **Protocol ≠ Adapter** - Use external protocol or token address
4. **Gas buffer essential** - RewardManager needs extra ETH

## Documentation

- 📖 Full guide: `docs/ADAPTER_DEVELOPMENT_GUIDE.md`
- 📋 Fix summary: `docs/FRONTEND_FIXES_SUMMARY.md`
- 🧪 Integration test: `test/TimeBasedTransferIntegration.test.ts`

## Support

Questions? Check the docs or review the passing integration test!
