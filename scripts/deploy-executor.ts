import { ethers } from "hardhat";

async function main() {
  console.log("\n🧪 Testing TaskExecutor Deployment...\n");

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log("Deployer Address:", deployerAddress);
  console.log("Account Balance:", ethers.formatEther(balance), "PAS");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("");

  try {
    console.log("Deploying TaskExecutor...");

    const TaskExecutor = await ethers.getContractFactory("TaskExecutor");
    console.log("✅ Contract factory created");

    console.log("Calling deploy()...");
    const taskExecutor = await TaskExecutor.deploy();
    console.log("✅ Deploy transaction sent");

    console.log("Waiting for deployment...");
    await taskExecutor.waitForDeployment();
    console.log("✅ Deployment confirmed");

    const address = await taskExecutor.getAddress();
    console.log("\n🎉 TaskExecutor deployed successfully to:", address);

    // Verify basic functionality
    console.log("\nVerifying contract...");
    const owner = await taskExecutor.owner();
    console.log("Owner:", owner);
    console.log("Platform Fee:", await taskExecutor.platformFeePercentage());
    console.log("Max Platform Fee:", await taskExecutor.MAX_PLATFORM_FEE());

    console.log("\n✅ All checks passed!");

  } catch (error: any) {
    console.error("\n❌ Deployment failed!");
    console.error("Error message:", error.message);

    if (error.data) {
      console.error("Error data:", error.data);
    }

    if (error.error) {
      console.error("Inner error:", error.error);
    }

    if (error.transaction) {
      console.error("Transaction data:", error.transaction);
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
