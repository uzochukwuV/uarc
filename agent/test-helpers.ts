/**
 * Re-exports internal server logic needed by test-local.ts
 * Avoids starting the Express server or creating a real provider.
 */

import { ethers } from "ethers";
import { TaskIntent } from "./ai-task-creator";

// Mirror of applyDefaults from ai-task-creator (exposed for testing)
export function applyDefaultsTest(intent: any, manifest: any, now: number): TaskIntent {
    const params = { ...intent.params };
    const usdcAddress = manifest.tokens?.MockUSDC;
    const euroAddress = manifest.tokens?.MockEURO;

    switch (intent.adapterType) {
        case "time_based_transfer":
            if (!params.token && usdcAddress) params.token = usdcAddress;
            if (!params.executeAfter) params.executeAfter = now + 300;
            if (!params.amount) params.amount = "1000000";
            break;
        case "cctp_bridge":
            if (!params.token && usdcAddress) params.token = usdcAddress;
            if (!params.executeAfter) params.executeAfter = now + 600;
            if (!params.amount) params.amount = "1000000";
            if (params.destinationDomain === undefined) params.destinationDomain = 0;
            if (!params.mintRecipient) params.mintRecipient = ethers.ZeroAddress;
            break;
        case "stork_price_transfer":
            if (!params.token && usdcAddress) params.token = usdcAddress;
            if (!params.storkOracle) params.storkOracle = manifest.oracles?.MockStorkUSDC;
            if (!params.amount) params.amount = "1000000";
            if (params.targetPrice === undefined) params.targetPrice = "95000000";
            if (params.isBelow === undefined) params.isBelow = false;
            break;
    }

    const summaryLower = (intent.summary || "").toLowerCase();
    if (summaryLower.includes("euro") && euroAddress && params.token !== euroAddress) {
        if (!intent.summary?.toLowerCase().includes("usdc")) {
            params.token = euroAddress;
            if (intent.adapterType === "stork_price_transfer") {
                params.storkOracle = manifest.oracles?.MockStorkEURO;
            }
        }
    }

    return { ...intent, params };
}

// Mirror of buildTaskPayload for a simple time_based_transfer test case
export function buildPayloadTest(manifest: any) {
    const now = Math.floor(Date.now() / 1000);
    const abiCoder = new ethers.AbiCoder();
    const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10);

    const token = manifest.tokens.MockUSDC;
    const recipient = manifest.contracts.TaskFactory;
    const amount = BigInt(10_000_000); // 10 USDC
    const executeAfter = BigInt(now + 300);

    const encodedParams = abiCoder.encode(
        ["address", "address", "uint256", "uint256"],
        [token, recipient, amount, executeAfter]
    );

    const taskParams = {
        expiresAt: now + 86400 * 30,
        maxExecutions: 1,
        recurringInterval: 0,
        rewardPerExecution: ethers.parseEther("0.0001").toString(),
        seedCommitment: ethers.ZeroHash,
    };

    return {
        taskFactoryAddress: manifest.contracts.TaskFactory,
        taskParams,
        actions: [{
            selector: executeSelector,
            protocol: manifest.adapters.TimeBasedTransferAdapter,
            params: encodedParams,
        }],
        deposits: [{ token, amount: amount.toString() }],
        value: ethers.formatEther(ethers.parseEther("0.0001")),
    };
}
