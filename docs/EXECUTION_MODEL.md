# TaskerOnChain Execution Model

## Overview

This document describes how executors claim and execute tasks in the TaskerOnChain protocol. We currently use a **simple, open model for testnet** that prioritizes ease of use and traction. Advanced anti-bot mechanisms will be added when the platform reaches production scale.

## Current Model (Testnet): Time-Based Exclusive Window

### Architecture

```
Task Creation → Exclusive Window (30 min) → Public Window (unlimited)
                ↓                              ↓
           Platform Users                All Users/Bots
           (Free, priority)               (Free, but after window)
```

### How It Works

1. **Task Creator Sets Execution Rules**
   ```solidity
   struct TaskExecutionRules {
       ExecutionTier tier;              // Open, Reputation, or Staked
       uint256 exclusiveWindow;         // Duration in seconds (e.g., 30 min)
       uint256 minimumReputation;       // 0 = no requirement
       uint256 requiredStake;           // 0 = no requirement
   }
   ```

2. **During Exclusive Window (First 30 Minutes)**
   - Only platform-registered executors can execute
   - Registration is FREE on testnet
   - Users get fair chance to earn without bot competition
   - No CAPTCHA required (yet)

3. **After Exclusive Window Expires**
   - ANY user can execute (including bots)
   - Prevents tasks from getting stuck
   - Still free on testnet
   - Decentralized fallback mechanism

### Execution Flow

```
┌─────────────────────────────────────────────────┐
│ User Wants to Execute Task                      │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│ Check Exclusive Window Active?                  │
└──────────────┬──────────┬───────────────────────┘
               │          │
          YES  │          │ NO
               ▼          ▼
         ┌──────────┐  ┌──────────────┐
         │ Verify   │  │ Skip window  │
         │ Platform │  │ check        │
         │ Status   │  └──────┬───────┘
         └────┬─────┘         │
              │               │
              ▼               ▼
         ┌──────────────────────────┐
         │ Execute Task             │
         │ - Call adapter.execute() │
         │ - Verify canExecute()    │
         │ - Distribute rewards     │
         │ - Update executor stats  │
         └──────────────────────────┘
```

### Smart Contract Changes Needed

#### 1. Update TaskExecutionRules Struct

```solidity
enum ExecutionTier {
    OPEN,           // No restrictions
    REPUTATION,     // Minimum reputation required
    STAKED          // Stake required
}

struct TaskExecutionRules {
    ExecutionTier tier;
    uint256 exclusiveWindow;      // Duration in seconds (30 minutes = 1800 seconds)
    uint256 minimumReputation;    // 0 = no requirement
    uint256 requiredStake;        // 0 = no requirement
}

struct Task {
    // ... existing fields
    TaskExecutionRules executionRules;
    uint256 createdAt;             // Block timestamp when task was created
}
```

#### 2. Update TaskLogicV2._executeAction()

```solidity
function _executeAction(address taskVault, Action memory action)
    internal
    returns (bool)
{
    // ... existing validation code

    // NEW: Check execution permissions
    if (!_canExecute(taskId, msg.sender)) {
        revert ExecutionNotAllowed();
    }

    // ... rest of existing execution logic
}

function _canExecute(uint256 taskId, address executor)
    internal
    view
    returns (bool)
{
    Task memory task = tasks[taskId];
    TaskExecutionRules memory rules = task.executionRules;

    // Check if in exclusive window
    bool inExclusiveWindow = block.timestamp < (task.createdAt + rules.exclusiveWindow);

    if (inExclusiveWindow) {
        // During exclusive window: only platform executors
        return isPlatformExecutor[executor];
    }

    // After exclusive window: anyone can execute
    return true;
}
```

#### 3. Platform Executor Registration

```solidity
mapping(address => bool) public isPlatformExecutor;

event ExecutorRegistered(address indexed executor);
event ExecutorUnregistered(address indexed executor);

function registerPlatformExecutor(address executor)
    external
    onlyOwner
{
    isPlatformExecutor[executor] = true;
    emit ExecutorRegistered(executor);
}

function unregisterPlatformExecutor(address executor)
    external
    onlyOwner
{
    isPlatformExecutor[executor] = false;
    emit ExecutorUnregistered(executor);
}
```

## Roadmap: From Testnet to Production

### Phase 1: Testnet (Current)
```
✅ Time-based exclusive window
✅ Free for all users
✅ Platform executor registration (not enforced yet)
❌ No CAPTCHA
❌ No reputation system
❌ No staking requirements
```

**Goals:**
- Get real user adoption
- Understand execution patterns
- Find product-market fit
- Build community

**Deployment:** Immediately

---

### Phase 2: Reputation System (After Traction)

Add reputation tracking without gates:

```solidity
mapping(address => uint256) public executorReputation;

function executeTask(...) {
    // ... execution logic
    executorReputation[msg.sender]++;  // Increment reputation
    emit ExecutionRecorded(msg.sender, taskId, success);
}
```

**Benefits:**
- Track executor reliability
- Prepare for future tiering
- Identify trusted users
- Ready for Phases 3-4

**Deployment:** When monthly active executors > 100

---

### Phase 3: CAPTCHA Layer (When Bots Attack)

Add puzzle-based CAPTCHA:

```solidity
struct Puzzle {
    bytes32 puzzleHash;        // Hash of puzzle+answer
    uint256 difficulty;        // 1-10 scale
    uint256 expiresAt;         // Puzzle rotation
}

mapping(uint256 => Puzzle) public taskPuzzles;

function executeTask(
    uint256 taskId,
    uint256 puzzleAnswer
) external {
    // Verify CAPTCHA (if required)
    if (requiresCaptcha[taskId]) {
        require(verifyCaptcha(taskId, puzzleAnswer), "Wrong answer");
    }

    // ... rest of execution
}
```

**When to Deploy:**
- Bot attacks detected (>50% of executions)
- High-value task abuse (>$1000 reward)
- Community requests anti-bot measures
- We have offensive data to set proper difficulty

**Deployment:** Month 3-6 (if needed)

---

### Phase 4: Staking & Premium Tiers (Monetization)

Allow premium execution paths:

```solidity
mapping(address => uint256) public executorStakes;

function registerPremiumExecutor(uint256 amountStaked) external payable {
    require(msg.value == amountStaked, "Stake mismatch");
    executorStakes[msg.sender] += msg.value;
    // Can execute immediately, skip CAPTCHA, skip time window
}

function executeTaskAsPremium(uint256 taskId) external {
    // Skip all gates, execute immediately
    // Takes stake if execution fails
    // Returns stake + reward if execution succeeds
}
```

**Monetization:**
- 0.5% commission on staked execution rewards
- Premium executor badges
- Guaranteed execution slots for high-value tasks

**Deployment:** Month 6-9 (after proof of concept)

---

## Implementation Timeline

| Phase | Timeline | Features | Effort |
|-------|----------|----------|--------|
| 1: Testnet | Week 1-2 | Exclusive window | 2-3 days |
| 2: Reputation | Month 2-3 | Tracking + stats | 1-2 days |
| 3: CAPTCHA | Month 3-6* | Anti-bot layer | 3-5 days |
| 4: Premium | Month 6-9* | Staking + tiers | 5-7 days |

*Only if needed based on usage patterns

## Benefits of This Approach

### For Users
- ✅ Free to use on testnet
- ✅ Fair access to tasks during exclusive window
- ✅ Build reputation naturally
- ✅ Progressive feature adoption

### For Platform
- ✅ Quick to market
- ✅ Data-driven anti-bot design
- ✅ Gradual complexity increase
- ✅ Monetization path when ready
- ✅ User feedback loop

### For Protocol
- ✅ Remains decentralized
- ✅ Fallback to public execution (no stuck tasks)
- ✅ No artificial restrictions
- ✅ Scalable anti-spam mechanisms

## Future Enhancements (Backlog)

### Advanced Gates
- **Proof of Humanity integration** - Require verified humans
- **Rate limiting** - Max executions per user per hour
- **Gas price controls** - Reject executions with excessive gas
- **Task creator controls** - Custom whitelist/blacklist

### Execution Incentives
- **Early bird rewards** - Bonus for executing within exclusive window
- **Consecutive execution streaks** - Cumulative rewards
- **Quality scoring** - Reward clean, low-gas executions

### Analytics & Monitoring
- **Execution patterns** - Identify bots vs humans
- **Profitability tracking** - Show realistic executor earnings
- **Success rates** - Per executor, per adapter, per task type

## FAQ

**Q: Why no CAPTCHA on testnet?**
A: Testnet is for learning. CAPTCHAs add friction that prevents real users from testing. We'll add anti-bot measures when real value is at stake.

**Q: What prevents bots during exclusive window?**
A: We verify isPlatformExecutor status. Platform controls executor registration, so we can pause registrations if abuse detected.

**Q: What if bots register as platform executors?**
A: We can identify and ban abusive executors within hours. If pattern emerges, we activate CAPTCHA immediately.

**Q: Can task creators disable exclusive window?**
A: Yes, future versions will let task creators choose window duration (0 = immediate public access).

**Q: Is this secure?**
A: Yes. The exclusive window is a UX feature, not security. Tasks always execute eventually (decentralized). No forced centralization.

## Related Docs

- [TaskLogicV2 Architecture](./TASKLOGICV2_ANALYSIS_AND_SOLUTIONS.md)
- [Adapter Interface Extension](./ADAPTER_INTERFACE_EXTENSION.md)
- [Executor Hub Design](./EXECUTOR_HUB_DESIGN.md)

## Version History

- **v1.0** - Initial execution model (testnet, exclusive window only)
- *Future: v2.0 with reputation system*
- *Future: v3.0 with CAPTCHA layer*
- *Future: v4.0 with premium staking tiers*
