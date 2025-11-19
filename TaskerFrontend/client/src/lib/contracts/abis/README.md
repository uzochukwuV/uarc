# Contract ABIs

This directory should contain the ABI JSON files for all smart contracts.

## How to Add ABIs

After compiling your contracts with Hardhat, copy the ABI files here:

```bash
# From the contracts directory
cd ../../contracts

# Compile contracts
npx hardhat compile

# Copy ABIs to frontend
cp artifacts/contracts/core/TaskFactory.sol/TaskFactory.json ../TaskerFrontend/client/src/lib/contracts/abis/
cp artifacts/contracts/core/TaskCore.sol/TaskCore.json ../TaskerFrontend/client/src/lib/contracts/abis/
cp artifacts/contracts/core/TaskVault.sol/TaskVault.json ../TaskerFrontend/client/src/lib/contracts/abis/
cp artifacts/contracts/core/TaskLogicV2.sol/TaskLogicV2.json ../TaskerFrontend/client/src/lib/contracts/abis/
cp artifacts/contracts/core/ExecutorHub.sol/ExecutorHub.json ../TaskerFrontend/client/src/lib/contracts/abis/
cp artifacts/contracts/core/GlobalRegistry.sol/GlobalRegistry.json ../TaskerFrontend/client/src/lib/contracts/abis/
cp artifacts/contracts/support/ActionRegistry.sol/ActionRegistry.json ../TaskerFrontend/client/src/lib/contracts/abis/
cp artifacts/contracts/support/RewardManager.sol/RewardManager.json ../TaskerFrontend/client/src/lib/contracts/abis/
cp artifacts/contracts/adapters/UniswapV2USDCETHBuyLimitAdapter.sol/UniswapV2USDCETHBuyLimitAdapter.json ../TaskerFrontend/client/src/lib/contracts/abis/
cp artifacts/contracts/mocks/MockERC20.sol/MockERC20.json ../TaskerFrontend/client/src/lib/contracts/abis/
```

## Required ABI Files

- ✅ TaskFactory.json
- ✅ TaskCore.json
- ✅ TaskVault.json
- ✅ TaskLogicV2.json
- ✅ ExecutorHub.json
- ✅ GlobalRegistry.json
- ✅ ActionRegistry.json
- ✅ RewardManager.json
- ✅ UniswapV2USDCETHBuyLimitAdapter.json
- ✅ MockERC20.json

## Automated Script

Or use this script to copy all at once:

```bash
#!/bin/bash
# run from contracts directory
CONTRACT_ABIS=(
  "core/TaskFactory.sol/TaskFactory.json"
  "core/TaskCore.sol/TaskCore.json"
  "core/TaskVault.sol/TaskVault.json"
  "core/TaskLogicV2.sol/TaskLogicV2.json"
  "core/ExecutorHub.sol/ExecutorHub.json"
  "core/GlobalRegistry.sol/GlobalRegistry.json"
  "support/ActionRegistry.sol/ActionRegistry.json"
  "support/RewardManager.sol/RewardManager.json"
  "adapters/UniswapV2USDCETHBuyLimitAdapter.sol/UniswapV2USDCETHBuyLimitAdapter.json"
  "mocks/MockERC20.sol/MockERC20.json"
)

for abi in "${CONTRACT_ABIS[@]}"; do
  cp "../../../../../artifacts/contracts/$abi" "abis/"
done

taskerOnChain/TaskerFrontend/client/src/lib/contracts/abis
```
