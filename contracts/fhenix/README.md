# FHenix Confidential Adapters

This directory contains adapters built for the **FHenix L2**, enabling fully homomorphic encryption (FHE) within the Task Automation System.

## Why FHenix?

Standard smart contracts are fully transparent, meaning conditions (e.g., "sell ETH when price > $3,000") and execution amounts are visible to everyone in the mempool. This exposes users to MEV attacks, front-running, and sandwiching.

By integrating FHenix:
1. **Confidential Conditions**: A user can encrypt their target execution condition (`euint32`).
2. **Confidential Amounts**: The amount to be transferred or swapped is encrypted (`euint256`).
3. **Blind Execution**: Executors can submit current on-chain state or oracle data in an encrypted format. The FHE network evaluates the condition (`FHE.select(conditionMet, amount, 0)`), meaning the executor pays for gas and triggers the task *without ever knowing what the threshold was or how much was transferred*.

## Example: `ConfidentialTransferAdapter.sol`

This adapter demonstrates a simple limit-order or time-based transfer where the condition and amount are encrypted.

- **`createConfidentialTask`**: Accepts encrypted `inEuint32` and `inEuint256` from the frontend (using `fhenixjs`).
- **`executeConfidential`**: Evaluates the FHE condition entirely on-chain without decrypting the values, executing the transfer only if the condition resolves to `ebool` true.

## Future Implementation

When deploying the full system on FHenix Mainnet/Testnet, the `TaskCore` and `TaskVault` can be upgraded to support `FHERC20` tokens natively, allowing the entire lifecycle of a task (funding, conditional checks, and execution) to remain fully encrypted end-to-end.