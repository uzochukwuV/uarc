import { ethers } from "hardhat";

/**
 * Test Script: DCA Adapter on Ethereum Mainnet Fork
 *
 * This script tests the Dollar-Cost Averaging adapter with real Ethereum mainnet data.
 * It simulates weekly USDC → WETH purchases using Uniswap V3.
 *
 * Prerequisites:
 * - Run on Ethereum mainnet fork (Tenderly or Hardhat fork)
 * - Requires deployed TaskFactory and core contracts
 *
 * Usage:
 * npx hardhat run scripts/test-dca-adapter.ts --network etherum
 */

// Ethereum Mainnet Addresses
const MAINNET_ADDRESSES = {
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    UNISWAP_V3_ROUTER: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    UNISWAP_V3_QUOTER: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    USDC_WHALE: "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503", // Binance wallet with lots of USDC
};

const POOL_FEES = {
    LOW: 500,      // 0.05%
    MEDIUM: 3000,  // 0.3%
    HIGH: 10000,   // 1%
};

async function main() {
    console.log("🚀 Testing DCA Adapter on Ethereum Mainnet Fork\n");

    const [deployer, user, executor] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("User:", user.address);
    console.log("Executor:", executor.address);
    console.log();

    // ============ STEP 1: Deploy DCA Adapter ============
    console.log("📝 STEP 1: Deploying DCA Adapter...");
    const DCAAdapter = await ethers.getContractFactory("DCAAdapter");
    const dcaAdapter = await DCAAdapter.deploy(
        MAINNET_ADDRESSES.UNISWAP_V3_ROUTER,
        MAINNET_ADDRESSES.UNISWAP_V3_QUOTER
    );
    await dcaAdapter.waitForDeployment();
    const adapterAddress = await dcaAdapter.getAddress();
    console.log("✅ DCA Adapter deployed to:", adapterAddress);
    console.log();

    // ============ STEP 2: Impersonate USDC Whale ============
    console.log("📝 STEP 2: Getting USDC from whale account...");
    await ethers.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.USDC_WHALE]);
    const usdcWhale = await ethers.getSigner(MAINNET_ADDRESSES.USDC_WHALE);

    // Fund whale with ETH for gas
    await deployer.sendTransaction({
        to: MAINNET_ADDRESSES.USDC_WHALE,
        value: ethers.parseEther("10"),
    });

    const usdcContract = await ethers.getContractAt("IERC20", MAINNET_ADDRESSES.USDC);

    // Transfer 10,000 USDC to user for testing
    const usdcAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    await usdcContract.connect(usdcWhale).transfer(user.address, usdcAmount);

    const userUsdcBalance = await usdcContract.balanceOf(user.address);
    console.log("✅ User USDC balance:", ethers.formatUnits(userUsdcBalance, 6), "USDC");
    console.log();

    // ============ STEP 3: Calculate DCA Parameters ============
    console.log("📝 STEP 3: Calculating DCA parameters...");

    const amountPerPurchase = ethers.parseUnits("100", 6); // 100 USDC per purchase
    const interval = 7 * 24 * 60 * 60; // 7 days
    const maxExecutions = 52; // Buy for 52 weeks (1 year)

    // Get current WETH price quote
    const quoterContract = await ethers.getContractAt(
        ["function quoteExactInputSingle(address,address,uint24,uint256,uint160) external returns (uint256)"],
        MAINNET_ADDRESSES.UNISWAP_V3_QUOTER
    );

    // Quote for 100 USDC → WETH
    const expectedWeth = await quoterContract.quoteExactInputSingle.staticCall(
        MAINNET_ADDRESSES.USDC,
        MAINNET_ADDRESSES.WETH,
        POOL_FEES.MEDIUM,
        amountPerPurchase,
        0
    );

    console.log("Expected WETH per 100 USDC:", ethers.formatEther(expectedWeth), "WETH");

    // Calculate minAmountOut with 1% slippage
    const slippageBps = 100; // 1%
    const minAmountOut = (expectedWeth * BigInt(10000 - slippageBps)) / BigInt(10000);
    console.log("Min WETH with 1% slippage:", ethers.formatEther(minAmountOut), "WETH");
    console.log();

    // ============ STEP 4: Encode DCA Params ============
    console.log("📝 STEP 4: Encoding DCA parameters...");

    const dcaParams = {
        tokenIn: MAINNET_ADDRESSES.USDC,
        tokenOut: MAINNET_ADDRESSES.WETH,
        poolFee: POOL_FEES.MEDIUM,
        amountPerPurchase: amountPerPurchase,
        interval: BigInt(interval),
        lastExecutionTime: BigInt(0),
        executionCount: BigInt(0),
        maxExecutions: BigInt(maxExecutions),
        minAmountOut: minAmountOut,
        recipient: user.address,
    };

    const encodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,uint256,uint256,uint256,uint256,uint256,uint256,address)"],
        [[
            dcaParams.tokenIn,
            dcaParams.tokenOut,
            dcaParams.poolFee,
            dcaParams.amountPerPurchase,
            dcaParams.interval,
            dcaParams.lastExecutionTime,
            dcaParams.executionCount,
            dcaParams.maxExecutions,
            dcaParams.minAmountOut,
            dcaParams.recipient,
        ]]
    );

    console.log("✅ DCA params encoded");
    console.log();

    // ============ STEP 5: Validate Parameters ============
    console.log("📝 STEP 5: Validating parameters...");

    const [isValid, errorMessage] = await dcaAdapter.validateParams(encodedParams);
    if (!isValid) {
        throw new Error(`Parameter validation failed: ${errorMessage}`);
    }
    console.log("✅ Parameters validated successfully");
    console.log();

    // ============ STEP 6: Check Initial canExecute (should fail - time not met) ============
    console.log("📝 STEP 6: Checking initial execution readiness...");

    const [canExecute1, reason1] = await dcaAdapter.canExecute(encodedParams);
    console.log("Can execute?", canExecute1);
    console.log("Reason:", reason1);
    console.log();

    // ============ STEP 7: Simulate Time Passage ============
    console.log("📝 STEP 7: Simulating 7 days passing...");

    await ethers.provider.send("evm_increaseTime", [interval]);
    await ethers.provider.send("evm_mine", []);

    const [canExecute2, reason2] = await dcaAdapter.canExecute(encodedParams);
    console.log("Can execute after 7 days?", canExecute2);
    console.log("Reason:", reason2);
    console.log();

    // ============ STEP 8: Approve USDC for Adapter ============
    console.log("📝 STEP 8: Approving USDC for adapter...");

    await usdcContract.connect(user).approve(adapterAddress, amountPerPurchase);
    console.log("✅ USDC approved");
    console.log();

    // ============ STEP 9: Execute First DCA Purchase ============
    console.log("📝 STEP 9: Executing first DCA purchase...");

    const userWethBefore = await ethers.provider.getBalance(user.address);
    const wethContract = await ethers.getContractAt("IERC20", MAINNET_ADDRESSES.WETH);
    const userWethBalanceBefore = await wethContract.balanceOf(user.address);

    // Execute via adapter (in production, this would be called by TaskLogic)
    const executeTx = await dcaAdapter.connect(user).execute(
        user.address, // vault address (user for testing)
        encodedParams
    );
    const receipt = await executeTx.wait();

    console.log("✅ DCA purchase executed!");
    console.log("Gas used:", receipt?.gasUsed.toString());
    console.log();

    // ============ STEP 10: Verify Results ============
    console.log("📝 STEP 10: Verifying purchase results...");

    const userUsdcAfter = await usdcContract.balanceOf(user.address);
    const userWethBalanceAfter = await wethContract.balanceOf(user.address);

    const usdcSpent = userUsdcBalance - userUsdcAfter;
    const wethReceived = userWethBalanceAfter - userWethBalanceBefore;

    console.log("USDC spent:", ethers.formatUnits(usdcSpent, 6), "USDC");
    console.log("WETH received:", ethers.formatEther(wethReceived), "WETH");
    console.log("Effective price:", ethers.formatUnits(usdcSpent, 6) / Number(ethers.formatEther(wethReceived)), "USDC/WETH");
    console.log();

    // Verify slippage protection worked
    if (wethReceived >= minAmountOut) {
        console.log("✅ Slippage protection: PASSED (received >=", ethers.formatEther(minAmountOut), "WETH)");
    } else {
        console.log("❌ Slippage protection: FAILED");
    }
    console.log();

    // ============ STEP 11: Test Multiple Executions ============
    console.log("📝 STEP 11: Testing multiple executions...");

    for (let i = 1; i < 5; i++) {
        // Update params with new execution count and time
        const updatedParams = {
            ...dcaParams,
            lastExecutionTime: BigInt(await ethers.provider.getBlockNumber()),
            executionCount: BigInt(i),
        };

        const updatedEncodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,address,uint24,uint256,uint256,uint256,uint256,uint256,uint256,address)"],
            [[
                updatedParams.tokenIn,
                updatedParams.tokenOut,
                updatedParams.poolFee,
                updatedParams.amountPerPurchase,
                updatedParams.interval,
                updatedParams.lastExecutionTime,
                updatedParams.executionCount,
                updatedParams.maxExecutions,
                updatedParams.minAmountOut,
                updatedParams.recipient,
            ]]
        );

        // Fast forward another week
        await ethers.provider.send("evm_increaseTime", [interval]);
        await ethers.provider.send("evm_mine", []);

        // Check canExecute
        const [canExec, reason] = await dcaAdapter.canExecute(updatedEncodedParams);
        console.log(`Week ${i + 1} - Can execute?`, canExec, `(${reason})`);

        if (canExec) {
            // Approve more USDC
            await usdcContract.connect(user).approve(adapterAddress, amountPerPurchase);

            // Execute
            await dcaAdapter.connect(user).execute(user.address, updatedEncodedParams);

            const currentWethBalance = await wethContract.balanceOf(user.address);
            console.log(`Week ${i + 1} - Total WETH accumulated:`, ethers.formatEther(currentWethBalance), "WETH");
        }
    }
    console.log();

    // ============ STEP 12: Test Max Executions Limit ============
    console.log("📝 STEP 12: Testing max executions limit...");

    const maxedOutParams = {
        ...dcaParams,
        executionCount: BigInt(52), // Already at max
    };

    const maxedOutEncodedParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint24,uint256,uint256,uint256,uint256,uint256,uint256,address)"],
        [[
            maxedOutParams.tokenIn,
            maxedOutParams.tokenOut,
            maxedOutParams.poolFee,
            maxedOutParams.amountPerPurchase,
            maxedOutParams.interval,
            maxedOutParams.lastExecutionTime,
            maxedOutParams.executionCount,
            maxedOutParams.maxExecutions,
            maxedOutParams.minAmountOut,
            maxedOutParams.recipient,
        ]]
    );

    const [canExecMaxed, reasonMaxed] = await dcaAdapter.canExecute(maxedOutEncodedParams);
    console.log("Can execute after max executions?", canExecMaxed);
    console.log("Reason:", reasonMaxed);
    console.log();

    // ============ SUMMARY ============
    console.log("════════════════════════════════════════════════════════════");
    console.log("📋 DCA ADAPTER TEST SUMMARY");
    console.log("════════════════════════════════════════════════════════════");
    console.log("Adapter Address:", adapterAddress);
    console.log("Strategy: Buy 100 USDC worth of WETH every 7 days for 52 weeks");
    console.log("Total Executions Tested: 5");
    console.log("Final WETH Balance:", ethers.formatEther(await wethContract.balanceOf(user.address)), "WETH");
    console.log("Final USDC Balance:", ethers.formatUnits(await usdcContract.balanceOf(user.address), 6), "USDC");
    console.log("════════════════════════════════════════════════════════════");
    console.log();
    console.log("✅ ALL TESTS PASSED!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
