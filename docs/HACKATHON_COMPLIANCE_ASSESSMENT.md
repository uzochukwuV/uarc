# Self-Driving Yield Engine: Hackathon Compliance Assessment

## Overview

This document assesses TaskerOnChain's compliance with the **BNB Chain Yield Strategy Hackathon** requirements for building a "Self-Driving Yield Engine" - a fully autonomous, non-custodial protocol that leverages AsterDEX Earn.

**Hackathon Goal**: Build a fully decentralized, non-custodial protocol that automates superior financial outcomes using AsterDEX as the primary yield primitive.

---

## The Four Pillars Assessment

### Pillar 1: INTEGRATE (The Core)

> **Requirement**: AsterDEX Earn must be the primary yield source and the default execution engine for the strategy.

| Criteria | Status | Details |
|----------|--------|---------|
| AsterDEX Earn integration | ❌ Not Built | Need to create `AsterDEXEarnAdapter` |
| Adapter pattern supports it | ✅ Ready | `IActionAdapter` interface is compatible |
| Similar implementations exist | ✅ Yes | `YieldAutoCompoundAdapter` provides template |

**Current State**: The architecture fully supports AsterDEX integration through the adapter pattern. The `IActionAdapter` interface provides all necessary hooks:

```solidity
interface IActionAdapter {
    function execute(address vault, bytes calldata params)
        external returns (bool success, bytes memory result);

    function canExecute(bytes calldata params)
        external view returns (bool canExecute, string memory reason);

    function getTokenRequirements(bytes calldata params)
        external view returns (address[] memory tokens, uint256[] memory amounts);

    function validateParams(bytes calldata params)
        external view returns (bool isValid, string memory errorMessage);
}
```

**Gap**: Need to implement `AsterDEXEarnAdapter` with:
- Deposit USDF to AsterDEX Earn
- Withdraw from AsterDEX Earn
- Claim rewards
- Check pending yields for execution conditions

**Verdict**: 🟡 **ARCHITECTURE READY, IMPLEMENTATION NEEDED**

---

### Pillar 2: STACK (The Growth)

> **Requirement**: The system should be designed for composability, enabling yield stacking by re-deploying earned yield into PancakeSwap LPs, farms, or other on-chain strategies to maximize risk-adjusted returns.

| Criteria | Status | Details |
|----------|--------|---------|
| Composable strategies | ✅ Supported | Multiple actions per task |
| Multi-protocol support | ✅ Ready | ActionRegistry whitelists protocols |
| Yield re-deployment | ⚠️ Partial | Need PancakeSwap adapters |
| Existing DeFi adapters | ✅ Yes | 6 adapters already built |

**Existing Adapters**:
1. `TimeBasedTransferAdapter` - Scheduled transfers
2. `DCAAdapter` - Dollar-cost averaging (Uniswap V3)
3. `YieldAutoCompoundAdapter` - Auto-compound yield farming
4. `StopLossTakeProfitAdapter` - Price-based orders
5. `UniswapV2USDCETHBuyLimitAdapter` - Limit orders
6. `AaveLiquidationProtectionAdapter` - Aave health protection

**Gap**: Need to build:
- `PancakeSwapLPAdapter` - Add/remove liquidity
- `PancakeSwapFarmAdapter` - Stake LP tokens, claim CAKE
- `RebalanceAdapter` - Adjust allocations based on conditions

**Composability Pattern**:
```
Task with Multiple Actions:
├── Action 1: Harvest AsterDEX yield
├── Action 2: Swap 50% to BNB
├── Action 3: Add liquidity to PancakeSwap
└── Action 4: Stake LP in farm
```

**Verdict**: 🟡 **ARCHITECTURE SUPPORTS IT, NEEDS ADDITIONAL ADAPTERS**

---

### Pillar 3: AUTOMATE (The Speed)

> **Requirement**: All strategy cycles must be entirely programmatic and deterministic. There can be no manual buttons, multisig execution, privileged operators, or off-chain triggers.

| Criteria | Status | Details |
|----------|--------|---------|
| No manual buttons | ✅ Pass | Execution is permissionless |
| No multisig execution | ✅ Pass | Single tx execution |
| No privileged operators | ✅ Pass | Anyone can be executor |
| No off-chain triggers | ✅ Pass | Conditions checked on-chain |
| Deterministic logic | ✅ Pass | All in smart contracts |
| Economic incentives | ✅ Pass | Executors paid per execution |

**How Automation Works**:

```
┌─────────────────────────────────────────────────────────────┐
│ EXECUTOR NETWORK (Permissionless)                           │
├─────────────────────────────────────────────────────────────┤
│ 1. Anyone monitors tasks via GlobalRegistry                 │
│ 2. Check canExecute() on each adapter                       │
│ 3. If conditions met → call ExecutorHub.executeTask()       │
│ 4. Executor receives reward from TaskVault                  │
│ 5. Task state updates, ready for next cycle                 │
└─────────────────────────────────────────────────────────────┘
```

**Execution Flow** (from `ExecutorHub.sol`):
```solidity
function executeTask(uint256 taskId) external nonReentrant returns (bool success) {
    // No registration required on testnet - anyone can execute
    require(ITaskCore(taskCore).isExecutable(), "Task not executable");

    // Execute via TaskLogic - fetches actions from TaskCore
    ITaskLogic.ExecutionResult memory result = ITaskLogic(taskLogic).executeTask(params);

    // Track execution stats
    emit ExecutionCompleted(taskId, msg.sender, result.success);
    return result.success;
}
```

**Minor Consideration**: Task creators can `pause()`, `resume()`, `cancel()` their own tasks. This is acceptable if the **yield engine contract itself** is the task creator - these become engine-level controls, not manual human intervention.

**Verdict**: ✅ **COMPLIANT**

---

### Pillar 4: PROTECT (The Trust)

> **Requirement**: The architecture must be 100% non-custodial and decentralized. Smart contracts must be the sole source of truth, with no admin keys or entities holding unilateral control over user funds.

| Criteria | Status | Details |
|----------|--------|---------|
| Non-custodial | ⚠️ Partial | User funds safe, but admin can pause |
| No admin keys | ❌ Fail | Multiple `onlyOwner` functions |
| Decentralized | ❌ Fail | Owner has significant control |
| Users control funds | ✅ Pass | TaskVault per-user isolation |

#### Critical Admin Controls Identified

**1. TaskLogicV2.sol** - 🔴 CRITICAL
```solidity
// Owner can pause ALL execution system-wide
function pause() external onlyOwner {
    _pause();
}

function unpause() external onlyOwner {
    _unpause();
}

// Owner can change core contract addresses
function setActionRegistry(address _actionRegistry) external onlyOwner
function setRewardManager(address _rewardManager) external onlyOwner
function setExecutorHub(address _executorHub) external onlyOwner
function setTaskRegistry(address _taskRegistry) external onlyOwner
```

**2. ActionRegistry.sol** - 🔴 CRITICAL
```solidity
// Owner can disable adapters mid-strategy
function deactivateAdapter(bytes4 selector) external onlyOwner

// Owner controls which adapters exist
function registerAdapter(...) external onlyOwner

// Owner controls protocol whitelist
function approveProtocol(address protocol) external onlyOwner
function revokeProtocol(address protocol) external onlyOwner
```

**3. ExecutorHub.sol** - 🟡 MEDIUM
```solidity
// Owner can slash executors and take their stake
function slashExecutor(address executor, uint256 amount, string calldata reason)
    external onlyOwner

// Owner can change system contracts
function setTaskLogic(address _taskLogic) external onlyOwner
function setTaskRegistry(address _taskRegistry) external onlyOwner
function setMinStakeAmount(uint256 _minStake) external onlyOwner
```

**4. TaskFactory.sol** - 🟡 MEDIUM
```solidity
function setMinTaskReward(uint256 _minReward) external onlyOwner
function setCreationFee(uint256 _fee) external onlyOwner
function withdrawFees(address recipient) external onlyOwner
function setGlobalRegistry(address _globalRegistry) external onlyOwner
```

**5. RewardManager.sol** - 🟡 MEDIUM
```solidity
function collectFees(address recipient) external onlyOwner
function setPlatformFee(uint256 feePercentage) external onlyOwner
function setGasReimbursementMultiplier(uint256 _multiplier) external onlyOwner
```

**6. GlobalRegistry.sol** - 🟡 MEDIUM
```solidity
function authorizeFactory(address factory) external onlyOwner
function revokeFactory(address factory) external onlyOwner
```

#### Impact Analysis

| Admin Action | User Fund Impact | Strategy Impact |
|--------------|------------------|-----------------|
| `pause()` on TaskLogicV2 | Funds trapped temporarily | ❌ All execution stops |
| `deactivateAdapter()` | Indirect - strategies fail | ❌ Strategies break |
| `setTaskLogic()` | Potential rug if malicious | ❌ Execution redirected |
| `slashExecutor()` | Executor stake at risk | ⚠️ Reduced executors |
| `setPlatformFee()` | Higher fees | ⚠️ Reduced rewards |

#### What IS Non-Custodial

Despite admin controls, user funds have protections:
- **TaskVault** is per-task, per-user - admin cannot directly withdraw
- **Only task creator** can withdraw via `withdrawAll()` after cancellation
- **Adapters** execute with limited token approvals
- **Funds remain in vault** unless action explicitly moves them

**Verdict**: ❌ **FAILS HACKATHON REQUIREMENTS**

---

## Summary Matrix

| Pillar | Requirement | Status | Action Required |
|--------|-------------|--------|-----------------|
| 1. Integrate | AsterDEX as primary yield | 🟡 Ready | Build AsterDEX adapter |
| 2. Stack | Composable yield stacking | 🟡 Ready | Build PancakeSwap adapters |
| 3. Automate | Fully programmatic | ✅ Pass | Minor: Engine as task creator |
| 4. Protect | No admin keys | ❌ Fail | **Remove admin controls** |

---

## Remediation Strategies

### Option A: Admin-Free Yield Engine Layer (Recommended)

Build **new contracts specifically for the hackathon** that sit on top of TaskerOnChain:

```
┌─────────────────────────────────────────────────────────────┐
│  YIELD ENGINE LAYER (No Admin Keys)                         │
├─────────────────────────────────────────────────────────────┤
│  YieldEngineVault                                           │
│  ├── Immutable strategy addresses                          │
│  ├── No pause function                                     │
│  ├── No owner                                              │
│  └── Users deposit/withdraw directly                       │
├─────────────────────────────────────────────────────────────┤
│  Strategy Adapters (Ownerless)                              │
│  ├── AsterDEXEarnAdapter                                   │
│  ├── PancakeSwapLPAdapter                                  │
│  ├── HedgeAdapter                                          │
│  └── EmergencyExitAdapter                                  │
├─────────────────────────────────────────────────────────────┤
│  TASKERONCHAIN LAYER (Execution Infrastructure)             │
│  └── Used only for executor incentives                     │
└─────────────────────────────────────────────────────────────┘
```

**Architecture**:
```solidity
contract YieldEngineVault {
    // NO Ownable inheritance
    // NO admin functions

    // Immutable strategy configuration
    address public immutable asterDEXStrategy;
    address public immutable pancakeStrategy;
    address public immutable hedgeStrategy;

    // User deposits - fully non-custodial
    mapping(address => uint256) public userShares;

    // No pause, no admin keys, no privileged operators
    function deposit(uint256 amount) external { ... }
    function withdraw(uint256 shares) external { ... }

    // Strategies execute via TaskerOnChain for automation
    // but funds remain in this admin-free vault
}
```

**Benefits**:
- TaskerOnChain provides battle-tested execution infrastructure
- Yield engine layer is fully compliant with hackathon rules
- Clean separation of concerns
- Existing adapters can be wrapped in ownerless contracts

### Option B: Modify Existing Contracts

Remove or restrict admin functions in the execution path:

**Step 1**: Remove `Pausable` from TaskLogicV2
```solidity
// REMOVE these functions
function pause() external onlyOwner { _pause(); }
function unpause() external onlyOwner { _unpause(); }
```

**Step 2**: Make ActionRegistry immutable after setup
```solidity
bool public locked;

function lock() external onlyOwner {
    locked = true;
    renounceOwnership(); // Permanently remove owner
}

function registerAdapter(...) external onlyOwner {
    require(!locked, "Registry locked");
    // ... existing logic
}
```

**Step 3**: Add timelocks to sensitive operations
```solidity
uint256 public constant TIMELOCK_DURATION = 7 days;
mapping(bytes32 => uint256) public pendingChanges;

function proposeAdapterDeactivation(bytes4 selector) external onlyOwner {
    bytes32 key = keccak256(abi.encode("deactivate", selector));
    pendingChanges[key] = block.timestamp + TIMELOCK_DURATION;
}

function executeAdapterDeactivation(bytes4 selector) external {
    bytes32 key = keccak256(abi.encode("deactivate", selector));
    require(pendingChanges[key] != 0 && block.timestamp >= pendingChanges[key]);
    adapters[selector].isActive = false;
    delete pendingChanges[key];
}
```

**Step 4**: Renounce ownership after deployment
```solidity
// After all setup is complete
actionRegistry.renounceOwnership();
taskLogicV2.renounceOwnership();
// etc.
```

---

## Recommended Implementation Plan

### Phase 1: Core Adapters (Week 1)

1. **AsterDEXEarnAdapter**
   - `deposit()` - Deposit USDF to AsterDEX Earn
   - `withdraw()` - Withdraw from AsterDEX Earn
   - `claimRewards()` - Harvest yield
   - `canExecute()` - Check if harvest is profitable

2. **PancakeSwapLPAdapter**
   - `addLiquidity()` - Add to LP pools
   - `removeLiquidity()` - Exit positions
   - `canExecute()` - Check rebalance conditions

### Phase 2: Yield Engine Vault (Week 2)

Build the admin-free orchestration layer:

```solidity
contract YieldEngineVault {
    // Immutable configuration
    ITaskFactory public immutable taskFactory;
    address public immutable asterDEXAdapter;
    address public immutable pancakeAdapter;

    // Strategy state
    uint256 public totalDeposited;
    uint256 public lastHarvestTime;

    // User accounting
    mapping(address => uint256) public shares;
    uint256 public totalShares;

    constructor(
        address _taskFactory,
        address _asterDEXAdapter,
        address _pancakeAdapter
    ) {
        taskFactory = ITaskFactory(_taskFactory);
        asterDEXAdapter = _asterDEXAdapter;
        pancakeAdapter = _pancakeAdapter;

        // Create perpetual tasks for automation
        _createHarvestTask();
        _createCompoundTask();
        _createRebalanceTask();
    }

    function deposit(uint256 amount) external {
        // Calculate shares
        // Transfer USDF from user
        // Deploy to AsterDEX Earn
    }

    function withdraw(uint256 shareAmount) external {
        // Calculate underlying
        // Withdraw from strategies
        // Transfer to user
    }
}
```

### Phase 3: Task Integration (Week 3)

Create self-registering tasks on TaskerOnChain:

```solidity
function _createHarvestTask() internal {
    ITaskCore.Action[] memory actions = new ITaskCore.Action[](1);
    actions[0] = ITaskCore.Action({
        adapter: asterDEXAdapter,
        data: abi.encode(HarvestParams({
            minYield: 100e18, // Min 100 USDF to harvest
            recipient: address(this)
        }))
    });

    taskFactory.createTask{value: taskFunding}(
        TaskParams({
            actions: actions,
            maxExecutions: 0, // Unlimited
            recurringInterval: 6 hours,
            rewardPerExecution: 0.1 ether,
            expiresAt: 0 // Never expires
        })
    );
}
```

### Phase 4: Testing & Documentation (Week 4)

1. **Demo Video** showing:
   - User deposit → AsterDEX Earn
   - Automatic harvest by executor
   - Yield compounding to PancakeSwap
   - Rebalancing during volatility
   - Emergency exit simulation

2. **README.md** with design philosophy

---

## Conclusion

TaskerOnChain provides excellent infrastructure for building the Self-Driving Yield Engine. The core automation mechanics (Pillar 3) are already compliant. The adapter pattern enables easy integration with AsterDEX and PancakeSwap (Pillars 1 & 2).

**The critical gap is Pillar 4**: The current admin controls violate the hackathon's "no admin keys" requirement.

**Recommended approach**: Build an admin-free Yield Engine layer on top of TaskerOnChain, keeping user funds in ownerless vault contracts while leveraging TaskerOnChain's executor network for automation incentives.

This approach:
- ✅ Preserves TaskerOnChain's battle-tested execution infrastructure
- ✅ Creates fully compliant yield engine for hackathon
- ✅ Maintains clean separation between automation layer and fund management
- ✅ Enables future governance without compromising current security

---

## Appendix: Contract Admin Control Inventory

| Contract | Admin Functions | Risk | Recommendation |
|----------|----------------|------|----------------|
| TaskLogicV2 | `pause()`, `unpause()` | 🔴 Critical | Remove from yield engine path |
| TaskLogicV2 | `setActionRegistry()` | 🔴 Critical | Make immutable |
| TaskLogicV2 | `setRewardManager()` | 🟡 Medium | Timelock or immutable |
| ActionRegistry | `deactivateAdapter()` | 🔴 Critical | Timelock + governance |
| ActionRegistry | `registerAdapter()` | 🟡 Medium | Lock after setup |
| ActionRegistry | `approveProtocol()` | 🟡 Medium | Lock after setup |
| ExecutorHub | `slashExecutor()` | 🟡 Medium | Governance-only |
| ExecutorHub | `setTaskLogic()` | 🔴 Critical | Make immutable |
| TaskFactory | `setMinTaskReward()` | 🟢 Low | Acceptable with bounds |
| TaskFactory | `withdrawFees()` | 🟢 Low | Platform revenue |
| RewardManager | `setPlatformFee()` | 🟡 Medium | Cap at deployment |
| GlobalRegistry | `authorizeFactory()` | 🟡 Medium | Timelock |
