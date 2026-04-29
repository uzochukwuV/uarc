/**
 * AI Task Creator — Mistral AI integration
 * Parses natural language intents into structured UARC task parameters
 *
 * Supported task types:
 * - time_based_transfer: Transfer USDC/EURO at a specific time
 * - cctp_bridge: Bridge tokens cross-chain via Circle CCTP
 * - stork_price_transfer: Transfer tokens when price condition is met
 */

import { ethers } from "ethers";

export interface TaskIntent {
    summary: string;
    adapterType: "time_based_transfer" | "cctp_bridge" | "stork_price_transfer" | "recurring_transfer";
    params: Record<string, any>;
}

const SYSTEM_PROMPT = (manifest: any) => `
You are UARC — a Universal Automation agent on the Arc blockchain.
Your job is to parse natural language intents into structured on-chain automation task parameters.

PROTOCOL MANIFEST:
${JSON.stringify(manifest, null, 2)}

ADAPTER TYPES AND PARAMETERS:

1. recurring_transfer — Recurring token transfers (weekly, monthly, etc.) ⭐ PREFERRED FOR RECURRING PAYMENTS
   Params: {
     token: address,
     recipient: address,
     amountPerExecution: uint256 (raw, 6 decimals for stablecoins),
     startTime: unix_timestamp,
     interval: seconds (86400=daily, 604800=weekly, 2592000=monthly),
     maxExecutions: number (total times to execute, e.g. 10 for "10 weeks"),
     fundingMode: 0 (VAULT - deposit upfront) or 1 (PULL - authorize adapter to pull each time),
     fundingSource: address (user's wallet for PULL mode)
   }
   Examples:
   - "send 50 USDC to alice.eth weekly" → recurring_transfer with interval=604800
   - "pay 100 USDT monthly for 6 months" → recurring_transfer with interval=2592000, maxExecutions=6
   - "transfer $25 daily to 0x123..." → recurring_transfer with interval=86400

2. time_based_transfer — One-time transfer after a timestamp
   Params: { token: address, recipient: address, amount: uint256 (raw, 6 decimals), executeAfter: unix_timestamp }
   Example: "send 100 USDC to 0x123... in 1 hour"

3. cctp_bridge — Cross-chain USDC bridge via Circle CCTP
   Params: { token: address, amount: uint256 (raw, 6 decimals), destinationDomain: number, mintRecipient: address, executeAfter: unix_timestamp }
   Domain IDs: 0=Ethereum, 1=Avalanche, 2=OP Mainnet, 3=Arbitrum, 6=Base
   Example: "bridge 50 USDC to Ethereum in 30 minutes"

4. stork_price_transfer — Transfer tokens when price condition met
   Params: { storkOracle?: address, token: address, amount: uint256 (raw, 6 decimals), targetPrice: int256 (8 decimals), isBelow: bool, recipient: address }
   Example: "transfer 100 USDC when price drops below $0.99"

IMPORTANT: Use recurring_transfer for ANY intent involving regular/scheduled payments like "weekly", "monthly", "every X days", "subscription", etc.

TOKEN ADDRESSES (from manifest):
- USDC: ${manifest.tokens?.MockUSDC || "<USDC_ADDRESS>"}
- EURO: ${manifest.tokens?.MockEURO || "<EURO_ADDRESS>"}

ORACLE ADDRESSES (from manifest):
- USDC/USD: ${manifest.oracles?.MockStorkUSDC || "<STORK_USDC>"}
- EURO/USD: ${manifest.oracles?.MockStorkEURO || "<STORK_EURO>"}

RULES:
1. Convert dollar amounts to 6-decimal integers (e.g., 100 USDC = 100000000)
2. Convert price targets to 8-decimal integers (e.g., $0.99 = 99000000)
3. Convert relative time to absolute unix timestamp (current time + offset)
4. Use manifest token addresses for USDC and EURO
5. Output ONLY valid JSON, no markdown, no explanation

OUTPUT FORMAT (JSON):
{
  "summary": "Human-readable summary",
  "adapterType": "time_based_transfer" | "cctp_bridge" | "stork_price_transfer",
  "params": { ...adapter-specific params... }
}
`;

async function createMistralClient(apiKey: string) {
    const importer = new Function("specifier", "return import(specifier)");
    const { Mistral } = await importer("@mistralai/mistralai");
    return new Mistral({ apiKey });
}

/**
 * Parse natural language intent into structured task parameters using Mistral AI
 */
export async function parseIntent(
    intent: string,
    manifest: any,
    apiKey: string
): Promise<TaskIntent> {
    const client = await createMistralClient(apiKey);

    const currentTime = Math.floor(Date.now() / 1000);

    const userMessage = `
Current unix timestamp: ${currentTime}
Current time: ${new Date().toISOString()}

User intent: "${intent}"

Parse this intent into UARC task parameters. Return only valid JSON.
`;

    const response = await client.chat.complete({
        model: "mistral-large-latest",
        messages: [
            { role: "system", content: SYSTEM_PROMPT(manifest) },
            { role: "user", content: userMessage },
        ],
        responseFormat: { type: "json_object" },
        temperature: 0.1, // Low temperature for consistent structured output
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("Mistral AI returned empty response");
    }

    const raw = typeof content === "string" ? content : JSON.stringify(content);

    let parsed: TaskIntent;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`Mistral returned invalid JSON: ${raw.slice(0, 200)}`);
    }

    // Validate required fields
    if (!parsed.adapterType) {
        throw new Error("AI did not identify adapter type");
    }
    if (!parsed.params) {
        throw new Error("AI did not provide params");
    }

    // Fill in defaults for missing fields
    parsed = applyDefaults(parsed, manifest, currentTime);

    return parsed;
}

function applyDefaults(intent: TaskIntent, manifest: any, now: number): TaskIntent {
    const params = { ...intent.params };

    // Default token addresses from manifest
    const usdcAddress = manifest.tokens?.MockUSDC?.address || manifest.tokens?.MockUSDC;
    const usdtAddress = manifest.tokens?.MockUSDT?.address || manifest.tokens?.MockUSDT;
    const euroAddress = manifest.tokens?.MockEURO?.address || manifest.tokens?.MockEURO;

    switch (intent.adapterType) {
        case "recurring_transfer":
            if (!params.token && usdcAddress) params.token = usdcAddress;
            if (!params.startTime) params.startTime = now + 60; // Start in 1 minute
            if (!params.interval) params.interval = 604800; // Default: weekly
            if (!params.maxExecutions) params.maxExecutions = 4; // Default: 4 executions
            if (!params.amountPerExecution) params.amountPerExecution = "50000000"; // 50 USDC
            if (params.fundingMode === undefined) params.fundingMode = 0; // VAULT mode default
            if (!params.fundingSource) params.fundingSource = ethers.ZeroAddress;
            break;

        case "time_based_transfer":
            if (!params.token && usdcAddress) params.token = usdcAddress;
            if (!params.executeAfter) params.executeAfter = now + 300; // 5 min
            if (!params.amount) params.amount = "1000000"; // 1 USDC
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
            if (params.targetPrice === undefined) params.targetPrice = "95000000"; // $0.95
            if (params.isBelow === undefined) params.isBelow = false; // above by default
            break;
    }

    // Detect EURO intent
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

/**
 * Build a task creation summary for logging/display
 */
export function formatTaskSummary(intent: TaskIntent): string {
    const { adapterType, params, summary } = intent;

    let details = "";
    switch (adapterType) {
        case "recurring_transfer":
            const intervalDays = Number(params.interval) / 86400;
            const intervalStr = intervalDays >= 30 ? "monthly" : intervalDays >= 7 ? "weekly" : `every ${intervalDays} days`;
            const fundingStr = params.fundingMode === 1 ? "PULL from wallet" : "VAULT deposit";
            details = `${Number(params.amountPerExecution) / 1e6} tokens ${intervalStr} × ${params.maxExecutions} times (${fundingStr})`;
            break;
        case "time_based_transfer":
            details = `Transfer ${Number(params.amount) / 1e6} tokens at ${new Date(Number(params.executeAfter) * 1000).toISOString()}`;
            break;
        case "cctp_bridge":
            details = `Bridge ${Number(params.amount) / 1e6} tokens to domain ${params.destinationDomain}`;
            break;
        case "stork_price_transfer":
            details = `Transfer ${Number(params.amount) / 1e6} tokens when price ${params.isBelow ? "<" : ">="} $${Number(params.targetPrice) / 1e8}`;
            break;
    }

    return `${summary}\n  Adapter: ${adapterType}\n  Details: ${details}`;
}
