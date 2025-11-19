# Frontend Encoding Mismatch - Complete Analysis

**Date**: November 19, 2025
**Issue**: Tasks created from frontend always fail with "Invalid token" error
**Root Cause**: Frontend uses 6-parameter encoding but adapter expects 4-parameter struct encoding
**Status**: ⚠️ REQUIRES FRONTEND UPDATE

---

## The Problem

### Frontend Code (Lines 235-245):

```typescript
// WRONG: 6-parameter encoding (old Uniswap format)
adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address", "address", "address", "uint256", "uint256", "address"],
  [
    ethers.ZeroAddress,           // router (ignored, for TaskLogicV2 compatibility)
    formData.tokenAddress,        // tokenIn
    ethers.ZeroAddress,           // tokenOut (ignored)
    BigInt(formData.transferAmount),  // amountIn
    executeAfter,                 // minAmountOut - repurposed as timestamp!
    formData.recipientAddress,    // recipient
  ]
) as `0x${string}`;
```

### Smart Contract Expectation (TimeBasedTransferAdapter.sol:46):

```solidity
// CORRECT: 4-parameter struct encoding
struct TransferParams {
    address token;           // Field 0
    address recipient;       // Field 1
    uint256 amount;          // Field 2
    uint256 executeAfter;    // Field 3
}

function getTokenRequirements(bytes calldata params) {
    TransferParams memory p = abi.decode(params, (TransferParams));
    tokens[0] = p.token;  // ← Reads from wrong position!
}
```

---

## Why It Fails

### Transaction Trace Shows:

```
Frontend encodes (6 parameters):
[ZeroAddress, tokenAddress, ZeroAddress, amount, timestamp, recipient]
   ↓
Stored in action.params
   ↓
Adapter tries to decode as struct (4 parameters):
struct { address, address, uint256, uint256 }
   ↓
Field misalignment:
  p.token = read first 32 bytes = ZeroAddress ❌
  p.recipient = read second 32 bytes = tokenAddress (wrong!)
  p.amount = read third 32 bytes = ZeroAddress (wrong!)
  p.executeAfter = read fourth 32 bytes = tokenAddress (wrong!)
   ↓
tokens[0] = address(0)  ← THIS CAUSES THE ERROR!
   ↓
TaskVault.executeTokenAction(address(0), ...)
require(token != address(0), "Invalid token") ❌ FAILS
```

---

## Evidence from Transaction Trace

From the Polkadot testnet execution you provided:

```
Input to TimeBasedTransferAdapter.getTokenRequirements():
0x000000000000000000000000000000000000000000000000000000000000000000
00000000defa91c83a08eb1745668feedb51ab532d20ee62
00000000000000000000000000000000000000000000000000000000000000
00000c35000000000000000000000000000000000000000000000000000000
00691dbc99
00000000000000000000000019c50bfd73627b35f2ef3f7b0755229d42cd56a8

^ This is 6 parameters!
^ But adapter expects 4!
^ Decoder reads wrong positions
^ Token field gets address(0) from first parameter
^ ERROR: "Invalid token"
```

---

## The Solution

### Fix the Frontend Encoding

**File**: [TaskerFrontend/client/src/pages/create-task.tsx](TaskerFrontend/client/src/pages/create-task.tsx)
**Lines**: 235-245

**CHANGE FROM**:
```typescript
adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address", "address", "address", "uint256", "uint256", "address"],
  [
    ethers.ZeroAddress,
    formData.tokenAddress,
    ethers.ZeroAddress,
    BigInt(formData.transferAmount),
    executeAfter,
    formData.recipientAddress,
  ]
) as `0x${string}`;
```

**CHANGE TO**:
```typescript
// Use tuple encoding to match TimeBasedTransferAdapter struct:
// struct TransferParams { address token; address recipient; uint256 amount; uint256 executeAfter; }
adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
  ["tuple(address,address,uint256,uint256)"],
  [[
    formData.tokenAddress,           // token
    formData.recipientAddress,       // recipient
    BigInt(formData.transferAmount), // amount
    executeAfter,                    // executeAfter
  ]]
) as `0x${string}`;
```

---

## Why Frontend Has Wrong Encoding

Looking at the comment in the frontend code (lines 232-234):

```typescript
// CRITICAL: Encode as 6 parameters to match TaskLogicV2 expectations!
// TaskLogicV2 expects Uniswap format: (router, tokenIn, tokenOut, amountIn, minAmountOut, recipient)
// We map our params: (ignored, token, ignored, amount, executeAfter, recipient)
```

This comment is **outdated**. The system was refactored to:
1. Remove commit-reveal patterns
2. Store actions on-chain during task creation
3. Use adapter-specific struct formats

The frontend still has **old Uniswap compatibility code** that's no longer needed.

---

## Comparison: Frontend vs Deployment Script

### Deployment Script (FIXED ✅):
```typescript
// deploy-updated-timebased-adapter.ts:186-187
encode(["tuple(address,address,uint256,uint256)"], [[
  mockUSDAAddress,      // token
  recipient.address,    // recipient
  transferAmount,       // amount
  executeAfter,         // executeAfter
]])
```

### Frontend (BROKEN ❌):
```typescript
// create-task.tsx:235-245
encode(["address", "address", "address", "uint256", "uint256", "address"], [
  ethers.ZeroAddress,            // ← Wrong! Should be token
  formData.tokenAddress,         // ← Wrong position!
  ethers.ZeroAddress,            // ← Wrong!
  BigInt(formData.transferAmount),
  executeAfter,
  formData.recipientAddress,
])
```

**The deployment script is now correct. The frontend is still using the old format.**

---

## Adapter Struct Definition

**File**: [contracts/adapters/TimeBasedTransferAdapter.sol](contracts/adapters/TimeBasedTransferAdapter.sol)
**Lines**: 26-31

```solidity
struct TransferParams {
    address token;           // Token to transfer (e.g., Mock USDC)
    address recipient;       // Where to send tokens
    uint256 amount;          // Amount to transfer
    uint256 executeAfter;    // Timestamp when task can execute
}
```

This is clear: **4 parameters in specific order**.

Frontend should match this exactly.

---

## Implementation Steps

### Step 1: Update Frontend Encoding

**File**: [TaskerFrontend/client/src/pages/create-task.tsx](TaskerFrontend/client/src/pages/create-task.tsx)
**Lines**: 232-245

```diff
    if (selectedTemplate === "TIME_BASED_TRANSFER") {
      // Calculate executeAfter timestamp (hours from now)
      const hoursFromNow = parseFloat(formData.executeAfterHours || "1");
      const executeAfter = BigInt(Math.floor(Date.now() / 1000) + Math.floor(hoursFromNow * 3600));

-     // CRITICAL: Encode as 6 parameters to match TaskLogicV2 expectations!
-     // TaskLogicV2 expects Uniswap format: (router, tokenIn, tokenOut, amountIn, minAmountOut, recipient)
-     // We map our params: (ignored, token, ignored, amount, executeAfter, recipient)
+     // CRITICAL: Encode as struct to match TimeBasedTransferAdapter expectations!
+     // struct TransferParams { address token; address recipient; uint256 amount; uint256 executeAfter; }
      adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
-       ["address", "address", "address", "uint256", "uint256", "address"],
+       ["tuple(address,address,uint256,uint256)"],
        [
-         ethers.ZeroAddress,                           // router (ignored, for TaskLogicV2 compatibility)
-         formData.tokenAddress,                        // tokenIn - TaskLogicV2 extracts this
-         ethers.ZeroAddress,                           // tokenOut (ignored)
-         BigInt(formData.transferAmount),              // amountIn - TaskLogicV2 extracts this
-         executeAfter,                                 // minAmountOut - repurposed as timestamp!
-         formData.recipientAddress,                    // recipient
+         [
+           formData.tokenAddress,           // token
+           formData.recipientAddress,       // recipient
+           BigInt(formData.transferAmount), // amount
+           executeAfter,                    // executeAfter
+         ]
        ]
      ) as `0x${string}`;
```

### Step 2: Remove Outdated Comments

Remove the old Uniswap compatibility comments since we're now using clean struct encoding.

### Step 3: Test

Run frontend task creation and verify:
1. Task created successfully
2. Action parameters match struct format
3. Task execution succeeds (no "Invalid token" error)
4. Tokens transferred to recipient

---

## Testing Before & After

### BEFORE (Current - Broken):
```
Frontend creates task with 6-parameter encoding
  ↓
Adapter tries to decode as 4-parameter struct
  ↓
Field misalignment
  ↓
tokens[0] = address(0)
  ↓
❌ Error: "Invalid token"
```

### AFTER (Fixed):
```
Frontend creates task with 4-parameter struct encoding
  ↓
Adapter decodes as 4-parameter struct
  ↓
Fields align correctly
  ↓
tokens[0] = tokenAddress
  ↓
✅ Task executes successfully
✅ Tokens transferred
✅ Reward distributed
```

---

## Why This Happened

The system went through these phases:

**Phase 1** (Old): Used 6-parameter Uniswap format
- Frontend and contracts all used this format

**Phase 2** (Recent Update): Refactored to clean struct format
- Deployment script updated ✅
- Smart contracts use clean structs ✅
- **Frontend NOT updated** ❌

**Phase 3** (Now): Discovered mismatch when testing frontend

The deployment script was updated correctly, but the frontend code was overlooked during the refactoring.

---

## Related Files

### Smart Contracts (All Correct ✅):
- [contracts/adapters/TimeBasedTransferAdapter.sol](contracts/adapters/TimeBasedTransferAdapter.sol) - Expects 4-param struct
- [contracts/core/TaskVault.sol](contracts/core/TaskVault.sol) - Validates token (rejects address(0))
- [contracts/core/TaskLogicV2.sol](contracts/core/TaskLogicV2.sol) - Executes actions

### Deployment Script (Fixed ✅):
- [scripts/deploy-updated-timebased-adapter.ts](scripts/deploy-updated-timebased-adapter.ts) - Uses correct encoding

### Frontend (Needs Fix ❌):
- [TaskerFrontend/client/src/pages/create-task.tsx](TaskerFrontend/client/src/pages/create-task.tsx) - **Lines 232-245 need update**

---

## Impact Analysis

### Current State:
- ❌ All tasks created from frontend fail with "Invalid token"
- ✅ Tasks created from deployment script work
- ✅ Smart contracts are correct
- ❌ Frontend blocks user from creating tasks

### After Fix:
- ✅ Frontend tasks work
- ✅ Deployment script still works
- ✅ All encoding consistent
- ✅ Users can create tasks from both sources

---

## Verification Checklist

After updating frontend:

- [ ] Frontend compilation succeeds
- [ ] Create task form renders correctly
- [ ] Task created with TIME_BASED_TRANSFER template
- [ ] Action parameters logged show 4 parameters (not 6)
- [ ] Task execution succeeds (no "Invalid token" error)
- [ ] Recipient receives tokens
- [ ] Task marked COMPLETED
- [ ] Console shows ✅ everywhere (no ❌ errors)

---

## Code Locations to Update

### PRIMARY FIX:
**File**: [TaskerFrontend/client/src/pages/create-task.tsx](TaskerFrontend/client/src/pages/create-task.tsx)
**Lines**: 232-245 (encoding section)
**Change**: 6-parameter → 4-parameter struct encoding

### OPTIONAL CLEANUP:
**File**: [TaskerFrontend/client/src/pages/create-task.tsx](TaskerFrontend/client/src/pages/create-task.tsx)
**Lines**: 232-234 (outdated comments)
**Change**: Update or remove Uniswap compatibility references

---

## Summary

| Aspect | Issue | Root Cause | Fix |
|--------|-------|-----------|-----|
| **Encoding Format** | 6 vs 4 parameters | Old Uniswap code not updated | Update frontend to use 4-param struct |
| **Field Order** | Wrong positions | Loose type vs struct layout | Use tuple encoding `["tuple(...)"]` |
| **Error** | "Invalid token" | token field reads address(0) | Correct parameter order |
| **Impact** | Frontend tasks fail | Frontend code outdated | Single change in encoding |
| **Smart Contracts** | All correct ✅ | No changes needed | Deploy script fixed, frontend to follow |

---

## Quick Reference

### What needs changing:

Only ONE function in ONE file:

**File**: [TaskerFrontend/client/src/pages/create-task.tsx](TaskerFrontend/client/src/pages/create-task.tsx)
**Function**: `handleCreate()`
**Lines**: 235-245 (adapterParams encoding)

### What changes:

```typescript
// Change from 6 parameters:
encode(["address", "address", "address", "uint256", "uint256", "address"], [...])

// To 4-parameter struct:
encode(["tuple(address,address,uint256,uint256)"], [[...]])
```

### Expected result:

✅ Frontend tasks now execute successfully like deployment script

---

**Status**: Ready for frontend update
**Estimated Fix Time**: 5 minutes
**Estimated Testing Time**: 10 minutes
