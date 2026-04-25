import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { Mistral } from '@mistralai/mistralai';

// Load manifest
const manifestPath = path.join(__dirname, "../agent/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// Setup Network and Wallet
const RPC_URL = 'http://127.0.0.1:8545';
const CHAIN_ID = 31337; // Hardhat local chain ID
const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Setup Mistral AI
const apiKey = process.env.MISTRAL_API_KEY || "MZQObVTrMQoqmADbPDgLpTxNwAg07FT7";
const client = new Mistral({ apiKey: apiKey });

// ERC20 ABI
const erc20Abi = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

const taskFactoryAbi = [
    "function createTaskWithTokens((uint16 maxExecutions, uint64 expiresAt, uint256 rewardPerExecution, bytes32 seedCommitment) taskParams, (bytes4 selector, address protocol, bytes params)[] actions, (address token, uint256 amount)[] deposits) external payable returns (uint256 taskId)"
];

async function mistralLLMParsing(intent: string): Promise<any> {
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
    if (!content) throw new Error("Failed to get response from Mistral AI.");
    
    let jsonStr = typeof content === 'string' ? content : JSON.stringify(content);
    if (typeof jsonStr === 'string' && jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n/g, '').replace(/\n```/g, '');
    }

    return JSON.parse(jsonStr);
}

async function resolvePlaceholder(placeholder: string, userAddress: string): Promise<string> {
    const mockDb: Record<string, string> = {
        "<USDC_ADDRESS>": "0x3600000000000000000000000000000000000000",
        "<EURC_ADDRESS>": "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        "<STORK_ORACLE_ADDRESS>": "0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62",
        "<CCTP_MESSENGER_ADDRESS>": "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
        "<WALLET_ADDRESS>": userAddress,
        "<RECIPIENT_ADDRESS>": "0x1111111111111111111111111111111111111111", // Dummy recipient
        "<DESTINATION_DOMAIN>": "0", // Ethereum
        "<MINT_RECIPIENT>": "0x0000000000000000000000001111111111111111111111111111111111111111", // Bytes32 format
        "<THRESHOLD_USD>": "100000000" // 1 USD (Stork uses 8 decimals)
    };
    return mockDb[placeholder] || placeholder;
}

async function main() {
    console.log("--------------------------------------------------");
    console.log("🚀 STARTING LIVE AI AUTOMATION ON ARC TESTNET");
    console.log("--------------------------------------------------");
    console.log(`Wallet Address: ${wallet.address}`);
    
    const nativeBalance = await provider.getBalance(wallet.address);
    console.log(`Native Balance: ${ethers.formatEther(nativeBalance)} USDC (Gas Token)`);

    const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
    const usdc = new ethers.Contract(USDC_ADDRESS, erc20Abi, wallet);
    const usdcBalance = await usdc.balanceOf(wallet.address);
    console.log(`ERC20 Balance:  ${ethers.formatUnits(usdcBalance, 6)} USDC (Token representation)`);

    if (usdcBalance < ethers.parseUnits("1", 6)) {
        console.error("❌ Not enough ERC20 USDC to perform a transfer! Please check faucet.");
        process.exit(1);
    }

    // 1. Define Intent
    const intent = "transfer 1 USDC to 0x1111111111111111111111111111111111111111 in 5 minutes";
    console.log(`\n💬 Intent: "${intent}"`);

    // 2. AI Parsing
    console.log(`\n🧠 AI is processing intent...`);
    const parsedData = await mistralLLMParsing(intent);
    console.log(`✅ AI Summary: ${parsedData.summary}`);
    
    // Resolve Placeholders
    for (const [key, value] of Object.entries(parsedData.action.params)) {
        if (typeof value === 'string' && value.startsWith('<') && value.endsWith('>')) {
            parsedData.action.params[key] = await resolvePlaceholder(value, wallet.address);
        }
    }
    for (const [key, value] of Object.entries(parsedData.condition?.params || {})) {
        if (typeof value === 'string' && value.startsWith('<') && value.endsWith('>')) {
            parsedData.condition.params[key] = await resolvePlaceholder(value, wallet.address);
        }
    }

    console.log(`\n⚙️  Resolved Action Params:`, parsedData.action.params);
    if (parsedData.condition) {
        console.log(`⚙️  Resolved Condition Params:`, parsedData.condition.params);
    }

    // 3. Build Contract Call
    const taskFactoryAddress = manifest.contracts.TaskFactory;
    const taskFactory = new ethers.Contract(taskFactoryAddress, taskFactoryAbi, wallet);

    // Approve TaskFactory
    const amountToTransfer = BigInt(parsedData.action.params.amount);
    const allowance = await usdc.allowance(wallet.address, taskFactoryAddress);
    if (allowance < amountToTransfer) {
        console.log(`\n🔓 Approving TaskFactory to spend ${ethers.formatUnits(amountToTransfer, 6)} USDC...`);
        const approveTx = await usdc.approve(taskFactoryAddress, amountToTransfer);
        await approveTx.wait();
        console.log(`✅ Approved. TX: ${approveTx.hash}`);
    }

    // Encode Adapter Payload
    const abiCoder = new ethers.AbiCoder();
    const encodedAdapterParams = abiCoder.encode(
        ['address', 'uint256', 'uint256', 'address'],
        [
            parsedData.action.params.token,
            parsedData.action.params.amount,
            parsedData.action.params.executeAfter || (Math.floor(Date.now() / 1000) + 300), // 5 min fallback
            parsedData.action.params.recipient || "0x1111111111111111111111111111111111111111"
        ]
    );

    const taskParams = {
        expiresAt: Math.floor(Date.now() / 1000) + 86400 * 7,
        maxExecutions: 1,
        recurringInterval: 0,
        rewardPerExecution: ethers.parseEther("0.001"), // Gas reward for executor
        seedCommitment: ethers.ZeroHash
    };

    const actionParams = [{
        selector: ethers.id("execute(address,bytes)").slice(0, 10),
        protocol: manifest.actions.find((a: any) => a.id === "time_based_transfer")!.address,
        params: encodedAdapterParams
    }];

    const tokenDeposits = [{
        token: USDC_ADDRESS,
        amount: amountToTransfer
    }];

    console.log(`\n🚀 Submitting createTaskWithTokens to Arc Testnet...`);
    
    // We send 0.002 ETH (native USDC) as the creation fee + reward funding
    const valueToSend = ethers.parseEther("0.002"); 

    try {
        const tx = await taskFactory.createTaskWithTokens(
            taskParams,
            actionParams,
            tokenDeposits,
            { value: valueToSend, gasLimit: 2000000 }
        );
        console.log(`⏳ Waiting for confirmation... TX Hash: ${tx.hash}`);
        const receipt = await tx.wait();
        console.log(`\n🎉 SUCCESS! Task Automation created on-chain!`);
        console.log(`🔗 Transaction Hash: https://testnet.arc.network/tx/${tx.hash}`);
    } catch (e: any) {
        console.error(`\n❌ Failed to create task:`, e.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch(console.error);