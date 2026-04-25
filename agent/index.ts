import { ethers } from 'ethers';
import manifest from './manifest.json';
import * as readline from 'readline';

// Using Hardhat's default random key for demonstration purposes
// You should set a real private key funded with test USDC for the Arc Testnet
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RPC_URL = 'https://rpc.testnet.arc.network';
const CHAIN_ID = 5042002;

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log(`Agent started. Connected to ${manifest.network} (Chain ID: ${manifest.chainId})`);
console.log(`Wallet address: ${wallet.address}`);

/**
 * Mock Web Search tool
 */
async function webSearch(query: string): Promise<string> {
    console.log(`[Tool: Web Search] Searching for: "${query}"...`);
    // In a real scenario, this would call a search API.
    if (query.toLowerCase().includes('usdc') || query.toLowerCase().includes('token')) {
        return 'USDC token address on Arc Testnet is 0x3600000000000000000000000000000000000000 (system contract) or an ERC-20 equivalent.';
    }
    return 'No specific results found.';
}

/**
 * Formulate and create automation transaction
 */
async function createAutomationTx(intent: string) {
    console.log(`\n[Agent] Analyzing intent: "${intent}"`);
    console.log(`[Agent] Loading manifest for protocol: ${manifest.protocol}`);
    
    // Simulate AI parsing the intent
    console.log(`[Agent] Parsing intent using LLM...`);
    let tokenAddress = '0x3600000000000000000000000000000000000000'; // Default USDC
    let amount = ethers.parseUnits('10', 6); // 10 USDC
    let executeAfter = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    let recipient = '0x1234567890123456789012345678901234567890';

    if (intent.toLowerCase().includes('usdc')) {
        const searchResult = await webSearch('USDC address on Arc testnet');
        console.log(`[Agent] Search result: ${searchResult}`);
    }

    console.log(`\n[Agent] Extracted Parameters:`);
    console.log(`- Token: ${tokenAddress}`);
    console.log(`- Amount: 10 USDC`);
    console.log(`- Execute After: ${new Date(executeAfter * 1000).toLocaleString()}`);
    console.log(`- Recipient: ${recipient}`);

    // Encode Adapter Params for TimeBasedTransferAdapter
    // abi.encode(address token, uint256 amount, uint256 executeAfter, address recipient)
    const abiCoder = new ethers.AbiCoder();
    const adapterParams = abiCoder.encode(
        ['address', 'uint256', 'uint256', 'address'],
        [tokenAddress, amount, executeAfter, recipient]
    );

    console.log(`\n[Agent] Formulated Adapter Payload: ${adapterParams}`);

    // In a real implementation, you would:
    // 1. Create the TaskParams tuple
    // 2. Create the Actions tuple array
    // 3. Create Deposits array
    // 4. Send transaction to TaskFactory (createTaskWithTokens)

    console.log(`[Agent] Transaction ready to be signed and submitted to TaskFactory on Arc Testnet.`);
}

// Simple CLI for interaction
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function promptUser() {
    rl.question('\nWhat automation would you like to create? (e.g. "Transfer 10 USDC to 0x123... in 1 hour")\n> ', async (answer) => {
        if (answer.toLowerCase() === 'exit') {
            rl.close();
            return;
        }
        await createAutomationTx(answer);
        promptUser();
    });
}

promptUser();
