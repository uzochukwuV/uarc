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
import { TaskStatus } from "../reference/TaskerFrontend/shared/schema";

// ============================================================
// Config
// ============================================================

const PORT = parseInt(process.env.PORT || "3000");

// Network selection: "base" (Base Sepolia) or "arc" (Arc Testnet)
const NETWORK = process.env.NETWORK || "base";

const NETWORK_CONFIG: Record<
  string,
  { rpc: string; chainId: number; name: string; explorer: string }
> = {
  base: {
    rpc: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
    chainId: 84532,
    name: "Base Sepolia",
    explorer: "https://sepolia.basescan.org",
  },
  arc: {
    rpc: process.env.ARC_RPC || "https://rpc.drpc.testnet.arc.network",
    chainId: 5042002,
    name: "Arc Testnet",
    explorer: "https://testnet.arc.network",
  },
};

const activeNetwork = NETWORK_CONFIG[NETWORK] || NETWORK_CONFIG.base;

const PRIVATE_KEY =
  process.env.BASE_DEPLOYER_KEY ||
  process.env.DEPLOYER_KEY ||
  "0x5ad3af615c05ba41f877e6fe251039b5c66c3a858c7bf2c8d235fe1b9eabfd7f";
const MISTRAL_API_KEY =
  process.env.MISTRAL_API_KEY || "ZivuaamB98Ph9AajVZ2DW4ZrpL97a8OJ";

// x402 fee: 0.0001 ETH per task creation
const X402_FEE = ethers.parseEther("0.0001");
const X402_MIN_CONFIRMATIONS = 1;
const TASK_REWARD_PER_EXECUTION = ethers.parseEther("0.0002");

// Faucet limits
const FAUCET_AMOUNT = ethers.parseUnits("1000", 6); // 1000 tokens per request
const FAUCET_COOLDOWN = 3600 * 1000; // 1 hour cooldown
const faucetCooldowns: Map<string, number> = new Map();

// ============================================================
// Setup provider + wallet
// ============================================================

const provider = new ethers.JsonRpcProvider(
  activeNetwork.rpc,
  activeNetwork.chainId,
);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Load manifest based on network
const manifestPath =
  NETWORK === "base"
    ? path.join(__dirname, "manifest-base.json")
    : path.join(__dirname, "manifest.json");
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
  "function transfer(address to, uint256 amount) external returns (bool)",
];

const REWARD_MANAGER_ABI = [
  "function getMaxRewardCost(uint256 baseReward) external view returns (uint256)",
];

const GLOBAL_REGISTRY_ABI = [
  "function getTasksByCreator(address creator) external view returns (uint256[] memory)",
  "function taskCount() external view returns (uint256)",
];

const TASK_CORE_ABI = [
  "function executionCount() external view returns (uint256)",
  "function isPaused() external view returns (bool)",
  "function taskParams() external view returns (uint256 expiresAt, uint256 maxExecutions, uint256 recurringInterval, uint256 rewardPerExecution, bytes32 seedCommitment)",
  "function getAction(uint256 index) external view returns (bytes4 selector, address protocol, bytes memory params)",
  "function actionCount() external view returns (uint256)",
  "function creator() external view returns (address)",
  "function lastExecutionTime() external view returns (uint256)",
  "function getActions() external view returns (tuple(bytes4 selector, address protocol, bytes params)[] memory)",
  "function getMetadata() external view returns (uint256 id, address creator, uint96 createdAt, uint256 expiresAt, uint256 maxExecutions, uint256 executionCount, uint256 lastExecutionTime, uint256 recurringInterval, uint256 rewardPerExecution, uint8 status, bytes32 actionsHash, bytes32 seedCommitment)",
];

// ============================================================
// Express App
// ============================================================

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
    allowedHeaders: ["Content-Type", "X-Payment-Tx", "Authorization"],
  }),
);

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
    res.json({
      status: "UARC Agent running",
      ui: "frontend/index.html not found",
    });
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
 * POST /task/preview — parse natural language intent and build a task payload for wallet signing
 */
app.post("/task/preview", async (req: Request, res: Response) => {
  const { intent, userAddress } = req.body;
  if (!intent || typeof intent !== "string") {
    res.status(400).json({ error: "Missing 'intent' string in body" });
    return;
  }

  try {
    const taskIntent = await parseIntent(intent, manifest, MISTRAL_API_KEY);
    const payload = await buildTaskPayload(
      taskIntent,
      userAddress || wallet.address,
    );

    res.json({
      success: true,
      summary: taskIntent.summary,
      adapterType: taskIntent.adapterType,
      params: taskIntent.params,
      payload,
    });
  } catch (err: any) {
    console.error("[Preview Error]", err.message);
    res.status(500).json({ error: err.message });
  }
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
      network: `${activeNetwork.name} (${activeNetwork.chainId})`,
      explorer: activeNetwork.explorer,
      x402Fee: ethers.formatEther(X402_FEE),
      faucetAvailable: true,
    });
  } catch (err: any) {
    res.status(503).json({ error: err.message });
  }
});

/**
 * POST /faucet — Request test tokens for testnet users
 * Body: { address: string, token?: "USDC" | "USDT" }
 */
app.post("/faucet", async (req: Request, res: Response) => {
  const { address, token = "USDC" } = req.body;

  if (!address || !ethers.isAddress(address)) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }

  // Check cooldown
  const lastRequest = faucetCooldowns.get(address.toLowerCase());
  if (lastRequest && Date.now() - lastRequest < FAUCET_COOLDOWN) {
    const waitTime = Math.ceil(
      (FAUCET_COOLDOWN - (Date.now() - lastRequest)) / 60000,
    );
    res.status(429).json({
      error: `Cooldown active. Try again in ${waitTime} minutes.`,
      nextAvailable: new Date(lastRequest + FAUCET_COOLDOWN).toISOString(),
    });
    return;
  }

  // Get token address from manifest
  const tokenKey = token === "USDT" ? "MockUSDT" : "MockUSDC";
  const tokenConfig = manifest.tokens?.[tokenKey];
  const tokenAddress =
    typeof tokenConfig === "string" ? tokenConfig : tokenConfig?.address;

  if (!tokenAddress) {
    res
      .status(503)
      .json({
        error: `Token ${token} not configured. Deploy contracts first.`,
      });
    return;
  }

  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

    // Check deployer balance
    const deployerBalance = await tokenContract.balanceOf(wallet.address);
    if (deployerBalance < FAUCET_AMOUNT) {
      res.status(503).json({ error: "Faucet empty. Contact admin." });
      return;
    }

    // Transfer tokens
    const tx = await tokenContract.transfer(address, FAUCET_AMOUNT);
    await tx.wait();

    // Set cooldown
    faucetCooldowns.set(address.toLowerCase(), Date.now());

    console.log(`[Faucet] Sent 1000 ${token} to ${address} - tx: ${tx.hash}`);

    res.json({
      success: true,
      token,
      amount: "1000",
      recipient: address,
      txHash: tx.hash,
      explorerUrl: `${activeNetwork.explorer}/tx/${tx.hash}`,
      nextAvailable: new Date(Date.now() + FAUCET_COOLDOWN).toISOString(),
    });
  } catch (err: any) {
    console.error("[Faucet Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /faucet/status — Check faucet status for an address
 */
app.get("/faucet/status", async (req: Request, res: Response) => {
  const { address } = req.query;

  if (!address || typeof address !== "string" || !ethers.isAddress(address)) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }

  const lastRequest = faucetCooldowns.get(address.toLowerCase());
  const canRequest =
    !lastRequest || Date.now() - lastRequest >= FAUCET_COOLDOWN;

  res.json({
    address,
    canRequest,
    lastRequest: lastRequest ? new Date(lastRequest).toISOString() : null,
    nextAvailable: lastRequest
      ? new Date(lastRequest + FAUCET_COOLDOWN).toISOString()
      : "now",
    amountPerRequest: "1000",
    supportedTokens: ["USDC", "USDT"],
  });
});

/**
 * GET /tasks — Fetch all tasks for a user address
 * Query: ?address=0x...
 */
app.get("/tasks", async (req: Request, res: Response) => {
  const { address } = req.query;

  if (!address || typeof address !== "string" || !ethers.isAddress(address)) {
    res.status(400).json({ error: "Invalid address" });
    return;
  }

  try {
    const globalRegistryAddr = manifest.contracts?.GlobalRegistry;
    const taskFactoryAddr = manifest.contracts?.TaskFactory;

    if (!globalRegistryAddr) {
      res.json({ tasks: [], message: "GlobalRegistry not deployed" });
      return;
    }

    const registry = new ethers.Contract(
      globalRegistryAddr,
      GLOBAL_REGISTRY_ABI,
      provider,
    );

    // Get all task IDs for this creator
    let taskIds: bigint[] = [];
    try {
      taskIds = await registry.getTasksByCreator(address);
      console.log(taskIds);
    } catch (err) {
      // If getTasksByCreator doesn't exist, return empty
      console.log(
        "[Tasks] getTasksByCreator not available:",
        (err as Error).message,
      );
      res.json({
        tasks: [],
        message: "Task lookup not available on this registry",
      });
      return;
    }
    console.log(taskIds);
    // Fetch details for each task
    const tasks = await Promise.all(
      taskIds.map(async (taskId) => {
        try {
          // Get TaskCore address from factory events or stored mapping
          const factory = new ethers.Contract(
            taskFactoryAddr,
            [
              "function getTaskAddresses(uint256 taskId) external view returns (address, address)",
            ],
            provider,
          );

          let taskCoreAddr: string;
          try {
            taskCoreAddr = await factory
              .getTaskAddresses(taskId)
              .then((res: [string, string]) => res[0]);
          } catch {
            // If getTaskCore doesn't exist, skip this task
            console.log("getTaskCore not available");
            return null;
          }

          if (!taskCoreAddr || taskCoreAddr === ethers.ZeroAddress) return null;

          const taskCore = new ethers.Contract(
            taskCoreAddr,
            TASK_CORE_ABI,
            provider,
          );

          const [
            id,
            creator,
            createdAt,
            expiresAt,
            maxExecutions,
            executionCount,
            lastExecutionTime,
            recurringInterval,
            rewardPerExecution,
            status,
            actionsHash,
            seedCommitment,
          ] = await taskCore.getMetadata();
          const isPaused = await taskCore.isPaused().catch(() => false);
          console.log(isPaused);

          const executed = Number(executionCount);
          const interval = Number(recurringInterval);
          const lastExec = Number(lastExecutionTime);

          console.log(
            `Task ${taskId}: executed ${executed}/${maxExecutions}, interval ${interval}s, lastExec ${lastExec}, paused: ${isPaused}`,
          );

          // Calculate next execution time
          let nextExecution = 0;
          if (
            executed < Number(maxExecutions) &&
            interval > 0 &&
            lastExec > 0
          ) {
            nextExecution = lastExec + interval;
          } else if (executed === 0 && interval > 0) {
            // Not executed yet, estimate from creation
            nextExecution = Math.floor(Date.now() / 1000) + 60;
          }
          console.log(nextExecution);

          // Try to get action details for adapter type
          let adapterType = "unknown";
          let amountPerExecution = 0;

          const action = await taskCore.getActions();
          console.log(action);
          const protocol = action[0][1] || "";
          console.log(protocol);

          console.log(protocol)
          console.log(manifest.adapters?.RecurringTransferAdapter)

          // Identify adapter type by address
          adapterType =
            protocol === manifest.adapters?.RecurringTransferAdapter.address
              ? "recurring_transfer"
              : protocol === manifest.adapters?.TimeBasedTransferAdapter.address
              ? "time_based_transfer"
              : "unknown";

        console.log(adapterType);

          return {
            taskId: Number(taskId).toString(),
            taskCore: taskCoreAddr,
            maxExecutions: Number(maxExecutions),
            executed: Number(executionCount),
            interval: Number(recurringInterval),
            paused: isPaused,
            adapterType,
            amountPerExecution: Number(rewardPerExecution),
            nextExecution,
            expiresAt: Number(expiresAt),
          };
        } catch (err) {
          console.log(
            `[Tasks] Error fetching task ${taskId}:`,
            (err as Error).message,
          );
          return null;
        }
      }),
    );

    // Filter out nulls and return
    const validTasks = tasks.filter((t) => t !== null);

    res.json({
      address,
      tasks: validTasks,
      count: validTasks.length,
    });
  } catch (err: any) {
    console.error("[Tasks Error]", err.message);
    res.status(500).json({ error: err.message });
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
      explorerUrl: `${activeNetwork.explorer}/tx/${result.txHash}`,
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
      instructions:
        "Send ETH to payTo address, then retry with X-Payment-Tx header",
    });
    return;
  }

  // ---- x402: Verify payment ----
  try {
    const paid = await verifyPayment(
      provider,
      paymentTxHash,
      wallet.address,
      X402_FEE,
      X402_MIN_CONFIRMATIONS,
    );
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
    res
      .status(402)
      .json({ error: "Payment verification error: " + err.message });
    return;
  }

  // ---- Process task creation ----
  const { taskIntent, userAddress } = req.body;
  if (!taskIntent) {
    res.status(400).json({ error: "Missing taskIntent in body" });
    return;
  }

  try {
    const result = await submitTask(
      taskIntent as TaskIntent,
      userAddress || wallet.address,
    );
    res.json({
      success: true,
      paymentVerified: paymentTxHash,
      taskId: result.taskId,
      txHash: result.txHash,
      taskCore: result.taskCore,
      taskVault: result.taskVault,
      explorerUrl: `${activeNetwork.explorer}/tx/${result.txHash}`,
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
app.post(
  "/task/create-from-prompt-x402",
  async (req: Request, res: Response) => {
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
        instructions:
          "Send ETH to payTo address, then retry with X-Payment-Tx header",
      });
      return;
    }

    try {
      const paid = await verifyPayment(
        provider,
        paymentTxHash,
        wallet.address,
        X402_FEE,
        X402_MIN_CONFIRMATIONS,
      );
      if (!paid) {
        res
          .status(402)
          .json({ error: "Payment not confirmed", txHash: paymentTxHash });
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
      const result = await submitTask(
        taskIntent,
        userAddress || wallet.address,
      );

      res.json({
        success: true,
        paymentVerified: paymentTxHash,
        summary: taskIntent.summary,
        taskId: result.taskId,
        txHash: result.txHash,
        explorerUrl: `${activeNetwork.explorer}/tx/${result.txHash}`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ============================================================
// Core task submission logic
// ============================================================

async function buildTaskPayload(taskIntent: TaskIntent, userAddress: string) {
  if (!manifest.contracts?.TaskFactory) {
    throw new Error("TaskFactory not deployed. Run deployment script first.");
  }

  const latestBlock = await provider.getBlock("latest");
  const now = latestBlock?.timestamp ?? Math.floor(Date.now() / 1000);
  const abiCoder = new ethers.AbiCoder();
  const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10);

  let encodedParams: string;
  let tokenDeposits: { token: string; amount: string }[] = [];
  let adapterAddress: string;
  let maxExecutions = 1;
  let recurringInterval = 0;

  // Get adapter address helper
  const getAdapterAddress = (key: string) => {
    const adapter = manifest.adapters?.[key];
    return typeof adapter === "string" ? adapter : adapter?.address;
  };

  // Get token address helper
  const getTokenAddress = (tokenOrSymbol: string) => {
    if (ethers.isAddress(tokenOrSymbol)) return tokenOrSymbol;
    const tokenConfig =
      manifest.tokens?.[tokenOrSymbol] ||
      manifest.tokens?.[`Mock${tokenOrSymbol}`];
    return typeof tokenConfig === "string" ? tokenConfig : tokenConfig?.address;
  };

  switch (taskIntent.adapterType) {
    case "recurring_transfer": {
      const {
        token,
        recipient,
        amountPerExecution,
        startTime,
        interval,
        maxExecutions: maxExec,
        fundingMode,
        fundingSource,
      } = taskIntent.params;

      const tokenAddr = getTokenAddress(token);
      const totalAmount = BigInt(amountPerExecution) * BigInt(maxExec || 4);

      // Encode RecurringParams struct
      encodedParams = abiCoder.encode(
        [
          "tuple(address,address,uint256,uint256,uint256,uint256,uint8,address)",
        ],
        [
          [
            tokenAddr,
            recipient || userAddress,
            BigInt(amountPerExecution),
            BigInt(startTime || now + 60),
            BigInt(interval || 604800),
            BigInt(maxExec || 4),
            Number(fundingMode || 0),
            fundingMode === 1
              ? fundingSource || userAddress
              : ethers.ZeroAddress,
          ],
        ],
      );

      adapterAddress = getAdapterAddress("RecurringTransferAdapter");
      maxExecutions = Number(maxExec || 4);
      recurringInterval = Number(interval || 604800);

      // For VAULT mode (0), deposit total amount upfront
      if (Number(fundingMode || 0) === 0) {
        tokenDeposits = [{ token: tokenAddr, amount: totalAmount.toString() }];
      }
      break;
    }

    case "time_based_transfer": {
      const { token, recipient, amount, executeAfter } = taskIntent.params;
      const tokenAddr = getTokenAddress(token);
      encodedParams = abiCoder.encode(
        ["address", "address", "uint256", "uint256"],
        [
          tokenAddr,
          recipient || userAddress,
          BigInt(amount),
          BigInt(executeAfter || now + 300),
        ],
      );
      adapterAddress = getAdapterAddress("TimeBasedTransferAdapter");
      tokenDeposits = [{ token: tokenAddr, amount: amount.toString() }];
      break;
    }

    case "cctp_bridge": {
      const { token, amount, destinationDomain, mintRecipient, executeAfter } =
        taskIntent.params;
      const tokenAddr = getTokenAddress(token);
      const messenger =
        manifest.cctp?.MockTokenMessenger || taskIntent.params.cctpMessenger;
      const recipientBytes32 = ethers.zeroPadValue(
        mintRecipient || userAddress,
        32,
      );
      encodedParams = abiCoder.encode(
        ["address", "address", "uint256", "uint32", "bytes32", "uint256"],
        [
          messenger,
          tokenAddr,
          BigInt(amount),
          Number(destinationDomain || 0),
          recipientBytes32,
          BigInt(executeAfter || now + 600),
        ],
      );
      adapterAddress = getAdapterAddress("CCTPTransferAdapter");
      tokenDeposits = [{ token: tokenAddr, amount: amount.toString() }];
      break;
    }

    case "stork_price_transfer": {
      const { storkOracle, token, amount, targetPrice, isBelow, recipient } =
        taskIntent.params;
      const tokenAddr = getTokenAddress(token);
      const oracle = storkOracle || manifest.oracles?.MockStorkUSDC;
      encodedParams = abiCoder.encode(
        ["address", "address", "uint256", "int256", "bool", "address"],
        [
          oracle,
          tokenAddr,
          BigInt(amount),
          BigInt(targetPrice),
          Boolean(isBelow),
          recipient || userAddress,
        ],
      );
      adapterAddress = getAdapterAddress("StorkPriceTransferAdapter");
      tokenDeposits = [{ token: tokenAddr, amount: amount.toString() }];
      break;
    }

    default:
      throw new Error(`Unknown adapter type: ${taskIntent.adapterType}`);
  }

  if (!adapterAddress) {
    throw new Error(
      `Missing adapter address for ${taskIntent.adapterType}. Check manifest.`,
    );
  }

  let maxRewardCostPerExecution = TASK_REWARD_PER_EXECUTION;
  if (manifest.contracts?.RewardManager) {
    const rewardManager = new ethers.Contract(
      manifest.contracts.RewardManager,
      REWARD_MANAGER_ABI,
      provider,
    );
    maxRewardCostPerExecution = await rewardManager.getMaxRewardCost(
      TASK_REWARD_PER_EXECUTION,
    );
  }

  const taskParams = {
    expiresAt: now + 86400 * 90,
    maxExecutions,
    recurringInterval,
    rewardPerExecution: TASK_REWARD_PER_EXECUTION.toString(),
    seedCommitment: ethers.ZeroHash,
  };

  return {
    taskFactoryAddress: manifest.contracts.TaskFactory,
    taskParams,
    actions: [
      {
        selector: executeSelector,
        protocol: adapterAddress,
        params: encodedParams,
      },
    ],
    deposits: tokenDeposits,
    value: ethers.formatEther(
      maxRewardCostPerExecution * BigInt(maxExecutions || 1),
    ),
  };
}

async function submitTask(
  taskIntent: TaskIntent,
  userAddress: string,
): Promise<{
  taskId: string;
  txHash: string;
  taskCore: string;
  taskVault: string;
}> {
  if (!manifest.contracts?.TaskFactory) {
    throw new Error("TaskFactory not deployed. Run deploy-arc-full.ts first.");
  }

  const taskFactory = new ethers.Contract(
    manifest.contracts.TaskFactory,
    TASK_FACTORY_ABI,
    wallet,
  );
  const payload = await buildTaskPayload(taskIntent, userAddress);

  // Mint tokens if wallet balance is insufficient (testnet MockERC20)
  for (const deposit of payload.deposits) {
    const token = new ethers.Contract(deposit.token, ERC20_ABI, wallet);
    const needed = BigInt(deposit.amount);
    const balance = await token.balanceOf(wallet.address);
    if (balance < needed) {
      const mintTx = await token.mint(wallet.address, needed * 2n);
      await mintTx.wait();
      console.log(`[Task] Minted tokens for ${deposit.token}`);
    }
  }

  // Approve tokens if needed
  for (const deposit of payload.deposits) {
    const token = new ethers.Contract(deposit.token, ERC20_ABI, wallet);
    const allowance = await token.allowance(
      wallet.address,
      manifest.contracts.TaskFactory,
    );
    if (allowance < BigInt(deposit.amount)) {
      const approveTx = await token.approve(
        manifest.contracts.TaskFactory,
        ethers.MaxUint256,
      );
      await approveTx.wait();
      console.log(`[Task] Approved ${deposit.token}`);
    }
  }

  const tx = await taskFactory.createTaskWithTokens(
    payload.taskParams,
    payload.actions,
    payload.deposits,
    {
      value: ethers.parseEther(payload.value),
      gasLimit: 3000000,
    },
  );

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
  console.log(`   Network: ${activeNetwork.name} (${activeNetwork.chainId})`);
  console.log(`   Explorer: ${activeNetwork.explorer}`);
  console.log(`   x402 Fee: ${ethers.formatEther(X402_FEE)} ETH\n`);
  console.log("Endpoints:");
  console.log(`  GET  /health                          — health check`);
  console.log(`  GET  /manifest                        — protocol info`);
  console.log(`  GET  /tasks?address=0x...             — fetch user's tasks`);
  console.log(`  POST /faucet                          — request test tokens`);
  console.log(
    `  GET  /faucet/status?address=0x...     — check faucet cooldown`,
  );
  console.log(
    `  POST /task/preview                    — parse intent (no on-chain tx)`,
  );
  console.log(`  POST /task/create-from-prompt         — AI prompt → task`);
  console.log(
    `  POST /task/create                     — x402-gated task creation`,
  );
  console.log(`  POST /task/create-from-prompt-x402   — x402-gated AI prompt`);
});

export default app;
