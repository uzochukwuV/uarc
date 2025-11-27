# TaskerOnChain V2 Deployment Guide

## Running the Deploy Script

### Prerequisites

1. **Node.js & npm** installed
2. **Hardhat** configured in your project
3. **Network Configuration** set up in `hardhat.config.ts`
4. **Funds** in your deployer wallet (for gas costs)

### Step 1: Configure Network

Edit `hardhat.config.ts` to add your network:

```typescript
const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    // Local testing
    hardhat: {
      chainId: 31337,
    },
    // Polkadot Hub Testnet
    polkadotHubTestnet: {
      url: "https://rpc.polkadot-testnet.io",
      accounts: [process.env.PRIVATE_KEY || "0x..."],
      chainId: 4242,
    },
    // Sepolia testnet
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: [process.env.PRIVATE_KEY || "0x..."],
      chainId: 11155111,
    },
  },
};
```

### Step 2: Set Environment Variables

Create a `.env` file in the root directory:

```bash
# Private key of deployer account
PRIVATE_KEY=0xyourprivatekey...

# RPC URLs (optional, if not in hardhat.config)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
POLKADOT_TESTNET_RPC=https://rpc.polkadot-testnet.io
```

### Step 3: Run Deployment

#### Option A: Deploy to Local Hardhat Network (Testing)

```bash
npx hardhat run scripts/deploy-v2.ts
```

This deploys to the default local hardhat network (no real gas costs).

#### Option B: Deploy to Sepolia Testnet

```bash
npx hardhat run scripts/deploy-v2.ts --network sepolia
```

#### Option C: Deploy to Polkadot Hub Testnet

```bash
npx hardhat run scripts/deploy-v2.ts --network polkadotHubTestnet
```

#### Option D: Deploy to Custom Network

```bash
npx hardhat run scripts/deploy-v2.ts --network <network-name>
```

### Deployment Process

The script will:

1. **✅ Deploy Implementation Contracts**
   - TaskCore (clone template)
   - TaskVault (clone template)

2. **✅ Deploy Core System Contracts**
   - ActionRegistry (adapter management)
   - ExecutorHub (executor management)
   - GlobalRegistry (task discovery)
   - RewardManager (reward distribution)
   - TaskLogicV2 (execution orchestration)
   - TaskFactory (task creation)

3. **✅ Deploy Adapters** (Optional)
   - TimeBasedTransferAdapter (default enabled)
   - Custom adapters (you add these)

4. **✅ Configure Contract Connections**
   - Wire all contracts together
   - Set permissions and addresses

5. **✅ Register Adapters**
   - Register deployed adapters with ActionRegistry

6. **✅ Verify Settings**
   - Check all configuration

7. **✅ Save Deployment Info**
   - Saves contract addresses to `deployments/` folder

---

## Deployment Output

After successful deployment, you'll see:

```
========== DEPLOYMENT SUCCESSFUL! ==========

📝 Contract Addresses:

Implementation Contracts:
├─ TaskCore Implementation: 0x...
└─ TaskVault Implementation: 0x...

Core System Contracts:
├─ TaskFactory: 0x...
├─ TaskLogicV2: 0x...
├─ ExecutorHub: 0x...
├─ GlobalRegistry: 0x...
├─ RewardManager: 0x...
└─ ActionRegistry: 0x...

Adapters:
├─ TimeBasedTransferAdapter: 0x...
└─ Others: 0x...

💾 Deployment info saved to: deployments/deployment-v2-4242-1234567890.json
```

---

## Post-Deployment Setup

### 1. Register as Executor

```bash
npx hardhat console --network polkadotHubTestnet
```

```javascript
const ExecutorHub = await ethers.getContractAt("ExecutorHub", "0x...");
const tx = await ExecutorHub.registerExecutor({ value: ethers.parseEther("0.1") });
await tx.wait();
console.log("Executor registered!");
```

### 2. Create Your First Task

```javascript
const TaskFactory = await ethers.getContractAt("TaskFactory", "0x...");

const taskParams = {
  expiresAt: Math.floor(Date.now() / 1000) + 86400, // 1 day
  maxExecutions: 1,
  recurringInterval: 0,
  rewardPerExecution: ethers.parseEther("0.01"),
  seedCommitment: ethers.ZeroHash,
};

const tx = await TaskFactory.createTask(taskParams, [], {
  value: ethers.parseEther("0.01"),
});

const receipt = await tx.wait();
console.log("Task created!", receipt.transactionHash);
```

### 3. Approve Protocols

```javascript
const ActionRegistry = await ethers.getContractAt("ActionRegistry", "0x...");

// Approve a token or protocol address
const tx = await ActionRegistry.approveProtocol("0x...tokenAddress");
await tx.wait();
```

---

## Deployment Variables Explanation

| Variable | Purpose | Value |
|----------|---------|-------|
| `DEPLOY_TIME_ADAPTER` | Whether to deploy TimeBasedTransferAdapter | `true` |
| `minTaskReward` | Minimum reward per execution | 0.001 ETH |
| `creationFee` | Fee for creating tasks | 0.001 ETH |
| `minStakeAmount` | Minimum executor stake | 0.1 ETH |
| `platformFeePercentage` | Platform fee on rewards | 1% (100 bps) |
| `gasReimbursementMultiplier` | Gas reimbursement multiplier | 120% |

---

## Troubleshooting

### ❌ Error: "insufficient funds"

**Solution**: Ensure you have enough ETH for deployment
```bash
# Check your balance
node -e "console.log(require('ethers').formatEther('...wei'))"
```

### ❌ Error: "Cannot find module 'hardhat'"

**Solution**: Install dependencies
```bash
npm install --save-dev hardhat hardhat-ethers ethers
```

### ❌ Error: "Network not found"

**Solution**: Verify network name in hardhat.config.ts matches your --network flag

### ❌ Error: "Private key not found"

**Solution**: Set PRIVATE_KEY in .env file
```bash
export PRIVATE_KEY=0xyourkey...
```

### ❌ Deployment hangs

**Solution**: Check RPC URL is accessible
```bash
curl https://rpc.polkadot-testnet.io
```

---

## Gas Estimation

Approximate gas costs for deployment:

| Contract | Gas | Cost @ 20 gwei |
|----------|-----|---|
| TaskCore | 50,000 | 0.001 ETH |
| TaskVault | 50,000 | 0.001 ETH |
| ActionRegistry | 100,000 | 0.002 ETH |
| ExecutorHub | 150,000 | 0.003 ETH |
| GlobalRegistry | 100,000 | 0.002 ETH |
| RewardManager | 80,000 | 0.0016 ETH |
| TaskLogicV2 | 120,000 | 0.0024 ETH |
| TaskFactory | 200,000 | 0.004 ETH |
| TimeBasedTransferAdapter | 50,000 | 0.001 ETH |
| Configuration (8 txs) | 40,000 | 0.008 ETH |
| **TOTAL** | **~940,000** | **~0.019 ETH** |

Add 20% buffer for safety: **~0.023 ETH**

---

## Saving Deployment Info

After deployment, check `deployments/` folder:

```
deployments/
├─ deployment-v2-4242-1234567890.json  (Polkadot Hub)
├─ deployment-v2-11155111-1234567890.json  (Sepolia)
└─ deployment-v2-1-1234567890.json  (Mainnet - future)
```

Each file contains:
- All contract addresses
- Network info
- Configuration details
- Timestamp

---

## Next: Create a Task

See [TASK_CREATION_GUIDE.md](./TASK_CREATION_GUIDE.md) for how to create tasks with the deployed system.

