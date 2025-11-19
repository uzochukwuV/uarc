# TaskerOnChain V2 - Quick Reference Guide

## Contract Call Sequence

### CREATE TASK

```
User
  └─ TaskFactory.createTask(
       TaskParams,
       ActionParams[],
       TokenDeposit[]  // optional
     )
      ├─ Validates parameters
      ├─ Deploys TaskCore clone
      ├─ Deploys TaskVault clone
      ├─ Stores actions on-chain in TaskCore
      ├─ Funds TaskVault
      └─ Registers with GlobalRegistry
```

### EXECUTE TASK

```
Executor
  └─ ExecutorHub.executeTask(taskId)
      └─ TaskLogicV2.executeTask(ExecutionParams)
          ├─ Load: GlobalRegistry.getTaskAddresses()
          ├─ Check: TaskCore.isExecutable()
          ├─ Mark: TaskCore.executeTask() → status=EXECUTING
          ├─ Fetch: TaskCore.getActions()
          ├─ For each action:
          │   ├─ Get: ActionRegistry.getAdapter()
          │   ├─ Check: adapter.canExecute()
          │   ├─ Get: adapter.getTokenRequirements()
          │   └─ Execute: TaskVault.executeTokenAction()
          │       └─ adapter.execute()
          ├─ Reward: RewardManager.calculateReward()
          ├─ Pay: TaskVault.releaseReward()
          └─ Update: TaskCore.completeExecution()
              └─ Increment counters, check if COMPLETED
```

---

## State Changes

### During Creation:

| Contract | Variable | Change |
|----------|----------|--------|
| TaskFactory | nextTaskId | increments |
| TaskCore | metadata | set from params |
| TaskCore | storedActions | set from ActionParams[] |
| TaskVault | nativeBalance | += providedValue |
| TaskVault | tokenBalances[token] | += amount |
| GlobalRegistry | tasks[id] | set TaskInfo |
| GlobalRegistry | totalTasks | increments |

### During Execution:

| Contract | Variable | Change |
|----------|----------|--------|
| TaskCore | status | ACTIVE → EXECUTING → ACTIVE/COMPLETED |
| TaskCore | executionCount | increments |
| TaskCore | lastExecutionTime | = block.timestamp |
| TaskVault | nativeBalance | -= reward (released) |
| TaskVault | tokenBalances[token] | -= amount (executed) |
| ExecutorHub | executor.totalExecutions | increments |
| ExecutorHub | executor.successfulExecutions | increments (if success) |
| ExecutorHub | executor.reputationScore | updates based on success rate |

---

## Key State Variables by Contract

### TaskCore
```solidity
TaskMetadata metadata {
  id, creator, createdAt, expiresAt,
  maxExecutions, executionCount, lastExecutionTime,
  recurringInterval, rewardPerExecution,
  status, actionsHash, seedCommitment
}

Action[] storedActions  ← Actions stored on-chain

address vault, logic, creator
```

### TaskVault
```solidity
uint256 nativeBalance          ← Available native tokens
uint256 nativeReserved         ← In-flight payments
mapping(token → uint256) tokenBalances
mapping(token → uint256) tokenReserved

address[] trackedTokens        ← All tokens deposited
```

### ExecutorHub
```solidity
mapping(executor → Executor) {
  addr, stakedAmount, registeredAt,
  totalExecutions, successfulExecutions, failedExecutions,
  reputationScore, isActive, isSlashed
}
```

### GlobalRegistry
```solidity
mapping(taskId → TaskInfo) {
  taskId, taskCore, taskVault, creator,
  createdAt, expiresAt, status
}

mapping(creator → uint256[]) tasksByCreator
mapping(status → uint256[]) tasksByStatus
uint256[] allTaskIds
```

---

## Read Operations (View Functions)

### Task Discovery
```solidity
// By ID
GlobalRegistry.getTaskAddresses(taskId)
GlobalRegistry.getTaskInfo(taskId)

// By Creator
GlobalRegistry.getTasksByCreator(creator)

// By Status
GlobalRegistry.getTasksByStatus(status)

// Pagination
GlobalRegistry.getPaginatedTasks(limit, offset)

// Executable Tasks
GlobalRegistry.getExecutableTasks(limit, offset)

// Search
GlobalRegistry.searchTasks(creator, status, minReward, limit)
```

### Task Status
```solidity
// Current metadata
TaskCore.getMetadata()

// Lifecycle check
TaskCore.isExecutable()

// Actions
TaskCore.getActions()
TaskCore.getAction(index)
TaskCore.getActionsLength()
```

### Vault Balances
```solidity
// Native
TaskVault.getNativeBalance()
TaskVault.getAvailableForRewards()

// Tokens
TaskVault.getTokenBalance(token)
TaskVault.getAvailableTokenBalance(token)
TaskVault.getTrackedTokens()
```

### Executor Reputation
```solidity
// Executor info
ExecutorHub.getExecutor(executor)

// Can execute?
ExecutorHub.canExecute(executor)  ← Always true on testnet

// Reputation multiplier
RewardManager.getReputationMultiplier(executor)
```

---

## Write Operations (State Changes)

### Creator Actions
```solidity
// Pause/Resume
TaskCore.pause()
TaskCore.resume()

// Update reward
TaskCore.updateReward(newReward)

// Cancel & withdraw
TaskCore.cancel()
TaskVault.withdrawAll()
```

### Executor Actions
```solidity
// Register
ExecutorHub.registerExecutor()  ← Free on testnet

// Execute task
ExecutorHub.executeTask(taskId)

// Manage stake
ExecutorHub.addStake()
ExecutorHub.withdrawStake(amount)

// Unregister
ExecutorHub.unregisterExecutor()
```

### Admin Actions
```solidity
// TaskFactory
factory.setMinTaskReward(amount)
factory.setCreationFee(fee)
factory.setMaxTaskDuration(duration)
factory.setGlobalRegistry(registry)
factory.withdrawFees(recipient)

// ActionRegistry
registry.registerAdapter(selector, adapter, gasLimit, requiresTokens)
registry.deactivateAdapter(selector)
registry.approveProtocol(protocol)
registry.revokeProtocol(protocol)

// RewardManager
rewardManager.setPlatformFee(percentage)
rewardManager.setGasReimbursementMultiplier(multiplier)
rewardManager.collectFees(recipient)

// TaskLogicV2
logic.setActionRegistry(registry)
logic.setRewardManager(manager)
logic.setExecutorHub(hub)
logic.setTaskRegistry(registry)
logic.pause()
logic.unpause()
```

---

## Status Transitions

```
ACTIVE ──execute──> EXECUTING ──completeExecution──> ACTIVE (if not done)
                                                  └──> COMPLETED (if max reached)

ACTIVE ──pause──> PAUSED
PAUSED ──resume──> ACTIVE

ACTIVE ──cancel──> CANCELLED
PAUSED ──cancel──> CANCELLED

CANCELLED → WITHDRAW ALLOWED
```

---

## Events

### Task Lifecycle
```solidity
TaskCreated(taskId, creator, taskCore, taskVault, reward, maxExecutions)
TaskStatusChanged(taskId, oldStatus, newStatus)
TaskExecuted(taskId, executor, success, rewardPaid, penalty)
TaskCancelled(taskId, creator)
TaskRewardUpdated(taskId, oldReward, newReward)
```

### Vault Operations
```solidity
NativeDeposited(sender, amount)
TokenDeposited(token, sender, amount)
RewardReleased(executor, amount)
TokenActionExecuted(token, adapter, amount, success)
FundsWithdrawn(creator, nativeAmount, tokens)
```

### Executor Management
```solidity
ExecutorRegistered(executor, stakedAmount)
ExecutorUnregistered(executor)
StakeAdded(executor, amount)
StakeWithdrawn(executor, amount)
ExecutionCompleted(taskId, executor, success)
ExecutorSlashed(executor, amount, reason)
```

### Registry & Rewards
```solidity
TaskRegistered(taskId, creator, taskCore, taskVault)
MinTaskRewardUpdated(oldMin, newMin)
CreationFeeUpdated(oldFee, newFee)
AdapterRegistered(selector, adapter)
AdapterDeactivated(selector)
ProtocolApproved(protocol)
ProtocolRevoked(protocol)
RewardDistributed(taskId, executor, executorReward, platformFee, gasReimbursement)
PlatformFeeCollected(recipient, amount)
PlatformFeeUpdated(oldFee, newFee)
```

---

## Important Addresses

### Polkadot Hub Testnet
```
TimeBasedTransferAdapter: 0x629cfCA0e279d895A798262568dBD8DaA7582912 ✅

Others: TBD (set in deployment)
```

### Key Interfaces
```solidity
ITaskFactory
ITaskCore
ITaskVault
ITaskLogic
IExecutorHub
IActionRegistry
IRewardManager
IActionAdapter
```

---

## Adapter Integration

### Register Adapter
```solidity
registry.registerAdapter(
    bytes4(keccak256("execute(address,bytes)")),  // selector
    address(adapter),                              // adapter contract
    300000,                                        // gas limit
    true                                           // requires tokens
);
```

### Implement Adapter
```solidity
contract MyAdapter is IActionAdapter {
    function canExecute(bytes calldata params)
        external view returns (bool, string memory) {
        // Your condition logic
    }

    function getTokenRequirements(bytes calldata params)
        external view returns (address[] memory, uint256[] memory) {
        // Declare what tokens you need
    }

    function execute(address vault, bytes calldata params)
        external returns (bool, bytes memory) {
        // Your execution logic
    }

    function isProtocolSupported(address protocol)
        external view returns (bool) {
        // Check if protocol is supported
    }

    function name() external pure returns (string memory) {
        return "MyAdapter";
    }
}
```

---

## Testnet vs Production

### Testnet (Current)
- ✅ No executor registration required to execute
- ✅ No commit-reveal (direct execution)
- ✅ Free registration (no stake required)
- ✅ No reputation checks

### Production (TODO)
- Uncomment registration check in [ExecutorHub:131](ExecutorHub.sol#L131)
- Uncomment blacklist check in [ExecutorHub:135](ExecutorHub.sol#L135)
- Add commit-reveal mechanism
- Enforce minimum stake requirement
- Check reputation scores

---

## Gas Optimization Tips

- Batch task creation: Create multiple tasks in one transaction
- Use time-locked tasks: Simpler than price oracles
- Monitor gas usage: RewardManager tracks gasUsed
- Reserve tokens: Prevents double-spending

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| InvalidReward() | Reward too low | Increase rewardPerExecution >= minTaskReward |
| InvalidExpiration() | Bad expiry time | Set expiresAt > now and <= now + maxDuration |
| InvalidActions() | Wrong action count | Provide 1-10 actions |
| TaskNotExecutable() | Conditions not met | Check task expiry, max executions, recurring interval |
| AdapterNotFound() | Adapter not registered | Register adapter in ActionRegistry |
| InsufficientBalance() | Not enough funds in vault | Deposit more tokens |
| OnlyCreator() | Not task creator | Call from creator address |
| OnlyTaskLogic() | Not authorized | Only TaskLogic can call |

