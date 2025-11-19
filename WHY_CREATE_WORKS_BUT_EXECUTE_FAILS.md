# Why Task Creation Works But Execution Fails

**Question**: If the encoding is wrong, why does `createTask()` succeed?

**Answer**: Because the wrong encoding is only validated during **execution**, not during creation.

---

## The Two-Phase Process

### Phase 1: Task Creation ✅ (Works with wrong encoding)

```
User creates task with wrong encoding
  ↓
TaskFactory.createTaskWithTokens() is called
  ↓
Smart contract validates:
  ✅ Caller is not zero address
  ✅ Reward amount is valid
  ✅ Expiry is in the future
  ✅ Token deposits are valid amounts
  ✅ Actions array has items
  ✓ But: DOES NOT validate parameter encoding!
  ↓
Task is created and stored
  ↓
Action params are stored on-chain (as-is, no validation)
  ↓
✅ createTask() returns success
  ↓
UI shows: "Task created successfully!"
```

**Key Point**: TaskFactory **does NOT validate what's INSIDE the action params** during creation. It only checks that params exist as bytes.

### Phase 2: Task Execution ❌ (Fails with wrong encoding)

```
Executor tries to execute task
  ↓
ExecutorHub.executeTask() is called
  ↓
TaskLogicV2._executeAction() is called
  ↓
Adapter.getTokenRequirements(action.params) is called
  ↓
Adapter tries to DECODE the params
  ↓
❌ Decoding fails or produces wrong data
  ↓
tokens[0] = address(0) (from wrong byte position)
  ↓
TaskVault.executeTokenAction(address(0), ...)
  ↓
❌ require(token != address(0)) fails
  ↓
❌ Error: "Invalid token"
  ↓
Task execution fails
```

**Key Point**: Only during execution does the adapter actually **decode and validate** the parameters.

---

## Why This Happens

### Task Creation: Store, Don't Validate

**File**: [contracts/core/TaskFactory.sol](contracts/core/TaskFactory.sol)

```solidity
function createTaskWithTokens(
    TaskParams calldata taskParams,
    Action[] calldata actions,  // ← Just stored as-is
    TokenAmount[] calldata tokenDeposits,
    bytes32[] calldata actionsProof  // DEPRECATED
) external payable {
    // ...

    // Store actions on-chain
    for (uint256 i = 0; i < actions.length; i++) {
        ITaskCore(taskCore).setActions(actions[i]);
        // No validation of actions[i].params content!
        // Just store the bytes
    }

    // ✅ Task created successfully
}
```

The factory **stores** the action params as raw `bytes` without understanding their content.

### Task Execution: Decode and Use

**File**: [contracts/core/TaskLogicV2.sol](contracts/core/TaskLogicV2.sol)

```solidity
function _executeAction(
    address taskVault,
    ITaskCore.Action memory action
) internal returns (bool) {
    // Get adapter
    IActionRegistry.AdapterInfo memory adapterInfo =
        IActionRegistry(actionRegistry).getAdapter(action.selector);

    // THIS is where the encoding is validated!
    (address[] memory tokens, uint256[] memory amounts) =
        IActionAdapter(adapterInfo.adapter).getTokenRequirements(action.params);
        //                                   ↑
        //                            params are decoded HERE

    // If params were encoded wrong, tokens[0] will be wrong
    if (tokens[0] == address(0)) {
        // Next call will fail...
    }

    // Call vault with decoded token
    taskVault.call(
        abi.encodeWithSignature(
            "executeTokenAction(address,address,uint256,bytes)",
            tokens[0],  // ← If this is address(0), vault rejects!
            ...
        )
    );
}
```

During execution, the adapter **decodes** the params for the first time.

If the encoding was wrong, the decoder gets corrupted data.

---

## Visual Timeline

```
Minute 0: User Creates Task
│
├─ Task Data Input
│  ├─ tokenAddress: 0x...USDC
│  ├─ recipientAddress: 0x...user
│  ├─ amount: 100
│  └─ executeAfter: [future timestamp]
│
├─ Frontend Encoding (WRONG FORMAT)
│  └─ 6 parameters → [0, usdc, 0, 100, timestamp, recipient]
│
├─ TaskFactory Validation
│  ├─ ✅ Caller valid
│  ├─ ✅ Reward valid
│  ├─ ✅ Expiry valid
│  ├─ ✅ Tokens valid
│  ├─ ❌ Does NOT validate encoding! (just stores bytes)
│  └─ ✅ Task created
│
└─ User sees: "✅ Task created successfully!"


⏳ 1 hour later: Time condition met


Minute 60+: Executor Tries to Execute Task
│
├─ ExecutorHub.executeTask() called
│
├─ TaskLogicV2._executeAction() called
│
├─ Adapter.getTokenRequirements(params) called
│  ├─ Tries to decode as 4-param struct
│  ├─ But received 6-param encoding
│  ├─ Field misalignment occurs
│  ├─ Reads from wrong byte positions
│  └─ tokens[0] = address(0) (from first param)
│
├─ TaskVault.executeTokenAction(address(0), ...)
│  └─ ❌ require(token != address(0)) fails
│
└─ User sees: "❌ Invalid token error"
```

---

## The Key Difference

### Task Creation Only Cares: "Are there params?"
```solidity
// TaskFactory.sol - very loose
require(actions.length > 0);  // Just need some actions
require(actions[i].params.length > 0);  // Just need some params
// That's it! No content validation.
```

### Task Execution Cares: "What's IN the params?"
```solidity
// TimeBasedTransferAdapter.sol - very strict
TransferParams memory p = abi.decode(params, (TransferParams));
// Expects specific struct layout
// If layout wrong → corrupted data
```

---

## Why This Design?

This is actually intentional:

**Reason 1: Separation of Concerns**
- TaskFactory just orchestrates task creation
- Individual adapters understand their own parameter formats
- Factory shouldn't know about every adapter's format

**Reason 2: Flexibility**
- Different adapters have different parameter formats
- Each adapter defines its own struct
- Factory treats all params as generic `bytes`

**Reason 3: Extensibility**
- New adapters can be added without changing TaskFactory
- Each adapter responsible for validating its own params
- Factory doesn't need modification

---

## The Encoding Error Lifecycle

```
Creation Time:
  encode() → bytes → store → ✅ Success

Execution Time:
  fetch bytes → decode() → ❌ Mismatch → ❌ Failure
```

**The bytes don't change** - they're stored exactly as created. But:
- **At creation**: bytes are not interpreted, just stored
- **At execution**: bytes are decoded, and the wrong format causes corruption

---

## Analogy

Think of it like **sending a postcard**:

**Mailing**: ✅ Works
```
Postcard with wrong address format
  → Post office doesn't read/validate the address details
  → Just puts it in the system
  → ✅ "Mail accepted!"
```

**Delivery**: ❌ Fails
```
Postal worker tries to read the address
  → Address format is wrong
  → Can't parse destination
  → ❌ "Return to sender - Invalid address"
```

The mail system accepts anything at creation, but fails at delivery if the content is wrong.

---

## Why Fix Is So Simple

Since the error is in encoding (not in contract logic), the fix is just to **encode correctly**:

```typescript
// WRONG: 6 parameters
encode(["address", "address", "address", "uint256", "uint256", "address"], [...])

// RIGHT: 4-parameter struct
encode(["tuple(address,address,uint256,uint256)"], [[...]])
```

Same data, different format. Execution will now decode correctly.

---

## Why Both Fixes Were Needed

You need to fix encoding in **both places**:

1. **Deployment Script**: For testing and backend task creation
2. **Frontend**: For user-created tasks

If you only fixed the deployment script:
- ✅ Script-created tasks would work
- ❌ Frontend-created tasks would still fail
- ❌ Users can't create tasks

If you only fixed the frontend:
- ❌ Script-created tasks would fail
- ✅ Frontend-created tasks would work
- ❌ Backend automation would break

Both must use **the same encoding format** that the adapter expects.

---

## Why This Wasn't Caught in Testing

LocalHardhat tests pass because:

```typescript
// In test: Everything is correct and aligned
const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256"],  // 4 params
    [token, recipient, amount, executeAfter]
);

// Adapter decodes
const decoded = abi.decode(adapterParams, (TransferParams));
// All fields align correctly → tests pass ✅
```

But real world has multiple sources:

```
Deployment Script → encode(["address", ...]) → Works ✅
Frontend → encode(["address", "address", "address", ...]) → Fails ❌
```

The mismatch only shows up when **different encoding sources** are used.

---

## Key Takeaway

**Task creation doesn't validate the encoding because it doesn't need to.**

Task creation just needs to:
- Store parameters safely
- Ensure amounts are valid
- Create the task data structure

Task execution actually uses the parameters and discovers if they're wrong.

This is **lazy validation** - validate only when you use the data.

It's good design for flexibility, but means bugs only surface at execution time.

---

## Summary

```
┌─────────────────────────────────────────┐
│  Why Creation Works, Execution Fails    │
├─────────────────────────────────────────┤
│                                         │
│  Creation:                              │
│  ├─ Takes encoded params as bytes       │
│  ├─ Validates amounts and structure     │
│  ├─ Does NOT validate encoding          │
│  └─ ✅ Succeeds even with wrong format  │
│                                         │
│  Execution:                             │
│  ├─ Fetches stored params (wrong format)│
│  ├─ Tries to decode them               │
│  ├─ Decoding fails/produces wrong data  │
│  └─ ❌ Fails during execution           │
│                                         │
│  Fix:                                   │
│  ├─ Use correct encoding format         │
│  ├─ Creation will still work            │
│  └─ Execution will now work too         │
│                                         │
└─────────────────────────────────────────┘
```

---

**The encoding error is a **DATA FORMAT issue**, not a contract logic issue.**

Contract logic is sound. It correctly validates what it receives. But if you send it the wrong data format, it correctly rejects it during execution.

That's actually good design - fail fast when using the data, not when storing it.
