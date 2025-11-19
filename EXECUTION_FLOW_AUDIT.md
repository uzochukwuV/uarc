# TaskerOnChain - Complete Execution Flow Audit & Trace

## Overview
This document traces the complete task creation and execution flow to identify the unlimited execution issue.

---

## TASK CREATION FLOW

### 1. Frontend → Smart Contract
**User calls:** `TaskFactory.createTaskWithTokens(taskParams, actions, deposits)`

**TaskParams structure:**
```solidity
struct TaskParams {
    uint256 expiresAt;           // Task expiration time (0 = no expiration)
    uint256 maxExecutions;        // CRITICAL: Max number of executions (0 = unlimited)
    uint256 recurringInterval;    // Recurring execution interval
    uint256 rewardPerExecution;   // ETH reward per execution
    bytes32 seedCommitment;       // Seed for executor authorization
}
```

⚠️ **ISSUE HYPOTHESIS**: Frontend might be sending `maxExecutions: 0` by default!

### 2. TaskFactory._createTask() - Line 92
**Steps:**
1. **Validate parameters** (Line 98)
   - Checks `actions.length > 0 && actions.length <= 10`
   - Does NOT validate `maxExecutions`!

2. **Calculate funding** (Line 115-117)
   ```solidity
   uint256 totalReward = params.maxExecutions == 0
       ? params.rewardPerExecution
       : params.rewardPerExecution * params.maxExecutions;
   ```
   - If `maxExecutions == 0`, only requires 1x reward
   - If `maxExecutions > 0`, requires N × reward

3. **Create metadata** (Line 126-139)
   ```solidity
   ITaskCore.TaskMetadata memory metadata = ITaskCore.TaskMetadata({
       id: taskId,
       creator: msg.sender,
       createdAt: uint96(block.timestamp),
       expiresAt: params.expiresAt,
       maxExecutions: params.maxExecutions,  // ← STORED HERE
       executionCount: 0,
       lastExecutionTime: 0,
       recurringInterval: params.recurringInterval,
       rewardPerExecution: params.rewardPerExecution,
       status: ITaskCore.TaskStatus.ACTIVE,
       actionsHash: actionsHash,
       seedCommitment: params.seedCommitment
   });
   ```

4. **Initialize TaskCore** (Line 142-148)
   - Passes metadata with stored `maxExecutions`

5. **Store actions on-chain** (Line 151)
   - `_storeActions(taskCore, actions)`
   - Actions are persistent and retrievable

6. **Initialize TaskVault** (Line 154)
   - Vault receives funds based on calculated `totalReward`

---

## TASK EXECUTION FLOW - THE CRITICAL PATH

### Step 1: ExecutorHub.executeTask(uint256 taskId)
**Location:** [contracts/core/ExecutorHub.sol:126](contracts/core/ExecutorHub.sol#L126)

```solidity
function executeTask(uint256 taskId) external nonReentrant returns (bool success) {
    ITaskLogic.ExecutionParams memory params = ITaskLogic.ExecutionParams({
        taskId: taskId,
        executor: msg.sender,
        seed: bytes32(0),
        actionsProof: bytes("")  // ← No longer needed
    });

    ITaskLogic(taskLogic).executeTask(params);
    // ... tracking code
}
```

### Step 2: TaskLogicV2.executeTask() - THE GATEWAY
**Location:** [contracts/core/TaskLogicV2.sol:45](contracts/core/TaskLogicV2.sol#L45)

```solidity
function executeTask(ExecutionParams calldata params)
    external
    onlyExecutorHub
    whenNotPaused
    nonReentrant
    returns (ExecutionResult memory result)
{
    uint256 startGas = gasleft();

    // Step 2a: Load and validate task
    (address taskCore, address taskVault) = _loadTask(params.taskId);
    ITaskCore.TaskMetadata memory metadata = ITaskCore(taskCore).getMetadata();

    // Step 2b: Verify seed commitment (optional)
    if (metadata.seedCommitment != bytes32(0)) {
        bytes32 providedCommitment = keccak256(abi.encode(params.seed));
        if (providedCommitment != metadata.seedCommitment) {
            revert InvalidSeed();  // ← EXECUTION BLOCKED
        }
    }

    // Step 2c: CRITICAL CHECK - Mark task as executing
    bool canExecute = ITaskCore(taskCore).executeTask(params.executor);
    if (!canExecute) revert TaskNotExecutable();  // ← EXECUTION BLOCKED HERE

    // Step 2d: Fetch and execute actions from TaskCore
    bool actionsSuccess = _verifyAndExecuteActions(
        taskCore,
        taskVault,
        metadata.actionsHash
    );

    // Step 2e: Distribute reward if successful
    if (actionsSuccess) {
        _distributeReward(taskVault, params.executor, metadata.rewardPerExecution, gasUsed);
        ITaskCore(taskCore).completeExecution(true);  // ← EXECUTION COUNT ++
    } else {
        ITaskCore(taskCore).completeExecution(false);  // ← EXECUTION COUNT NOT ++
    }
}
```

### Step 3: TaskCore.executeTask() - EXECUTION LIMIT ENFORCEMENT
**Location:** [contracts/core/TaskCore.sol:73](contracts/core/TaskCore.sol#L73)

```solidity
function executeTask(address executor) external onlyLogic returns (bool success) {
    require(metadata.status == TaskStatus.ACTIVE, "Not active");
    require(isExecutable(), "Not executable");  // ← CRITICAL CHECK #1

    metadata.status = TaskStatus.EXECUTING;
    return true;
}
```

### Step 4: TaskCore.isExecutable() - LIMIT ENFORCEMENT
**Location:** [contracts/core/TaskCore.sol:155](contracts/core/TaskCore.sol#L155)

```solidity
function isExecutable() public view returns (bool) {
    // Check 1: Status must be ACTIVE
    if (metadata.status != TaskStatus.ACTIVE) {
        return false;
    }

    // Check 2: Not expired
    if (metadata.expiresAt != 0 && block.timestamp > metadata.expiresAt) {
        return false;
    }

    // Check 3: MAX EXECUTIONS LIMIT - THE KEY CHECK
    if (metadata.maxExecutions > 0 && metadata.executionCount >= metadata.maxExecutions) {
        return false;  // ← Task is NOT executable when limit reached
    }

    // Check 4: Recurring interval
    if (metadata.recurringInterval > 0 && metadata.lastExecutionTime > 0) {
        if (block.timestamp < metadata.lastExecutionTime + metadata.recurringInterval) {
            return false;
        }
    }

    return true;
}
```

**LOGIC ANALYSIS:**
- `if (metadata.maxExecutions > 0 && metadata.executionCount >= metadata.maxExecutions)`
- When `maxExecutions == 0`: Check is SKIPPED → Unlimited executions allowed
- When `maxExecutions > 0` AND `executionCount >= maxExecutions`: Returns FALSE
- When `maxExecutions > 0` AND `executionCount < maxExecutions`: Returns TRUE

✅ **Logic is CORRECT**

### Step 5: TaskCore.completeExecution() - EXECUTION COUNT INCREMENT
**Location:** [contracts/core/TaskCore.sol:87](contracts/core/TaskCore.sol#L87)

```solidity
function completeExecution(bool success) external onlyLogic {
    require(metadata.status == TaskStatus.EXECUTING, "Not executing");

    if (success) {
        metadata.executionCount++;  // ← INCREMENTED HERE
        metadata.lastExecutionTime = block.timestamp;

        // Check if task completed
        if (metadata.maxExecutions > 0 && metadata.executionCount >= metadata.maxExecutions) {
            _setStatus(TaskStatus.COMPLETED);  // ← Task marked COMPLETED
        } else {
            _setStatus(TaskStatus.ACTIVE);  // ← Task remains ACTIVE for next execution
        }
    } else {
        _setStatus(TaskStatus.ACTIVE);  // ← Task remains ACTIVE on failure
    }
}
```

---

## ROOT CAUSE ANALYSIS

### Why Frontend Can Execute Unlimited Times

**SCENARIO 1: Task created with `maxExecutions: 0`**
```
Frontend creates task with TaskParams:
  maxExecutions: 0  // ← UNLIMITED!
  rewardPerExecution: 0.01 ETH

TaskFactory calculates:
  totalReward = 0.01 ETH (for unlimited executions!)
  Vault is funded with 0.01 ETH

Execution attempt 1:
  isExecutable() → maxExecutions == 0, so check is SKIPPED → TRUE
  Task executes → executionCount becomes 1
  completeExecution(true) → status remains ACTIVE

Execution attempt 2:
  isExecutable() → maxExecutions == 0, check is SKIPPED → TRUE
  Task executes → executionCount becomes 2
  But vault might run out of funds!

Execution attempt N:
  Until vault has no ETH left
```

**SCENARIO 2: Frontend not tracking `maxExecutions` properly**
- Frontend shows "Execute & Earn" button for completed tasks
- Smart contract correctly blocks execution (isExecutable() returns false)
- But frontend UI doesn't refresh to disable button
- User clicks repeatedly → Contract rejects each attempt

---

## DEBUGGING CHECKLIST

### On-Chain Checks (Smart Contract)
- [ ] Verify task creation sends correct `maxExecutions` value
- [ ] Log `maxExecutions` value in TaskCreated event
- [ ] Check `isExecutable()` is being called before execution
- [ ] Verify `executionCount` is incremented after each successful execution
- [ ] Confirm task status changes to COMPLETED when limit reached

### Front-End Checks
- [ ] Verify `maxExecutions` value displayed in marketplace
- [ ] Check `remainingExecutions` is correctly calculated
- [ ] Verify execute button is DISABLED when `remainingExecutions <= 0`
- [ ] Confirm UI refreshes after task execution
- [ ] Check transaction errors are displayed to user

### Data Flow Checks
- [ ] Trace what `maxExecutions` value is sent to TaskFactory
- [ ] Log metadata after task creation
- [ ] Log metadata before each execution attempt
- [ ] Compare frontend `maxExecutions` with on-chain value

---

## ENFORCEMENT MECHANISMS

### Current Enforcement (✅ Working as Designed)
1. **isExecutable()** - Returns false when `executionCount >= maxExecutions`
2. **executeTask()** - Reverts if `isExecutable()` returns false
3. **completeExecution()** - Sets status to COMPLETED when limit reached
4. **Status check** - Only ACTIVE tasks can execute

### Missing Enforcement (⚠️ Frontend-side)
1. **Disable execute button** - When `remainingExecutions <= 0`
2. **Refresh task status** - After each execution
3. **Validate maxExecutions** - When task is created

---

## RECOMMENDED FIXES

### 1. Add Event Logging
```solidity
// In TaskCore.executeTask()
emit ExecutionAttempted(taskId, executionCount, maxExecutions, isExecutable);
```

### 2. Add Parameter Validation
```solidity
// In TaskFactory._validateTaskParams()
if (params.maxExecutions == 0 && params.recurringInterval == 0) {
    revert("Set either maxExecutions or recurringInterval");
}
```

### 3. Frontend Button Logic
```typescript
// In marketplace.tsx
const isExecutionAllowed =
  task.status === "active" &&
  task.maxExecutions > 0 &&
  task.executionCount < task.maxExecutions;

<Button disabled={!isExecutionAllowed}>
  Execute & Earn
</Button>
```

### 4. Auto-refresh Task Status
```typescript
// After execution completes, refetch task metadata
await refetchTaskMetadata(taskId);
```

---

## TEST CASES TO VERIFY

### Test 1: Single Execution Task
```
Create task with maxExecutions: 1
Execute once → Should succeed
Execute again → Should fail with "Not executable"
```

### Test 2: Multi-Execution Task
```
Create task with maxExecutions: 5
Execute 5 times → All should succeed
Execute 6th time → Should fail
```

### Test 3: Unlimited Execution Task
```
Create task with maxExecutions: 0 (unlimited)
Execute 100 times → All should succeed (if vault has funds)
Status should remain ACTIVE, executionCount increases
```

### Test 4: Task Status Transitions
```
After max executions reached:
- Status should be COMPLETED (not ACTIVE)
- isExecutable() should return false
- executeTask() should revert
```

---

## CONCLUSION

✅ **Smart Contract Logic**: CORRECT
- `isExecutable()` properly enforces max execution limits
- `completeExecution()` correctly increments counter
- Task status transitions work as designed

❌ **Frontend Issues**: TO INVESTIGATE
- Verify `maxExecutions` value being sent to contract
- Check if UI refreshes after execution
- Verify execute button is disabled for completed tasks
- Check for "unlimited" tasks (maxExecutions = 0) being created by default

**Next Steps:**
1. Enable detailed logging in smart contracts
2. Trace actual `maxExecutions` value sent during task creation
3. Monitor execution count changes on-chain
4. Add frontend validation and auto-refresh
