Good question. Let me read the contracts carefully before explaining anything.

Now I have the full picture. Let me give you a precise analysis.

---

## What I Changed and What I Did NOT Touch

### My changes were limited to three areas — none touch fund custody:

| Contract | What Changed | Fund Flow Impact |
|---|---|---|
| `ActionRegistry` | Added `getAdapterByAddress()` lookup | None — registry has no funds |
| `TaskLogicV2` | Adapter looked up by protocol address, not selector | None — changes which adapter is called, not how vault moves money |
| `TaskFactory` | Same lookup change for validation only | None |
| `RewardManager` | Allowed `gasReimbursementMultiplier = 0` | None — still pulls from vault, just a smaller amount |

Your architecture is intact. Here is how the fund flow actually works, including a critical issue that was there **before** my changes:

---

## Fund Flow — Full Trace

### 1. Creation

```
User
 │
 │  createTaskWithTokens(params, actions, deposits)
 │  { value: rewardETH }
 ▼
TaskFactory
 │
 ├── clones TaskCore  (no funds ever here)
 ├── clones TaskVault (this IS the fund holder)
 │
 │  ─── ETH path ───────────────────────────────
 │  depositNative{value: rewardETH}()
 │  ETH goes straight into vault ✅
 │
 │  ─── ERC20 path ─────────────────────────────
 │  safeTransferFrom(user → Factory)    ← ⚠️ tokens transit here briefly
 │  approve(vault, amount)
 │  vault.depositToken(token, amount)   ← vault pulls from Factory
 │  approve(vault, 0)                   ← approval cleared
 │  All in one transaction, atomic ✅
 │
 └── TaskVault now holds:
       nativeBalance  = rewardETH
       tokenBalances  = {USDC: X, EURO: Y}
       creator        = msg.sender  (user keeps control)
```

> **The ERC20 brief transit through Factory** (line 165–178 of TaskFactory.sol) is the only moment funds are not in the vault. It's atomic — same transaction — so no external actor can intercept it. But it means TaskFactory has an implicit transient custody. This was pre-existing, not introduced by me.

---

### 2. Execution

```
Executor
 │
 │  executorHub.executeTask(taskId)
 ▼
ExecutorHub      ← no funds, just a gateway
 │  calls taskLogic.executeTask(params)  [onlyExecutorHub]
 ▼
TaskLogicV2      ← no funds, orchestrator only
 │
 ├── reads taskCore + taskVault from GlobalRegistry
 ├── verifies action hash stored in TaskCore
 │
 │  For each action:
 │    1. asks adapter: getTokenRequirements(params)  → (token, amount)
 │    2. calls vault:  executeTokenAction(token, adapter, amount, adapterCall)
 │
 ▼
TaskVault        ← sole fund holder
 │
 │  executeTokenAction:
 │    check tokenBalances[token] >= amount
 │    IERC20(token).approve(adapter, amount)  ← grants adapter a spend allowance
 │    adapter.call(adapterCall)               ← calls adapter.execute(vault, params)
 │    IERC20(token).approve(adapter, 0)       ← clears allowance
 │    deducts actual tokens spent from tokenBalances
 │
 ▼
Adapter          ← no funds (stateless logic only)
 │
 │  adapter.execute(vault, params):
 │    checks condition (time / price)
 │    IERC20(token).transferFrom(vault → recipient)   ← pulls allowed amount
 │    (for CCTP: pulls → approves messenger → depositForBurn)
 │    (for Stork: pulls → safeTransfer → recipient)
 ▼
Recipient / Cross-chain bridge
```

**The vault stays in control throughout.** The vault grants a tightly-scoped approval (`approve(adapter, amount)`) and immediately clears it after the call. The adapter cannot take more than that amount even if it tried.

---

### 3. Reward Payment

```
TaskLogicV2
 │
 │  rewardManager.distributeReward(vault, executor, baseReward, gasUsed)
 ▼
RewardManager    ← no funds (except platform fees collected)
 │
 │  calls vault.releaseReward(executor, executorTotal)  [onlyTaskLogic modifier]
 │  calls vault.releaseReward(rewardManager, platformFee)
 ▼
TaskVault
 │
 │  releaseReward:
 │    nativeBalance -= amount
 │    executor.call{value: amount}("")    ← ETH sent to executor
 │    rewardManager.call{value: fee}("")  ← fee sent to RewardManager
 ▼
Executor wallet  /  RewardManager (fee pool)
```

---

## One Design Issue Worth Fixing

The `onlyTaskLogic` modifier in TaskVault grants access to **both** `taskLogic` and `rewardManager`:

```solidity
// TaskVault.sol:43
modifier onlyTaskLogic() {
    if (msg.sender != taskLogic && msg.sender != rewardManager) revert OnlyTaskLogic();
    _;
}
```

This modifier guards both `releaseReward` **and** `executeTokenAction`. That means `RewardManager` can technically call `executeTokenAction` directly and drain ERC20 tokens from any vault — which is an over-permission. RewardManager should only be able to call `releaseReward` (for ETH rewards), not `executeTokenAction` (for ERC20 actions).

The fix is a two-modifier split:

```solidity
modifier onlyTaskLogic() {
    if (msg.sender != taskLogic) revert OnlyTaskLogic();
    _;
}

modifier onlyTaskLogicOrRewardManager() {
    if (msg.sender != taskLogic && msg.sender != rewardManager) revert OnlyTaskLogic();
    _;
}
```

Then:
- `executeTokenAction` → `onlyTaskLogic` (TaskLogicV2 only)
- `releaseReward` → `onlyTaskLogicOrRewardManager` (both, needed for RewardManager to pay executor)

---

## Your Architecture — What Actually Holds Funds

```
GlobalRegistry   — zero funds, task index only
TaskCore         — zero funds, metadata + action storage only
ExecutorHub      — zero funds, execution gateway only
TaskLogicV2      — zero funds, orchestrator only
ActionRegistry   — zero funds, adapter lookup only
RewardManager    — holds accumulated platform fees (ETH only, small amounts)
Adapters         — zero funds, stateless condition + action logic only

TaskVault        — ALL user funds live here ✅
                   creator = user (controls withdrawAll after task ends)
                   nativeBalance = reward ETH
                   tokenBalances = USDC / EURO
```

The vault is the only permanent fund holder. Your design intention is fully preserved.
