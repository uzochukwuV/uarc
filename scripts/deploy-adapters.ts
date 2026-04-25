import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import manifest from "../agent/manifest.json";

async function main() {
  console.log("\n🚀 Deploying New Adapters to Arc Testnet...\n");

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log("Deployer Address:", deployerAddress);

  // Deploy CCTP Adapter
  const CCTPAdapter = await ethers.getContractFactory("CCTPTransferAdapter");
  const cctpAdapter = await CCTPAdapter.deploy();
  await cctpAdapter.waitForDeployment();
  const cctpAdapterAddress = await cctpAdapter.getAddress();
  console.log("✅ CCTPTransferAdapter:", cctpAdapterAddress);

  // Deploy Stork Adapter
  const StorkAdapter = await ethers.getContractFactory("StorkPriceTransferAdapter");
  const storkAdapter = await StorkAdapter.deploy();
  await storkAdapter.waitForDeployment();
  const storkAdapterAddress = await storkAdapter.getAddress();
  console.log("✅ StorkPriceTransferAdapter:", storkAdapterAddress);

  // Register Adapters
  const actionRegistryAddress = "0xC2d08F92e445163d5DCF3bc17499EC0BCe0AD06d"; // Previous registry
  const actionRegistry = await ethers.getContractAt("ActionRegistry", actionRegistryAddress, deployer);

  const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10);

  try {
      await actionRegistry.registerAdapter(executeSelector, cctpAdapterAddress, 300000, true);
      console.log("✅ CCTPTransferAdapter registered in ActionRegistry");
  } catch (e: any) {
      console.log("⚠️ CCTP Registration failed (maybe already registered or no access):", e.message);
  }

  try {
      await actionRegistry.registerAdapter(executeSelector, storkAdapterAddress, 150000, true);
      console.log("✅ StorkPriceTransferAdapter registered in ActionRegistry");
  } catch (e: any) {
      console.log("⚠️ Stork Registration failed:", e.message);
  }

  console.log("\nUpdate your manifest.json with these new addresses!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });