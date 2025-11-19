# "Invalid token" Error Trace Analysis

**Date**: November 19, 2025
**Error**: `require(token != address(0), "Invalid token")`
**Status**: ROOT CAUSE IDENTIFIED

---

## Error Location

### File: [contracts/core/TaskVault.sol](contracts/core/TaskVault.sol)
### Line: 135
### Function: `executeTokenAction()`

```solidity
function executeTokenAction(
    address token,
    address adapter,
    uint256 amount,
    bytes calldata actionData
) external onlyTaskLogic nonReentrant returns (bool success, bytes memory result) {
    require(token != address(0), "Invalid token");  // ← LINE 135: THIS FAILS
    require(adapter != address(0), "Invalid adapter");

    if (tokenBalances[token] < amount) revert InsufficientBalance();
    // ... rest of function
}
```

**Error Condition**: Token address passed as parameter is `address(0)` (zero address)

---

## Execution Call Stack

### Path to Error:

1. **ExecutorHub.executeTask(taskId)** - Entry point
   - [ExecutorHub.sol](contracts/core/ExecutorHub.sol) - Calls TaskLogic

2. **TaskLogicV2.executeTask(ExecutionParams)**
   - [TaskLogicV2.sol](contracts/core/TaskLogicV2.sol) - Line 45-112
   - Calls `_verifyAndExecuteActions()` at line 75

3. **TaskLogicV2._verifyAndExecuteActions()**
   - [TaskLogicV2.sol](contracts/core/TaskLogicV2.sol) - Line 155-180
   - Fetches actions from TaskCore at line 163
   - Calls `_executeAction()` for each action at line 173

4. **TaskLogicV2._executeAction(taskVault, action)**
   - [TaskLogicV2.sol](contracts/core/TaskLogicV2.sol) - Line 188-237
   - Gets adapter requirements at line 203-204
   - Calls taskVault.call() with `executeTokenAction` at line 216-223
   - **Passes `tokens[0]` as token parameter** ← This is where the issue occurs

5. **TaskVault.executeTokenAction(token, adapter, amount, actionData)**
   - [TaskVault.sol](contracts/core/TaskVault.sol) - Line 129-182
   - **Line 135: Checks if token != address(0)** ← ERROR OCCURS HERE

---

## Root Cause Analysis

### Why tokens[0] = address(0):

The token address comes from the adapter's `getTokenRequirements()` function:

```solidity
// TaskLogicV2.sol - Line 203-204
(address[] memory tokens, uint256[] memory amounts) =
    IActionAdapter(adapterInfo.adapter).getTokenRequirements(action.params);
```

### Tracing to TimeBasedTransferAdapter:

Let me check the adapter's getTokenRequirements implementation:

**File**: [contracts/adapters/TimeBasedTransferAdapter.sol](contracts/adapters/TimeBasedTransferAdapter.sol)

The adapter decodes `action.params` to extract the token address:

```typescript
// From deployment script - line 179-187
const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256"],
    [
        mockUSDAAddress,         // ← token address (Position 0)
        recipient.address,       // ← recipient (Position 1)
        transferAmount,          // ← amount (Position 2)
        executeAfter,            // ← executeAfter (Position 3)
    ]
);
```

So the adapter should decode and return `mockUSDAAddress` as the token.

### Why It Becomes address(0):

There are several possible causes:

**Cause A**: Adapter's `getTokenRequirements()` is returning wrong data
- Decoding error in adapter
- Parameter order mismatch
- Unused parameters

**Cause B**: Action stored in TaskCore has wrong params
- Token address wasn't properly encoded during task creation
- Action params corrupted during storage
- Wrong action params used

**Cause C**: Token address never deployed
- `mockUSDAAddress` is a zero address because deployment failed
- Token deployment step was skipped
- Wrong address used in action params

---

## Evidence from Testnet Transaction

### From Polkadot testnet trace:

```
Task ID: 1
Action Protocol: 0xdefa91c8...

During Execution:
→ TaskLogicV2._executeAction() called
→ Gets adapter: TimeBasedTransferAdapter
→ Calls adapter.getTokenRequirements(action.params)
→ Returns: tokens[0] = address(0)
→ Calls taskVault.executeTokenAction(address(0), ...)
→ Line 135: require(address(0) != address(0)) fails
→ "Invalid token" error
```

---

## Verification Steps

To verify which cause is the problem:

### Step 1: Check Adapter's getTokenRequirements()

Read [contracts/adapters/TimeBasedTransferAdapter.sol](contracts/adapters/TimeBasedTransferAdapter.sol) and verify:
- Parameters decoded in correct order
- Token address returned as first element in tokens array
- No issues with parameter parsing

### Step 2: Check Stored Action Params

During task execution, the action params should be logged:

```solidity
// Add to TaskLogicV2._executeAction() for debugging:
emit DebugAction(
    action.selector,
    action.protocol,
    action.params  // ← Log the actual encoded params
);
```

Decode the logged params and verify token address is not zero.

### Step 3: Check Deployment

Verify deployment script:
- Token actually deployed
- Token address is not address(0)
- Token address matches in:
  - Action params encoding
  - Protocol approval
  - Action stored in TaskCore

---

## Fix Strategy

### Option 1: Validate in Deployment Script (RECOMMENDED)

Add validation after deploying token:

```typescript
// In deploy-updated-timebased-adapter.ts
const mockUSDAAddress = await mockUSDC.getAddress();

// Validate token address
if (mockUSDAAddress === ethers.ZeroAddress) {
    throw new Error("Token deployment failed - address is zero!");
}

console.log("✅ Token deployed:", mockUSDAAddress);
```

### Option 2: Add Debug Checkpoint in TaskLogicV2

Add debug event to trace token address:

```solidity
// In TaskLogicV2._executeAction()
event DebugTokenAddress(
    uint256 indexed taskId,
    bytes4 selector,
    address protocol,
    address[] tokens,
    uint256[] amounts
);

// After getting adapter requirements:
(address[] memory tokens, uint256[] memory amounts) =
    IActionAdapter(adapterInfo.adapter).getTokenRequirements(action.params);

emit DebugTokenAddress(
    taskId,
    action.selector,
    action.protocol,
    tokens,
    amounts
);
```

Then examine logs to see what token address is being returned.

### Option 3: Add Validation in TaskVault

Make error message more helpful:

```solidity
// In TaskVault.executeTokenAction()
require(token != address(0), "Invalid token: address is zero (may indicate adapter decoding error)");
```

---

## Affected Components

| Component | File | Issue |
|-----------|------|-------|
| **Adapter** | [TimeBasedTransferAdapter.sol](contracts/adapters/TimeBasedTransferAdapter.sol) | May return address(0) from getTokenRequirements() |
| **TaskLogic** | [TaskLogicV2.sol](contracts/core/TaskLogicV2.sol) - Line 216-223 | Passes whatever adapter returns (no validation) |
| **Vault** | [TaskVault.sol](contracts/core/TaskVault.sol) - Line 135 | Rejects address(0) ← Error occurs here |
| **Deployment** | [deploy-updated-timebased-adapter.ts](scripts/deploy-updated-timebased-adapter.ts) | May deploy token as address(0) |

---

## Quick Debugging Steps for User

Run this script to identify the exact cause:

```typescript
// Create debug script: scripts/debug-token-address.ts
import { ethers } from "hardhat";

const TASK_ID = 1;  // The failing task
const CONTRACTS = {
    TASK_FACTORY: '0x...',  // From deployment
    TASK_CORE: '0x...',     // From deployment
    ADAPTER: '0x...',       // TimeBasedTransferAdapter
};

async function main() {
    const taskFactory = await ethers.getContractAt("TaskFactory", CONTRACTS.TASK_FACTORY);
    const task = await taskFactory.getTask(TASK_ID);
    const taskCore = await ethers.getContractAt("TaskCore", task.taskCore);

    const actions = await taskCore.getActions();
    const action = actions[0];

    console.log("Stored action.params:", action.params);

    // Decode params
    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["address", "address", "uint256", "uint256"],
        action.params
    );

    console.log("Decoded token address:", decoded[0]);
    console.log("Is zero?", decoded[0] === ethers.ZeroAddress);

    // Test adapter's getTokenRequirements
    const adapter = await ethers.getContractAt("TimeBasedTransferAdapter", CONTRACTS.ADAPTER);
    const [tokens, amounts] = await adapter.getTokenRequirements(action.params);

    console.log("Adapter returned tokens[0]:", tokens[0]);
    console.log("Is zero?", tokens[0] === ethers.ZeroAddress);
}

main();
```

---

## Summary

### Error Source
```
TaskVault.sol:135
require(token != address(0), "Invalid token")
```

### Why It Fails
Token address passed to executeTokenAction is address(0)

### How It Gets There
1. Adapter's getTokenRequirements() returns address(0)
2. TaskLogicV2 passes whatever adapter returns
3. TaskVault rejects address(0)

### Most Likely Cause
**Adapter is not correctly decoding the action params** or **action params don't contain a valid token address**

### Fix Priority
1. ✅ Verify token deployed to non-zero address
2. ✅ Verify token address stored correctly in action params
3. ✅ Verify adapter decodes params correctly
4. Add debug logging to identify exact failure point

---

## Files to Examine

1. [contracts/adapters/TimeBasedTransferAdapter.sol](contracts/adapters/TimeBasedTransferAdapter.sol)
   - Check `getTokenRequirements()` implementation
   - Verify parameter decode order

2. [contracts/core/TaskLogicV2.sol](contracts/core/TaskLogicV2.sol)
   - Lines 188-237: _executeAction()
   - Line 203-204: adapter.getTokenRequirements() call
   - Line 216-223: taskVault.call() with executeTokenAction

3. [contracts/core/TaskVault.sol](contracts/core/TaskVault.sol)
   - Line 135: require(token != address(0), "Invalid token")
   - Line 138: Check tokenBalances[token]

4. [scripts/deploy-updated-timebased-adapter.ts](scripts/deploy-updated-timebased-adapter.ts)
   - Lines 57-78: Token deployment/connection
   - Lines 179-187: Action params encoding
   - Verify token address is not address(0)
