import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Load manifest
const manifestPath = path.join(__dirname, "../agent/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

async function main() {
    console.log("\n🚀 Starting Real Task Generation on Arc Testnet Fork...\n");

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log("Using account:", deployerAddress);

    // Get TaskFactory contract
    const taskFactoryAddress = manifest.contracts.TaskFactory;
    const taskFactory = await ethers.getContractAt("TaskFactory", taskFactoryAddress, deployer);

    console.log("Deploying Mock Tokens for local fork execution...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();
    const USDC_ADDRESS = await mockUSDC.getAddress();
    
    const mockEURC = await MockERC20.deploy("Mock EURC", "EURC", 6);
    await mockEURC.waitForDeployment();
    const EURC_ADDRESS = await mockEURC.getAddress();

    console.log("Minting and approving tokens...");
    await mockUSDC.mint(deployerAddress, ethers.parseUnits("100000", 6));
    await mockUSDC.approve(taskFactoryAddress, ethers.MaxUint256);

    const TARGET_TX_COUNT = 60;
    let txCount = 0;

    console.log(`\nGenerating ${TARGET_TX_COUNT} valid on-chain automation requests...\n`);

    const abiCoder = new ethers.AbiCoder();

    for (let i = 0; i < TARGET_TX_COUNT; i++) {
        try {
            const isCurve = i % 2 === 0;
            const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 7; // Expires in 7 days
            const maxExecutions = 1;
            const recurringInterval = 0;
            const rewardPerExecution = ethers.parseEther("0.01"); // 0.01 ETH reward
            const seedCommitment = ethers.ZeroHash;

            const taskParams = {
                expiresAt,
                maxExecutions,
                recurringInterval,
                rewardPerExecution,
                seedCommitment
            };

            let actionParams;
            const amount = ethers.parseUnits("1", 6); // 1 USDC

            if (isCurve) {
                // Curve Swap
                const curveAdapter = manifest.actions.find((a: any) => a.id === "curve_swap")!.address;
                const poolId = "0x1234567890123456789012345678901234567890"; // Mock pool
                
                const encodedAdapterParams = abiCoder.encode(
                    ['address', 'address', 'address', 'int128', 'int128', 'uint256', 'uint256', 'address'],
                    [
                        poolId,
                        USDC_ADDRESS,
                        EURC_ADDRESS,
                        0,
                        1,
                        amount,
                        0, // minAmountOut
                        deployerAddress
                    ]
                );

                actionParams = [{
                    selector: ethers.id("execute(address,bytes)").slice(0, 10),
                    protocol: curveAdapter, // Address of the registered adapter contract!
                    params: encodedAdapterParams
                }];
            } else {
                // Time-Based Transfer
                const timeAdapter = manifest.actions.find((a: any) => a.id === "time_based_transfer")!.address;
                const executeAfter = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
                
                const encodedAdapterParams = abiCoder.encode(
                    ['address', 'uint256', 'uint256', 'address'],
                    [USDC_ADDRESS, amount, executeAfter, deployerAddress]
                );

                actionParams = [{
                    selector: ethers.id("execute(address,bytes)").slice(0, 10),
                    protocol: timeAdapter, // Address of the registered adapter contract!
                    params: encodedAdapterParams
                }];
            }

            const tokenDeposits = [{
                token: USDC_ADDRESS,
                amount: amount
            }];

            const creationFee = ethers.parseEther("0.001");
            const totalEthValue = rewardPerExecution + creationFee; // Simplified calculation

            const tx = await taskFactory.createTaskWithTokens(
                taskParams,
                actionParams,
                tokenDeposits,
                { value: totalEthValue, gasLimit: 2000000 }
            );
            
            await tx.wait();
            txCount++;
            
            const typeStr = isCurve ? "Curve Swap" : "Time Transfer";
            console.log(`[${txCount}/${TARGET_TX_COUNT}] ✅ Created ${typeStr} automation: ${tx.hash}`);
        } catch (error: any) {
            console.error(`[${txCount + 1}/${TARGET_TX_COUNT}] ❌ Transaction failed:`, error.message);
        }
    }

    console.log(`\n✅ Successfully generated ${txCount} real automation requests on the fork!`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });