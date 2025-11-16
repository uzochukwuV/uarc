import { ethers } from "hardhat";

async function main() {
  console.log("\n🚀 Deploying Split Task Registry System...\n");

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log("Deployer Address:", deployerAddress);
  console.log("Account Balance:", ethers.formatEther(balance), "PAS");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("");

  try {
    // ============ Deploy TaskCreator ============
    console.log("📝 Deploying TaskCreator...");
    const TaskCreator = await ethers.getContractFactory("TaskCreator");
    const taskCreator = await TaskCreator.deploy();
    await taskCreator.waitForDeployment();
    const creatorAddress = await taskCreator.getAddress();
    console.log("✅ TaskCreator deployed to:", creatorAddress);

    // ============ Deploy TaskExecutor ============
    console.log("\n⚡ Deploying TaskExecutor...");
    const TaskExecutor = await ethers.getContractFactory("TaskExecutor");
    const taskExecutor = await TaskExecutor.deploy();
    await taskExecutor.waitForDeployment();
    const executorAddress = await taskExecutor.getAddress();
    console.log("✅ TaskExecutor deployed to:", executorAddress);

    // ============ Link Contracts ============
    console.log("\n🔗 Linking contracts...");

    console.log("Setting TaskCreator in TaskExecutor...");
    const tx1 = await taskExecutor.setTaskCreator(creatorAddress);
    await tx1.wait();
    console.log("✅ TaskCreator linked");

    // ============ Verify Setup ============
    console.log("\n🔍 Verifying deployment...");

    console.log("\nTaskCreator:");
    console.log("  - Owner:", await taskCreator.owner());
    console.log("  - Next Task ID:", await taskCreator.nextTaskId());
    console.log("  - Max Actions:", await taskCreator.MAX_ACTIONS());

    console.log("\nTaskExecutor:");
    console.log("  - Owner:", await taskExecutor.owner());
    console.log("  - Task Creator:", await taskExecutor.taskCreator());
    console.log("  - Platform Fee:", await taskExecutor.platformFeePercentage(), "bps");

    // ============ Deployment Summary ============
    console.log("\n" + "=".repeat(60));
    console.log("🎉 Deployment Complete!");
    console.log("=".repeat(60));
    console.log("\nContract Addresses:");
    console.log("  TaskCreator:  ", creatorAddress);
    console.log("  TaskExecutor: ", executorAddress);
    console.log("\n📋 Next Steps:");
    console.log("  1. Deploy PaymentEscrow and set in TaskCreator");
    console.log("  2. Deploy supporting contracts (ExecutorManager, etc.)");
    console.log("  3. Approve protocols in TaskCreator");
    console.log("  4. Set ConditionChecker and ActionRouter in TaskExecutor");
    console.log("  5. Set ReputationSystem in TaskExecutor");
    console.log("=".repeat(60));

  } catch (error: any) {
    console.error("\n❌ Deployment failed!");
    console.error("Error message:", error.message);

    if (error.data) {
      console.error("Error data:", error.data);
    }

    if (error.error) {
      console.error("Inner error:", error.error);
    }

    console.error("\nFull error:", JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
