import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy TimeBasedTransferAdapter
 *
 * This script:
 * 1. Deploys the TimeBasedTransferAdapter contract
 * 2. Registers it with ActionRegistry
 * 3. Saves deployment info
 *
 * Prerequisites:
 * - Main contracts already deployed (run deploy-v2.ts first)
 * - ActionRegistry address from deployment
 */

async function main() {
  console.log("\n🚀 Deploying TimeBasedTransferAdapter...\n");

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
  // CONFIGURATION - UPDATE THESE AFTER MAIN DEPLOYMENT
  // ============================================================

  // Get the latest deployment file
  const deploymentsDir = path.join(__dirname, "..", "deployments");

  let actionRegistryAddress: string;

  if (fs.existsSync(deploymentsDir)) {
    const deploymentFiles = fs.readdirSync(deploymentsDir)
      .filter(f => f.startsWith('deployment-v2-'))
      .sort()
      .reverse();

    if (deploymentFiles.length > 0) {
      const latestDeployment = JSON.parse(
        fs.readFileSync(path.join(deploymentsDir, deploymentFiles[0]), 'utf-8')
      );
      actionRegistryAddress = latestDeployment.contracts.core.ActionRegistry;
      console.log("📁 Loaded ActionRegistry from latest deployment:", actionRegistryAddress, "\n");
    } else {
      throw new Error("No deployment files found. Run deploy-v2.ts first!");
    }
  } else {
    throw new Error("Deployments directory not found. Run deploy-v2.ts first!");
  }

  // ============================================================
  // STEP 1: DEPLOY TimeBasedTransferAdapter
  // ============================================================
  console.log("📦 STEP 1: Deploying TimeBasedTransferAdapter...\n");

  const TimeAdapter = await ethers.getContractFactory("TimeBasedTransferAdapter");
  const timeAdapter = await TimeAdapter.deploy();
  await timeAdapter.waitForDeployment();
  const timeAdapterAddress = await timeAdapter.getAddress();

  console.log("   ✅ TimeBasedTransferAdapter deployed:", timeAdapterAddress, "\n");

  // ============================================================
  // STEP 2: REGISTER WITH ActionRegistry
  // ============================================================
  console.log("📦 STEP 2: Registering with ActionRegistry...\n");

  const ActionRegistry = await ethers.getContractFactory("ActionRegistry");
  const actionRegistry = ActionRegistry.attach(actionRegistryAddress);

  // Register the adapter with execute() selector
  console.log("🔌 Registering TimeBasedTransferAdapter...");
  const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10);
  const registerTx = await actionRegistry.registerAdapter(
    executeSelector,      // selector
    timeAdapterAddress,   // adapter address
    100000,               // gasLimit
    true                  // requiresTokens
  );
  await registerTx.wait();

  console.log("   ✅ Adapter registered");
  console.log("   🔑 Selector:", executeSelector);
  console.log("   📍 Address:", timeAdapterAddress);
  console.log("   ⛽ Gas Limit: 100,000");
  console.log("   💰 Requires Tokens: true\n");

  // ============================================================
  // STEP 3: VERIFICATION
  // ============================================================
  console.log("✅ STEP 3: Verifying Registration...\n");

  const adapterInfo = await actionRegistry.getAdapter(executeSelector);
  console.log("📊 Adapter Info:");
  console.log("   Selector:", executeSelector);
  console.log("   Address:", adapterInfo.adapter);
  console.log("   Active:", adapterInfo.isActive);
  console.log("   Gas Limit:", adapterInfo.gasLimit.toString());
  console.log("   Requires Tokens:", adapterInfo.requiresTokens, "\n");

  if (!adapterInfo.isActive) {
    throw new Error("Adapter registration failed!");
  }

  // ============================================================
  // DEPLOYMENT SUMMARY
  // ============================================================
  console.log("━".repeat(60));
  console.log("🎉 TimeBasedTransferAdapter DEPLOYED SUCCESSFULLY!");
  console.log("━".repeat(60), "\n");

  console.log("📝 Adapter Details:\n");
  console.log("Contract Address:", timeAdapterAddress);
  console.log("Selector:", executeSelector);
  console.log("Gas Limit: 100,000");
  console.log("Requires Tokens: true");
  console.log("\n");

  // ============================================================
  // SAVE DEPLOYMENT INFO
  // ============================================================
  const adapterDeployment = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    adapter: {
      name: "TimeBasedTransfer",
      address: timeAdapterAddress,
      selector: executeSelector,
      gasLimit: 100000,
      requiresTokens: true,
      actionRegistry: actionRegistryAddress,
    },
  };

  const filename = `adapter-time-based-${network.chainId}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(adapterDeployment, null, 2));

  console.log("💾 Deployment info saved to:", filepath);
  console.log("");

  // ============================================================
  // USAGE EXAMPLE
  // ============================================================
  console.log("📋 Usage Example:\n");
  console.log("// 1. Encode action parameters");
  console.log("const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(");
  console.log("  ['address', 'address', 'uint256', 'uint256'],");
  console.log("  [");
  console.log("    usdcAddress,           // token");
  console.log("    recipientAddress,      // recipient");
  console.log("    ethers.parseUnits('100', 6),  // amount (100 USDC)");
  console.log("    Math.floor(Date.now()/1000) + 3600,  // executeAfter (1 hour from now)");
  console.log("  ]");
  console.log(");\n");

  console.log("// 2. Create task with this adapter");
  console.log("await taskFactory.createTaskWithDeposit(");
  console.log("  [usdcAddress],         // tokens");
  console.log("  [depositAmount],       // amounts");
  console.log("  actionRoot,            // Merkle root of actions");
  console.log("  1,                     // maxExecutions");
  console.log("  ethers.ZeroHash,       // no dependencies");
  console.log("  0                      // no delay");
  console.log(");\n");

  console.log("// 3. In your action definition:");
  console.log("const action = {");
  console.log("  tokenIn: usdcAddress,");
  console.log("  adapter: '" + timeAdapterAddress + "',");
  console.log("  gasLimit: 100000,");
  console.log("  data: actionParams,");
  console.log("  proof: merkleProof");
  console.log("};\n");

  console.log("━".repeat(60));
  console.log("✨ TimeBasedTransferAdapter is ready to use!");
  console.log("━".repeat(60), "\n");

  console.log("💡 Tips:");
  console.log("• This adapter is perfect for testnet testing");
  console.log("• Simple time-based condition (execute after timestamp)");
  console.log("• Transfers tokens from TaskVault to recipient");
  console.log("• Great for demonstrating the protocol flow\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
