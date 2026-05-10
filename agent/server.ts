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
import { parseIntent, TaskIntent } from "./ai-task-creator";
import { verifyPayment, X402PaymentRequired } from "./x402";
import cors from "cors";
import {
  connectDB,
  processChat,
  getUserSessions,
  saveChatTurn,
  createSession,
  updateSessionTitle,
  deleteSession,
  getChatHistory,
} from "./chat-handler";
import { configDotenv } from "dotenv";
configDotenv();

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
  "";
const MISTRAL_API_KEY =
  process.env.MISTRAL_API_KEY || "";
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/uarc";

// x402 fee: 0.0001 ETH per task creation
const X402_FEE = ethers.parseEther("0.0001");
const X402_MIN_CONFIRMATIONS = 1;
const TASK_REWARD_PER_EXECUTION = ethers.parseEther("0.0002");

// Faucet limits
const FAUCET_AMOUNT = ethers.parseUnits("1000", 6); // 1000 tokens per request
const FAUCET_GAS_TARGET = ethers.parseEther("0.0002"); // enough Base Sepolia ETH for roughly 10 txs
const FAUCET_COOLDOWN = 3600 * 1000; // 1 hour cooldown
const faucetCooldowns: Map<string, number> = new Map();


type ChatUiMessage = {
  role: "assistant" | "system";
  kind: string;
  content?: string;
  title?: string;
  lines?: Array<{ k: string; v: string; emphasis?: boolean; editable?: boolean }>;
  calendarData?: Array<{
    index: number;
    timestamp: number;
    isoDate: string;
    isPast: boolean;
    isNext: boolean;
  }> | null;
  footnote?: string;
  suggestions?: string[];
};

type PendingChatPreview = {
  taskPreview: {
    success?: boolean;
    summary: string;
    adapterType: string;
    params: Record<string, any>;
    payload?: any;
  };
  conversationHistory: Array<{ role: string; content: string }>;
  originalIntent: string;
  userAddress?: string;
};

const pendingChatPreviews = new Map<string, PendingChatPreview>();

const ADAPTER_LABELS: Record<string, string> = {
  time_based_transfer: "Scheduled Transfer",
  cctp_bridge: "Cross-chain Bridge",
  stork_price_transfer: "Price-triggered Transfer",
  recurring_transfer: "Recurring Payment",
  uniswap_dca: "DCA Swap",
  uniswap_limit_order: "Limit Order",
};
const DOMAIN_NAMES: Record<number, string> = { 0: "Ethereum", 1: "Avalanche", 2: "OP Mainnet", 3: "Arbitrum", 6: "Base" };
const INTERVAL_LABELS: Record<number, string> = { 86400: "Daily", 604800: "Weekly", 2592000: "Monthly" };
const FUNDING_MODES: Record<number, string> = { 0: "Vault (Deposit)", 1: "Pull (Subscription)" };

function fmt6(v: any): string {
  const n = Number(v || 0) / 1e6;
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function fmtAddr(a: any): string {
  const s = String(a || "");
  return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s || "—";
}

function buildReceiptLines(data: { adapterType: string; params: Record<string, any> }) {
  const { adapterType, params } = data;
  switch (adapterType) {
    case "recurring_transfer": {
      const total = BigInt(params.amountPerExecution || 0) * BigInt(params.maxExecutions || 1);
      return [
        { k: "Type", v: "Recurring transfer", emphasis: true },
        { k: "Token", v: String(params.token || "USDC") },
        { k: "Per payment", v: `${fmt6(params.amountPerExecution)} tokens` },
        { k: "Recipient", v: fmtAddr(params.recipient) },
        { k: "Schedule", v: INTERVAL_LABELS[Number(params.interval)] || `Every ${params.interval}s` },
        { k: "Executions", v: String(params.maxExecutions || 1) },
        { k: "Total deposit", v: `${fmt6(total.toString())} tokens` },
        { k: "Funding", v: FUNDING_MODES[Number(params.fundingMode || 0)] || "Vault" },
      ];
    }
    case "time_based_transfer":
      return [
        { k: "Type", v: "Scheduled transfer", emphasis: true },
        { k: "Amount", v: `${fmt6(params.amount)} tokens` },
        { k: "Recipient", v: fmtAddr(params.recipient) },
        { k: "Execute after", v: new Date(Number(params.executeAfter || 0) * 1000).toLocaleString() },
      ];
    case "cctp_bridge":
      return [
        { k: "Type", v: "CCTP bridge", emphasis: true },
        { k: "Amount", v: `${fmt6(params.amount)} USDC` },
        { k: "Destination", v: DOMAIN_NAMES[Number(params.destinationDomain)] || `Domain ${params.destinationDomain}` },
        { k: "Recipient", v: fmtAddr(params.mintRecipient) },
      ];
    case "stork_price_transfer":
      return [
        { k: "Type", v: "Price-triggered transfer", emphasis: true },
        { k: "Amount", v: `${fmt6(params.amount)} tokens` },
        { k: "Trigger", v: `Price ${params.isBelow ? "≤" : "≥"} $${(Number(params.targetPrice) / 1e8).toLocaleString()}` },
        { k: "Recipient", v: fmtAddr(params.recipient) },
      ];
    case "uniswap_dca":
      return [
        { k: "Type", v: "DCA swap", emphasis: true },
        { k: "Per swap", v: `${fmt6(params.amountPerSwap)} input tokens` },
        { k: "Schedule", v: INTERVAL_LABELS[Number(params.interval)] || `Every ${params.interval}s` },
        { k: "Swaps", v: String(params.totalSwaps || 1) },
        { k: "Recipient", v: params.recipient ? fmtAddr(params.recipient) : "Connected wallet" },
      ];
    case "uniswap_limit_order":
      return [
        { k: "Type", v: "Limit order", emphasis: true },
        { k: "Amount in", v: `${fmt6(params.amountIn)} input tokens` },
        { k: "Order type", v: ["Limit buy", "Limit sell", "Stop loss", "Take profit"][Number(params.orderType || 0)] || "Limit" },
        { k: "Recipient", v: params.recipient ? fmtAddr(params.recipient) : "Connected wallet" },
      ];
    default:
      return [{ k: "Type", v: adapterType, emphasis: true }];
  }
}

function buildCalendarData(params: Record<string, any>) {
  const startTime = Number(params.startTime || Math.floor(Date.now() / 1000));
  const interval = Number(params.interval || 604800);
  const maxExecutions = Number(params.maxExecutions || params.totalSwaps || 4);
  return Array.from({ length: maxExecutions }, (_, index) => {
    const timestamp = startTime + index * interval;
    return {
      index,
      timestamp,
      isoDate: new Date(timestamp * 1000).toISOString(),
      isPast: timestamp * 1000 < Date.now(),
      isNext: index === 0,
    };
  });
}

function buildPreviewMessages(taskPreview: TaskIntent): ChatUiMessage[] {
  const label = ADAPTER_LABELS[taskPreview.adapterType] || taskPreview.adapterType;
  const isRecurring = taskPreview.adapterType === "recurring_transfer" || taskPreview.adapterType === "uniswap_dca";
  return [
    { role: "assistant", kind: "text", content: `Got it — ${taskPreview.summary}. Here's the task to review before deploying.` },
    {
      role: "assistant",
      kind: taskPreview.adapterType === "recurring_transfer" ? "recurring-preview" : "receipt",
      title: `New automation · ${label}`,
      lines: buildReceiptLines(taskPreview),
      calendarData: isRecurring ? buildCalendarData(taskPreview.params) : null,
      footnote: `Adapter: ${taskPreview.adapterType} · ${activeNetwork.name}`,
    },
    { role: "assistant", kind: "confirm-cta" },
  ];
}

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

const UNISWAP_LIMIT_ORDER_ADAPTER_ABI = [
  "function getCurrentPrice(address tokenIn,address tokenOut,uint24 fee) external view returns (uint256)",
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

    // Mint tokens directly to user (testnet mock tokens have public mint)
    let tx;
    try {
      tx = await tokenContract.mint(address, FAUCET_AMOUNT);
      await tx.wait();
      console.log(`[Faucet] Minted 1000 ${token} to ${address} - tx: ${tx.hash}`);
    } catch (mintErr: any) {
      // Fallback to transfer if mint fails (maybe mint is restricted)
      console.log(`[Faucet] Mint failed, trying transfer: ${mintErr.message}`);
      const deployerBalance = await tokenContract.balanceOf(wallet.address);
      if (deployerBalance < FAUCET_AMOUNT) {
        res.status(503).json({ error: "Faucet empty. Contact admin." });
        return;
      }
      tx = await tokenContract.transfer(address, FAUCET_AMOUNT);
      await tx.wait();
      console.log(`[Faucet] Transferred 1000 ${token} to ${address} - tx: ${tx.hash}`);
    }

    // Top up Base Sepolia ETH only when the user cannot cover a small batch of txs.
    let ethTxHash = null;
    let ethAmount = "0";
    try {
      const userEthBalance = await provider.getBalance(address);

      if (userEthBalance < FAUCET_GAS_TARGET) {
        const ethTopUp = FAUCET_GAS_TARGET - userEthBalance;
        const serverBalance = await provider.getBalance(wallet.address);
        if (serverBalance > ethTopUp * 2n) {
          const ethTx = await wallet.sendTransaction({
            to: address,
            value: ethTopUp,
          });
          await ethTx.wait();
          ethTxHash = ethTx.hash;
          ethAmount = ethers.formatEther(ethTopUp);
          console.log(`[Faucet] Topped up ${ethAmount} ETH to ${address} for gas - tx: ${ethTx.hash}`);
        }
      }
    } catch (ethErr: any) {
      console.log(`[Faucet] ETH drip skipped: ${ethErr.message}`);
    }

    // Set cooldown
    faucetCooldowns.set(address.toLowerCase(), Date.now());

    res.json({
      success: true,
      token,
      amount: "1000",
      recipient: address,
      txHash: tx.hash,
      ethTxHash,
      ethAmount: ethTxHash ? ethAmount : null,
      gasTarget: ethers.formatEther(FAUCET_GAS_TARGET),
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
    gasTarget: ethers.formatEther(FAUCET_GAS_TARGET),
    supportedTokens: ["USDC", "USDT"],
  });
});

// ============================================================
// Chat Endpoints (Conversational AI with history)
// ============================================================

/**
 * POST /chat — Send a message and get AI response
 * Body: { message: string, sessionId?: string, userAddress?: string }
 * Returns conversational response or automation intent
 */
app.post("/chat", async (req: Request, res: Response) => {
  const { message, sessionId, userAddress } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing 'message' string in body" });
    return;
  }

  try {
    const activeSessionId = sessionId || (await createSession(userAddress));

    // Single AI call handles classification + task parsing + missing field detection
    const response = await processChat(message, activeSessionId, manifest, MISTRAL_API_KEY, userAddress);

    let taskPreview: TaskIntent | null = null;
    let messages: ChatUiMessage[] = [];

    if (response.type === "automation" && response.automationIntent) {
      const intent = response.automationIntent as TaskIntent;

      // Still missing required fields — ask the single next question
      if (response.missingFields?.length && response.nextQuestion) {
        await saveChatTurn(activeSessionId, message, response.nextQuestion, userAddress, "text");
        res.json({
          success: true,
          sessionId: activeSessionId,
          type: "chat",
          message: response.nextQuestion,
          messages: [{ role: "assistant", kind: "text", content: response.nextQuestion }],
        });
        return;
      }

      // All fields present — build payload and show preview
      try {
        const payload = await buildTaskPayload(intent, userAddress || wallet.address);
        taskPreview = { ...intent, params: { ...intent.params, ...payload } } as any;
        // Store the real payload separately so confirm() can use it
        pendingChatPreviews.set(activeSessionId, {
          taskPreview: { ...intent, payload },
          conversationHistory: [],
          originalIntent: message,
          userAddress,
        });
        messages = buildPreviewMessages(intent);
      } catch (err: any) {
        console.log("[Chat] buildTaskPayload failed:", err.message);
        messages = [{ role: "assistant", kind: "text", content: response.message }];
      }
    } else {
      messages = [{ role: "assistant", kind: "text", content: response.message, suggestions: response.suggestions }];
    }

    // Determine pendingPreview for the frontend confirm() button
    const pending = pendingChatPreviews.get(activeSessionId);

    res.json({
      success: true,
      sessionId: activeSessionId,
      type: response.type,
      message: response.message,
      suggestions: response.suggestions,
      taskPreview,
      pendingPreview: pending?.taskPreview ?? null,
      messages,
    });
  } catch (err: any) {
    console.error("[Chat Error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /chat/history — Get chat history for a session
 * Query: ?sessionId=xxx&limit=50
 */
app.get("/chat/history", async (req: Request, res: Response) => {
  const { sessionId, limit } = req.query;

  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "Missing sessionId query parameter" });
    return;
  }

  try {
    const history = await getChatHistory(sessionId, Number(limit) || 50);
    res.json({ sessionId, messages: history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /chat/sessions — Get all sessions for a user
 * Query: ?userAddress=0x...&limit=20
 */
app.get("/chat/sessions", async (req: Request, res: Response) => {
  const { userAddress, limit } = req.query;

  if (!userAddress || typeof userAddress !== "string") {
    res.status(400).json({ error: "Missing userAddress query parameter" });
    return;
  }

  try {
    const sessions = await getUserSessions(userAddress, Number(limit) || 20);
    res.json({ userAddress, sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /chat/session — Create a new chat session
 * Body: { userAddress?: string, title?: string }
 */
app.post("/chat/session", async (req: Request, res: Response) => {
  const { userAddress, title } = req.body;

  try {
    console.log(`[Chat] Creating session for ${userAddress} with title "${title}"`);
    const sessionId = await createSession(userAddress, title);
    res.json({ success: true, sessionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /chat/session/:sessionId — Delete a session
 */
app.delete("/chat/session/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;

  try {
    await deleteSession(sessionId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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
              : protocol === manifest.adapters?.UniswapV3DCAAdapter?.address
              ? "uniswap_dca"
              : protocol === manifest.adapters?.UniswapV3LimitOrderAdapter?.address
              ? "uniswap_limit_order"
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
    const symbol = String(tokenOrSymbol);
    if (/^0x[0-9a-fA-F]{40}$/.test(symbol)) return symbol;
    const normalized = symbol.toUpperCase();
    if (normalized === "ETH") {
      return manifest.tokens?.WETH?.address || manifest.tokens?.WETH;
    }
    const tokenConfig =
      manifest.tokens?.[symbol] ||
      manifest.tokens?.[normalized] ||
      manifest.tokens?.[`Mock${symbol}`];
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

    case "uniswap_dca": {
      const {
        taskId,
        tokenIn,
        tokenOut,
        fee,
        amountPerSwap,
        interval,
        totalSwaps,
        minAmountOut,
        recipient,
      } = taskIntent.params;

      const tokenInAddr = getTokenAddress(tokenIn || "USDC");
      const tokenOutAddr = getTokenAddress(tokenOut || "WETH");
      const swaps = Number(totalSwaps || 1);
      const perSwap = BigInt(amountPerSwap || "1000000");
      const dcaTaskId =
        taskId ||
        ethers.keccak256(
          ethers.solidityPacked(
            ["string", "address", "uint256", "uint256"],
            ["uarc-ai-dca", userAddress, BigInt(activeNetwork.chainId), BigInt(Date.now())],
          ),
        );

      encodedParams = abiCoder.encode(
        ["bytes32", "address", "address", "uint24", "uint256", "uint256", "uint256", "uint256", "address"],
        [
          dcaTaskId,
          tokenInAddr,
          tokenOutAddr,
          Number(fee || 3000),
          perSwap,
          BigInt(interval || 86400),
          BigInt(swaps),
          BigInt(minAmountOut || 0),
          recipient && recipient !== ethers.ZeroAddress ? recipient : userAddress,
        ],
      );

      adapterAddress = getAdapterAddress("UniswapV3DCAAdapter");
      maxExecutions = swaps;
      recurringInterval = Number(interval || 86400);
      tokenDeposits = [
        {
          token: tokenInAddr,
          amount: (perSwap * BigInt(swaps || 1)).toString(),
        },
      ];
      break;
    }

    case "uniswap_limit_order": {
      const {
        orderId,
        tokenIn,
        tokenOut,
        fee,
        amountIn,
        targetPrice,
        orderType,
        minAmountOut,
        recipient,
        expiry,
      } = taskIntent.params;

      const tokenInAddr = getTokenAddress(tokenIn || "USDC");
      const tokenOutAddr = getTokenAddress(tokenOut || "WETH");
      const poolFee = Number(fee || 3000);
      const adapter = getAdapterAddress("UniswapV3LimitOrderAdapter");
      let resolvedTargetPrice = targetPrice ? BigInt(targetPrice) : 0n;

      if (resolvedTargetPrice === 0n) {
        const limitAdapter = new ethers.Contract(
          adapter,
          UNISWAP_LIMIT_ORDER_ADAPTER_ABI,
          provider,
        );
        const currentPrice: bigint = await limitAdapter.getCurrentPrice(
          tokenInAddr,
          tokenOutAddr,
          poolFee,
        );
        // For test / generic buy orders, make the condition immediately executable.
        resolvedTargetPrice = currentPrice * 2n;
      }

      const resolvedOrderId =
        orderId ||
        ethers.keccak256(
          ethers.solidityPacked(
            ["string", "address", "uint256", "uint256"],
            ["uarc-ai-limit", userAddress, BigInt(activeNetwork.chainId), BigInt(Date.now())],
          ),
        );
      const rawAmountIn = BigInt(amountIn || "1000000");

      encodedParams = abiCoder.encode(
        ["bytes32", "address", "address", "uint24", "uint256", "uint256", "uint8", "uint256", "address", "uint256"],
        [
          resolvedOrderId,
          tokenInAddr,
          tokenOutAddr,
          poolFee,
          rawAmountIn,
          resolvedTargetPrice,
          Number(orderType ?? 0),
          BigInt(minAmountOut || 0),
          recipient && recipient !== ethers.ZeroAddress ? recipient : userAddress,
          BigInt(expiry || 0),
        ],
      );

      adapterAddress = adapter;
      tokenDeposits = [{ token: tokenInAddr, amount: rawAmountIn.toString() }];
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

    // Connect to MongoDB before starting server

     connectDB(MONGODB_URI)
    .then(() => console.log("[MongoDB] Connected"))
    .catch((err) => console.warn("[MongoDB] Connection failed, chat history disabled:", err.message));

 
  console.log(`\n🤖 UARC Agent Server running on http://localhost:${PORT}`);
  console.log(`   Wallet: ${wallet.address}`);
  console.log(`   Network: ${activeNetwork.name} (${activeNetwork.chainId})`);
  console.log(`   Explorer: ${activeNetwork.explorer}`);
  console.log(`   x402 Fee: ${ethers.formatEther(X402_FEE)} ETH\n`);
  console.log("Endpoints:");
  console.log(`  GET  /health                          — health check`);
  console.log(`  GET  /manifest                        — protocol info`);
  console.log(`  POST /chat                            — conversational AI chat`);
  console.log(`  GET  /chat/history?sessionId=...      — get chat history`);
  console.log(`  GET  /chat/sessions?userAddress=...   — get user sessions`);
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
