import { ethers } from 'ethers';
import manifest from './manifest.json';
import * as readline from 'readline';
import { Mistral } from '@mistralai/mistralai';

// Initialize Mistral Client
const apiKey = process.env.MISTRAL_API_KEY || "MZQObVTrMQoqmADbPDgLpTxNwAg07FT7";
const client = new Mistral({ apiKey: apiKey });

// Using the generated wallet
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x5ad3af615c05ba41f877e6fe251039b5c66c3a858c7bf2c8d235fe1b9eabfd7f';
const RPC_URL = 'https://rpc.testnet.arc.network';
const CHAIN_ID = 5042002;

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const agentWallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log(`Agent started. Connected to ${manifest.network} (Chain ID: ${manifest.chainId})`);
console.log(`Wallet address: ${agentWallet.address}`);
async function mistralLLMParsing(intent: string, manifestContent: any): Promise<any> {
    

    const systemPrompt = `
You are the TaskerOnChain V2 AI Agent. Your job is to translate natural language intents into on-chain automation parameters.

Here is the protocol manifest containing all available conditions and actions:
${JSON.stringify(manifest, null, 2)}

When the user provides an intent, you must:
1. Identify the correct 'condition' and 'action' from the manifest.
2. Extract or infer the required parameters for both.
3. If amount is in dollars, convert it to 6 decimals (e.g. 200 -> 200000000). If threshold is in dollars, convert to 8 decimals (e.g. 2000 -> 200000000000).
4. Output ONLY a valid JSON object matching this schema, no markdown blocks, no other text:
{
  "summary": "A human-readable summary of what will happen",
  "condition": { "id": "...", "params": { ... } },
  "action": { "id": "...", "params": { ... } }
}
If you are missing critical information, use placeholders like '<USDC_ADDRESS>' which the backend will resolve via tools.
`;

    const chatResponse = await client.chat.complete({
        model: 'mistral-large-latest',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: intent }
        ],
        responseFormat: {
            type: "json_object"
        }
    });

    const content = chatResponse.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error("Failed to get response from Mistral AI.");
    }
    
    // Clean up potential markdown formatting if model didn't perfectly respect JSON mode
    let jsonStr = typeof content === 'string' ? content : JSON.stringify(content);
    if (typeof jsonStr === 'string' && jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n/g, '').replace(/\n```/g, '');
    }

    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        throw new Error(`Failed to parse JSON from Mistral AI. Content was: ${content}`);
    }
}

/**
 * Mock Web Search Tool (used to resolve placeholders like <ETH_USD_CHAINLINK_FEED>)
 */
async function resolvePlaceholder(placeholder: string, userAddress: string): Promise<string> {
    const mockDb: Record<string, string> = {
        "<ETH_USD_CHAINLINK_FEED>": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
        "<CURVE_USDC_EURC_POOL>": "0x1234567890123456789012345678901234567890", // Mock Pool
        "<CURVE_USDC_EURC_POOL_ADDRESS>": "0x1234567890123456789012345678901234567890", // Mock Pool
        "<EURC_ADDRESS>": "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", // Arc Testnet EURC
        "<USDC_ADDRESS>": "0x3600000000000000000000000000000000000000", // Arc Testnet USDC
        "<WALLET_ADDRESS>": userAddress,
        "<USER_WALLET_ADDRESS>": userAddress,
        "<USDC_PRICE_FEED_ADDRESS>": "0x8888888888888888888888888888888888888888",
        "<THRESHOLD_IN_USD_8_DECIMALS>": "100000000", // $1
        "<USDC_POOL_INDEX>": "0",
        "<EURC_POOL_INDEX>": "1",
        "<MIN_EURC_AMOUNT_OUT>": "9000000" // $9 with slippage
    };
    return mockDb[placeholder] || placeholder;
}

/**
 * Formulate and create automation transaction
 */
async function createAutomationTx(intent: string, walletAddress: string) {
    console.log(`\n🤖 Analyzing intent: "${intent}"`);

const systemPrompt = `
You are the TaskerOnChain V2 AI Agent. Your job is to translate natural language intents into on-chain automation parameters.

Here is the protocol manifest containing all available conditions and actions:
${JSON.stringify(manifest, null, 2)}

When the user provides an intent, you must:
1. Identify the correct 'condition' and 'action' from the manifest.
2. Extract or infer the required parameters for both.
3. If amount is in dollars, convert it to 6 decimals (e.g. 200 -> 200000000). If threshold is in dollars, convert to 8 decimals (e.g. 2000 -> 200000000000).
4. Output ONLY a valid JSON object matching this schema, no markdown blocks, no other text:
{
  "summary": "A human-readable summary of what will happen",
  "condition": { "id": "...", "params": { ... } },
  "action": { "id": "...", "params": { ... } }
}
If you are missing critical information, use placeholders like '<USDC_ADDRESS>' which the backend will resolve via tools.
`;

    // 1. LLM parses intent using the manifest and system prompt
    console.log(`\n🧠 Mistral AI is processing intent using the Manifest...`);
    let parsedData;
    try {
        parsedData = await mistralLLMParsing(intent, manifest);
    } catch (e: any) {
        console.log(`❌ ${e.message}`);
        return;
    }

    console.log(`\n💬 ${parsedData.summary}`);

    // 2. Resolve missing placeholders
    console.log(`\n🔍 Resolving missing on-chain addresses...`);
    for (const [key, value] of Object.entries(parsedData.condition.params)) {
        if (typeof value === 'string' && value.startsWith('<') && value.endsWith('>')) {
            parsedData.condition.params[key] = await resolvePlaceholder(value, walletAddress);
        }
    }
    for (const [key, value] of Object.entries(parsedData.action.params)) {
        if (typeof value === 'string' && value.startsWith('<') && value.endsWith('>')) {
            parsedData.action.params[key] = await resolvePlaceholder(value, walletAddress);
        }
    }

    // 3. Match against Manifest to get addresses
    const conditionManifest = manifest.conditions.find(c => c.id === parsedData.condition.id);
    const actionManifest = manifest.actions.find(a => a.id === parsedData.action.id);

    if (!conditionManifest || !actionManifest) {
        console.log(`❌ Failed to match parsed intent to manifest.`);
        return;
    }

    console.log(`\n⚙️  Constructing Calldata...`);
    console.log(`Condition Contract (${parsedData.condition.id}): ${conditionManifest.address}`);
    console.log(`Params:`, parsedData.condition.params);
    
    console.log(`Action Contract (${parsedData.action.id}): ${actionManifest.address}`);
    console.log(`Params:`, parsedData.action.params);

    // In a real scenario, we would use abiCoder.encode() using the types from the manifest
    console.log(`\n✅ Ready for MetaMask Signature! (One click to deploy)`);
}

// Simple CLI for interaction
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const mockWallet = ethers.Wallet.createRandom();

function promptUser() {
    console.log('\n=============================================');
    rl.question('Type your intent (e.g. "buy $200 ETH on Uniswap if price drops below $2000")\n> ', async (answer) => {
        if (answer.toLowerCase() === 'exit' || !answer) {
            rl.close();
            return;
        }
        await createAutomationTx(answer, mockWallet.address);
        
        // If not running in TTY (like echo pipeline), exit after one command
        if (!process.stdin.isTTY) {
            rl.close();
            return;
        }
        setTimeout(promptUser, 1000);
    });
}

promptUser();
