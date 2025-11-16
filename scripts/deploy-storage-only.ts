import { ethers } from "hardhat";

async function main() {
  console.log("\n🧪 Testing TaskCreator Deployment...\n");

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log("Deployer Address:", deployerAddress);
  console.log("Account Balance:", ethers.formatEther(balance), "PAS");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("");

  try {
    console.log("Deploying TaskCreator...");

    const TaskCreator = await ethers.getContractFactory("TaskLogicV2");
    console.log("✅ Contract factory created");

    console.log("Calling deploy()...");
    const taskCreator = await TaskCreator.deploy("0x8AaEe2071A400cC60927e46D53f751e521ef4D35");
    console.log("✅ Deploy transaction sent");

    console.log("Waiting for deployment...");
    await taskCreator.waitForDeployment();
    console.log("✅ Deployment confirmed");

    const address = await taskCreator.getAddress();
    console.log("\n🎉 TaskCreator deployed successfully to:", address);

    // Verify basic functionality
    console.log("\nVerifying contract...");
    const owner = await taskCreator.owner();
    console.log("Owner:", owner);
    // console.log("Next Task ID:", await taskCreator.nextTaskId());
    // console.log("Max Actions:", await taskCreator.MAX_ACTIONS());

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
