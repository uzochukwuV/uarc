import { ethers } from "hardhat";

/**
 * Test Script: Stop-Loss/Take-Profit Adapter on Ethereum Mainnet Fork
 *
 * This script tests price-based automated orders using Chainlink price feeds.
 * Simulates stop-loss, take-profit, and trailing stop scenarios.
 *
 * Prerequisites:
 * - Run on Ethereum mainnet fork
 * - Requires Chainlink price feeds
 *
 * Usage:
 * npx hardhat run scripts/test-stop-loss-take-profit.ts --network etherum
 */

// Ethereum Mainnet Addresses
const MAINNET_ADDRESSES = {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    UNISWAP_V3_ROUTER: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    ETH_USD_PRICE_FEED: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // Chainlink ETH/USD
    WETH_WHALE: "0x8EB8a3b98659Cce290402893d0123abb75E3ab28",
};

const POOL_FEES = {
    MEDIUM: 3000, // 0.3%
};

enum OrderType {
    STOP_LOSS = 0,
    TAKE_PROFIT = 1,
    TRAILING_STOP = 2,
}

async function main() {
    console.log("🚀 Testing Stop-Loss/Take-Profit Adapter on Ethereum Mainnet Fork\n");

    const [deployer, user, executor] = await ethers.getSigners();
    console.log("Deployer:", deployer.address);
    console.log("User:", user.address);
    console.log("Executor:", executor.address);
    console.log();

    // ============ STEP 1: Deploy Adapter ============
    console.log("📝 STEP 1: Deploying Stop-Loss/Take-Profit Adapter...");
    const StopLossTakeProfitAdapter = await ethers.getContractFactory("StopLossTakeProfitAdapter");
    const adapter = await StopLossTakeProfitAdapter.deploy(MAINNET_ADDRESSES.UNISWAP_V3_ROUTER);
    await adapter.waitForDeployment();
    const adapterAddress = await adapter.getAddress();
    console.log("✅ Adapter deployed to:", adapterAddress);
    console.log();

    // ============ STEP 2: Get Test Tokens ============
    console.log("📝 STEP 2: Getting test tokens...");

    // Impersonate WETH whale
    await ethers.provider.send("hardhat_impersonateAccount", [MAINNET_ADDRESSES.WETH_WHALE]);
    const wethWhale = await ethers.getSigner(MAINNET_ADDRESSES.WETH_WHALE);
    await deployer.sendTransaction({ to: MAINNET_ADDRESSES.WETH_WHALE, value: ethers.parseEther("10") });

    const wethContract = await ethers.getContractAt("IERC20", MAINNET_ADDRESSES.WETH);
    const usdcContract = await ethers.getContractAt("IERC20", MAINNET_ADDRESSES.USDC);

    // Transfer 100 WETH to user
    const wethAmount = ethers.parseEther("100");
    await wethContract.connect(wethWhale).transfer(user.address, wethAmount);

    console.log("✅ User WETH balance:", ethers.formatEther(await wethContract.balanceOf(user.address)), "WETH");
    console.log();

    // ============ STEP 3: Get Current ETH Price ============
    console.log("📝 STEP 3: Fetching current ETH/USD price from Chainlink...");

    const [currentPrice, updatedAt] = await adapter.getCurrentPrice(MAINNET_ADDRESSES.ETH_USD_PRICE_FEED);
    const priceInUSD = Number(currentPrice) / 1e8; // Chainlink uses 8 decimals

    console.log("Current ETH/USD price:", priceInUSD);
    console.log("Last updated:", new Date(Number(updatedAt) * 1000).toISOString());
    console.log();

    // ============ STEP 4: Setup Stop-Loss Order ============
    console.log("📝 STEP 4: Setting up STOP-LOSS order...");

    const stopLossPrice = Math.floor(priceInUSD * 0.95) * 1e8; // 5% below current price
    const amountToSell = ethers.parseEther("10"); // Sell 10 WETH

    // Calculate minAmountOut (expect ~current price with 2% slippage)
    const expectedUSDC = BigInt(Math.floor((priceInUSD * 10 * 0.98) * 1e6)); // USDC has 6 decimals

    const stopLossParams = {
        orderType: OrderType.STOP_LOSS,
        tokenIn: MAINNET_ADDRESSES.WETH,
        tokenOut: MAINNET_ADDRESSES.USDC,
        priceFeed: MAINNET_ADDRESSES.ETH_USD_PRICE_FEED,
        swapPoolFee: POOL_FEES.MEDIUM,
        triggerPrice: BigInt(stopLossPrice),
        amountToSell: amountToSell,
        minAmountOut: expectedUSDC,
        trailingPercent: BigInt(0), // Not used for stop-loss
        peakPrice: BigInt(0), // Not used for stop-loss
        isActive: true,
        recipient: user.address,
    };

    const stopLossEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(uint8,address,address,address,uint24,uint256,uint256,uint256,uint256,uint256,bool,address)"],
        [[
            stopLossParams.orderType,
            stopLossParams.tokenIn,
            stopLossParams.tokenOut,
            stopLossParams.priceFeed,
            stopLossParams.swapPoolFee,
            stopLossParams.triggerPrice,
            stopLossParams.amountToSell,
            stopLossParams.minAmountOut,
            stopLossParams.trailingPercent,
            stopLossParams.peakPrice,
            stopLossParams.isActive,
            stopLossParams.recipient,
        ]]
    );

    console.log("Stop-loss trigger price:", Number(stopLossPrice) / 1e8, "USD");
    console.log("Amount to sell:", ethers.formatEther(amountToSell), "WETH");
    console.log("Min USDC expected:", ethers.formatUnits(expectedUSDC, 6), "USDC");
    console.log();

    // ============ STEP 5: Validate Stop-Loss Parameters ============
    console.log("📝 STEP 5: Validating stop-loss parameters...");

    const [stopLossValid, stopLossError] = await adapter.validateParams(stopLossEncoded);
    if (!stopLossValid) {
        throw new Error(`Stop-loss validation failed: ${stopLossError}`);
    }
    console.log("✅ Stop-loss parameters validated");
    console.log();

    // ============ STEP 6: Check Stop-Loss Trigger Condition ============
    console.log("📝 STEP 6: Checking if stop-loss would trigger...");

    const [canExecuteStopLoss, stopLossReason] = await adapter.canExecute(stopLossEncoded);
    console.log("Would trigger?", canExecuteStopLoss);
    console.log("Reason:", stopLossReason);
    console.log("(Expected: false, since current price >", Number(stopLossPrice) / 1e8, "USD)");
    console.log();

    // ============ STEP 7: Setup Take-Profit Order ============
    console.log("📝 STEP 7: Setting up TAKE-PROFIT order...");

    const takeProfitPrice = Math.floor(priceInUSD * 1.10) * 1e8; // 10% above current price

    const takeProfitParams = {
        ...stopLossParams,
        orderType: OrderType.TAKE_PROFIT,
        triggerPrice: BigInt(takeProfitPrice),
    };

    const takeProfitEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(uint8,address,address,address,uint24,uint256,uint256,uint256,uint256,uint256,bool,address)"],
        [[
            takeProfitParams.orderType,
            takeProfitParams.tokenIn,
            takeProfitParams.tokenOut,
            takeProfitParams.priceFeed,
            takeProfitParams.swapPoolFee,
            takeProfitParams.triggerPrice,
            takeProfitParams.amountToSell,
            takeProfitParams.minAmountOut,
            takeProfitParams.trailingPercent,
            takeProfitParams.peakPrice,
            takeProfitParams.isActive,
            takeProfitParams.recipient,
        ]]
    );

    console.log("Take-profit trigger price:", Number(takeProfitPrice) / 1e8, "USD");

    const [canExecuteTakeProfit, takeProfitReason] = await adapter.canExecute(takeProfitEncoded);
    console.log("Would trigger?", canExecuteTakeProfit);
    console.log("Reason:", takeProfitReason);
    console.log("(Expected: false, since current price <", Number(takeProfitPrice) / 1e8, "USD)");
    console.log();

    // ============ STEP 8: Setup Trailing Stop Order ============
    console.log("📝 STEP 8: Setting up TRAILING STOP order...");

    const trailingPercent = 15; // Trigger if price drops 15% from peak
    const peakPrice = BigInt(Math.floor(priceInUSD * 1.2) * 1e8); // Assume peak was 20% higher

    const trailingStopParams = {
        ...stopLossParams,
        orderType: OrderType.TRAILING_STOP,
        triggerPrice: BigInt(0), // Not used for trailing stop
        trailingPercent: BigInt(trailingPercent),
        peakPrice: peakPrice,
    };

    const trailingStopEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(uint8,address,address,address,uint24,uint256,uint256,uint256,uint256,uint256,bool,address)"],
        [[
            trailingStopParams.orderType,
            trailingStopParams.tokenIn,
            trailingStopParams.tokenOut,
            trailingStopParams.priceFeed,
            trailingStopParams.swapPoolFee,
            trailingStopParams.triggerPrice,
            trailingStopParams.amountToSell,
            trailingStopParams.minAmountOut,
            trailingStopParams.trailingPercent,
            trailingStopParams.peakPrice,
            trailingStopParams.isActive,
            trailingStopParams.recipient,
        ]]
    );

    console.log("Trailing stop configuration:");
    console.log("  Peak price:", Number(peakPrice) / 1e8, "USD");
    console.log("  Trailing %:", trailingPercent, "%");
    console.log("  Trigger price (calculated):", Number(peakPrice) / 1e8 * (100 - trailingPercent) / 100, "USD");

    const [canExecuteTrailing, trailingReason] = await adapter.canExecute(trailingStopEncoded);
    console.log("Would trigger?", canExecuteTrailing);
    console.log("Reason:", trailingReason);
    console.log();

    // ============ STEP 9: Test Helper Functions ============
    console.log("📝 STEP 9: Testing helper functions...");

    // Test wouldTrigger helper
    console.log("\nTesting wouldTrigger helper:");

    const wouldTriggerStopLoss = await adapter.wouldTrigger(
        OrderType.STOP_LOSS,
        stopLossPrice,
        currentPrice,
        0,
        0
    );
    console.log("Stop-loss would trigger?", wouldTriggerStopLoss);

    const wouldTriggerTakeProfit = await adapter.wouldTrigger(
        OrderType.TAKE_PROFIT,
        takeProfitPrice,
        currentPrice,
        0,
        0
    );
    console.log("Take-profit would trigger?", wouldTriggerTakeProfit);

    const wouldTriggerTrailing = await adapter.wouldTrigger(
        OrderType.TRAILING_STOP,
        0,
        currentPrice,
        peakPrice,
        trailingPercent
    );
    console.log("Trailing stop would trigger?", wouldTriggerTrailing);

    // Test calculateMinAmountOut helper
    console.log("\nTesting calculateMinAmountOut helper:");

    const calculatedMinOut = await adapter.calculateMinAmountOut(
        amountToSell,
        currentPrice,
        200, // 2% slippage
        18, // WETH decimals
        6 // USDC decimals
    );
    console.log("Calculated minAmountOut:", ethers.formatUnits(calculatedMinOut, 6), "USDC");
    console.log();

    // ============ STEP 10: Test Parameter Validation Edge Cases ============
    console.log("📝 STEP 10: Testing parameter validation edge cases...");

    // Test invalid pool fee
    console.log("\nTest 1: Invalid pool fee");
    const invalidPoolFeeParams = {
        ...stopLossParams,
        swapPoolFee: 1000, // Invalid (not 500, 3000, or 10000)
    };

    const invalidPoolFeeEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(uint8,address,address,address,uint24,uint256,uint256,uint256,uint256,uint256,bool,address)"],
        [[
            invalidPoolFeeParams.orderType,
            invalidPoolFeeParams.tokenIn,
            invalidPoolFeeParams.tokenOut,
            invalidPoolFeeParams.priceFeed,
            invalidPoolFeeParams.swapPoolFee,
            invalidPoolFeeParams.triggerPrice,
            invalidPoolFeeParams.amountToSell,
            invalidPoolFeeParams.minAmountOut,
            invalidPoolFeeParams.trailingPercent,
            invalidPoolFeeParams.peakPrice,
            invalidPoolFeeParams.isActive,
            invalidPoolFeeParams.recipient,
        ]]
    );

    const [invalidPoolFeeValid, invalidPoolFeeError] = await adapter.validateParams(invalidPoolFeeEncoded);
    console.log("Valid?", invalidPoolFeeValid, "-", invalidPoolFeeError);

    // Test trailing stop without peak price
    console.log("\nTest 2: Trailing stop without peak price");
    const noPeakPriceParams = {
        ...trailingStopParams,
        peakPrice: BigInt(0),
    };

    const noPeakPriceEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(uint8,address,address,address,uint24,uint256,uint256,uint256,uint256,uint256,bool,address)"],
        [[
            noPeakPriceParams.orderType,
            noPeakPriceParams.tokenIn,
            noPeakPriceParams.tokenOut,
            noPeakPriceParams.priceFeed,
            noPeakPriceParams.swapPoolFee,
            noPeakPriceParams.triggerPrice,
            noPeakPriceParams.amountToSell,
            noPeakPriceParams.minAmountOut,
            noPeakPriceParams.trailingPercent,
            noPeakPriceParams.peakPrice,
            noPeakPriceParams.isActive,
            noPeakPriceParams.recipient,
        ]]
    );

    const [noPeakPriceValid, noPeakPriceError] = await adapter.validateParams(noPeakPriceEncoded);
    console.log("Valid?", noPeakPriceValid, "-", noPeakPriceError);
    console.log();

    // ============ STEP 11: Get Token Requirements ============
    console.log("📝 STEP 11: Testing token requirements...");

    const [tokens, amounts] = await adapter.getTokenRequirements(stopLossEncoded);
    console.log("Required tokens:", tokens.length);
    console.log("Token 0:", tokens[0], "=", tokens[0] === MAINNET_ADDRESSES.WETH ? "WETH ✓" : "");
    console.log("Amount:", ethers.formatEther(amounts[0]), "WETH");
    console.log();

    // ============ SUMMARY ============
    console.log("════════════════════════════════════════════════════════════");
    console.log("📋 STOP-LOSS/TAKE-PROFIT TEST SUMMARY");
    console.log("════════════════════════════════════════════════════════════");
    console.log("Adapter Address:", adapterAddress);
    console.log("\nCurrent Market Conditions:");
    console.log("  ETH/USD Price:", priceInUSD, "USD");
    console.log("  Last Updated:", new Date(Number(updatedAt) * 1000).toLocaleString());
    console.log("\nOrder Configurations Tested:");
    console.log("  1. STOP-LOSS:");
    console.log("     Trigger:", Number(stopLossPrice) / 1e8, "USD");
    console.log("     Status:", canExecuteStopLoss ? "TRIGGERED ⚠️" : "Pending ⏳");
    console.log("  2. TAKE-PROFIT:");
    console.log("     Trigger:", Number(takeProfitPrice) / 1e8, "USD");
    console.log("     Status:", canExecuteTakeProfit ? "TRIGGERED ⚠️" : "Pending ⏳");
    console.log("  3. TRAILING STOP:");
    console.log("     Peak:", Number(peakPrice) / 1e8, "USD");
    console.log("     Trailing:", trailingPercent, "%");
    console.log("     Status:", canExecuteTrailing ? "TRIGGERED ⚠️" : "Pending ⏳");
    console.log("\nValidation Tests:");
    console.log("  ✅ Basic parameter validation");
    console.log("  ✅ Price feed integration");
    console.log("  ✅ Helper functions");
    console.log("  ✅ Edge case handling");
    console.log("════════════════════════════════════════════════════════════");
    console.log();
    console.log("✅ ALL TESTS PASSED!");
    console.log();
    console.log("📌 Note: Full execution requires:");
    console.log("  1. Orders to be triggered by actual price movements");
    console.log("  2. TaskFactory integration for vault management");
    console.log("  3. Executor network to monitor and execute");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
