# Adapter Deployment Guide

## Overview

This guide explains how to deploy and register adapters in the TaskerOnChain protocol.

## TimeBasedTransferAdapter

The **TimeBasedTransferAdapter** is a simple adapter designed for testnet testing. It allows users to schedule token transfers that execute when a specific timestamp is reached.

### Features

- ✅ **Simple Time Condition**: Execute when `block.timestamp >= executeAfter`
- ✅ **Token Transfer**: Transfers tokens from TaskVault to recipient
- ✅ **Self-Contained**: Conditions checked within the adapter
- ✅ **Perfect for Testing**: Easy to understand and test protocol flow

### Use Case

```
User wants to transfer 100 USDC to Bob at 2pm tomorrow

1. User deposits 100 USDC into TaskVault
2. Creates task with executeAfter = tomorrow 2pm
3. Executor monitors the task
4. At 2pm, executor triggers execution
5. Adapter checks: block.timestamp >= executeAfter ✅
6. Transfers 100 USDC from vault to Bob
```

## Deployment Options

### Option 1: Deploy with Main Deployment Script

The TimeBasedTransferAdapter is included in the main deployment script by default.

```bash
npx hardhat run scripts/deploy-v2.ts --network <network-name>
```

To skip adapter deployment, edit `scripts/deploy-v2.ts`:

```typescript
const DEPLOY_TIME_ADAPTER = false; // Change to false
```

### Option 2: Deploy Standalone

If you already deployed the main contracts, deploy just the adapter:

```bash
npx hardhat run scripts/deploy-time-adapter.ts --network <network-name>
```

This script:
1. Reads the latest deployment file to get ActionRegistry address
2. Deploys TimeBasedTransferAdapter
3. Registers it with ActionRegistry
4. Saves deployment info

## How Adapter Registration Works

### ActionRegistry Structure

The ActionRegistry maps **function selectors** to adapter addresses:

```solidity
function registerAdapter(
    bytes4 selector,      // Function selector (e.g., 0x1234abcd)
    address adapter,      // Adapter contract address
    uint256 gasLimit,     // Max gas for adapter execution
    bool requiresTokens   // Does adapter need tokens?
) external onlyOwner;
```

### TimeBasedTransferAdapter Registration

```typescript
const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10);
// executeSelector = 0x1cff79cd

await actionRegistry.registerAdapter(
  executeSelector,      // 0x1cff79cd
  timeAdapterAddress,   // Adapter contract address
  100000,               // Gas limit
  true                  // Requires tokens
);
```

## Usage Example

### 1. Encode Action Parameters

```typescript
import { ethers } from 'hardhat';

// Get current time
const now = Math.floor(Date.now() / 1000);
const executeAfter = now + 3600; // 1 hour from now

// Encode parameters matching adapter's struct
const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
  ['address', 'address', 'uint256', 'uint256'],
  [
    usdcAddress,              // token to transfer
    recipientAddress,         // where to send tokens
    ethers.parseUnits('100', 6),  // amount (100 USDC)
    executeAfter              // timestamp when executable
  ]
);
```

### 2. Build Merkle Tree

```typescript
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = ethers;

// Hash the action
const actionHash = keccak256(
  ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint256', 'bytes'],
    [
      usdcAddress,              // tokenIn
      timeAdapterAddress,       // adapter
      100000,                   // gasLimit
      actionParams              // encoded params
    ]
  )
);

// Build tree
const tree = new MerkleTree([actionHash], keccak256, { sortPairs: true });
const actionRoot = tree.getRoot();
const proof = tree.getProof(actionHash);
```

### 3. Create Task

```typescript
// Approve USDC
await usdc.approve(taskFactoryAddress, depositAmount);

// Create task
await taskFactory.createTaskWithDeposit(
  [usdcAddress],           // tokens to deposit
  [depositAmount],         // amounts to deposit
  actionRoot,              // Merkle root of actions
  1,                       // maxExecutions (one-time transfer)
  ethers.ZeroHash,         // no dependencies
  0                        // no delay
);
```

### 4. Execute Task

```typescript
// Executor commits
const commitHash = keccak256(
  ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'bytes32'],
    [executorAddress, ethers.randomBytes(32)]
  )
);
await executorHub.commitToTask(taskCoreAddress, commitHash);

// Wait for commit delay
await time.increase(2);

// Execute (after time condition is met)
await taskLogic.executeTask(
  taskCoreAddress,
  [
    {
      tokenIn: usdcAddress,
      adapter: timeAdapterAddress,
      gasLimit: 100000,
      data: actionParams,
      proof: proof.map(p => p.data)
    }
  ]
);
```

## Adapter Parameters Structure

```solidity
struct TransferParams {
    address token;           // ERC20 token to transfer
    address recipient;       // Recipient address
    uint256 amount;          // Amount to transfer
    uint256 executeAfter;    // Timestamp - execute after this time
}
```

## Condition Checking

The adapter implements `canExecute()` which is called during execution:

```solidity
function canExecute(bytes calldata params)
    external view override
    returns (bool canExec, string memory reason)
{
    TransferParams memory p = abi.decode(params, (TransferParams));

    if (block.timestamp < p.executeAfter) {
        return (false, "Too early - execute after <timestamp>");
    }

    return (true, "Time condition met - ready to execute");
}
```

## Testing

Run the comprehensive test suite:

```bash
npx hardhat test test/TimeBasedTransfer.test.ts
```

This test covers:
- ✅ Full task lifecycle (create → execute → complete)
- ✅ Condition checking (before time vs after time)
- ✅ Token transfers
- ✅ Execution count tracking
- ✅ Failed execution handling

## Deployment Files

After deployment, JSON files are saved to `deployments/`:

**Main deployment**: `deployment-v2-<chainId>-<timestamp>.json`
```json
{
  "contracts": {
    "adapters": {
      "TimeBasedTransferAdapter": "0x..."
    }
  }
}
```

**Adapter deployment**: `adapter-time-based-<chainId>-<timestamp>.json`
```json
{
  "adapter": {
    "name": "TimeBasedTransfer",
    "address": "0x...",
    "selector": "0x1cff79cd",
    "gasLimit": 100000,
    "requiresTokens": true
  }
}
```

## Creating Custom Adapters

To create your own adapter:

1. **Implement IAdapter Interface**:
```solidity
contract MyCustomAdapter is IAdapter {
    function canExecute(bytes calldata params)
        external view override
        returns (bool, string memory);

    function execute(address vault, bytes calldata params)
        external override
        returns (bool, bytes memory);
}
```

2. **Define Your Parameters**:
```solidity
struct MyParams {
    // Your custom parameters
}
```

3. **Implement Condition Logic**:
```solidity
function canExecute(bytes calldata params)
    external view override
    returns (bool, string memory)
{
    MyParams memory p = abi.decode(params, (MyParams));

    // Check your conditions
    if (/* condition not met */) {
        return (false, "Reason why condition failed");
    }

    return (true, "Conditions met");
}
```

4. **Deploy and Register**:
```bash
# Deploy your adapter
npx hardhat run scripts/deploy-my-adapter.ts --network <network>

# Register with ActionRegistry
const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10);
await actionRegistry.registerAdapter(
  executeSelector,
  myAdapterAddress,
  gasLimit,
  requiresTokens
);
```

## Next Steps

- ✅ Deploy to testnet and test the full flow
- ✅ Create more complex adapters (price-based, oracle-based, etc.)
- ✅ Build hyper-specific adapters (e.g., UniswapUSDCETHBuyLimitAdapter)
- ✅ Integrate with external protocols (Uniswap, Aave, etc.)

## Resources

- **Main Deployment**: `scripts/deploy-v2.ts`
- **Adapter Deployment**: `scripts/deploy-time-adapter.ts`
- **Test Suite**: `test/TimeBasedTransfer.test.ts`
- **Adapter Contract**: `contracts/adapters/TimeBasedTransferAdapter.sol`
- **ActionRegistry**: `contracts/support/ActionRegistry.sol`
