import { ethers } from "hardhat";

async function main() {
  console.log("\n🚀 Starting TaskerOnChain Deployment (3-Contract Architecture)...\n");

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log("📋 Deployment Details:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Deployer Address:", deployerAddress);
  console.log("Account Balance:", ethers.formatEther(balance), "PAS");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Check balance
  if (balance < ethers.parseEther("0.1")) {
    console.log("⚠️  WARNING: Low balance. Get tokens from faucet:");
    console.log("   https://faucet.polkadot.io/?parachain=1111\n");
  }

  // For testnet, we'll use the deployer for all roles
  const communityTreasury = deployerAddress;
  const liquidityPool = deployerAddress;
  const teamVesting = deployerAddress;
  const airdropContract = deployerAddress;
  const feeRecipient = deployerAddress;

  console.log("📝 Using deployer address for all roles (testnet setup)");
  console.log("   - Community Treasury:", communityTreasury);
  console.log("   - Liquidity Pool:", liquidityPool);
  console.log("   - Team Vesting:", teamVesting);
  console.log("   - Airdrop Contract:", airdropContract);
  console.log("   - Fee Recipient:", feeRecipient);
  console.log("");

  // ============ DEPLOY CONTRACTS ============
  console.log("📦 Step 1: Deploying Core Contracts...\n");

  // 1. Deploy TaskerToken
  console.log("1️⃣  Deploying TaskerToken...");
  const TaskerToken = await ethers.getContractFactory("TaskerToken");
  const taskerToken = await TaskerToken.deploy(
    communityTreasury,
    liquidityPool,
    teamVesting,
    airdropContract
  );
  await taskerToken.waitForDeployment();
  const taskerTokenAddress = await taskerToken.getAddress();
  console.log("   ✅ TaskerToken deployed to:", taskerTokenAddress);
  console.log("   📊 Total Supply: 100,000,000 TASK\n");

  // 2. Deploy PaymentEscrow
  console.log("2️⃣  Deploying PaymentEscrow...");
  const PaymentEscrow = await ethers.getContractFactory("PaymentEscrow");
  const paymentEscrow = await PaymentEscrow.deploy(feeRecipient);
  await paymentEscrow.waitForDeployment();
  const paymentEscrowAddress = await paymentEscrow.getAddress();
  console.log("   ✅ PaymentEscrow deployed to:", paymentEscrowAddress, "\n");

  // 3. Deploy ConditionChecker
  console.log("3️⃣  Deploying ConditionChecker...");
  const ConditionChecker = await ethers.getContractFactory("ConditionChecker");
  const conditionChecker = await ConditionChecker.deploy();
  await conditionChecker.waitForDeployment();
  const conditionCheckerAddress = await conditionChecker.getAddress();
  console.log("   ✅ ConditionChecker deployed to:", conditionCheckerAddress, "\n");

  // 4. Deploy ActionRouter
  console.log("4️⃣  Deploying ActionRouter...");
  const ActionRouter = await ethers.getContractFactory("ActionRouter");
  const actionRouter = await ActionRouter.deploy();
  await actionRouter.waitForDeployment();
  const actionRouterAddress = await actionRouter.getAddress();
  console.log("   ✅ ActionRouter deployed to:", actionRouterAddress, "\n");

  // 5. Deploy ExecutorManager
  console.log("5️⃣  Deploying ExecutorManager...");
  const ExecutorManager = await ethers.getContractFactory("ExecutorManager");
  const executorManager = await ExecutorManager.deploy();
  await executorManager.waitForDeployment();
  const executorManagerAddress = await executorManager.getAddress();
  console.log("   ✅ ExecutorManager deployed to:", executorManagerAddress, "\n");

  // 6. Deploy ReputationSystem
  console.log("6️⃣  Deploying ReputationSystem...");
  const ReputationSystem = await ethers.getContractFactory("ReputationSystem");
  const reputationSystem = await ReputationSystem.deploy();
  await reputationSystem.waitForDeployment();
  const reputationSystemAddress = await reputationSystem.getAddress();
  console.log("   ✅ ReputationSystem deployed to:", reputationSystemAddress, "\n");

  // 7. Deploy TaskStorage
  console.log("7️⃣  Deploying TaskStorage...");
  const TaskStorage = await ethers.getContractFactory("TaskStorage");
  const taskStorage = await TaskStorage.deploy();
  await taskStorage.waitForDeployment();
  const taskStorageAddress = await taskStorage.getAddress();
  console.log("   ✅ TaskStorage deployed to:", taskStorageAddress, "\n");

  // 8. Deploy TaskCreator
  console.log("8️⃣  Deploying TaskCreator...");
  const TaskCreator = await ethers.getContractFactory("TaskCreator");
  const taskCreator = await TaskCreator.deploy(taskStorageAddress, paymentEscrowAddress);
  await taskCreator.waitForDeployment();
  const taskCreatorAddress = await taskCreator.getAddress();
  console.log("   ✅ TaskCreator deployed to:", taskCreatorAddress, "\n");

  // 9. Deploy TaskExecutor
  console.log("9️⃣  Deploying TaskExecutor...");
  const TaskExecutor = await ethers.getContractFactory("TaskExecutor");
  const taskExecutor = await TaskExecutor.deploy(taskStorageAddress);
  await taskExecutor.waitForDeployment();
  const taskExecutorAddress = await taskExecutor.getAddress();
  console.log("   ✅ TaskExecutor deployed to:", taskExecutorAddress, "\n");

  // 10. Deploy ScheduledTransferAdapter
  console.log("🔟  Deploying ScheduledTransferAdapter...");
  const ScheduledTransferAdapter = await ethers.getContractFactory("ScheduledTransferAdapter");
  const scheduledTransferAdapter = await ScheduledTransferAdapter.deploy();
  await scheduledTransferAdapter.waitForDeployment();
  const scheduledTransferAdapterAddress = await scheduledTransferAdapter.getAddress();
  console.log("   ✅ ScheduledTransferAdapter deployed to:", scheduledTransferAdapterAddress, "\n");

  // ============ CONFIGURE CONTRACTS ============
  console.log("⚙️  Step 2: Configuring Contracts...\n");

  console.log("🔗 Linking contracts...");

  // Configure TaskStorage
  console.log("   Setting TaskCreator and TaskExecutor in TaskStorage...");
  await taskStorage.setTaskCreator(taskCreatorAddress);
  await taskStorage.setTaskExecutor(taskExecutorAddress);

  // Configure PaymentEscrow - Use TaskExecutor as the task registry
  console.log("   Setting TaskExecutor in PaymentEscrow...");
  await paymentEscrow.setTaskRegistry(taskExecutorAddress);

  // Configure ActionRouter
  console.log("   Setting TaskExecutor in ActionRouter...");
  await actionRouter.setTaskRegistry(taskExecutorAddress);

  // Configure ExecutorManager
  console.log("   Setting TaskExecutor in ExecutorManager...");
  await executorManager.setTaskRegistry(taskExecutorAddress);

  // Configure ReputationSystem
  console.log("   Authorizing TaskExecutor in ReputationSystem...");
  await reputationSystem.authorizeUpdater(taskExecutorAddress);

  // Configure TaskExecutor
  console.log("   Setting all dependencies in TaskExecutor...");
  await taskExecutor.setConditionChecker(conditionCheckerAddress);
  await taskExecutor.setActionRouter(actionRouterAddress);
  await taskExecutor.setExecutorManager(executorManagerAddress);
  await taskExecutor.setPaymentEscrow(paymentEscrowAddress);
  await taskExecutor.setReputationSystem(reputationSystemAddress);
  await taskExecutor.setPlatformFee(100); // 1%

  console.log("   ✅ All contract links configured\n");

  // ============ SETUP ADAPTERS ============
  console.log("🔌 Step 3: Setting up Adapters...\n");

  console.log("   Registering ScheduledTransferAdapter...");
  await actionRouter.registerAdapter(scheduledTransferAdapterAddress, scheduledTransferAdapterAddress);
  await actionRouter.approveProtocol(scheduledTransferAdapterAddress);
  await taskCreator.approveProtocol(scheduledTransferAdapterAddress);
  console.log("   ✅ ScheduledTransferAdapter registered and approved\n");

  // ============ SETUP TOKEN REWARDS ============
  console.log("💰 Step 4: Setting up Token Rewards...\n");

  console.log("   Setting TaskerToken in ReputationSystem...");
  await reputationSystem.setTaskerToken(taskerTokenAddress);

  console.log("   Transferring tokens to ReputationSystem...");
  const rewardAmount = ethers.parseEther("10000000"); // 10M TASK for rewards
  await taskerToken.transfer(reputationSystemAddress, rewardAmount);
  console.log("   ✅ Transferred", ethers.formatEther(rewardAmount), "TASK tokens");

  console.log("   Enabling token rewards...");
  await reputationSystem.setTokenRewardsEnabled(true);
  console.log("   ✅ Token rewards enabled\n");

  // ============ VERIFICATION ============
  console.log("✅ Step 5: Verifying Deployment...\n");

  const repBalance = await taskerToken.balanceOf(reputationSystemAddress);
  const treasuryBalance = await taskerToken.balanceOf(communityTreasury);

  console.log("   Token Balances:");
  console.log("   - ReputationSystem:", ethers.formatEther(repBalance), "TASK");
  console.log("   - Community Treasury:", ethers.formatEther(treasuryBalance), "TASK");
  console.log("");

  // ============ DEPLOYMENT SUMMARY ============
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("📝 Contract Addresses:\n");
  console.log("Core Contracts:");
  console.log("├─ TaskerToken:", taskerTokenAddress);
  console.log("├─ TaskStorage:", taskStorageAddress);
  console.log("├─ TaskCreator:", taskCreatorAddress);
  console.log("├─ TaskExecutor:", taskExecutorAddress);
  console.log("├─ ReputationSystem:", reputationSystemAddress);
  console.log("├─ ExecutorManager:", executorManagerAddress);
  console.log("├─ PaymentEscrow:", paymentEscrowAddress);
  console.log("├─ ActionRouter:", actionRouterAddress);
  console.log("└─ ConditionChecker:", conditionCheckerAddress);
  console.log("");
  console.log("Adapters:");
  console.log("└─ ScheduledTransferAdapter:", scheduledTransferAdapterAddress);
  console.log("\n");

  // Save deployment addresses to file
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    contracts: {
      TaskerToken: taskerTokenAddress,
      TaskStorage: taskStorageAddress,
      TaskCreator: taskCreatorAddress,
      TaskExecutor: taskExecutorAddress,
      ReputationSystem: reputationSystemAddress,
      ExecutorManager: executorManagerAddress,
      PaymentEscrow: paymentEscrowAddress,
      ActionRouter: actionRouterAddress,
      ConditionChecker: conditionCheckerAddress,
      ScheduledTransferAdapter: scheduledTransferAdapterAddress,
    },
    configuration: {
      platformFee: "100 (1%)",
      rewardTokens: ethers.formatEther(rewardAmount) + " TASK",
      tokenRewardsEnabled: true,
    },
  };

  const fs = require("fs");
  const path = require("path");
  const deploymentsDir = path.join(__dirname, "..", "deployments");

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const filename = `deployment-${(await ethers.provider.getNetwork()).name}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

  console.log("💾 Deployment info saved to:", filename);
  console.log("\n🚀 TaskerOnChain is now live on", (await ethers.provider.getNetwork()).name, "!");
  console.log("\n📚 Next steps:");
  console.log("   1. Verify contracts on BlockScout");
  console.log("   2. Test task creation via TaskCreator");
  console.log("   3. Register executors and test execution");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error.message);
    process.exit(1);
  });
