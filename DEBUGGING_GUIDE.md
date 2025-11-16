# Hardhat Debugging Guide - Foundry-style Traces

## 🔍 Method 1: Hardhat's Built-in Tracing (Like Foundry's `-vvvv`)

Hardhat has similar verbosity levels to Foundry's `-vvvv` flag.

### Enable Stack Traces

Add to your `hardhat.config.ts`:

```typescript
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // Enable detailed error messages
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      loggingEnabled: true, // 👈 Enable console.log in contracts
      mining: {
        auto: true,
        interval: 0,
      },
    },
  },
  mocha: {
    timeout: 100000,
  },
};
```

### Run Tests with Verbose Output

```bash
# Show stack traces (like -vv)
npx hardhat test --verbose

# Show detailed gas reports
npx hardhat test --gas-reporter

# Show full stack traces on errors
npx hardhat test --show-stack-traces

# Run specific test with verbose output
npx hardhat test test/TaskExecutionFlow.test.ts --verbose

# Combine flags
npx hardhat test --verbose --show-stack-traces --trace
```

---

## 🔍 Method 2: Hardhat Tracer Plugin (BEST for Foundry-like traces)

This gives you **call traces** similar to Foundry's `-vvvv`!

### Installation

```bash
npm install --save-dev hardhat-tracer
```

### Configuration

Update `hardhat.config.ts`:

```typescript
import "hardhat-tracer";

const config: HardhatUserConfig = {
  // ... your existing config
};
```

### Usage

```bash
# Basic trace (like foundry -vv)
npx hardhat test --trace

# Verbose trace (like foundry -vvv)
npx hardhat test --vvv

# Full trace (like foundry -vvvv) - shows all internal calls
npx hardhat test --vvvv

# Full trace with opcodes (like foundry -vvvvv)
npx hardhat test --vvvvv

# Trace specific test
npx hardhat test test/TaskExecutionFlow.test.ts --trace

# Trace with call data
npx hardhat test --fulltrace
```

### Example Output

```
  TaskerOnChain - Complete Execution Flow
    Complete Task Execution Flow
      ExecutorHub.executeTask(taskId=1, nonce=0x123..., ...)
        ├─ TaskLogicV2.executeTask(params={...})
        │  ├─ GlobalRegistry.getTaskAddresses(1) → (0xTaskCore, 0xTaskVault)
        │  ├─ TaskCore.getMetadata() → {conditionHash: 0x..., actionsHash: 0x...}
        │  ├─ TaskCore.executeTask(executor=0x...) → true
        │  ├─ ConditionOracle.checkCondition({type: 2, params: ...})
        │  │  └─ ChainlinkAggregator.latestRoundData() → (round=2, answer=3100...)
        │  │  └─ returns: {isMet: true, reason: "Price above target"}
        │  ├─ ActionRegistry.getAdapter(0x12345678)
        │  │  └─ returns: {adapter: 0xUniswap..., isActive: true, ...}
        │  ├─ TaskVault.executeTokenAction(token=0x0, adapter=0x..., amount=0, data=...)
        │  │  ❌ REVERT: "Invalid token"  ← 🔍 FOUND THE BUG!
        │  └─ returns: false
        └─ returns: false
```

---

## 🔍 Method 3: Console.log in Contracts

### Add to Contract

```solidity
import "hardhat/console.sol";

contract TaskLogicV2 {
    function _executeAction(address taskVault, Action memory action) internal returns (bool) {
        console.log("=== _executeAction called ===");
        console.log("Vault:", taskVault);
        console.log("Action selector:", uint32(bytes4(action.selector)));
        console.log("Action protocol:", action.protocol);

        IActionRegistry.AdapterInfo memory adapterInfo =
            IActionRegistry(actionRegistry).getAdapter(action.selector);

        console.log("Adapter:", adapterInfo.adapter);
        console.log("Is active:", adapterInfo.isActive);

        // ... rest of function

        console.log("Calling vault with:");
        console.log("  Token:", address(0));  // 👈 This is the bug!
        console.log("  Amount:", 0);

        (bool success, bytes memory result) = taskVault.call{gas: adapterInfo.gasLimit}(
            abi.encodeWithSignature(
                "executeTokenAction(address,address,uint256,bytes)",
                address(0),
                adapterInfo.adapter,
                0,
                adapterCall
            )
        );

        console.log("Vault call success:", success);
        if (!success) {
            console.logBytes(result);  // See the revert reason
        }

        return success;
    }
}
```

### Run Test

```bash
npx hardhat test
```

### Output

```
=== _executeAction called ===
Vault: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Action selector: 305419896
Action protocol: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Adapter: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
Is active: true
Calling vault with:
  Token: 0x0000000000000000000000000000000000000000  ← 🔍 BUG!
  Amount: 0  ← 🔍 BUG!
Vault call success: false
```

---

## 🔍 Method 4: Hardhat Network Traces (JSON RPC)

### Enable in hardhat.config.ts

```typescript
networks: {
  hardhat: {
    loggingEnabled: true,
    allowUnlimitedContractSize: true,
    blockGasLimit: 30000000,
  },
}
```

### Get Transaction Trace

In your test:

```typescript
const tx = await executorHub.executeTask(taskId, nonce, conditionProof, actionsProof);
const receipt = await tx.wait();

// Get the trace
const trace = await ethers.provider.send("debug_traceTransaction", [
  receipt!.hash,
  { tracer: "callTracer" }
]);

console.log(JSON.stringify(trace, null, 2));
```

---

## 🔍 Method 5: Tenderly Integration (Visual Debugger)

### Install

```bash
npm install --save-dev @tenderly/hardhat-tenderly
```

### Configure

```typescript
import "@tenderly/hardhat-tenderly";

tenderly: {
  project: "your-project",
  username: "your-username",
}
```

### Upload Transaction

```typescript
const tx = await executorHub.executeTask(...);
await tenderly.verify({
  name: "ExecutorHub",
  address: executorHubAddress,
});
```

Then view in Tenderly dashboard with full trace!

---

## 🎯 Recommended Debugging Workflow for Your Test

### Step 1: Install hardhat-tracer

```bash
npm install --save-dev hardhat-tracer
```

### Step 2: Update hardhat.config.ts

```typescript
import "hardhat-tracer";

export default {
  // ... existing config
  networks: {
    hardhat: {
      loggingEnabled: true,
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
    },
  },
};
```

### Step 3: Run test with full trace

```bash
npx hardhat test test/TaskExecutionFlow.test.ts --vvvv --fulltrace
```

This will show you:
```
ExecutorHub.executeTask
├─ TaskLogicV2.executeTask
│  ├─ GlobalRegistry.getTaskAddresses → (0x..., 0x...)
│  ├─ TaskCore.getMetadata → {...}
│  ├─ ConditionOracle.checkCondition → {isMet: true}
│  ├─ ActionRegistry.getAdapter → {adapter: 0x...}
│  ├─ TaskVault.executeTokenAction(
│  │     token=0x0000000000000000000000000000000000000000,  ← BUG!
│  │     adapter=0x...,
│  │     amount=0,  ← BUG!
│  │     data=0x...
│  │  )
│  │  └─ ❌ Revert: "Invalid token"
│  └─ returns false
└─ ExecutorHub updates stats
```

---

## 🔍 Quick Debug Commands Cheat Sheet

| Command | Effect | Foundry Equivalent |
|---------|--------|-------------------|
| `npx hardhat test --trace` | Basic call trace | `forge test -vv` |
| `npx hardhat test --vvv` | Detailed trace | `forge test -vvv` |
| `npx hardhat test --vvvv` | Full trace with internal calls | `forge test -vvvv` |
| `npx hardhat test --fulltrace` | Complete trace with opcodes | `forge test -vvvvv` |
| `npx hardhat test --verbose` | Show test names | `forge test -v` |
| `npx hardhat test --grep "pattern"` | Filter tests | `forge test --match-test pattern` |
| `npx hardhat test --gas-reporter` | Gas report | `forge test --gas-report` |

---

## 🐛 Finding Your Specific Bug

For your failing test, run:

```bash
npx hardhat test test/TaskExecutionFlow.test.ts --vvvv --fulltrace --grep "Should execute full lifecycle"
```

This will immediately show:
1. ✅ ExecutorHub calls TaskLogicV2
2. ✅ TaskLogicV2 calls ConditionOracle (passes)
3. ✅ TaskLogicV2 calls ActionRegistry
4. ❌ **TaskVault.executeTokenAction fails** because:
   - `token = address(0)` (line 282)
   - `amount = 0` (line 284)
   - But TaskVault requires `token != address(0)` (line 132)

The trace will look like:

```
TaskLogicV2._executeAction
  ├─ ActionRegistry.getAdapter(0x12345678) → {adapter: 0xUniswap, isActive: true}
  ├─ TaskVault.executeTokenAction(
  │     token: 0x0000000000000000000000000000000000000000,  ← NULL!
  │     adapter: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0,
  │     amount: 0,  ← ZERO!
  │     data: 0x1234...
  │  )
  │  └─ 💥 require(token != address(0), "Invalid token")
  └─ returns false
```

**Root cause identified**: TaskLogicV2 line 282-284 passes hardcoded `address(0)` and `0` instead of extracting token info from action params!

---

## 🛠️ Alternative: Use Remix Debugger

1. Export transaction data from Hardhat test
2. Replay in Remix debugger
3. Step through execution line by line

```typescript
// In test
const tx = await executorHub.executeTask(...);
console.log("Transaction:", {
  from: tx.from,
  to: tx.to,
  data: tx.data,
  value: tx.value,
});
```

Then paste into Remix debugger for step-by-step execution!
