# How to Run the Failing Test with Full Traces

## ✅ Setup Complete!

We've installed `hardhat-tracer` and added it to `hardhat.config.ts`.

## 🚀 Run Commands

### 1. Basic trace (shows main contract calls)
```bash
npx hardhat test test/TaskExecutionFlow.test.ts --trace
```

### 2. Verbose trace (shows more detail)
```bash
npx hardhat test test/TaskExecutionFlow.test.ts --vvv
```

### 3. Full trace (shows ALL internal calls - **RECOMMENDED**)
```bash
npx hardhat test test/TaskExecutionFlow.test.ts --vvvv
```

### 4. Full trace + opcodes (extreme detail)
```bash
npx hardhat test test/TaskExecutionFlow.test.ts --vvvvv
```

### 5. Trace specific test only
```bash
npx hardhat test test/TaskExecutionFlow.test.ts --vvvv --grep "Should execute full lifecycle"
```

### 6. Full trace + no logs clutter
```bash
npx hardhat test test/TaskExecutionFlow.test.ts --vvvv --no-console-log
```

---

## 📊 What You'll See

With `--vvvv`, you'll get output like:

```
TaskerOnChain - Complete Execution Flow
  Complete Task Execution Flow
    ⚡ STEP 7: Executor reveals and executes task
    ------------------------------------------------------------
      → Revealing nonce and executing...

      ExecutorHub.executeTask(
        taskId: 0,
        nonce: 0x1234...,
        conditionProof: 0x...,
        actionsProof: 0x...
      ) [Gas: 232022]
      ├─ [CALL] TaskLogicV2.executeTask(params) [Gas: 210045]
      │  ├─ [STATICCALL] GlobalRegistry.getTaskAddresses(0) → (0xTaskCore..., 0xTaskVault...)
      │  ├─ [STATICCALL] TaskCore.getMetadata() → {conditionHash: 0x..., actionsHash: 0x...}
      │  ├─ [CALL] TaskCore.executeTask(executor: 0x...) → true
      │  ├─ [STATICCALL] ConditionOracle.checkCondition({type: 2, params: 0x...})
      │  │  └─ [STATICCALL] ChainlinkAggregator.latestRoundData() → (2, 310000000000, ...)
      │  │  └─ returns {isMet: true, reason: "Price above target"}
      │  ├─ [STATICCALL] ActionRegistry.getAdapter(0x12345678)
      │  │  └─ returns {adapter: 0xUniswap..., isActive: true, gasLimit: 500000}
      │  ├─ [CALL] TaskVault.executeTokenAction(
      │  │     token: 0x0000000000000000000000000000000000000000,  ← ❌ BUG HERE!
      │  │     adapter: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0,
      │  │     amount: 0,  ← ❌ BUG HERE!
      │  │     data: 0x...
      │  │  )
      │  │  └─ 💥 REVERT: "Invalid token"
      │  ├─ _executeAction returns: false
      │  ├─ [CALL] RewardManager.distributeReward(...)
      │  └─ returns {success: true, gasUsed: 210045, rewardPaid: 12000000000000000}
      └─ returns true

      ✅ Task executed successfully!  ← Says success but swap failed!
         Gas used: 232022
```

**The trace will immediately show**:
- Line where `address(0)` is passed to `executeTokenAction`
- The revert inside TaskVault
- That `_executeAction` returns `false` but execution continues anyway

---

## 🎯 Expected Findings

Running with `--vvvv` will reveal:

### 1. The Bug Location
```
TaskLogicV2._executeAction (line 279-287)
  └─ Calls: taskVault.executeTokenAction(
        address(0),  ← WRONG! Should be USDC address
        adapter,
        0,           ← WRONG! Should be 1000e6
        data
     )
```

### 2. Why Swap Fails
```
TaskVault.executeTokenAction (line 132)
  └─ require(token != address(0), "Invalid token")
     └─ REVERTS because token = 0x000...
```

### 3. Silent Failure
```
TaskLogicV2._executeAction (line 289)
  └─ return success;  ← Returns false
     └─ TaskLogicV2._verifyAndExecuteActions (line 248-250)
        └─ if (!success) { return false; }
           └─ TaskLogicV2.executeTask (line 100-109)
              └─ Doesn't revert, just marks as failed
                 └─ But test doesn't check this!
```

---

## 🔧 Quick Fix Preview

After seeing the trace, the fix will be clear:

**TaskLogicV2.sol** (line 259-290):
```solidity
function _executeAction(address taskVault, Action memory action) internal returns (bool) {
    // Get adapter from registry
    IActionRegistry.AdapterInfo memory adapterInfo =
        IActionRegistry(actionRegistry).getAdapter(action.selector);

    // 🆕 DECODE action params to extract token info
    // Assuming UniswapV2Adapter.SwapParams structure
    (
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) = abi.decode(action.params, (address, address, address, uint256, uint256, address));

    // Prepare adapter call
    bytes memory adapterCall = abi.encodeWithSelector(
        IActionAdapter.execute.selector,
        taskVault,
        action.params
    );

    // Execute through vault with CORRECT token/amount
    (bool success, ) = taskVault.call{gas: adapterInfo.gasLimit}(
        abi.encodeWithSignature(
            "executeTokenAction(address,address,uint256,bytes)",
            tokenIn,              // ✅ USDC address
            adapterInfo.adapter,
            amountIn,             // ✅ 1000e6
            adapterCall
        )
    );

    return success;
}
```

---

## 📝 To Run Now

```bash
cd taskerOnChain
npx hardhat test test/TaskExecutionFlow.test.ts --vvvv --grep "Should execute full lifecycle"
```

This will give you the **exact line-by-line call trace** showing where and why the swap fails!
