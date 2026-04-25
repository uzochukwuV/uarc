import { ethers } from 'ethers';
import manifest from './manifest.json';
import * as readline from 'readline';

// Note: In production, you would use an LLM API like OpenAI or Anthropic.
// We're mocking the LLM call here to demonstrate the parsing flow locally.
async function mockLLMParsing(intent: string, manifestContent: any): Promise<any> {
    const lowerIntent = intent.toLowerCase();

    // 1. Parsing "buy $200 ETH on Uniswap if price drops below $2000"
    if (lowerIntent.includes('uniswap') && lowerIntent.includes('price drops')) {
        return {
            summary: "I'll buy $200 ETH via Uniswap when ETH drops below $2000. Max spend: $200. My fee: $0.002 per execution. Confirm?",
            condition: {
                id: "price_below",
                params: {
                    priceFeed: "<ETH_USD_CHAINLINK_FEED>",
                    threshold: ethers.parseUnits('2000', 8).toString() // Assuming 8 decimals for USD feeds
                }
            },
            action: {
                id: "uniswap_swap",
                params: {
                    poolId: "<ETH_USDC_UNISWAP_POOL_ID>",
                    amountIn: ethers.parseUnits('200', 6).toString(), // USDC has 6 decimals
                    tokenOut: "<WETH_ADDRESS>",
                    minAmountOut: "0" // For simplicity
                }
            }
        };
    }

    // 2. Parsing "lend my USDC on Aave if my wallet balance goes above 500"
    if (lowerIntent.includes('aave') && lowerIntent.includes('balance goes above')) {
        return {
            summary: "I'll lend 500 USDC on Aave when your wallet balance goes above 500 USDC. My fee: $0.002 per execution. Confirm?",
            condition: {
                id: "balance_above",
                params: {
                    wallet: "<USER_WALLET_ADDRESS>",
                    token: "<USDC_ADDRESS>",
                    threshold: ethers.parseUnits('500', 6).toString()
                }
            },
            action: {
                id: "aave_lend",
                params: {
                    asset: "<USDC_ADDRESS>",
                    amount: ethers.parseUnits('500', 6).toString(),
                    onBehalfOf: "<USER_WALLET_ADDRESS>"
                }
            }
        };
    }

    throw new Error("I couldn't parse that intent. Please try something like 'buy $200 ETH on Uniswap if price drops below $2000'.");
}

/**
 * Mock Web Search Tool (used to resolve placeholders like <ETH_USD_CHAINLINK_FEED>)
 */
async function resolvePlaceholder(placeholder: string, userAddress: string): Promise<string> {
    const mockDb: Record<string, string> = {
        "<ETH_USD_CHAINLINK_FEED>": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
        "<ETH_USDC_UNISWAP_POOL_ID>": "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8000000000000000000000000",
        "<WETH_ADDRESS>": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "<USDC_ADDRESS>": "0x3600000000000000000000000000000000000000",
        "<USER_WALLET_ADDRESS>": userAddress
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
3. Output a valid JSON object matching this schema:
{
  "summary": "A human-readable summary of what will happen",
  "condition": { "id": "...", "params": { ... } },
  "action": { "id": "...", "params": { ... } }
}
If you are missing critical information, use placeholders like '<USDC_ADDRESS>' which the backend will resolve via tools.
`;

    // 1. LLM parses intent using the manifest and system prompt
    console.log(`\n🧠 LLM is processing intent using the Manifest...`);
    let parsedData;
    try {
        parsedData = await mockLLMParsing(intent, manifest);
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
