/**
 * UARC Agent Server
 * Provides REST API for AI-driven task creation on Arc testnet
 * Implements HTTP 402 (x402) payment-gated endpoints for autonomous AI agents
 *
 * Features:
 * 1. POST /task/create-from-prompt — user submits natural language intent
 * 2. POST /task/create — x402-gated endpoint for AI agents (requires on-chain payment proof)
 * 3. GET /task/:taskId — query task status
 * 4. GET /manifest — fetch protocol manifest
 *
 * x402 Flow for AI Agents:
 *   Agent -> POST /task/create (no payment)
 *   Server -> 402 { payTo, amount, currency, network }
 *   Agent -> sends on-chain payment
 *   Agent -> POST /task/create { X-Payment-Tx: <txHash> }
 *   Server -> verifies on-chain payment -> creates task -> 200
 */

import express, { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { Mistral } from "@mistralai/mistralai";
import { parseIntent, TaskIntent } from "./ai-task-creator";
import { verifyPayment, X402PaymentRequired } from "./x402";
import cors from "cors";

// ============================================================
// Config
// ============================================================

const PORT = parseInt(process.env.PORT || "3000");
const ARC_RPC = process.env.ARC_RPC || "https://rpc.drpc.testnet.arc.network";
const PRIVATE_KEY = "0x5ad3af615c05ba41f877e6fe251039b5c66c3a858c7bf2c8d235fe1b9eabfd7f";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "ZivuaamB98Ph9AajVZ2DW4ZrpL97a8OJ";

// x402 fee: 0.0001 ETH per task creation
const X402_FEE = ethers.parseEther("0.0001");
const X402_MIN_CONFIRMATIONS = 1;

// ============================================================
// Setup provider + wallet
// ============================================================

const provider = new ethers.JsonRpcProvider(ARC_RPC, 5042002);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Load manifest
const manifestPath = path.join(__dirname, "manifest.json");
let manifest: any = {};
if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

// ============================================================
// Contract ABIs
// ============================================================

const TASK_FACTORY_ABI = [
    "function createTaskWithTokens(tuple(uint256 expiresAt, uint256 maxExecutions, uint256 recurringInterval, uint256 rewardPerExecution, bytes32 seedCommitment) taskParams, tuple(bytes4 selector, address protocol, bytes params)[] actions, tuple(address token, uint256 amount)[] deposits) external payable returns (uint256 taskId, address taskCore, address taskVault)",
    "function nextTaskId() external view returns (uint256)",
    "event TaskCreated(uint256 indexed taskId, address indexed creator, address taskCore, address taskVault, uint256 rewardPerExecution, uint256 maxExecutions)",
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function mint(address to, uint256 amount) external",
];

// ============================================================
// Express App
// ============================================================

const app = express();
app.use(express.json());
app.use(cors({ origin: "*", allowedHeaders: ["Content-Type", "X-Payment-Tx", "Authorization"] }));

// Serve the ChatGPT-style web UI from frontend/
const frontendPath = path.join(__dirname, "..", "frontend");
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
}

// ============================================================
// Routes
// ============================================================

/**
 * GET / — serve the web UI
 */
app.get("/", (_req: Request, res: Response) => {
    const indexPath = path.join(__dirname, "..", "frontend", "index.html");
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({ status: "UARC Agent running", ui: "frontend/index.html not found" });
    }
});

/**
 * GET /manifest — protocol information
 */
app.get("/manifest", (_req: Request, res: Response) => {
    if (!fs.existsSync(manifestPath)) {
        res.status(503).json({ error: "Contracts not deployed yet" });
        return;
    }
    const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    res.json(m);
});

/**
 * GET /health — health check
 */
app.get("/health", async (_req: Request, res: Response) => {
    try {
        const block = await provider.getBlockNumber();
        const balance = await provider.getBalance(wallet.address);
        res.json({
            status: "ok",
            block,
            wallet: wallet.address,
            balance: ethers.formatEther(balance),
            network: "Arc Testnet (5042002)",
            x402Fee: ethers.formatEther(X402_FEE),
        });
    } catch (err: any) {
        res.status(503).json({ error: err.message });
    }
});

/**
 * POST /task/create-from-prompt — natural language task creation
 * Body: { intent: string, userAddress?: string }
 * No payment required — uses server wallet
 */
app.post("/task/create-from-prompt", async (req: Request, res: Response) => {
    const { intent, userAddress } = req.body;

    if (!intent || typeof intent !== "string") {
        res.status(400).json({ error: "Missing 'intent' string in body" });
        return;
    }

    console.log(`\n[AI Prompt] "${intent}"`);

    try {
        // 1. Parse intent with Mistral AI
        const taskIntent = await parseIntent(intent, manifest, MISTRAL_API_KEY);
        console.log("[AI] Parsed intent:", JSON.stringify(taskIntent, null, 2));

        // 2. Build and submit on-chain task
        const result = await submitTask(taskIntent, userAddress || wallet.address);

        res.json({
            success: true,
            summary: taskIntent.summary,
            taskId: result.taskId,
            txHash: result.txHash,
            taskCore: result.taskCore,
            taskVault: result.taskVault,
            explorerUrl: `https://testnet.arc.network/tx/${result.txHash}`,
        });
    } catch (err: any) {
        console.error("[Error]", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /task/create — x402-gated task creation for AI agents
 * Body: { taskIntent: TaskIntent }
 * Header: X-Payment-Tx: <txHash> (required after receiving 402)
 *
 * x402 flow:
 *   1. Call without X-Payment-Tx → 402 with payment details
 *   2. Pay on-chain to wallet.address the X402_FEE in ETH
 *   3. Call again with X-Payment-Tx: <txHash> → 200 with task details
 */
app.post("/task/create", async (req: Request, res: Response) => {
    const paymentTxHash = req.headers["x-payment-tx"] as string | undefined;

    // ---- x402: Check for payment ----
    if (!paymentTxHash) {
        const paymentRequired: X402PaymentRequired = {
            payTo: wallet.address,
            amount: ethers.formatEther(X402_FEE),
            currency: "ETH",
            network: "Arc Testnet",
            chainId: 5042002,
            description: "API fee for UARC task creation",
            scheme: "exact",
            resource: `POST ${req.protocol}://${req.get("host")}${req.path}`,
            expires: Math.floor(Date.now() / 1000) + 300, // 5 min to pay
        };

        res.status(402).json({
            error: "Payment Required",
            x402: paymentRequired,
            instructions: "Send ETH to payTo address, then retry with X-Payment-Tx header",
        });
        return;
    }

    // ---- x402: Verify payment ----
    try {
        const paid = await verifyPayment(provider, paymentTxHash, wallet.address, X402_FEE, X402_MIN_CONFIRMATIONS);
        if (!paid) {
            res.status(402).json({
                error: "Payment verification failed",
                txHash: paymentTxHash,
                required: ethers.formatEther(X402_FEE) + " ETH",
                payTo: wallet.address,
            });
            return;
        }
        console.log(`[x402] Payment verified: ${paymentTxHash}`);
    } catch (err: any) {
        res.status(402).json({ error: "Payment verification error: " + err.message });
        return;
    }

    // ---- Process task creation ----
    const { taskIntent, userAddress } = req.body;
    if (!taskIntent) {
        res.status(400).json({ error: "Missing taskIntent in body" });
        return;
    }

    try {
        const result = await submitTask(taskIntent as TaskIntent, userAddress || wallet.address);
        res.json({
            success: true,
            paymentVerified: paymentTxHash,
            taskId: result.taskId,
            txHash: result.txHash,
            taskCore: result.taskCore,
            taskVault: result.taskVault,
            explorerUrl: `https://testnet.arc.network/tx/${result.txHash}`,
        });
    } catch (err: any) {
        console.error("[Error]", err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /task/create-from-prompt-x402 — AI prompt via x402 for autonomous agents
 * Body: { intent: string }
 * Header: X-Payment-Tx: <txHash> (required after receiving 402)
 */
app.post("/task/create-from-prompt-x402", async (req: Request, res: Response) => {
    const paymentTxHash = req.headers["x-payment-tx"] as string | undefined;

    if (!paymentTxHash) {
        const paymentRequired: X402PaymentRequired = {
            payTo: wallet.address,
            amount: ethers.formatEther(X402_FEE),
            currency: "ETH",
            network: "Arc Testnet",
            chainId: 5042002,
            description: "API fee for AI-powered UARC task creation",
            scheme: "exact",
            resource: `POST ${req.protocol}://${req.get("host")}${req.path}`,
            expires: Math.floor(Date.now() / 1000) + 300,
        };

        res.status(402).json({
            error: "Payment Required",
            x402: paymentRequired,
            instructions: "Send ETH to payTo address, then retry with X-Payment-Tx header",
        });
        return;
    }

    try {
        const paid = await verifyPayment(provider, paymentTxHash, wallet.address, X402_FEE, X402_MIN_CONFIRMATIONS);
        if (!paid) {
            res.status(402).json({ error: "Payment not confirmed", txHash: paymentTxHash });
            return;
        }
    } catch (err: any) {
        res.status(402).json({ error: err.message });
        return;
    }

    const { intent, userAddress } = req.body;
    if (!intent) {
        res.status(400).json({ error: "Missing intent" });
        return;
    }

    try {
        const taskIntent = await parseIntent(intent, manifest, MISTRAL_API_KEY);
        const result = await submitTask(taskIntent, userAddress || wallet.address);

        res.json({
            success: true,
            paymentVerified: paymentTxHash,
            summary: taskIntent.summary,
            taskId: result.taskId,
            txHash: result.txHash,
            explorerUrl: `https://testnet.arc.network/tx/${result.txHash}`,
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// Core task submission logic
// ============================================================

async function submitTask(taskIntent: TaskIntent, userAddress: string): Promise<{
    taskId: string;
    txHash: string;
    taskCore: string;
    taskVault: string;
}> {
    if (!manifest.contracts?.TaskFactory) {
        throw new Error("TaskFactory not deployed. Run deploy-arc-full.ts first.");
    }

    const taskFactory = new ethers.Contract(manifest.contracts.TaskFactory, TASK_FACTORY_ABI, wallet);
    const now = Math.floor(Date.now() / 1000);

    // Build encoded action params based on adapter type
    const abiCoder = new ethers.AbiCoder();
    const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10);

    let encodedParams: string;
    let tokenDeposits: { token: string; amount: bigint }[] = [];
    let adapterAddress: string;

    switch (taskIntent.adapterType) {
        case "time_based_transfer": {
            const { token, recipient, amount, executeAfter } = taskIntent.params;
            encodedParams = abiCoder.encode(
                ["address", "address", "uint256", "uint256"],
                [token, recipient || userAddress, BigInt(amount), BigInt(executeAfter || now + 300)]
            );
            adapterAddress = manifest.adapters.TimeBasedTransferAdapter;
            tokenDeposits = [{ token, amount: BigInt(amount) }];
            break;
        }

        case "cctp_bridge": {
            const { token, amount, destinationDomain, mintRecipient, executeAfter } = taskIntent.params;
            const messenger = manifest.cctp?.MockTokenMessenger || taskIntent.params.cctpMessenger;
            const recipientBytes32 = ethers.zeroPadValue(mintRecipient || userAddress, 32);
            encodedParams = abiCoder.encode(
                ["address", "address", "uint256", "uint32", "bytes32", "uint256"],
                [messenger, token, BigInt(amount), Number(destinationDomain || 0), recipientBytes32, BigInt(executeAfter || now + 600)]
            );
            adapterAddress = manifest.adapters.CCTPTransferAdapter;
            tokenDeposits = [{ token, amount: BigInt(amount) }];
            break;
        }

        case "stork_price_transfer": {
            const { storkOracle, token, amount, targetPrice, isBelow, recipient } = taskIntent.params;
            const oracle = storkOracle || manifest.oracles.MockStorkUSDC;
            encodedParams = abiCoder.encode(
                ["address", "address", "uint256", "int256", "bool", "address"],
                [oracle, token, BigInt(amount), BigInt(targetPrice), Boolean(isBelow), recipient || userAddress]
            );
            adapterAddress = manifest.adapters.StorkPriceTransferAdapter;
            tokenDeposits = [{ token, amount: BigInt(amount) }];
            break;
        }

        default:
            throw new Error(`Unknown adapter type: ${taskIntent.adapterType}`);
    }

    // Approve tokens if needed
    for (const deposit of tokenDeposits) {
        const token = new ethers.Contract(deposit.token, ERC20_ABI, wallet);
        const allowance = await token.allowance(wallet.address, manifest.contracts.TaskFactory);
        if (allowance < deposit.amount) {
            const approveTx = await token.approve(manifest.contracts.TaskFactory, ethers.MaxUint256);
            await approveTx.wait();
            console.log(`[Task] Approved ${deposit.token}`);
        }
    }

    const taskParams = {
        expiresAt: now + 86400 * 30,
        maxExecutions: 1,
        recurringInterval: 0,
        rewardPerExecution: ethers.parseEther("0.0001"),
        seedCommitment: ethers.ZeroHash,
    };

    const actions = [{
        selector: executeSelector,
        protocol: adapterAddress,
        params: encodedParams,
    }];

    const value = ethers.parseEther("0.0001"); // reward funding

    const tx = await taskFactory.createTaskWithTokens(taskParams, actions, tokenDeposits, {
        value,
        gasLimit: 3000000,
    });

    const receipt = await tx.wait();
    console.log(`[Task] Created: ${tx.hash}`);

    // Extract taskId from event
    let taskId = "0";
    let taskCore = ethers.ZeroAddress;
    let taskVault = ethers.ZeroAddress;

    if (receipt) {
        for (const log of receipt.logs) {
            try {
                const parsed = taskFactory.interface.parseLog({
                    topics: log.topics as string[],
                    data: log.data,
                });
                if (parsed?.name === "TaskCreated") {
                    taskId = parsed.args.taskId.toString();
                    taskCore = parsed.args.taskCore;
                    taskVault = parsed.args.taskVault;
                    break;
                }
            } catch {}
        }
    }

    return { taskId, txHash: tx.hash, taskCore, taskVault };
}

// ============================================================
// Start Server
// ============================================================

app.listen(PORT, () => {
    console.log(`\n🤖 UARC Agent Server running on http://localhost:${PORT}`);
    console.log(`   Wallet: ${wallet.address}`);
    console.log(`   Network: Arc Testnet (5042002)`);
    console.log(`   x402 Fee: ${ethers.formatEther(X402_FEE)} ETH\n`);
    console.log("Endpoints:");
    console.log(`  GET  /health                          — health check`);
    console.log(`  GET  /manifest                        — protocol info`);
    console.log(`  POST /task/create-from-prompt         — AI prompt → task`);
    console.log(`  POST /task/create                     — x402-gated task creation`);
    console.log(`  POST /task/create-from-prompt-x402   — x402-gated AI prompt`);
});

export default app;
