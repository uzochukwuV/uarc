import { ethers } from "hardhat";

async function main() {
    console.log("\n🚀 Starting Transaction Generation on Arc Testnet Fork...\n");

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log("Using account:", deployerAddress);

    // Ensure deployer has ETH (since we are on a fork, Hardhat auto-funds the first account)
    const initialBalance = await ethers.provider.getBalance(deployerAddress);
    console.log("Initial Balance:", ethers.formatEther(initialBalance), "ETH");

    const TARGET_TX_COUNT = 60;
    let txCount = 0;

    console.log(`\nGenerating ${TARGET_TX_COUNT} transactions...\n`);

    for (let i = 0; i < TARGET_TX_COUNT; i++) {
        try {
            // Send a tiny amount of ETH to self to generate a transaction
            const tx = await deployer.sendTransaction({
                to: deployerAddress,
                value: 1n, // 1 wei
            });
            await tx.wait();
            txCount++;
            console.log(`[${txCount}/${TARGET_TX_COUNT}] Transaction successful: ${tx.hash}`);
        } catch (error) {
            console.error(`[${txCount + 1}/${TARGET_TX_COUNT}] Transaction failed:`, error);
        }
    }

    console.log(`\n✅ Successfully generated ${txCount} transactions!`);

    const finalBalance = await ethers.provider.getBalance(deployerAddress);
    console.log("Final Balance:", ethers.formatEther(finalBalance), "ETH");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });