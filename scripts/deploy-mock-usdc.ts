import { ethers } from "hardhat";
import { writeFileSync } from "fs";
import path from "path";

/**
 * Deploy Mock USDC Token for Testing
 *
 * This script deploys a simple ERC20 token to simulate USDC
 * for testing the TimeBasedTransferAdapter and other DeFi operations
 */
async function main() {
  console.log("\n🚀 Deploying Mock USDC Token...\n");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("📋 Deployment Details:");
  console.log("━".repeat(60));
  console.log("Deployer Address:", deployer.address);
  console.log(
    "Account Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );
  console.log("Network:", network.name);
  console.log("Chain ID:", network.chainId.toString());
  console.log("━".repeat(60));

  // ============ STEP 1: Deploy Mock USDC ============

  console.log("\n📦 STEP 1: Deploying MockERC20 (USDC)...\n");

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUSDC = await MockERC20.deploy(
    "USD Coin",  // name
    "USDC",      // symbol
    6            // decimals (USDC uses 6 decimals)
  );

  await mockUSDC.waitForDeployment();
  const usdcAddress = await mockUSDC.getAddress();

  console.log("   ✅ Mock USDC deployed:", usdcAddress);

  // ============ STEP 2: Mint Initial Supply ============

  console.log("\n💰 STEP 2: Minting Initial Supply...\n");

  const INITIAL_SUPPLY = ethers.parseUnits("1000000", 6); // 1,000,000 USDC
  const mintTx = await mockUSDC.mint(deployer.address, INITIAL_SUPPLY);
  await mintTx.wait();

  console.log("   ✅ Minted", ethers.formatUnits(INITIAL_SUPPLY, 6), "USDC to deployer");
  console.log("   📍 Recipient:", deployer.address);

  // ============ STEP 3: Verify Deployment ============

  console.log("\n✅ STEP 3: Verifying Deployment...\n");

  const name = await mockUSDC.name();
  const symbol = await mockUSDC.symbol();
  const decimals = await mockUSDC.decimals();
  const totalSupply = await mockUSDC.totalSupply();
  const deployerBalance = await mockUSDC.balanceOf(deployer.address);

  console.log("📊 Token Info:");
  console.log("   Name:", name);
  console.log("   Symbol:", symbol);
  console.log("   Decimals:", decimals);
  console.log("   Total Supply:", ethers.formatUnits(totalSupply, 6), symbol);
  console.log("   Deployer Balance:", ethers.formatUnits(deployerBalance, 6), symbol);

  // ============ STEP 4: Save Deployment Info ============

  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      mockUSDC: {
        address: usdcAddress,
        name: name,
        symbol: symbol,
        decimals: Number(decimals),
        initialSupply: ethers.formatUnits(totalSupply, 6),
      },
    },
  };

  const filename = `mock-usdc-${network.chainId}-${Date.now()}.json`;
  const filepath = path.join(__dirname, "..", "deployments", filename);

  writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

  console.log("\n━".repeat(60));
  console.log("🎉 MOCK USDC DEPLOYED SUCCESSFULLY!");
  console.log("━".repeat(60));

  console.log("\n📝 Token Details:\n");
  console.log("Contract Address:", usdcAddress);
  console.log("Name:", name);
  console.log("Symbol:", symbol);
  console.log("Decimals:", decimals);
  console.log("Total Supply:", ethers.formatUnits(totalSupply, 6), symbol);

  console.log("\n💾 Deployment info saved to:", filepath);

  console.log("\n📋 Usage Example:\n");
  console.log("// 1. Get Mock USDC contract");
  console.log(`const mockUSDC = await ethers.getContractAt("MockERC20", "${usdcAddress}");`);
  console.log("");
  console.log("// 2. Mint tokens to a user");
  console.log(`await mockUSDC.mint(userAddress, ethers.parseUnits("1000", 6)); // 1000 USDC`);
  console.log("");
  console.log("// 3. Approve TaskFactory to spend tokens");
  console.log(`await mockUSDC.connect(user).approve(taskFactoryAddress, ethers.parseUnits("100", 6));`);
  console.log("");
  console.log("// 4. Use in TimeBasedTransferAdapter");
  console.log("const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(");
  console.log("  ['address', 'address', 'uint256', 'uint256'],");
  console.log("  [");
  console.log(`    "${usdcAddress}",           // token`);
  console.log("    recipientAddress,            // recipient");
  console.log("    ethers.parseUnits('100', 6), // amount (100 USDC)");
  console.log("    executeAfter                 // timestamp");
  console.log("  ]");
  console.log(");");

  console.log("\n━".repeat(60));
  console.log("✨ Mock USDC is ready for testing!");
  console.log("━".repeat(60));

  console.log("\n💡 Next Steps:");
  console.log("• Mint USDC to test users: mockUSDC.mint(userAddress, amount)");
  console.log("• Update frontend addresses.ts with Mock USDC address");
  console.log("• Create time-based transfer tasks using this token");
  console.log("• Test the full flow: deposit → execute → transfer\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
