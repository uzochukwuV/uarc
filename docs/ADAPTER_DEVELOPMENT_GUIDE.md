# Adapter Development Guide

## Overview

Adapters in TaskerOnChain are smart contracts that enable task automation for various DeFi protocols. This guide explains how to create new adapters that are compatible with the TaskerOnChain protocol.

## Critical Requirement: TaskLogicV2 Compatibility

**⚠️ IMPORTANT:** TaskLogicV2 currently expects ALL adapter parameters to follow the Uniswap V2 swap format with **6 parameters**:

```solidity
(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient)
```

Even if your adapter doesn't need all these parameters, you **MUST** encode your params in this 6-parameter format for compatibility with TaskLogicV2.

### Why This Matters

TaskLogicV2 decodes action params at lines 224-234 to extract `tokenIn` and `amountIn`:

```solidity
(
    ,  // router
    address tokenIn,
    ,  // tokenOut
    uint256 amountIn,
    ,  // minAmountOut
       // recipient
) = abi.decode(
    action.params,
    (address, address, address, uint256, uint256, address)
);
```

If your params don't match this structure, the transaction will fail with an ABI decoding error.

## Adapter Structure Template

### 1. Basic Contract Structure

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IActionAdapter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title YourAdapter
 * @notice Description of what this adapter automates
 */
contract YourAdapter is IActionAdapter {

    /**
     * @notice Params MUST match TaskLogicV2 expectations (6 params)
     * @dev Map your needed params to the Uniswap format:
     *      - Position 0 (router): Use for your primary address OR ignore
     *      - Position 1 (tokenIn): Token to spend - TaskLogicV2 REQUIRES this
     *      - Position 2 (tokenOut): Token to receive OR ignore if not needed
     *      - Position 3 (amountIn): Amount to spend - TaskLogicV2 REQUIRES this
     *      - Position 4 (minAmountOut): Minimum output OR repurpose for your needs
     *      - Position 5 (recipient): Recipient address
     */
    struct AdapterParams {
        address param1;      // Maps to router
        address tokenIn;     // Maps to tokenIn - REQUIRED by TaskLogicV2
        address param3;      // Maps to tokenOut
        uint256 amountIn;    // Maps to amountIn - REQUIRED by TaskLogicV2
        uint256 param5;      // Maps to minAmountOut
        address recipient;   // Maps to recipient
    }

    /**
     * @notice Check if conditions for execution are met
     * @param params ABI-encoded AdapterParams (6 fields)
     * @return canExec True if conditions are met
     * @return reason Human-readable reason
     */
    function canExecute(bytes calldata params)
        external
        view
        override
        returns (bool canExec, string memory reason)
    {
        AdapterParams memory p = abi.decode(params, (AdapterParams));

        // Your condition logic here
        if (/* condition not met */) {
            return (false, "Condition not met");
        }

        return (true, "Conditions met");
    }

    /**
     * @notice Execute the adapter action
     * @param vault Address of TaskVault holding the tokens
     * @param params ABI-encoded AdapterParams (6 fields)
     * @return success True if execution succeeded
     * @return result Encoded result data
     */
    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        // Step 1: Check conditions
        (bool conditionMet, string memory reason) = this.canExecute(params);
        if (!conditionMet) {
            return (false, bytes(reason));
        }

        // Step 2: Decode parameters
        AdapterParams memory p = abi.decode(params, (AdapterParams));

        // Step 3: Validate parameters
        if (p.tokenIn == address(0)) {
            return (false, bytes("Invalid token"));
        }
        if (p.amountIn == 0) {
            return (false, bytes("Invalid amount"));
        }

        // Step 4: Execute your logic
        // The TaskVault has already approved this adapter to spend p.amountIn of p.tokenIn

        try IERC20(p.tokenIn).transferFrom(vault, /* destination */, p.amountIn) {
            // Success
            return (true, abi.encode("Success message", /* result data */));
        } catch Error(string memory err) {
            return (false, bytes(err));
        } catch {
            return (false, bytes("Execution failed"));
        }
    }

    /// @inheritdoc IActionAdapter
    function isProtocolSupported(address protocol) external pure override returns (bool) {
        // Return true if protocol is supported
        // For simple adapters that don't interact with external protocols, return true for any address
        return true;
    }

    /// @inheritdoc IActionAdapter
    function name() external pure override returns (string memory) {
        return "YourAdapter";
    }
}
```

## Example: TimeBasedTransferAdapter

Here's a real working example that shows how to map custom logic to the 6-parameter format:

```solidity
contract TimeBasedTransferAdapter is IActionAdapter {
    struct TransferParams {
        address ignored1;        // router field (unused, for TaskLogicV2 compatibility)
        address token;           // tokenIn - Token to transfer
        address ignored2;        // tokenOut field (unused)
        uint256 amount;          // amountIn - Amount to transfer
        uint256 executeAfter;    // minAmountOut - REPURPOSED as timestamp!
        address recipient;       // recipient - Where to send tokens
    }

    function canExecute(bytes calldata params)
        external
        view
        override
        returns (bool canExec, string memory reason)
    {
        TransferParams memory p = abi.decode(params, (TransferParams));

        if (block.timestamp < p.executeAfter) {
            return (false, "Too early - time condition not met");
        }

        return (true, "Time condition met - ready to execute");
    }

    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        (bool conditionMet, string memory reason) = this.canExecute(params);
        if (!conditionMet) {
            return (false, bytes(reason));
        }

        TransferParams memory p = abi.decode(params, (TransferParams));

        // TaskVault has already approved this adapter to spend tokens
        try IERC20(p.token).transferFrom(vault, p.recipient, p.amount) returns (
            bool transferSuccess
        ) {
            if (!transferSuccess) {
                return (false, bytes("Token transfer failed"));
            }
            return (true, abi.encode(p.recipient, p.amount, block.timestamp));
        } catch Error(string memory err) {
            return (false, bytes(err));
        } catch {
            return (false, bytes("Transfer reverted"));
        }
    }

    function isProtocolSupported(address) external pure override returns (bool) {
        return true; // Supports any protocol since we don't interact with external protocols
    }

    function name() external pure override returns (string memory) {
        return "TimeBasedTransferAdapter";
    }
}
```

## Frontend Integration

### 1. Encoding Adapter Parameters

**Always encode as 6 parameters** even if you don't use all of them:

```typescript
const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
  ["address", "address", "address", "uint256", "uint256", "address"],
  [
    param1OrZeroAddress,       // router field
    tokenAddress,              // tokenIn - REQUIRED
    param3OrZeroAddress,       // tokenOut field
    amount,                    // amountIn - REQUIRED
    param5OrCustomValue,       // minAmountOut field (can repurpose)
    recipientAddress,          // recipient
  ]
);
```

### 2. Building Task Actions

```typescript
const actions = [{
  selector: "0x1cff79cd", // executeAction(address,bytes) selector
  protocol: protocolAddress, // Use external protocol address OR token address
  params: adapterParams,
}];
```

**Important:** The `protocol` field should be:
- For adapters interacting with external protocols (Uniswap, Aave): Use the **external protocol address** (e.g., router address)
- For simple adapters without external protocols: Use the **token address** or another relevant address
- The protocol address **must be approved** in ActionRegistry

### 3. Building Token Deposits

```typescript
const tokenDeposits = [{
  token: tokenAddress,
  amount: tokenAmount,
}];
```

### 4. ETH Value Calculation

**Critical:** Send MORE ETH than just the reward to cover gas reimbursement:

```typescript
// RewardManager has gas reimbursement multiplier (default 100)
// Safe approach: Send extra buffer
const rewardPerExecution = ethers.parseEther("0.01"); // Base reward
const totalETHValue = ethers.parseEther("0.1"); // Reward + gas buffer

// Or calculate based on expected gas:
const estimatedGas = 500000n;
const gasPrice = await provider.getFeeData().gasPrice;
const gasReimbursement = estimatedGas * gasPrice * 100n / 100n; // multiplier
const totalETHValue = rewardPerExecution + gasReimbursement + buffer;
```

### 5. Creating the Task

```typescript
await taskFactory.createTaskWithTokens(
  {
    expiresAt,
    maxExecutions,
    recurringInterval: 0n,
    rewardPerExecution,
    seedCommitment: ethers.ZeroHash,
  },
  actions,
  tokenDeposits,
  { value: totalETHValue } // Must be sufficient for rewards + gas
);
```

## Deployment Checklist

- [ ] Adapter contract implements IActionAdapter interface
- [ ] Params struct has exactly 6 fields matching Uniswap format
- [ ] `tokenIn` (position 1) and `amountIn` (position 3) are correctly mapped
- [ ] `canExecute()` returns clear reason strings
- [ ] `execute()` handles all error cases gracefully
- [ ] `isProtocolSupported()` validates correct protocol addresses
- [ ] Deploy adapter contract
- [ ] Register adapter in ActionRegistry with correct selector
- [ ] Approve protocol address in ActionRegistry
- [ ] Test with sufficient ETH for rewards + gas reimbursement
- [ ] Update frontend template with 6-parameter encoding

## Testing Best Practices

### Unit Tests

```typescript
describe("YourAdapter", function () {
  it("Should encode params in 6-field format", async function () {
    const params = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "uint256", "uint256", "address"],
      [param1, tokenIn, param3, amountIn, param5, recipient]
    );

    const [canExec] = await adapter.canExecute(params);
    expect(canExec).to.be.true;
  });
});
```

### Integration Tests

```typescript
// Test complete flow: task creation → execution
const actions = [{
  selector: "0x1cff79cd",
  protocol: protocolAddress,
  params: encodedParams,
}];

await taskFactory.createTaskWithTokens(
  taskParams,
  actions,
  tokenDeposits,
  { value: ethers.parseEther("0.1") } // Sufficient for rewards + gas
);
```

## Common Pitfalls

### ❌ Wrong: Using Custom Param Structure

```solidity
struct MyParams {
    address token;
    uint256 amount;
    uint256 timestamp;
} // Only 3 fields - will fail in TaskLogicV2!
```

### ✅ Correct: Using 6-Parameter Structure

```solidity
struct MyParams {
    address ignored;
    address token;      // tokenIn
    address ignored2;
    uint256 amount;     // amountIn
    uint256 timestamp;  // repurposed minAmountOut
    address recipient;
} // 6 fields matching Uniswap format
```

### ❌ Wrong: Insufficient ETH

```typescript
const value = rewardPerExecution; // Not enough for gas reimbursement
```

### ✅ Correct: Buffer for Gas

```typescript
const value = ethers.parseEther("0.1"); // Covers reward + gas reimbursement
```

### ❌ Wrong: Using Adapter Address as Protocol

```typescript
protocol: adapterAddress, // Wrong - causes validation issues
```

### ✅ Correct: Using External Protocol or Token Address

```typescript
protocol: externalProtocolAddress, // For Uniswap, Aave, etc.
// OR
protocol: tokenAddress, // For simple adapters without external protocols
```

## Future Considerations

### Making TaskLogicV2 More Flexible

In future versions, TaskLogicV2 should be refactored to support dynamic parameter structures:

```solidity
// Future improvement: Let adapters define their own param structure
interface IActionAdapter {
    function getParamTypes() external pure returns (string memory);
    // Returns: "(address,uint256,uint256)" for custom structure
}
```

This would remove the hardcoded Uniswap format requirement. For now, all adapters must conform to the 6-parameter format.

## Support

- **Issues:** Report at https://github.com/your-repo/issues
- **Docs:** https://docs.taskeronchain.com
- **Examples:** See `contracts/adapters/` for reference implementations

## Adapter Examples

### Simple Adapters
- **TimeBasedTransferAdapter**: Transfer tokens after a timestamp
- **RecurringPaymentAdapter**: Automated salary/subscription payments

### DeFi Protocol Adapters
- **UniswapV2Adapter**: Automated limit orders on Uniswap
- **AaveAdapter**: Automated supply/borrow on Aave
- **CompoundAdapter**: Automated lending strategies

---

**Remember:** Always test thoroughly on testnet before mainnet deployment!
