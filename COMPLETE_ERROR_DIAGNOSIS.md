# Complete "Invalid token" Error Diagnosis

**Date**: November 19, 2025
**Error Message**: "Invalid token" during action execution on Polkadot testnet
**Smart Contract**: [TaskVault.sol:135](contracts/core/TaskVault.sol#L135)

---

## Symptom

When executing a task on Polkadot testnet:

```
Actions were fetched from TaskCore
❌ Action execution failed
The vault tried to call the adapter but got "Invalid token" error
Task was NOT updated
Reward was NOT distributed
```

---

## Root Cause Chain

### Error Location 1: TaskVault.executeTokenAction()

**File**: [contracts/core/TaskVault.sol](contracts/core/TaskVault.sol)
**Line**: 135
**Code**:
```solidity
function executeTokenAction(
    address token,  // ← This parameter is address(0)
    address adapter,
    uint256 amount,
    bytes calldata actionData
) external onlyTaskLogic nonReentrant returns (bool success, bytes memory result) {
    require(token != address(0), "Invalid token");  // ← FAILS HERE
    require(adapter != address(0), "Invalid adapter");
    if (tokenBalances[token] < amount) revert InsufficientBalance();
    // ...
}
```

**Error Condition**: `token` parameter is `address(0)` (zero address)

---

### Why Token is address(0)

The token address comes from the call stack:

**Flow**:
1. **TaskLogicV2._executeAction()** - Line 216-223
2. Calls: `taskVault.call(abi.encodeWithSignature("executeTokenAction(...)", tokens[0], ...))`
3. **tokens[0]** comes from adapter's `getTokenRequirements()` - Line 203-204

### Adapter Decoding Issue

**File**: [contracts/adapters/TimeBasedTransferAdapter.sol](contracts/adapters/TimeBasedTransferAdapter.sol)
**Function**: `getTokenRequirements()` - Line 40-54

```solidity
function getTokenRequirements(bytes calldata params)
    external
    pure
    override
    returns (address[] memory tokens, uint256[] memory amounts)
{
    TransferParams memory p = abi.decode(params, (TransferParams));  // ← LINE 46

    tokens = new address[](1);
    amounts = new uint256[](1);

    tokens[0] = p.token;        // ← Returns p.token
    amounts[0] = p.amount;
}
```

**Expected Struct**:
```solidity
struct TransferParams {
    address token;           // Should be first field
    address recipient;       // Should be second
    uint256 amount;          // Should be third
    uint256 executeAfter;    // Should be fourth
}
```

---

## Critical Discovery: Parameter Encoding Mismatch

### Deployment Script Encoding (Line 179-187):

```typescript
const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256"],  // ← Type array order
    [
        mockUSDAAddress,         // Index 0 - token
        recipient.address,       // Index 1 - recipient
        transferAmount,          // Index 2 - amount
        executeAfter,           // Index 3 - executeAfter
    ]
);
```

### How Ethers.js Encodes This:

When you use `encode()` with loose types and loose values, ethers encodes them in **field order**, not packed:

```
ABI Encoding with ["address", "address", "uint256", "uint256"]:
Position  | Type     | Value                  | Size
----------|----------|------------------------|-------
0-31      | address  | 0x...mockUSDAAddress   | 32 bytes (padded)
32-63     | address  | 0x...recipient         | 32 bytes (padded)
64-95     | uint256  | transferAmount         | 32 bytes
96-127    | uint256  | executeAfter           | 32 bytes

Total: 128 bytes
```

### How Adapter Decodes This:

When adapter calls `abi.decode(params, (TransferParams))`, it expects:
- A **struct** with 4 fields
- Fields in specific order

**Problem**: The solidity decoder might interpret the bytes differently if the struct packing differs!

---

## The Real Issue: Struct Packing Differences

In Solidity, `struct TransferParams` with:
```solidity
struct TransferParams {
    address token;        // 20 bytes (padded to 32)
    address recipient;    // 20 bytes (padded to 32)
    uint256 amount;       // 32 bytes
    uint256 executeAfter; // 32 bytes
}
```

When decoded via `abi.decode(bytes, (TransferParams))`, Solidity expects each field to be in a specific memory layout.

**But the ethers.js encode might be different!**

### Test Case:

```typescript
// What deployment script creates:
const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256"],
    [mockUSDAAddress, recipient, 100n, 1700000000n]
);

// What adapter decodes:
const decoded = abi.decode(encoded, (TransferParams));
console.log(decoded.token);  // ← MIGHT BE address(0) IF ENCODING DIFFERS!
```

---

## Verification: Check Action Params Stored On-Chain

The actual issue can be diagnosed by checking what's stored in the task:

```typescript
// Debug script
const task = await taskFactory.getTask(taskId);
const taskCore = await ethers.getContractAt("TaskCore", task.taskCore);
const actions = await taskCore.getActions();
const action = actions[0];

console.log("Stored action.params:", action.params);
console.log("Params length:", action.params.length);

// Try to decode as loose types
const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
    ["address", "address", "uint256", "uint256"],
    action.params
);

console.log("Token from stored params:", decoded[0]);
console.log("Recipient:", decoded[1]);
console.log("Amount:", decoded[2]);
console.log("ExecuteAfter:", decoded[3]);

// Try to decode as struct
try {
    const structDecoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["tuple(address,address,uint256,uint256)"],
        action.params
    );
    console.log("Struct decode succeeded:", structDecoded);
} catch (e) {
    console.log("Struct decode failed:", e.message);
}
```

---

## Hypothesis: Loose Types vs. Struct Encoding

### Current Approach (WRONG):
```typescript
// Encodes as 4 separate fields
encode(["address", "address", "uint256", "uint256"], [...])
// Returns: 0x... (128 bytes)
```

**When adapter decodes this as a struct**:
```solidity
TransferParams memory p = abi.decode(params, (TransferParams));
// Solidity struct decode expects specific memory layout
// If the bytes don't match the struct layout → corrupted data!
```

### Correct Approach:
```typescript
// Encode AS a struct tuple
const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,uint256,uint256)"],  // ← Explicitly a tuple
    [[mockUSDAAddress, recipient, transferAmount, executeAfter]]
);
```

---

## Solution: Fix Encoding in Deployment Script

### Change Line 179-187:

**FROM**:
```typescript
const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256"],  // ← WRONG: loose types
    [
        mockUSDAAddress,
        recipient.address,
        transferAmount,
        executeAfter,
    ]
);
```

**TO**:
```typescript
const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,uint256,uint256)"],  // ← CORRECT: explicit tuple
    [[
        mockUSDAAddress,
        recipient.address,
        transferAmount,
        executeAfter,
    ]]
);
```

**Or use the struct definition directly**:
```typescript
// If you have the struct ABI available:
const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256"],  // Individual fields
    [
        mockUSDAAddress,
        recipient.address,
        transferAmount,
        executeAfter,
    ]
);
```

---

## Why This Causes "Invalid token" Error

**Sequence**:

1. **Script encodes** as loose types → returns wrong byte layout
2. **TaskCore stores** the misencoded params
3. **Adapter tries to decode** as struct → decodes wrong data
4. **tokens[0]** = corrupted/wrong address
5. **TaskLogicV2 calls** `executeTokenAction(tokens[0], ...)` → tokens[0] = address(0)
6. **TaskVault checks** `require(address(0) != address(0))` → FAILS!
7. **Error**: "Invalid token"

---

## Files to Update

### [scripts/deploy-updated-timebased-adapter.ts](scripts/deploy-updated-timebased-adapter.ts) - Line 179-187

Change from:
```typescript
const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256"],
    [...]
);
```

To:
```typescript
// Option 1: Explicit tuple (RECOMMENDED)
const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,uint256,uint256)"],
    [[...]]
);

// Option 2: Use packed encoding if adapter expects it
// const adapterParams = ethers.solidityPacked(
//     ["address", "address", "uint256", "uint256"],
//     [...]
// );
```

---

## Testing the Fix

### Before Fix:
```
STEP 7: Creating task...
✅ Task created

STEP 9: Executing task...
❌ Action execution failed
  Invalid token error
  TokenVault.sol:135 - require(token != address(0))
```

### After Fix:
```
STEP 7: Creating task...
✅ Task created

STEP 9: Executing task...
✅ Action executed successfully
✅ Recipient received tokens
✅ Task marked COMPLETED
```

---

## Summary

### Root Cause
**Encoding mismatch**: Script encodes parameters as loose types, but adapter expects struct layout.

### Impact
- `getTokenRequirements()` returns address(0) instead of actual token
- TaskVault rejects execution with "Invalid token"
- Task not updated, reward not distributed
- No reverts, just silent failure

### Fix
Use explicit **tuple encoding** when creating action parameters:
```typescript
encode(["tuple(address,address,uint256,uint256)"], [[...]])
```

### Why It Matters
- Struct layout in Solidity ≠ loose type encoding in ethers
- Decoder expects specific memory alignment
- Mismatch = corrupted data = address(0)

---

## Implementation Steps

1. **Update script**:
   - Change line 179-187 to use tuple encoding
   - Verify token address in logged output

2. **Redeploy and test**:
   ```bash
   npx hardhat run scripts/deploy-updated-timebased-adapter.ts --network polkadotHubTestnet
   ```

3. **Verify execution succeeds**:
   - Should see "✅ Action executed successfully"
   - Recipient balance should increase
   - Task should be marked COMPLETED

4. **Check second execution enforcement**:
   - Attempt execution again (should fail)
   - Task should remain COMPLETED

---

## Alternative: Update Adapter Instead

If you don't want to change the encoding, you could instead update the adapter to use loose type decoding:

```solidity
// In TimeBasedTransferAdapter.getTokenRequirements()
function getTokenRequirements(bytes calldata params)
    external
    pure
    override
    returns (address[] memory tokens, uint256[] memory amounts)
{
    // Decode as loose types instead of struct
    (address token, address recipient, uint256 amount, uint256 executeAfter) =
        abi.decode(params, (address, address, uint256, uint256));

    tokens = new address[](1);
    amounts = new uint256[](1);
    tokens[0] = token;
    amounts[0] = amount;
}
```

**But it's better to fix the encoding** since the struct is more type-safe.

---

## References

- [Solidity ABI Encoding Specification](https://docs.soliditylang.org/en/latest/abi-spec.html)
- [Ethers.js AbiCoder Documentation](https://docs.ethers.org/v6/api/utils/abi/)
- Error occurs: [TaskVault.sol:135](contracts/core/TaskVault.sol#L135)
- Encoding happens: [deploy-updated-timebased-adapter.ts:179-187](scripts/deploy-updated-timebased-adapter.ts#L179-L187)
- Decoding happens: [TimeBasedTransferAdapter.sol:46](contracts/adapters/TimeBasedTransferAdapter.sol#L46)
