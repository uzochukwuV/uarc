import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n🚀 Starting TaskerOnChain V2 Deployment...\n");

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  const network = await ethers.provider.getNetwork();

  console.log("📋 Deployment Details:");
  console.log("━".repeat(60));
  console.log("Deployer Address:", deployerAddress);
  console.log("Account Balance:", ethers.formatEther(balance), "ETH");
  console.log("Network:", network.name);
  console.log("Chain ID:", network.chainId.toString());
  console.log("━".repeat(60), "\n");

  // Check balance
  if (balance < ethers.parseEther("0.1")) {
    console.log("⚠️  WARNING: Low balance. Ensure you have enough ETH for deployment.\n");
  }

  // ============================================================
  // STEP 1: DEPLOY IMPLEMENTATION CONTRACTS
  // ============================================================
  console.log("📦 STEP 1: Deploying Implementation Contracts...\n");

  // 1.1 Deploy TaskCore Implementation
  console.log("1️⃣  Deploying TaskCore Implementation...");
  const TaskCore = await ethers.getContractFactory("TaskCore");
  const taskCoreImpl = await TaskCore.deploy();
  await taskCoreImpl.waitForDeployment();
  const taskCoreImplAddress = await taskCoreImpl.getAddress();
  console.log("   ✅ TaskCore Implementation:", taskCoreImplAddress, "\n");

  // 1.2 Deploy TaskVault Implementation
  console.log("2️⃣  Deploying TaskVault Implementation...");
  const TaskVault = await ethers.getContractFactory("TaskVault");
  const taskVaultImpl = await TaskVault.deploy();
  await taskVaultImpl.waitForDeployment();
  const taskVaultImplAddress = await taskVaultImpl.getAddress();
  console.log("   ✅ TaskVault Implementation:", taskVaultImplAddress, "\n");

  // ============================================================
  // STEP 2: DEPLOY CORE SYSTEM CONTRACTS
  // ============================================================
  console.log("📦 STEP 2: Deploying Core System Contracts...\n");

  // NOTE: ConditionOracle removed - conditions now checked by adapters

  // 2.1 Deploy ActionRegistry
  console.log("3️⃣  Deploying ActionRegistry...");
  const ActionRegistry = await ethers.getContractFactory("ActionRegistry");
  const actionRegistry = await ActionRegistry.deploy(deployerAddress);
  await actionRegistry.waitForDeployment();
  const actionRegistryAddress = await actionRegistry.getAddress();
  console.log("   ✅ ActionRegistry:", actionRegistryAddress, "\n");

  // 2.2 Deploy ExecutorHub
  console.log("4️⃣  Deploying ExecutorHub...");
  const ExecutorHub = await ethers.getContractFactory("ExecutorHub");
  const executorHub = await ExecutorHub.deploy(deployerAddress);
  await executorHub.waitForDeployment();
  const executorHubAddress = await executorHub.getAddress();
  console.log("   ✅ ExecutorHub:", executorHubAddress);
  console.log("   💰 Minimum Stake: 0.1 ETH");
  console.log("   🔒 Lock Duration: 30 seconds");
  console.log("   ⏱️  Commit Delay: 1 second\n");

  // 2.3 Deploy GlobalRegistry
  console.log("5️⃣  Deploying GlobalRegistry...");
  const GlobalRegistry = await ethers.getContractFactory("GlobalRegistry");
  const globalRegistry = await GlobalRegistry.deploy(deployerAddress);
  await globalRegistry.waitForDeployment();
  const globalRegistryAddress = await globalRegistry.getAddress();
  console.log("   ✅ GlobalRegistry:", globalRegistryAddress, "\n");

  // 2.4 Deploy RewardManager
  console.log("6️⃣  Deploying RewardManager...");
  const RewardManager = await ethers.getContractFactory("RewardManager");
  const rewardManager = await RewardManager.deploy(deployerAddress);
  await rewardManager.waitForDeployment();
  const rewardManagerAddress = await rewardManager.getAddress();
  console.log("   ✅ RewardManager:", rewardManagerAddress);
  console.log("   💸 Platform Fee: 1% (100 bps)");
  console.log("   ⛽ Gas Reimbursement: 120%\n");

  // 2.5 Deploy TaskLogicV2
  console.log("7️⃣  Deploying TaskLogicV2...");
  const TaskLogicV2 = await ethers.getContractFactory("TaskLogicV2");
  const taskLogic = await TaskLogicV2.deploy(deployerAddress);
  await taskLogic.waitForDeployment();
  const taskLogicAddress = await taskLogic.getAddress();
  console.log("   ✅ TaskLogicV2:", taskLogicAddress, "\n");

  // 2.6 Deploy TaskFactory
  console.log("8️⃣  Deploying TaskFactory...");
  const TaskFactory = await ethers.getContractFactory("TaskFactory");
  const taskFactory = await TaskFactory.deploy(
    taskCoreImplAddress,
    taskVaultImplAddress,
    taskLogicAddress,
    executorHubAddress,
    actionRegistryAddress,
    rewardManagerAddress,
    deployerAddress
  );
  await taskFactory.waitForDeployment();
  const taskFactoryAddress = await taskFactory.getAddress();
  console.log("   ✅ TaskFactory:", taskFactoryAddress);
  console.log("   💵 Creation Fee: 0.001 ETH");
  console.log("   💰 Min Task Reward: 0.001 ETH\n");

  // ============================================================
  // STEP 3: DEPLOY ADAPTERS (OPTIONAL)
  // ============================================================
  console.log("📦 STEP 3: Deploying Adapters...\n");

  // NOTE: Adapter deployment is optional. Deploy your specific adapters separately.
  // Example adapters are commented out below.

  let uniswapAdapterAddress = ethers.ZeroAddress;
  let genericAdapterAddress = ethers.ZeroAddress;
  let timeAdapterAddress = ethers.ZeroAddress;

  // Deploy TimeBasedTransferAdapter (for testnet testing)
  const DEPLOY_TIME_ADAPTER = true; // Set to false to skip

  if (DEPLOY_TIME_ADAPTER) {
    console.log("9️⃣  Deploying TimeBasedTransferAdapter...");
    const TimeAdapter = await ethers.getContractFactory("TimeBasedTransferAdapter");
    const timeAdapter = await TimeAdapter.deploy();
    await timeAdapter.waitForDeployment();
    timeAdapterAddress = await timeAdapter.getAddress();
    console.log("   ✅ TimeBasedTransferAdapter:", timeAdapterAddress);
    console.log("   📝 Simple time-based token transfer for testing\n");
  } else {
    console.log("ℹ️  Adapter deployment skipped.");
    console.log("   Deploy your specific adapters (e.g., UniswapUSDCETHBuyLimitAdapter)");
    console.log("   and register them with ActionRegistry.\n");
  }

  // Uncomment to deploy example adapters if they exist:
  /*
  // 3.1 Deploy UniswapV2Adapter
  console.log("9️⃣  Deploying UniswapV2Adapter...");
  const UniswapV2Adapter = await ethers.getContractFactory("UniswapV2Adapter");
  const uniswapAdapter = await UniswapV2Adapter.deploy(deployerAddress);
  await uniswapAdapter.waitForDeployment();
  uniswapAdapterAddress = await uniswapAdapter.getAddress();
  console.log("   ✅ UniswapV2Adapter:", uniswapAdapterAddress, "\n");

  // 3.2 Deploy GenericAdapter
  console.log("🔟 Deploying GenericAdapter...");
  const GenericAdapter = await ethers.getContractFactory("GenericAdapter");
  const genericAdapter = await GenericAdapter.deploy(deployerAddress);
  await genericAdapter.waitForDeployment();
  genericAdapterAddress = await genericAdapter.getAddress();
  console.log("   ✅ GenericAdapter:", genericAdapterAddress, "\n");
  */

  // ============================================================
  // STEP 4: CONFIGURE CONTRACTS
  // ============================================================
  console.log("⚙️  STEP 4: Configuring Contract Connections...\n");

  console.log("🔗 Configuring TaskLogicV2...");
  // ConditionOracle removed - conditions now checked by adapters
  await taskLogic.setActionRegistry(actionRegistryAddress);
  await taskLogic.setRewardManager(rewardManagerAddress);
  await taskLogic.setExecutorHub(executorHubAddress);
  await taskLogic.setTaskRegistry(globalRegistryAddress);
  console.log("   ✅ TaskLogicV2 configured\n");

  console.log("🔗 Configuring ExecutorHub...");
  await executorHub.setTaskLogic(taskLogicAddress);
  await executorHub.setTaskRegistry(globalRegistryAddress);
  console.log("   ✅ ExecutorHub configured\n");

  console.log("🔗 Configuring RewardManager...");
  await rewardManager.setTaskLogic(taskLogicAddress);
  await rewardManager.setExecutorHub(executorHubAddress);
  await rewardManager.setGasReimbursementMultiplier(100); // 100% (minimum)
  console.log("   ✅ RewardManager configured\n");

  console.log("🔗 Configuring GlobalRegistry...");
  await globalRegistry.authorizeFactory(taskFactoryAddress);
  console.log("   ✅ GlobalRegistry configured\n");

  console.log("🔗 Configuring TaskFactory...");
  await taskFactory.setGlobalRegistry(globalRegistryAddress);
  console.log("   ✅ TaskFactory configured\n");

  // ============================================================
  // STEP 5: REGISTER ADAPTERS (OPTIONAL)
  // ============================================================
  console.log("📦 STEP 5: Registering Adapters...\n");

  if (DEPLOY_TIME_ADAPTER && timeAdapterAddress !== ethers.ZeroAddress) {
    console.log("🔌 Registering TimeBasedTransferAdapter...");
    // Use execute() function selector from IAdapter
    const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10);
    await actionRegistry.registerAdapter(
      executeSelector,
      timeAdapterAddress,
      100000,  // gasLimit
      true     // requiresTokens
    );
    console.log("   ✅ TimeBasedTransferAdapter registered");
    console.log("   🔑 Selector:", executeSelector);
    console.log("   📍 Address:", timeAdapterAddress);
    console.log("   ⛽ Gas Limit: 100,000");
    console.log("   💰 Requires Tokens: true\n");
  } else {
    console.log("ℹ️  No adapters to register yet.");
    console.log("   Register your specific adapters after deployment using:");
    console.log("   await actionRegistry.registerAdapter(selector, address, gasLimit, requiresTokens)\n");
  }

  // Uncomment to register example adapters:
  /*
  console.log("🔌 Registering UniswapV2Adapter...");
  const swapSelector = ethers.id("swap").slice(0, 10);
  await actionRegistry.registerAdapter(
    swapSelector,
    uniswapAdapterAddress,
    500000, // gasLimit
    true    // requiresTokens
  );
  console.log("   ✅ UniswapV2Adapter registered");
  console.log("   🔑 Selector:", swapSelector);
  console.log("   ⛽ Gas Limit: 500,000\n");

  console.log("🔌 Registering GenericAdapter...");
  const genericSelector = ethers.id("execute").slice(0, 10);
  await actionRegistry.registerAdapter(
    genericSelector,
    genericAdapterAddress,
    1000000, // gasLimit
    false    // requiresTokens
  );
  console.log("   ✅ GenericAdapter registered");
  console.log("   🔑 Selector:", genericSelector);
  console.log("   ⛽ Gas Limit: 1,000,000\n");
  */

  // ============================================================
  // STEP 6: VERIFICATION
  // ============================================================
  console.log("✅ STEP 6: Verifying Deployment...\n");

  // Verify TaskFactory settings
  const minReward = await taskFactory.minTaskReward();
  const creationFee = await taskFactory.creationFee();
  console.log("📊 TaskFactory Settings:");
  console.log("   Min Task Reward:", ethers.formatEther(minReward), "ETH");
  console.log("   Creation Fee:", ethers.formatEther(creationFee), "ETH\n");

  // Verify ExecutorHub settings
  const minStakeAmount = await executorHub.minStakeAmount();
  const lockDuration = await executorHub.lockDuration();
  const commitDelay = await executorHub.commitDelay();
  console.log("📊 ExecutorHub Settings:");
  console.log("   Min Stake:", ethers.formatEther(minStakeAmount), "ETH");
  console.log("   Lock Duration:", lockDuration.toString(), "seconds");
  console.log("   Commit Delay:", commitDelay.toString(), "seconds\n");

  // Verify RewardManager settings
  const platformFee = await rewardManager.platformFeePercentage();
  const gasMultiplier = await rewardManager.gasReimbursementMultiplier();
  console.log("📊 RewardManager Settings:");
  console.log("   Platform Fee:", (Number(platformFee) / 100).toFixed(2) + "%");
  console.log("   Gas Reimbursement:", gasMultiplier.toString() + "%\n");

  // ============================================================
  // DEPLOYMENT SUMMARY
  // ============================================================
  console.log("━".repeat(60));
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("━".repeat(60), "\n");

  console.log("📝 Contract Addresses:\n");

  console.log("Implementation Contracts:");
  console.log("├─ TaskCore Implementation:", taskCoreImplAddress);
  console.log("└─ TaskVault Implementation:", taskVaultImplAddress);
  console.log("");

  console.log("Core System Contracts:");
  console.log("├─ TaskFactory:", taskFactoryAddress);
  console.log("├─ TaskLogicV2:", taskLogicAddress);
  console.log("├─ ExecutorHub:", executorHubAddress);
  console.log("├─ GlobalRegistry:", globalRegistryAddress);
  console.log("├─ RewardManager:", rewardManagerAddress);
  console.log("└─ ActionRegistry:", actionRegistryAddress);
  console.log("");

  console.log("Adapters:");
  console.log("├─ UniswapV2Adapter:", uniswapAdapterAddress);
  console.log("└─ GenericAdapter:", genericAdapterAddress);
  console.log("\n");

  // ============================================================
  // SAVE DEPLOYMENT INFO
  // ============================================================
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    contracts: {
      implementations: {
        TaskCore: taskCoreImplAddress,
        TaskVault: taskVaultImplAddress,
      },
      core: {
        TaskFactory: taskFactoryAddress,
        TaskLogicV2: taskLogicAddress,
        ExecutorHub: executorHubAddress,
        GlobalRegistry: globalRegistryAddress,
        RewardManager: rewardManagerAddress,
        ActionRegistry: actionRegistryAddress,
      },
      adapters: {
        UniswapV2Adapter: uniswapAdapterAddress,
        GenericAdapter: genericAdapterAddress,
      },
    },
    configuration: {
      taskFactory: {
        minTaskReward: ethers.formatEther(minReward) + " ETH",
        creationFee: ethers.formatEther(creationFee) + " ETH",
      },
      executorHub: {
        minStake: ethers.formatEther(minStakeAmount) + " ETH",
        lockDuration: lockDuration.toString() + " seconds",
        commitDelay: commitDelay.toString() + " seconds",
      },
      rewardManager: {
        platformFee: (Number(platformFee) / 100).toFixed(2) + "%",
        gasReimbursement: gasMultiplier.toString() + "%",
      }
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `deployment-v2-${network.chainId}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

  console.log("💾 Deployment info saved to:", filepath);
  console.log("");

  // ============================================================
  // NEXT STEPS
  // ============================================================
  console.log("📋 Next Steps:\n");
  console.log("1. Register as an executor:");
  console.log("   await executorHub.registerExecutor({ value: ethers.parseEther('0.1') });\n");

  console.log("2. Create your first task:");
  console.log("   await taskFactory.createTaskWithTokens(...)\n");

  console.log("3. Register DEX routers in UniswapV2Adapter:");
  console.log("   await uniswapAdapter.addRouter(routerAddress);\n");

  console.log("4. Approve protocols in ActionRegistry:");
  console.log("   await actionRegistry.approveProtocol(protocolAddress);\n");

  console.log("5. Create hyper-specific adapters with embedded conditions:");
  console.log("   e.g., UniswapUSDCETHBuyLimitAdapter for limit orders\n");

  console.log("━".repeat(60));
  console.log("✨ TaskerOnChain V2 is ready!");
  console.log("━".repeat(60), "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
