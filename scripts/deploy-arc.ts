import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n🚀 Starting TaskerOnChain V2 Deployment on Arc Testnet...\n");

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

  // ============================================================
  // STEP 1: DEPLOY IMPLEMENTATION CONTRACTS
  // ============================================================
  console.log("📦 STEP 1: Deploying Implementation Contracts...\n");

  const TaskCore = await ethers.getContractFactory("TaskCore");
  const taskCoreImpl = await TaskCore.deploy();
  await taskCoreImpl.waitForDeployment();
  const taskCoreImplAddress = await taskCoreImpl.getAddress();
  console.log("   ✅ TaskCore Implementation:", taskCoreImplAddress);

  const TaskVault = await ethers.getContractFactory("TaskVault");
  const taskVaultImpl = await TaskVault.deploy();
  await taskVaultImpl.waitForDeployment();
  const taskVaultImplAddress = await taskVaultImpl.getAddress();
  console.log("   ✅ TaskVault Implementation:", taskVaultImplAddress, "\n");

  // ============================================================
  // STEP 2: DEPLOY CORE SYSTEM CONTRACTS
  // ============================================================
  console.log("📦 STEP 2: Deploying Core System Contracts...\n");

  const ActionRegistry = await ethers.getContractFactory("ActionRegistry");
  const actionRegistry = await ActionRegistry.deploy(deployerAddress);
  await actionRegistry.waitForDeployment();
  const actionRegistryAddress = await actionRegistry.getAddress();
  console.log("   ✅ ActionRegistry:", actionRegistryAddress);

  const ExecutorHub = await ethers.getContractFactory("ExecutorHub");
  const executorHub = await ExecutorHub.deploy(deployerAddress);
  await executorHub.waitForDeployment();
  const executorHubAddress = await executorHub.getAddress();
  console.log("   ✅ ExecutorHub:", executorHubAddress);

  const GlobalRegistry = await ethers.getContractFactory("GlobalRegistry");
  const globalRegistry = await GlobalRegistry.deploy(deployerAddress);
  await globalRegistry.waitForDeployment();
  const globalRegistryAddress = await globalRegistry.getAddress();
  console.log("   ✅ GlobalRegistry:", globalRegistryAddress);

  const RewardManager = await ethers.getContractFactory("RewardManager");
  const rewardManager = await RewardManager.deploy(deployerAddress);
  await rewardManager.waitForDeployment();
  const rewardManagerAddress = await rewardManager.getAddress();
  console.log("   ✅ RewardManager:", rewardManagerAddress);

  const TaskLogicV2 = await ethers.getContractFactory("TaskLogicV2");
  const taskLogic = await TaskLogicV2.deploy(deployerAddress);
  await taskLogic.waitForDeployment();
  const taskLogicAddress = await taskLogic.getAddress();
  console.log("   ✅ TaskLogicV2:", taskLogicAddress);

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
  console.log("   ✅ TaskFactory:", taskFactoryAddress, "\n");

  // ============================================================
  // STEP 3: DEPLOY ADAPTERS
  // ============================================================
  console.log("📦 STEP 3: Deploying Adapters...\n");

  const TimeAdapter = await ethers.getContractFactory("TimeBasedTransferAdapter");
  const timeAdapter = await TimeAdapter.deploy();
  await timeAdapter.waitForDeployment();
  const timeAdapterAddress = await timeAdapter.getAddress();
  console.log("   ✅ TimeBasedTransferAdapter:", timeAdapterAddress);

  const CurveAdapter = await ethers.getContractFactory("CurveSwapAdapter");
  const curveAdapter = await CurveAdapter.deploy();
  await curveAdapter.waitForDeployment();
  const curveAdapterAddress = await curveAdapter.getAddress();
  console.log("   ✅ CurveSwapAdapter:", curveAdapterAddress, "\n");

  // ============================================================
  // STEP 4: CONFIGURE CONTRACTS
  // ============================================================
  console.log("⚙️  STEP 4: Configuring Contract Connections...\n");

  await taskLogic.setActionRegistry(actionRegistryAddress);
  await taskLogic.setRewardManager(rewardManagerAddress);
  await taskLogic.setExecutorHub(executorHubAddress);
  await taskLogic.setTaskRegistry(globalRegistryAddress);

  await executorHub.setTaskLogic(taskLogicAddress);
  await executorHub.setTaskRegistry(globalRegistryAddress);

  await rewardManager.setTaskLogic(taskLogicAddress);
  await rewardManager.setExecutorHub(executorHubAddress);
  await rewardManager.setGasReimbursementMultiplier(100);

  await globalRegistry.authorizeFactory(taskFactoryAddress);
  await taskFactory.setGlobalRegistry(globalRegistryAddress);
  console.log("   ✅ System connected\n");

  // ============================================================
  // STEP 5: REGISTER ADAPTERS
  // ============================================================
  console.log("📦 STEP 5: Registering Adapters...\n");

  const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10);
  
  await actionRegistry.registerAdapter(
    executeSelector,
    timeAdapterAddress,
    100000,  
    true     
  );
  console.log("   ✅ TimeBasedTransferAdapter registered");

  await actionRegistry.registerAdapter(
    executeSelector,
    curveAdapterAddress,
    300000,  
    true     
  );
  console.log("   ✅ CurveSwapAdapter registered\n");

  // ============================================================
  // SAVE DEPLOYMENT INFO
  // ============================================================
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployerAddress,
    contracts: {
      TaskFactory: taskFactoryAddress,
      TaskLogicV2: taskLogicAddress,
      ExecutorHub: executorHubAddress,
      GlobalRegistry: globalRegistryAddress,
      RewardManager: rewardManagerAddress,
      ActionRegistry: actionRegistryAddress,
      TimeBasedTransferAdapter: timeAdapterAddress,
      CurveSwapAdapter: curveAdapterAddress
    }
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `deployment-arc-${network.chainId}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

  console.log("💾 Deployment info saved to:", filepath);
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
