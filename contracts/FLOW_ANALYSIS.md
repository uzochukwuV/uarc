# TaskerOnChain V2 - Complete Flow Analysis

## Document Purpose
This document provides a detailed trace of how tasks are created and executed through all smart contracts, including state management, read/write operations, and data flow.

---

## 1. TASK CREATION FLOW

### 1.1 Entry Point: TaskFactory.createTask()

**Caller:** Task creator (user)
**Function:** `TaskFactory.createTask(TaskParams, ActionParams[])` or `createTaskWithTokens(..., TokenDeposit[])`

```
User
  ├─ Sends: ETH (reward funding + optional creation fee)
  ├─ Sends: ERC20 tokens (optional)
  ├─ Sends: TaskParams {
  │   ├─ expiresAt: uint256
  │   ├─ maxExecutions: uint256
  │   ├─ recurringInterval: uint256
  │   ├─ rewardPerExecution: uint256
  │   └─ seedCommitment: bytes32
  │ }
  └─ Sends: ActionParams[] {
      ├─ selector: bytes4 (function selector)
      ├─ protocol: address (protocol being called)
      └─ params: bytes (encoded parameters)
    }

TaskFactory.createTask()
  └─ _createTask(params, actions, deposits)
```

### 1.2 Validation Phase

**Location:** [TaskFactory.sol:92-226](TaskFactory.sol#L92-L226)

```
_validateTaskParams():
  ├─ Check: rewardPerExecution >= minTaskReward
  ├─ Check: expiresAt validity
  │  ├─ If expiresAt != 0:
  │  │  ├─ expiresAt > block.timestamp (not in past)
  │  │  └─ expiresAt <= block.timestamp + maxTaskDuration
  ├─ Check: actions.length > 0 && actions.length <= 10
  └─ State: All validations happen on-chain
     No state modified at this stage

Funding Validation:
  ├─ Collect creation fee (if creationFee > 0)
  ├─ Calculate total reward needed:
  │  ├─ totalReward = rewardPerExecution (if maxExecutions == 0)
  │  └─ totalReward = rewardPerExecution * maxExecutions (if maxExecutions > 0)
  ├─ Verify: msg.value >= creationFee + totalReward
  └─ Return: providedValue = msg.value - creationFee
```

### 1.3 Task ID Assignment & Clone Deployment

**Location:** [TaskFactory.sol:105-112](TaskFactory.sol#L105-L112)

```
STATE WRITES:
  nextTaskId++  ← Task ID counter increments

DEPLOYMENT (EIP-1167 Minimal Proxies):
  taskId = nextTaskId - 1  ← Current task gets this ID

  taskCore = taskCoreImplementation.clone()
    └─ Creates minimal proxy → calls TaskCore.initialize()

  taskVault = taskVaultImplementation.clone()
    └─ Creates minimal proxy → calls TaskVault.initialize()

RESULT:
  - taskCore: Independent contract instance for this task
  - taskVault: Independent contract instance for this task
  - Gas saved: ~50-60% vs full contract deployment
```

### 1.4 Metadata Creation

**Location:** [TaskFactory.sol:114-139](TaskFactory.sol#L114-L139)

```
Calculate total funding:
  totalReward = params.rewardPerExecution * (params.maxExecutions == 0 ? 1 : params.maxExecutions)

Hash actions:
  actionsHash = keccak256(abi.encode(actions[]))

Create TaskMetadata struct:
  metadata = {
    id: taskId,
    creator: msg.sender,
    createdAt: uint96(block.timestamp),
    expiresAt: params.expiresAt,
    maxExecutions: params.maxExecutions,
    executionCount: 0,                    ← Starts at 0
    lastExecutionTime: 0,                 ← No execution yet
    recurringInterval: params.recurringInterval,
    rewardPerExecution: params.rewardPerExecution,
    status: TaskStatus.ACTIVE,            ← Initial status
    actionsHash: actionsHash,             ← For verification
    seedCommitment: params.seedCommitment
  }

STATE WRITE in TaskCore:
  TaskCore.initialize(taskId, msg.sender, taskVault, taskLogic, metadata)
```

### 1.5 TaskCore Initialization

**Location:** [TaskCore.sol:47-68](TaskCore.sol#L47-L68)

```
TaskCore.initialize(id, creator, vault, logic, metadata):
  STATE WRITES:
    ├─ initialized = true        ← Prevent re-initialization
    ├─ taskId = id
    ├─ creator = creator
    ├─ vault = vault
    ├─ logic = logic
    ├─ metadata = metadata

  INVARIANT:
    ├─ Each field set exactly once
    └─ No state modifications after initialization
```

### 1.6 Action Storage Phase

**Location:** [TaskFactory.sol:150-151](TaskFactory.sol#L150-L151), [TaskCore.sol:220-229](TaskCore.sol#L220-L229)

```
PHASE: Store actions on-chain

_storeActions(taskCore, actions[]):
  ├─ Convert ActionParams[] → ITaskCore.Action[]
  └─ For each action:
      └─ Create Action struct {
          ├─ selector: bytes4
          ├─ protocol: address
          └─ params: bytes
        }

TaskCore.setActions(actions[]):
  STATE WRITES:
    └─ For each action:
        └─ storedActions.push(action)

  RESULT:
    ├─ Actions now stored on-chain in TaskCore
    ├─ No need for off-chain proofs during execution
    └─ Integrity checked via actionsHash
```

### 1.7 TaskVault Initialization & Funding

**Location:** [TaskFactory.sol:153-177](TaskFactory.sol#L153-L177), [TaskVault.sol:62-77](TaskVault.sol#L62-L77)

```
TaskVault.initialize(_taskCore, _creator, _rewardManager):
  STATE WRITES:
    ├─ initialized = true
    ├─ taskCore = _taskCore
    ├─ creator = _creator
    ├─ rewardManager = _rewardManager
    └─ taskLogic = ITaskCore(_taskCore).logic()

Fund with Native Tokens:
  if (providedValue > 0):
    TaskVault.depositNative{value: providedValue}()
      STATE WRITES:
        └─ nativeBalance += msg.value

Fund with ERC20 Tokens:
  for each TokenDeposit:
    ├─ Transfer tokens from creator → TaskFactory
    ├─ Approve vault to spend tokens
    ├─ TaskVault.depositToken(token, amount)
    │   STATE WRITES:
    │   ├─ If not tracked:
    │   │  ├─ trackedTokens.push(token)
    │   │  └─ isTracked[token] = true
    │   ├─ tokenBalances[token] += amount
    │   └─ Transfer tokens from TaskFactory → TaskVault
    └─ Clear approval

RESULT:
  ├─ nativeBalance = providedValue
  ├─ tokenBalances[token] = amount (for each token)
  ├─ nativeReserved = 0
  ├─ tokenReserved[token] = 0
  └─ Vault ready to pay executor and execute actions
```

### 1.8 GlobalRegistry Registration

**Location:** [TaskFactory.sol:196-208](TaskFactory.sol#L196-L208)

```
if (globalRegistry != address(0)):
  globalRegistry.registerTask(taskId, taskCore, taskVault, creator)

    GlobalRegistry.registerTask():
      STATE WRITES:
        ├─ tasks[taskId] = TaskInfo {
        │   ├─ taskId
        │   ├─ taskCore
        │   ├─ taskVault
        │   ├─ creator
        │   ├─ createdAt: metadata.createdAt
        │   ├─ expiresAt: metadata.expiresAt
        │   └─ status: ACTIVE
        │ }
        ├─ allTaskIds.push(taskId)
        ├─ tasksByCreator[creator].push(taskId)
        ├─ tasksByStatus[ACTIVE].push(taskId)
        └─ totalTasks++

RESULT:
  ├─ Task discoverable via GlobalRegistry
  ├─ Can query by creator, status, pagination
  └─ Enables task marketplace functionality
```

### 1.9 Task Creation Summary

**Stored Data After Creation:**

```
TaskFactory.tasks[taskId]:
  ├─ taskId
  ├─ taskCore: <clone address>
  ├─ taskVault: <clone address>
  └─ creator: <user address>

TaskCore storage:
  ├─ id: taskId
  ├─ creator: user
  ├─ vault: taskVault address
  ├─ logic: taskLogic address
  ├─ metadata: [all task params]
  └─ storedActions[]: [action1, action2, ...]

TaskVault storage:
  ├─ taskCore: taskCore address
  ├─ creator: user
  ├─ rewardManager: address
  ├─ taskLogic: address
  ├─ nativeBalance: provided ETH
  ├─ tokenBalances: {token → amount}
  ├─ trackedTokens[]: [token1, token2, ...]
  └─ nativeReserved: 0 (no execution yet)

GlobalRegistry.tasks[taskId]:
  ├─ taskId
  ├─ taskCore, taskVault, creator
  ├─ createdAt, expiresAt, status
  └─ Indexed in multiple mappings
```

**Events Emitted:**
```
TaskFactory: TaskCreated(
  taskId,
  creator,
  taskCore,
  taskVault,
  rewardPerExecution,
  maxExecutions
)

GlobalRegistry: TaskRegistered(
  taskId,
  creator,
  taskCore,
  taskVault
)
```

---

## 2. TASK EXECUTION FLOW

### 2.1 Entry Point: ExecutorHub.executeTask()

**Caller:** Executor (anyone on testnet)
**Function:** `ExecutorHub.executeTask(uint256 taskId)`

```
Executor
  └─ Calls: executorHub.executeTask(taskId)

      ExecutorHub.executeTask():
        ├─ TESTNET: No registration check (line 129-131 commented)
        ├─ TESTNET: No blacklist check (line 133-135 commented)
        └─ Creates ExecutionParams:
            ├─ taskId
            ├─ executor: msg.sender
            ├─ seed: bytes32(0)  ← No seed needed
            └─ actionsProof: bytes("")  ← No proof needed
```

### 2.2 TaskLogicV2 Execution Phase

**Location:** [TaskLogicV2.sol:44-112](TaskLogicV2.sol#L44-L112)

#### STEP 1: Load Task from Registry

```
_loadTask(taskId):
  └─ taskRegistry.staticcall(getTaskAddresses(taskId))

      GlobalRegistry.getTaskAddresses(taskId):
        STATE READS:
          └─ tasks[taskId] → (taskCore, taskVault)

        RETURN: (taskCore address, taskVault address)

RESULT:
  ├─ taskCore: Contract instance managing task state
  └─ taskVault: Contract instance holding task funds
```

#### STEP 2: Verify Task is Executable

```
TaskCore.getMetadata():
  STATE READS:
    └─ metadata (entire TaskMetadata struct)

TaskCore.isExecutable():
  ├─ Check: status == ACTIVE
  ├─ Check: expiresAt == 0 OR block.timestamp <= expiresAt
  ├─ Check: maxExecutions == 0 OR executionCount < maxExecutions
  ├─ Check: recurringInterval == 0 OR
  │          (lastExecutionTime == 0 OR block.timestamp >= lastExecutionTime + recurringInterval)
  └─ RETURN: bool canExecute

Validation:
  if (!canExecute):
    REVERT with TaskNotExecutable()
```

#### STEP 3: Mark Task as EXECUTING

```
TaskCore.executeTask(executor):
  ├─ Check: status == ACTIVE
  ├─ Emit: ExecutionCheckpoint()
  │   (Used for debugging/monitoring)
  └─ STATE WRITE:
      ├─ oldStatus = ACTIVE
      └─ status = EXECUTING

  RESULT:
    ├─ Task locked from concurrent execution
    └─ Ready for action execution
```

#### STEP 4: Fetch & Execute Actions

```
TaskCore.getActions():
  STATE READS:
    └─ storedActions[]  ← Actions stored during creation

  RETURN: Action[] array

FOR EACH action IN actions:
  ├─ ActionRegistry.getAdapter(action.selector)
  │   STATE READS:
  │   └─ adapters[selector] → AdapterInfo
  │
  │   RETURN: AdapterInfo {
  │     ├─ adapter: address
  │     ├─ isActive: bool
  │     ├─ gasLimit: uint256
  │     └─ requiresTokens: bool
  │   }
  │
  ├─ Check: adapter.isActive == true
  │
  ├─ Check: actionRegistry.isProtocolApproved(action.protocol)
  │
  ├─ Call adapter.getTokenRequirements(action.params)
  │   Returns: (tokens[], amounts[])
  │
  ├─ IF tokens.length == 1 (single-token adapter):
  │   │
  │   ├─ Encode adapter call:
  │   │  └─ abi.encodeWithSelector(
  │   │      IActionAdapter.execute.selector,
  │   │      taskVault,
  │   │      action.params
  │   │    )
  │   │
  │   └─ Call TaskVault.executeTokenAction():
  │       ├─ token: tokens[0]
  │       ├─ adapter: adapterInfo.adapter
  │       ├─ amount: amounts[0]
  │       └─ actionData: [encoded adapter call]
  │
  └─ ELSE: Return false (unsupported configuration)

TaskVault.executeTokenAction():
  ├─ Check: onlyTaskLogic or onlyRewardManager
  ├─ Check: token != address(0)
  ├─ Check: adapter != address(0)
  │
  ├─ Verify sufficient balance:
  │  └─ tokenBalances[token] >= amount
  │
  ├─ STATE WRITE: Reserve tokens
  │  ├─ tokenBalances[token] -= amount
  │  └─ tokenReserved[token] += amount
  │
  ├─ STATE WRITE: Approve adapter
  │  └─ IERC20(token).approve(adapter, amount)
  │
  ├─ Call adapter.execute(vault, params)
  │   RETURNS: (bool success, bytes result)
  │
  │   Adapter execution may include:
  │   ├─ Call adapter.canExecute() ← Condition verification!
  │   ├─ Validate parameters
  │   ├─ Perform token operations (transfers, approvals)
  │   └─ Return success status
  │
  ├─ STATE WRITE: Clear approval
  │  └─ IERC20(token).approve(adapter, 0)
  │
  ├─ STATE WRITE: Unreserve tokens
  │  └─ tokenReserved[token] -= amount
  │
  ├─ IF failed:
  │  ├─ Attempt token recovery
  │  ├─ Balance check:
  │  │  └─ currentBalance = IERC20(token).balanceOf(vault)
  │  ├─ If currentBalance > expected:
  │  │  └─ tokenBalances[token] += (currentBalance - expected)
  │  └─ Tokens reclaimed
  │
  └─ RETURN: (success, result)

IF action failed:
  ├─ TaskVault.executeTokenAction returns (false, ...)
  └─ Break action loop → execution fails
```

#### STEP 5: Distribute Reward (on success)

```
IF all actions succeeded:

  RewardManager.calculateReward(baseReward, executor, gasUsed):
    STATE READS:
      └─ ExecutorHub.getExecutor(executor):
          └─ Get executor.reputationScore

    Calculate reputation multiplier:
      multiplier = BASIS_POINTS + (reputationScore * 2500) / BASIS_POINTS
      Range: 100% to 125%

    Calculate reward breakdown:
      ├─ executorReward = baseReward * multiplier / 10000
      ├─ platformFee = baseReward * platformFeePercentage / 10000 (1% default)
      ├─ gasReimbursement = (gasUsed * tx.gasprice * 120%) / 100
      └─ totalFromVault = executorReward + platformFee + gasReimbursement

    RETURN: RewardCalculation {
      ├─ executorReward
      ├─ platformFee
      ├─ gasReimbursement
      └─ totalFromVault
    }

  TaskVault.releaseReward(executor, executorTotal):
    WHERE executorTotal = executorReward + gasReimbursement

    ├─ Check: nativeBalance >= amount
    ├─ STATE WRITE: Update balances
    │  ├─ nativeBalance -= amount
    │  └─ nativeReserved += amount
    ├─ Transfer ETH to executor:
    │  └─ (bool success, ) = executor.call{value: amount}("")
    ├─ Check: transfer succeeded
    ├─ STATE WRITE: Unreserve
    │  └─ nativeReserved -= amount
    └─ Emit: RewardReleased(executor, amount)

  TaskVault.releaseReward(rewardManager, platformFee):
    (Same process for platform fee collection)
```

#### STEP 6: Update Task Status

```
TaskCore.completeExecution(success):
  IF success:
    ├─ STATE WRITE: Increment counters
    │  ├─ executionCount++
    │  └─ lastExecutionTime = block.timestamp
    │
    ├─ Emit: ExecutionCheckpoint()
    │
    ├─ Check if task complete:
    │  IF maxExecutions > 0 AND executionCount >= maxExecutions:
    │    │
    │    └─ STATE WRITE:
    │        ├─ status = EXECUTING → COMPLETED
    │        └─ Emit: TaskStatusChanged()
    │
    └─ Else:
        ├─ STATE WRITE:
        │  ├─ status = EXECUTING → ACTIVE
        │  └─ Emit: TaskStatusChanged()
        │
        └─ Task ready for next execution

  ELSE (if failed):
    ├─ STATE WRITE:
    │  ├─ status = EXECUTING → ACTIVE
    │  └─ (no counter increment)
    └─ Executor gets no reward
```

#### STEP 7: Track in ExecutorHub

```
ExecutorHub.executeTask() continuation:

  IF executor registered:
    Executor storage exec = executors[executor]

    ├─ STATE WRITE:
    │  ├─ totalExecutions++
    │  └─ IF success:
    │     ├─ successfulExecutions++
    │     └─ _updateReputation(executor, true)
    │
    │  ├─ ELSE:
    │     ├─ failedExecutions++
    │     └─ _updateReputation(executor, false)
    │
    └─ Update reputation:
        ├─ successRate = (successfulExecutions * 10000) / totalExecutions
        ├─ volumeBonus = _calculateVolumeBonus(totalExecutions)
        │   [Based on execution count tiers]
        └─ reputationScore = (successRate * 70 + volumeBonus * 30) / 100

RESULT:
  ├─ Executor stats updated
  ├─ Reputation affects future reward multipliers
  └─ ExecutionCompleted(taskId, executor, success) emitted
```

---

## 3. STATE CONSISTENCY & GUARANTEES

### 3.1 Task Lifecycle State Diagram

```
                 ┌─────────────────────────┐
                 │   CREATION: ACTIVE      │
                 └────────────┬────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
              Creator PAUSE       Creator CANCEL
                    │                   │
                    ▼                   ▼
              ┌──────────┐        ┌───────────┐
              │ PAUSED   │        │ CANCELLED │
              └────┬─────┘        └─────┬─────┘
                   │                    │
            Creator RESUME      Creator WITHDRAW
                   │
                   ▼
              ┌──────────┐
              │ ACTIVE   │
              └────┬─────┘
                   │
           Executor calls executeTask()
                   │
                   ▼
              ┌────────────────┐
              │ EXECUTING      │
              │ (locked state) │
              └────┬─────┬─────┘
                   │     │
            ┌──────┘     └──────┐
            │ (action success)  │ (action failure)
            │                   │
            ▼                   ▼
      ┌──────────────────┐  ┌──────────┐
      │ Check max execs  │  │ ACTIVE   │
      └────┬─────────┬───┘  └──────────┘
           │         │
    reached limit   more allowed
           │         │
           ▼         ▼
       ┌─────────┐ ┌──────────┐
       │COMPLETED│ │ ACTIVE   │
       └─────────┘ └──────────┘
           │         (can re-execute)
           │
      Creator can only
      WITHDRAW when CANCELLED
```

### 3.2 Critical Invariants

```
1. ACTION INTEGRITY:
   ├─ Actions hash verified before execution
   ├─ actionsHash == keccak256(actions) stored in metadata
   └─ Prevents action tampering

2. TOKEN BALANCE TRACKING:
   ├─ nativeBalance = actual ETH balance in vault
   ├─ tokenBalances[token] = actual token balance in vault
   ├─ reserved amounts tracked separately:
   │  ├─ nativeReserved ≥ 0
   │  └─ tokenReserved[token] ≥ 0
   ├─ available = balance - reserved
   └─ Prevents over-allocation

3. EXECUTION COUNT ATOMICITY:
   ├─ executionCount increments with status change
   ├─ Both happen in completeExecution() same transaction
   └─ No state where they diverge

4. STATUS TRANSITIONS VALID:
   ├─ ACTIVE → EXECUTING → ACTIVE/COMPLETED (only paths)
   ├─ PAUSED → ACTIVE (only path from PAUSED)
   ├─ CANCELLED → terminal (no further transitions)
   └─ Creator guards prevent invalid state changes

5. REENTRANCY PROTECTION:
   ├─ ReentrancyGuard on TaskVault
   ├─ ReentrancyGuard on RewardManager
   ├─ ReentrancyGuard on ExecutorHub
   └─ Prevents reentrancy attacks

6. REWARD DISTRIBUTION:
   ├─ Executor reward released atomically
   ├─ Platform fee collected separately
   ├─ Gas reimbursement included
   └─ All from reserved vault balance
```

### 3.3 Data Consistency Checks

```
During Task Creation:
  ├─ Actions stored → actionsHash computed → stored in metadata
  ├─ Task funded → nativeBalance/tokenBalances updated
  ├─ Status set → Task readable immediately
  └─ Registered → Discoverable via GlobalRegistry

During Task Execution:
  ├─ Actions fetched → Hash verification
  ├─ Token reservation → Balance check → Token execution
  ├─ Unreservation → Balance recovery on failure
  ├─ Reward calculated → Distributed → Recorded
  └─ Status updated → Final state consistent

State Read Safety:
  ├─ TaskCore.getMetadata() returns current state snapshot
  ├─ TaskVault.getNativeBalance() returns available amount
  ├─ TaskVault.getTokenBalance() returns balance (including reserved)
  ├─ TaskVault.getAvailableForRewards() returns balance - reserved
  └─ All reads are point-in-time accurate
```

---

## 4. ADAPTER PATTERN & CONDITION CHECKING

### 4.1 Adapter Interface

**Location:** [IActionAdapter.sol](IActionAdapter.sol)

```solidity
interface IActionAdapter {
    // 1. Condition verification (decentralized)
    function canExecute(bytes calldata params)
        external
        view
        returns (bool canExec, string memory reason);

    // 2. Token requirement declaration
    function getTokenRequirements(bytes calldata params)
        external
        view
        returns (address[] memory tokens, uint256[] memory amounts);

    // 3. Action execution
    function execute(address vault, bytes calldata params)
        external
        returns (bool success, bytes memory result);

    // 4. Protocol support check
    function isProtocolSupported(address protocol)
        external
        view
        returns (bool);

    // 5. Adapter metadata
    function name() external pure returns (string memory);
}
```

### 4.2 Condition Checking Flow (Example: TimeBasedTransferAdapter)

```
TimeBasedTransferAdapter.TransferParams:
  ├─ token: address (USDC)
  ├─ recipient: address
  ├─ amount: uint256
  └─ executeAfter: uint256 (unix timestamp)

Condition embedded in params ← NOT in separate ConditionOracle!

TaskLogicV2 execution:
  ├─ Fetch adapter from registry
  ├─ Call adapter.canExecute(params)
  │   └─ Adapter checks: block.timestamp >= executeAfter
  ├─ If condition not met:
  │   └─ Return (false, "Too early...")
  └─ If condition met:
      └─ Continue with execution

RESULT:
  ├─ Each adapter owns its condition logic
  ├─ Decentralized, more flexible
  ├─ Simpler to audit
  └─ No single point of failure
```

### 4.3 Token Requirement Pattern

```
OLD DESIGN (Hardcoded in TaskLogic):
  TaskLogic decodes params based on adapter type
    ├─ Tight coupling
    ├─ Doesn't scale with new adapters
    └─ Error-prone

NEW DESIGN (Adapter declares):
  adapter.getTokenRequirements(params)
    ├─ Returns (tokens[], amounts[])
    ├─ Loose coupling
    ├─ Adapter-agnostic TaskLogic
    └─ Easy to extend

TaskLogicV2 for single-token adapters:
  ├─ Get requirements from adapter
  ├─ Call executeTokenAction(token, amount, ...)
  └─ Vault handles all token logic
```

---

## 5. GAS COST ANALYSIS

### 5.1 Task Creation Costs

```
Operation                           Gas Est.    ETH @ 50 gwei   USD @ $2000
────────────────────────────────────────────────────────────────────────
Validate parameters                 ~5,000
Clone TaskCore                       ~1,000
Clone TaskVault                      ~1,000
Initialize TaskCore                  ~10,000
Initialize TaskVault                 ~8,000
Store actions (per action)           ~2,000 × N
Fund vault (native)                  ~5,000
Fund vault (ERC20 transfer)          ~50,000 × M
Register GlobalRegistry              ~15,000
                                   ────────
TOTAL (1 action, no ERC20)           ~45,000
TOTAL (1 action, 1 ERC20)            ~95,000     $0.0048        $9.50

With 2 actions, 2 tokens             ~130,000    $0.0065        $13
```

### 5.2 Task Execution Costs

```
Operation                           Gas Est.
──────────────────────────────────────────
Load from GlobalRegistry            ~2,000
Load TaskCore metadata              ~3,000
Fetch actions from storage          ~2,000 (per action)
Get adapter from registry           ~1,000
Call canExecute()                   ~5,000 (varies by adapter)
Get token requirements              ~1,000
Execute token action                ~30,000 (base)
  ├─ Reserve tokens
  ├─ Approve adapter
  ├─ Call adapter.execute()
  └─ Unreserve/cleanup
Call RewardManager.calculateReward  ~8,000
Release reward                       ~10,000
Update TaskCore counters            ~5,000
Update ExecutorHub stats            ~10,000
                                  ────────
TOTAL (1 action, no transfer)      ~77,000
TOTAL (1 action, token transfer)   ~120,000
```

### 5.3 Storage Efficiency

```
TaskCore:
  ├─ metadata: ~130 bytes (uses uint96, uint128)
  ├─ storedActions[]: variable (32 bytes per action)
  └─ Per-task storage: ~200 bytes average

TaskVault:
  ├─ tracking: ~200 bytes
  ├─ balances: ~100 bytes (per token tracked)
  └─ Per-vault storage: ~300 bytes average

ExecutorHub:
  ├─ per executor: ~130 bytes
  └─ Scales with executor count

Total overhead per task:
  ├─ TaskCore clone: ~500 bytes
  ├─ TaskVault clone: ~500 bytes
  └─ Storage: ~600 bytes
  ────────────────────
  Total: ~1.6 KB per task
```

---

## 6. TESTING & VERIFICATION

### 6.1 Testnet Deployment Results

**TimeBasedTransferAdapter Test:**

```
Created Task ID: 1
  ├─ Creator: 0x8AaEe2071A400cC60927e46D53f751e521ef4D35
  ├─ Amount: 100 USDC
  ├─ Condition: Execute after timestamp
  └─ Block: 2210601

Execution Results:
  ├─ Condition checked: ✅ Time passed
  ├─ Token reserved: ✅ 100 USDC
  ├─ Transfer executed: ✅ Successful
  ├─ Recipient balance: ✅ +100 USDC
  └─ Task status: ✅ COMPLETED

Transaction Hash:
  0xd48e5d55917bfb9e1ca51a55860e673c2b3d6aa7d226bd7bd13a6a25ebd4b4c0
```

### 6.2 State Verification Checklist

```
After Creation:
  ✅ TaskCore.metadata.status == ACTIVE
  ✅ TaskCore.executionCount == 0
  ✅ TaskVault.nativeBalance == provided ETH
  ✅ TaskVault.tokenBalances[token] == provided amount
  ✅ GlobalRegistry.tasks[id] populated
  ✅ Actions hash matches stored actions

After Execution (Success):
  ✅ TaskCore.executionCount == 1
  ✅ TaskCore.lastExecutionTime == block.timestamp
  ✅ TaskVault.nativeBalance decreased (reward paid)
  ✅ TaskVault.tokenBalances[token] decreased (tokens transferred)
  ✅ Executor received reward
  ✅ If maxExecutions reached: status == COMPLETED
  ✅ Else: status == ACTIVE (can re-execute)

On Cancellation:
  ✅ TaskCore.status == CANCELLED
  ✅ Creator can withdraw remaining balance
  ✅ No further executions allowed
```

---

## 7. SUMMARY

### Task Creation in 3 Steps:
1. **Validate & Deploy**: Check parameters, deploy TaskCore/TaskVault clones
2. **Store Data**: Set metadata, store actions on-chain, fund vault
3. **Register**: Register with GlobalRegistry for discovery

### Task Execution in 5 Steps:
1. **Load Task**: Fetch from GlobalRegistry
2. **Execute Actions**: For each action, call adapter with condition checking
3. **Distribute Reward**: Calculate and pay executor
4. **Update State**: Increment counters, update task status
5. **Track Executor**: Record execution stats and reputation

### Key Design Patterns:
- ✅ **EIP-1167 Clones**: Gas-efficient per-task deployment
- ✅ **Adapter Pattern**: Decentralized condition/action logic
- ✅ **Token Requirements**: Adapter declares what it needs
- ✅ **Reserved Balances**: Prevents double-spending
- ✅ **Atomic Operations**: State updates with guard conditions

### State Guarantees:
- ✅ Actions integrity verified via hash
- ✅ Token balances tracked with reservations
- ✅ Execution count atomic with status change
- ✅ Reentrancy protected on all fund transfers
- ✅ Creator controls task lifecycle

