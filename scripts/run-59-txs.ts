/**
 * Generate 59+ Testnet Transactions on Arc
 * Creates a mix of:
 *   - Time-based USDC transfers
 *   - Time-based EURO transfers
 *   - CCTP cross-chain bridge tasks
 *   - Stork price-conditional USDC transfers
 *   - Stork price-conditional EURO transfers
 *
 * Usage:
 *   npx hardhat run scripts/run-59-txs.ts --network arcTestnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TARGET_TX = 65; // Aim above 59 to have buffer

interface TxRecord {
    txIndex: number;
    type: string;
    txHash: string;
    blockNumber?: number;
    gasUsed?: string;
    taskId?: string;
    description: string;
}

async function main() {
    console.log("\n🚀 Generating 59+ Transactions on Arc Testnet\n");
    console.log("=".repeat(60));

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    const network = await ethers.provider.getNetwork();

    console.log("Deployer:", deployerAddress);
    console.log("Network:", network.chainId.toString());

    // Load manifest
    const manifestPath = path.join(__dirname, "..", "agent", "manifest.json");
    if (!fs.existsSync(manifestPath)) {
        console.error("❌ manifest.json not found. Run deploy-arc-full.ts first.");
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    const {
        TaskFactory: taskFactoryAddress,
        ActionRegistry: actionRegistryAddress,
    } = manifest.contracts ?? {};

    const usdcAddress = manifest.tokens?.MockUSDC;
    const euroAddress = manifest.tokens?.MockEURO;
    const storkUsdcAddress = manifest.oracles?.MockStorkUSDC;
    const storkEuroAddress = manifest.oracles?.MockStorkEURO;
    const messengerAddress = manifest.cctp?.MockTokenMessenger;
    const timeAdapterAddress = manifest.adapters?.TimeBasedTransferAdapter
        ?? manifest.actions?.find((a: any) => a.id === "time_based_transfer")?.address;
    const cctpAdapterAddress = manifest.adapters?.CCTPTransferAdapter
        ?? manifest.actions?.find((a: any) => a.id === "cctp_bridge")?.address;
    const storkAdapterAddress = manifest.adapters?.StorkPriceTransferAdapter
        ?? manifest.actions?.find((a: any) => a.id === "stork_price_transfer")?.address;

    if (!taskFactoryAddress || !actionRegistryAddress) {
        console.error("❌ manifest.json is missing required contract addresses under manifest.contracts.");
        console.error("   Ensure you have run deploy-arc-full.ts and that agent/manifest.json is up to date.");
        process.exit(1);
    }

    if (!usdcAddress || !euroAddress || !storkUsdcAddress || !storkEuroAddress || !messengerAddress || !timeAdapterAddress || !cctpAdapterAddress || !storkAdapterAddress) {
        console.error("❌ manifest.json is missing required token/oracle/cctp/adapter addresses.");
        console.error("   Expected keys: manifest.tokens.MockUSDC, manifest.tokens.MockEURO, manifest.oracles.MockStorkUSDC, manifest.oracles.MockStorkEURO, manifest.cctp.MockTokenMessenger, manifest.adapters.*");
        console.error("   If agent/manifest.json is incomplete, rerun deploy-arc-full.ts or restore the correct manifest file.");
        process.exit(1);
    }

    // Load contracts
    const taskFactory = await ethers.getContractAt("TaskFactory", taskFactoryAddress, deployer);
    const creationFee = await taskFactory.creationFee();
    const usdc = await ethers.getContractAt("MockERC20", usdcAddress, deployer);
    const euro = await ethers.getContractAt("MockERC20", euroAddress, deployer);
    const storkOracle = await ethers.getContractAt("MockStorkOracle", storkUsdcAddress, deployer);

    // Check/mint USDC if needed
    const usdcBalance = await usdc.balanceOf(deployerAddress);
    if (usdcBalance < ethers.parseUnits("10000", 6)) {
        console.log("Minting USDC...");
        const tx = await usdc.mint(deployerAddress, ethers.parseUnits("1000000", 6));
        await tx.wait();
        console.log("  ✅ Minted 1M USDC");
    }

    // Check/mint EURO if needed
    const euroBalance = await euro.balanceOf(deployerAddress);
    if (euroBalance < ethers.parseUnits("10000", 6)) {
        console.log("Minting EURO...");
        const tx = await euro.mint(deployerAddress, ethers.parseUnits("1000000", 6));
        await tx.wait();
        console.log("  ✅ Minted 1M EURO");
    }

    // Approve TaskFactory for large amounts
    console.log("\nApproving TaskFactory...");
    const approveUsdcTx = await usdc.approve(taskFactoryAddress, ethers.MaxUint256);
    await approveUsdcTx.wait();
    console.log("  ✅ Approved USDC");

    const approveEuroTx = await euro.approve(taskFactoryAddress, ethers.MaxUint256);
    await approveEuroTx.wait();
    console.log("  ✅ Approved EURO");

    console.log("\n" + "=".repeat(60));
    console.log(`Starting task creation (target: ${TARGET_TX} txs)`);
    console.log("=".repeat(60) + "\n");

    const abiCoder = new ethers.AbiCoder();
    const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10) as `0x${string}`;

    const txRecords: TxRecord[] = [];
    let txCount = 0;
    const now = Math.floor(Date.now() / 1000);
    const recipient = deployerAddress; // Send back to deployer for testing
    const REWARD_PER_EXECUTION = ethers.parseEther("0.001");

    // Helper to create a task and record it
    async function createTask(
        type: string,
        description: string,
        params: any,
        actions: any[],
        deposits: { token: string; amount: bigint }[]
    ) {
        try {
            // Each task needs reward + creation fee funded in native
            const rewardPerExecution = ethers.parseEther("0.001");
            const totalReward = params.maxExecutions === 0
                ? rewardPerExecution
                : rewardPerExecution * BigInt(params.maxExecutions);
            const value = creationFee + totalReward;

            const tx = await taskFactory.createTaskWithTokens(
                params,
                actions,
                deposits,
                { value, gasLimit: 3000000 }
            );
            const receipt = await tx.wait();

            txCount++;
            const record: TxRecord = {
                txIndex: txCount,
                type,
                txHash: tx.hash,
                blockNumber: receipt?.blockNumber,
                gasUsed: receipt?.gasUsed?.toString(),
                description,
            };
            txRecords.push(record);
            console.log(`[${txCount}] ✅ ${type}: ${tx.hash}`);
            return true;
        } catch (err: any) {
            console.error(`[${txCount + 1}] ❌ ${type} failed: ${err.message?.slice(0, 100)}`);
            return false;
        }
    }

    // ----------------------------------------------------------------
    // BATCH 1: Time-Based USDC Transfers (15 tasks)
    // ----------------------------------------------------------------
    console.log("⏰ BATCH 1: Time-Based USDC Transfers (15 tasks)\n");
    for (let i = 0; i < 15; i++) {
        const amount = ethers.parseUnits((1 + i * 0.5).toFixed(1), 6);
        const executeAfter = now + 300 + i * 60; // 5min+, spaced 1 min apart

        const encodedParams = abiCoder.encode(
            ["address", "address", "uint256", "uint256"],
            [usdcAddress, recipient, amount, executeAfter]
        );

        await createTask(
            "TimedUSDC",
            `Transfer ${ethers.formatUnits(amount, 6)} USDC after ${new Date(executeAfter * 1000).toISOString()}`,
            {
                expiresAt: now + 86400 * 30,
                maxExecutions: 1,
                recurringInterval: 0,
                rewardPerExecution: REWARD_PER_EXECUTION,
                seedCommitment: ethers.ZeroHash,
            },
            [{
                selector: executeSelector,
                protocol: timeAdapterAddress,
                params: encodedParams,
            }],
            [{ token: usdcAddress, amount }]
        );
    }

    // ----------------------------------------------------------------
    // BATCH 2: Time-Based EURO Transfers (15 tasks)
    // ----------------------------------------------------------------
    console.log("\n💶 BATCH 2: Time-Based EURO Transfers (15 tasks)\n");
    for (let i = 0; i < 15; i++) {
        const amount = ethers.parseUnits((1 + i * 0.5).toFixed(1), 6);
        const executeAfter = now + 600 + i * 60;

        const encodedParams = abiCoder.encode(
            ["address", "address", "uint256", "uint256"],
            [euroAddress, recipient, amount, executeAfter]
        );

        await createTask(
            "TimedEURO",
            `Transfer ${ethers.formatUnits(amount, 6)} EURO after ${new Date(executeAfter * 1000).toISOString()}`,
            {
                expiresAt: now + 86400 * 30,
                maxExecutions: 1,
                recurringInterval: 0,
                rewardPerExecution: REWARD_PER_EXECUTION,
                seedCommitment: ethers.ZeroHash,
            },
            [{
                selector: executeSelector,
                protocol: timeAdapterAddress,
                params: encodedParams,
            }],
            [{ token: euroAddress, amount }]
        );
    }

    // ----------------------------------------------------------------
    // BATCH 3: CCTP Bridge Tasks (10 tasks)
    // ----------------------------------------------------------------
    console.log("\n🌉 BATCH 3: CCTP Cross-Chain Bridge Tasks (10 tasks)\n");
    for (let i = 0; i < 10; i++) {
        const amount = ethers.parseUnits((5 + i).toString(), 6);
        const executeAfter = now + 900 + i * 120;
        const destinationDomain = i % 3; // Rotate: 0=Ethereum, 1=Base, 2=Avalanche
        const mintRecipient = ethers.zeroPadValue(recipient, 32) as `0x${string}`;

        const encodedParams = abiCoder.encode(
            ["address", "address", "uint256", "uint32", "bytes32", "uint256"],
            [messengerAddress, usdcAddress, amount, destinationDomain, mintRecipient, executeAfter]
        );

        const domainNames = ["Ethereum", "Avalanche", "OP Mainnet"];
        await createTask(
            "CCTPBridge",
            `Bridge ${ethers.formatUnits(amount, 6)} USDC to ${domainNames[destinationDomain]}`,
            {
                expiresAt: now + 86400 * 30,
                maxExecutions: 1,
                recurringInterval: 0,
                rewardPerExecution: REWARD_PER_EXECUTION,
                seedCommitment: ethers.ZeroHash,
            },
            [{
                selector: executeSelector,
                protocol: cctpAdapterAddress,
                params: encodedParams,
            }],
            [{ token: usdcAddress, amount }]
        );
    }

    // ----------------------------------------------------------------
    // BATCH 4: Stork Price-Based USDC Transfers (10 tasks)
    // ----------------------------------------------------------------
    console.log("\n📈 BATCH 4: Stork Price-Based USDC Transfers (10 tasks)\n");

    // Set oracle price for testing: USDC at $1.00
    try {
        const updatePriceTx = await storkOracle.updateAnswer(BigInt("100000000")); // $1.00
        await updatePriceTx.wait();
        console.log("  📊 Set USDC/USD oracle price to $1.00");
    } catch (e: any) {
        console.log("  ⚠️  Could not update oracle price:", e.message?.slice(0, 50));
    }

    for (let i = 0; i < 10; i++) {
        const amount = ethers.parseUnits((2 + i).toString(), 6);
        const isBelow = i % 2 === 0;
        // For "isBelow=true" tasks: trigger if price drops below $0.99
        // For "isBelow=false" tasks: trigger if price rises above $0.95 (always true at $1.00)
        const targetPrice = isBelow ? BigInt("99000000") : BigInt("95000000");

        const encodedParams = abiCoder.encode(
            ["address", "address", "uint256", "int256", "bool", "address"],
            [storkUsdcAddress, usdcAddress, amount, targetPrice, isBelow, recipient]
        );

        const conditionDesc = isBelow
            ? `USDC price < $${(Number(targetPrice) / 1e8).toFixed(2)}`
            : `USDC price >= $${(Number(targetPrice) / 1e8).toFixed(2)}`;

        await createTask(
            "StorkUSDC",
            `Transfer ${ethers.formatUnits(amount, 6)} USDC when ${conditionDesc}`,
            {
                expiresAt: now + 86400 * 30,
                maxExecutions: 1,
                recurringInterval: 0,
                rewardPerExecution: REWARD_PER_EXECUTION,
                seedCommitment: ethers.ZeroHash,
            },
            [{
                selector: executeSelector,
                protocol: storkAdapterAddress,
                params: encodedParams,
            }],
            [{ token: usdcAddress, amount }]
        );
    }

    // ----------------------------------------------------------------
    // BATCH 5: Stork Price-Based EURO Transfers (5 tasks)
    // ----------------------------------------------------------------
    console.log("\n💱 BATCH 5: Stork Price-Based EURO Transfers (5 tasks)\n");
    const storkEuroOracleContract = await ethers.getContractAt("MockStorkOracle", storkEuroAddress, deployer);

    try {
        const updateEuroTx = await storkEuroOracleContract.updateAnswer(BigInt("108000000")); // $1.08
        await updateEuroTx.wait();
        console.log("  📊 Set EURO/USD oracle price to $1.08");
    } catch (e: any) {
        console.log("  ⚠️  Could not update EURO oracle price:", e.message?.slice(0, 50));
    }

    for (let i = 0; i < 5; i++) {
        const amount = ethers.parseUnits((3 + i).toString(), 6);
        // Trigger if EURO price >= $1.05 (always true at $1.08)
        const targetPrice = BigInt("105000000");
        const isBelow = false;

        const encodedParams = abiCoder.encode(
            ["address", "address", "uint256", "int256", "bool", "address"],
            [storkEuroAddress, euroAddress, amount, targetPrice, isBelow, recipient]
        );

        await createTask(
            "StorkEURO",
            `Transfer ${ethers.formatUnits(amount, 6)} EURO when price >= $1.05`,
            {
                expiresAt: now + 86400 * 30,
                maxExecutions: 1,
                recurringInterval: 0,
                rewardPerExecution: REWARD_PER_EXECUTION,
                seedCommitment: ethers.ZeroHash,
            },
            [{
                selector: executeSelector,
                protocol: storkAdapterAddress,
                params: encodedParams,
            }],
            [{ token: euroAddress, amount }]
        );
    }

    // ----------------------------------------------------------------
    // FINAL SUMMARY
    // ----------------------------------------------------------------
    console.log("\n" + "=".repeat(60));
    console.log(`✅ COMPLETE: ${txCount} transactions submitted`);
    console.log("=".repeat(60));

    if (txCount < 59) {
        console.warn(`⚠️  Only ${txCount} txs — need at least 59. Check errors above.`);
    } else {
        console.log(`🎉 Target met! ${txCount} >= 59 transactions`);
    }

    // Save tx log
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

    const txLogPath = path.join(deploymentsDir, `txs-arc-${Date.now()}.json`);
    fs.writeFileSync(txLogPath, JSON.stringify({
        network: network.chainId.toString(),
        deployer: deployerAddress,
        totalTxs: txCount,
        generatedAt: new Date().toISOString(),
        transactions: txRecords,
    }, null, 2));
    console.log(`\n💾 TX log saved to: deployments/txs-arc-${Date.now()}.json`);
    console.log(`\n🔗 Explorer: https://testnet.arc.network/address/${deployerAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Fatal error:", err);
        process.exit(1);
    });
