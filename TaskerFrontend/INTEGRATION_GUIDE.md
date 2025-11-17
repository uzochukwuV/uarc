# Web3 Integration Guide - TaskerOnChain Frontend

> **Step-by-step guide to complete the blockchain integration**

**Status:** Phase 1 Complete ✅ → Phase 2 Starting ⚠️

---

## ✅ Phase 1 Complete: Wallet Connection

**What's Done:**
- ✅ Installed RainbowKit, wagmi, viem
- ✅ Created `Web3Provider` component
- ✅ Updated `App.tsx` with Web3Provider wrapper
- ✅ Replaced mock wallet with `ConnectButton` in Navigation
- ✅ Created contract addresses structure
- ✅ Created `useWallet()` hook

**How to Test:**
```bash
cd TaskerFrontend
npm run dev
```

Visit `http://localhost:5173` and click "Connect Wallet". You should see RainbowKit modal.

---

## 🚧 Phase 2: Contract Integration (Next Steps)

### Step 1: Get WalletConnect Project ID

1. Go to https://cloud.walletconnect.com
2. Create a new project
3. Copy your Project ID
4. Create `.env` file:

```bash
cd TaskerFrontend
cp .env.example .env
```

5. Edit `.env` and add your Project ID:
```
VITE_WALLETCONNECT_PROJECT_ID=your_actual_project_id
```

### Step 2: Deploy Contracts to Mumbai

From the contracts directory:

```bash
cd ../contracts

# Compile contracts
npx hardhat compile

# Deploy to Mumbai testnet
npx hardhat run scripts/deploy.ts --network polygonMumbai
```

**Important:** Save all deployed addresses!

### Step 3: Update Contract Addresses

Edit `client/src/lib/contracts/addresses.ts`:

```typescript
polygonMumbai: {
  TASK_FACTORY: '0xYourDeployedAddress',
  EXECUTOR_HUB: '0xYourDeployedAddress',
  // ... update all addresses
}
```

### Step 4: Copy Contract ABIs

Run this from the contracts directory:

```bash
#!/bin/bash
cd contracts

# Create destination directory if it doesn't exist
mkdir -p ../TaskerFrontend/client/src/lib/contracts/abis

# Copy all ABIs
cp artifacts/contracts/core/TaskFactory.sol/TaskFactory.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

cp artifacts/contracts/core/TaskCore.sol/TaskCore.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

cp artifacts/contracts/core/TaskVault.sol/TaskVault.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

cp artifacts/contracts/core/TaskLogicV2.sol/TaskLogicV2.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

cp artifacts/contracts/core/ExecutorHub.sol/ExecutorHub.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

cp artifacts/contracts/core/GlobalRegistry.sol/GlobalRegistry.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

cp artifacts/contracts/support/ActionRegistry.sol/ActionRegistry.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

cp artifacts/contracts/support/RewardManager.sol/RewardManager.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

cp artifacts/contracts/adapters/UniswapV2USDCETHBuyLimitAdapter.sol/UniswapV2USDCETHBuyLimitAdapter.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

cp artifacts/contracts/mocks/MockERC20.sol/MockERC20.json \
   ../TaskerFrontend/client/src/lib/contracts/abis/

echo "✅ ABIs copied successfully!"
```

### Step 5: Create Contract Hooks

**Create `useTaskFactory.ts`:**

```typescript
// client/src/lib/hooks/useTaskFactory.ts
import { useContractRead, useContractWrite, usePrepareContractWrite } from 'wagmi';
import { getContractAddress } from '../contracts/addresses';
import TaskFactoryABI from '../contracts/abis/TaskFactory.json';
import { useWallet } from './useWallet';

export function useTaskFactory() {
  const { chainId } = useWallet();
  const address = getContractAddress('TASK_FACTORY', chainId);

  // Read: Get task count
  const { data: taskCount } = useContractRead({
    address,
    abi: TaskFactoryABI.abi,
    functionName: 'getTaskCount',
  });

  // Write: Create task
  const { config } = usePrepareContractWrite({
    address,
    abi: TaskFactoryABI.abi,
    functionName: 'createTaskWithTokens',
  });

  const { write: createTask, isLoading, isSuccess } = useContractWrite(config);

  return {
    address,
    taskCount,
    createTask,
    isLoading,
    isSuccess,
  };
}
```

**Create `useExecutorHub.ts`:**

```typescript
// client/src/lib/hooks/useExecutorHub.ts
import { useContractRead, useContractWrite } from 'wagmi';
import { getContractAddress } from '../contracts/addresses';
import ExecutorHubABI from '../contracts/abis/ExecutorHub.json';
import { useWallet } from './useWallet';

export function useExecutorHub() {
  const { address: userAddress, chainId } = useWallet();
  const contractAddress = getContractAddress('EXECUTOR_HUB', chainId);

  // Read: Get executor info
  const { data: executor } = useContractRead({
    address: contractAddress,
    abi: ExecutorHubABI.abi,
    functionName: 'getExecutor',
    args: [userAddress],
    enabled: !!userAddress,
  });

  // Write: Register executor
  const { write: registerExecutor } = useContractWrite({
    address: contractAddress,
    abi: ExecutorHubABI.abi,
    functionName: 'registerExecutor',
  });

  return {
    executor,
    registerExecutor,
    isRegistered: executor?.isActive || false,
  };
}
```

### Step 6: Replace Mock Data with Blockchain Data

**Update `executor-dashboard.tsx`:**

```typescript
// Before (mock data)
const { data: executor } = useQuery<Executor>({
  queryKey: ["/api/executors", executorAddress],  // ❌ API call
});

// After (blockchain data)
import { useExecutorHub } from '@/lib/hooks/useExecutorHub';
import { useWallet } from '@/lib/hooks/useWallet';

const { address, isConnected } = useWallet();
const { executor, isRegistered } = useExecutorHub();

// Now `executor` comes from smart contract!
```

### Step 7: Implement Task Creation

**Update `create-task.tsx`:**

```typescript
import { useTaskFactory } from '@/lib/hooks/useTaskFactory';
import { useContractWrite } from 'wagmi';
import { parseEther } from 'viem';

const { createTask } = useTaskFactory();

const handleCreate = async () => {
  // Prepare task params
  const taskParams = {
    expiresAt: Math.floor(Date.now() / 1000) + (formData.expiresIn * 86400),
    maxExecutions: formData.maxExecutions || 0,
    recurringInterval: 0,
    rewardPerExecution: parseEther(formData.rewardPerExecution),
    seedCommitment: ethers.ZeroHash,
  };

  // Prepare action params (adapter-specific)
  const actionParams = encodeAbiParameters(
    ['address', 'address', 'address', 'uint256', 'uint256', 'address', 'uint256'],
    [
      mockRouter.address,
      mockUSDC.address,
      mockWETH.address,
      parseUnits('1000', 6), // 1000 USDC
      parseEther('0.3'),     // Min 0.3 WETH
      userAddress,
      3100e8,                // $3100 price limit
    ]
  );

  const actions = [{
    selector: '0x...', // buyLimitOrder selector
    protocol: mockRouter.address,
    params: actionParams,
  }];

  const deposits = [{
    token: mockUSDC.address,
    amount: parseUnits('1000', 6),
  }];

  // Execute transaction
  await createTask({
    args: [taskParams, actions, deposits],
    value: taskParams.rewardPerExecution, // ETH for reward
  });
};
```

---

## Testing Checklist

### Phase 1 (Wallet Connection) ✅
- [ ] Can connect wallet
- [ ] Wallet address displays in navigation
- [ ] Can disconnect wallet
- [ ] Can switch networks (Mumbai/Polygon)

### Phase 2 (Contract Reading)
- [ ] Can read task count from TaskFactory
- [ ] Can read executor info from ExecutorHub
- [ ] Can read tasks from GlobalRegistry
- [ ] Dashboard shows real blockchain data

### Phase 3 (Contract Writing)
- [ ] Can create tasks on-chain
- [ ] Can register as executor
- [ ] Can execute tasks
- [ ] Transaction confirmations work
- [ ] Error handling works

---

## Common Issues & Solutions

### Issue 1: "Cannot find module '@rainbow-me/rainbowkit'"

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue 2: "Unsupported chain"

**Solution:** Make sure you're connected to Polygon Mumbai (Chain ID: 80001)

Switch network in MetaMask:
- Network Name: Polygon Mumbai
- RPC URL: https://rpc-mumbai.maticvigil.com
- Chain ID: 80001
- Currency Symbol: MATIC
- Block Explorer: https://mumbai.polygonscan.com

### Issue 3: "Contract not deployed"

**Solution:** Update contract addresses in `addresses.ts` after deployment

### Issue 4: ABI files not found

**Solution:** Run the copy script from Step 4 again

---

## Quick Commands Reference

```bash
# Start development server
cd TaskerFrontend
npm run dev

# Deploy contracts (from contracts dir)
cd ../contracts
npx hardhat compile
npx hardhat run scripts/deploy.ts --network polygonMumbai

# Copy ABIs (from contracts dir)
./copy-abis.sh

# Build frontend for production
cd ../TaskerFrontend
npm run build
```

---

## Next Actions (After Phase 2)

1. **Phase 3:** Implement task creation flow
   - Token approval step
   - Dynamic form based on template
   - Transaction progress UI

2. **Phase 4:** Implement executor flow
   - Register executor
   - Browse executable tasks
   - Commit-execute flow

3. **Phase 5:** Real-time updates
   - Event listeners
   - Toast notifications
   - Auto-refresh data

4. **Phase 6:** Deploy
   - Build production bundle
   - Deploy to Vercel
   - Configure domain

---

## Files Created

```
TaskerFrontend/
├── .env.example                              ← Environment variables template
├── client/src/
│   ├── App.tsx                               ← Updated with Web3Provider
│   ├── providers/
│   │   └── Web3Provider.tsx                  ← NEW: RainbowKit setup
│   ├── components/
│   │   └── navigation.tsx                    ← Updated with ConnectButton
│   └── lib/
│       ├── contracts/
│       │   ├── addresses.ts                  ← NEW: Contract addresses
│       │   └── abis/                         ← NEW: ABI files go here
│       │       └── README.md
│       └── hooks/
│           ├── useWallet.ts                  ← NEW: Wallet hook
│           ├── useTaskFactory.ts             ← TODO: Create this
│           └── useExecutorHub.ts             ← TODO: Create this
```

---

**Current Status:** Ready for Step 1 (Get WalletConnect Project ID)

**Next Task:** Create `.env` file and add Project ID

---

Let me know when you're ready to proceed with Phase 2! 🚀
