# TaskerOnChain Bug Fixes Summary

## Bug #1: ExecutorHub Commit Delay - Mixing Time Units ❌

**File**: `contracts/core/ExecutorHub.sol:163`

**Issue**: The code was comparing `block.number` (block height) with `lock.lockedAt` (timestamp).

```solidity
// BEFORE (WRONG)
if (lock.lockedAt + commitDelay > block.number) revert CommitmentNotReady();
```

**Root Cause**:
- Line 142: `lockedAt: uint96(block.timestamp)` - stores TIMESTAMP
- Line 163: Compares with `block.number` - uses BLOCK NUMBER
- This caused the delay check to always fail since timestamps >> block numbers

**Fix**:
```solidity
// AFTER (CORRECT)
if (block.timestamp < lock.lockedAt + commitDelay) revert CommitmentNotReady();
```

Also updated comment on line 26:
```solidity
uint256 public commitDelay = 1; // Seconds to wait after commit
```

---

## Bug #2: TaskLogicV2 Action Hash Mismatch ❌

**File**: `contracts/core/TaskLogicV2.sol:237-240`

**Issue**: Hash computation didn't match how TaskFactory hashes actions.

```solidity
// BEFORE (WRONG) - hashed individual fields
bytes32 computedHash = keccak256(abi.encode(
    actions[0].selector,
    actions[0].protocol,
    actions[0].params
));
```

**Root Cause**:
- TaskFactory (line 237): `keccak256(abi.encode(actions))` - hashes entire array
- TaskLogicV2 (line 237-240): Hashed individual action fields
- These produced different hashes, causing validation to fail

**Fix**:
```solidity
// AFTER (CORRECT) - matches TaskFactory
bytes32 computedHash = keccak256(abi.encode(actions));
```

---

## Bug #3: TaskLogicV2 Missing Token Info in executeTokenAction ❌

**File**: `contracts/core/TaskLogicV2.sol:279-287`

**Issue**: Calling `TaskVault.executeTokenAction` with `address(0)` for token and `0` for amount.

```solidity
// BEFORE (WRONG)
(bool success, ) = taskVault.call{gas: adapterInfo.gasLimit}(
    abi.encodeWithSignature(
        "executeTokenAction(address,address,uint256,bytes)",
        address(0), // ❌ token (determined by adapter)
        adapterInfo.adapter,
        0, // ❌ amount (determined by adapter)
        adapterCall
    )
);
```

**Root Cause**:
- TaskVault.executeTokenAction (line 132) requires `token != address(0)`
- TaskVault needs to know token/amount to:
  - Check balance (line 135)
  - Reserve tokens (line 138-139)
  - Approve adapter (line 142)
- TaskLogicV2 wasn't extracting this info from action params

**Status**: 🚧 NEEDS FIX

**Proposed Solution**:
Extract token and amount from action params before calling vault:

```solidity
// Decode swap params to get token info
UniswapV2Adapter.SwapParams memory swapParams = abi.decode(
    action.params,
    (UniswapV2Adapter.SwapParams)
);

// Execute through vault with correct token/amount
(bool success, ) = taskVault.call{gas: adapterInfo.gasLimit}(
    abi.encodeWithSignature(
        "executeTokenAction(address,address,uint256,bytes)",
        swapParams.tokenIn,        // ✅ Actual token
        adapterInfo.adapter,
        swapParams.amountIn,       // ✅ Actual amount
        adapterCall
    )
);
```

**Alternative Solution**:
Create a generic action metadata struct that stores token/amount info separately from adapter-specific params.

---

## Test Fixes

### MockERC20 Constructor

**File**: `test/ComprehensiveExecutor.test.ts:44`

```typescript
// BEFORE (WRONG)
mockToken = await MockERC20.deploy();

// AFTER (CORRECT)
mockToken = await MockERC20.deploy("Mock Token", "MOCK", 18);
```

### Commit Delay in Tests

**Files**:
- `test/TaskExecutionFlow.test.ts:449-450`
- `test/TaskExecutionFlow.test.ts:625-626`

```typescript
// BEFORE (WRONG) - mine blocks
await ethers.provider.send("evm_mine", []);

// AFTER (CORRECT) - advance time
await time.increase(1); // 1 second
```

---

## Summary

| Bug | Status | Impact |
|-----|--------|--------|
| ExecutorHub commit delay time units | ✅ FIXED | High - prevented all executions |
| TaskLogicV2 action hash mismatch | ✅ FIXED | High - action verification failed |
| TaskLogicV2 missing token info | 🚧 PENDING | High - token actions fail |
| Test: MockERC20 constructor | ✅ FIXED | Medium - test deployment failed |
| Test: commit delay timing | ✅ FIXED | Medium - test execution failed |

---

## Next Steps

1. ✅ Fix ExecutorHub.sol commit delay check
2. ✅ Fix TaskLogicV2.sol action hash computation
3. 🚧 Fix TaskLogicV2.sol token/amount extraction
4. ✅ Update tests to use time.increase() instead of evm_mine
5. ✅ Fix MockERC20 deployment in tests
6. 🧪 Run full test suite
7. 📝 Document the correct action params encoding format
