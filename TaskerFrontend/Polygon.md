npx hardhat run scripts/deploy-v2.ts --network polygonAmoy

🚀 Starting TaskerOnChain V2 Deployment...

📋 Deployment Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Deployer Address: 0xa7793C5c4582C72B3aa5e78859d8Bd66998D43ce
Account Balance: 10.049465287498677 ETH
Network: polygonAmoy
Chain ID: 80002
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 STEP 1: Deploying Implementation Contracts...

1️⃣  Deploying TaskCore Implementation...
   ✅ TaskCore Implementation: 0x6E64b5403C36Ab073cbD1FEb7951E536825ebF60 

2️⃣  Deploying TaskVault Implementation...
   ✅ TaskVault Implementation: 0x7bbA73CCe26D4b912107d2D8E3963E924faa0fB7 

📦 STEP 2: Deploying Core System Contracts...

3️⃣  Deploying ActionRegistry...
   ✅ ActionRegistry: 0xb228d40cb2f4C72c4930e136aD276C25F4871148 

4️⃣  Deploying ExecutorHub...
   ✅ ExecutorHub: 0x35B6A83233b7fEaEfe8E408F217b62fCE154AcD7
   💰 Minimum Stake: 0.1 ETH
   📝 Actions stored on-chain during task creation

5️⃣  Deploying GlobalRegistry...
   ✅ GlobalRegistry: 0x37e8DccDed6E1e783b79Ad168c5B4E5f3aD0851A 

6️⃣  Deploying RewardManager...
   ✅ RewardManager: 0xa5Ca14E836634adB60edd0888ce79C54AFD574f7
   💸 Platform Fee: 1% (100 bps)
   ⛽ Gas Reimbursement: 120%

7️⃣  Deploying TaskLogicV2...
   ✅ TaskLogicV2: 0x19E7d58017aCBeDdAD37963e7352D6E8c08385fC 

8️⃣  Deploying TaskFactory...
   ✅ TaskFactory: 0x2984DA62a1124f2C3D631bb5bfEa9343a1279BBb
   💵 Creation Fee: 0.001 ETH
   💰 Min Task Reward: 0.001 ETH

📦 STEP 3: Deploying Adapters...

9️⃣  Deploying TimeBasedTransferAdapter...
   ✅ TimeBasedTransferAdapter: 0x885484C9Ae591c472bd0e29C11C82D9b3B644F68
   📝 Simple time-based token transfer for testing
   ✨ Uses clean 4-parameter structure with getTokenRequirements()

⚙️  STEP 4: Configuring Contract Connections...

🔗 Configuring TaskLogicV2...
   ✅ TaskLogicV2 configured

🔗 Configuring ExecutorHub...
   ✅ ExecutorHub configured

🔗 Configuring RewardManager...
   ✅ RewardManager configured

🔗 Configuring GlobalRegistry...
   ✅ GlobalRegistry configured

🔗 Configuring TaskFactory...
   ✅ TaskFactory configured

📦 STEP 5: Registering Adapters...

🔌 Registering TimeBasedTransferAdapter...
   ✅ TimeBasedTransferAdapter registered
   🔑 Selector: 0x1cff79cd
   📍 Address: 0x885484C9Ae591c472bd0e29C11C82D9b3B644F68
   ⛽ Gas Limit: 100,000
   💰 Requires Tokens: true

✅ STEP 6: Verifying Deployment...

📊 TaskFactory Settings:
   Min Task Reward: 0.001 ETH
   Creation Fee: 0.0 ETH

📊 ExecutorHub Settings:
   Min Stake: 0.1 ETH
   Direct execution (no commit-reveal on testnet)

📊 RewardManager Settings:
   Platform Fee: 1.00%
   Gas Reimbursement: 100%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 DEPLOYMENT SUCCESSFUL!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Contract Addresses:

Implementation Contracts:
├─ TaskCore Implementation: 0x6E64b5403C36Ab073cbD1FEb7951E536825ebF60
└─ TaskVault Implementation: 0x7bbA73CCe26D4b912107d2D8E3963E924faa0fB7

Core System Contracts:
├─ TaskFactory: 0x2984DA62a1124f2C3D631bb5bfEa9343a1279BBb
├─ TaskLogicV2: 0x19E7d58017aCBeDdAD37963e7352D6E8c08385fC
├─ ExecutorHub: 0x35B6A83233b7fEaEfe8E408F217b62fCE154AcD7
├─ GlobalRegistry: 0x37e8DccDed6E1e783b79Ad168c5B4E5f3aD0851A
├─ RewardManager: 0xa5Ca14E836634adB60edd0888ce79C54AFD574f7
└─ ActionRegistry: 0xb228d40cb2f4C72c4930e136aD276C25F4871148

Adapters:
├─ UniswapV2Adapter: 0x0000000000000000000000000000000000000000
└─ GenericAdapter: 0x0000000000000000000000000000000000000000


💾 Deployment info saved to: C:\Users\ASUS FX95G\Documents\web3\polkadot\taskerOnChain\deployments\deployment-v2-80002-1764277233985.json

📋 Next Steps:

1. Register as an executor:
   await executorHub.registerExecutor({ value: ethers.parseEther('0.1') });

2. Create your first task:
   await taskFactory.createTaskWithTokens(...)

3. Register DEX routers in UniswapV2Adapter:
   await uniswapAdapter.addRouter(routerAddress);

4. Approve protocols in ActionRegistry:
   await actionRegistry.approveProtocol(protocolAddress);

5. Create hyper-specific adapters with embedded conditions:
   e.g., UniswapUSDCETHBuyLimitAdapter for limit orders

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ TaskerOnChain V2 is ready!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
