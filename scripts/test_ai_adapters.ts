import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { Mistral } from '@mistralai/mistralai';

const manifestPath = path.join(__dirname, "../agent/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const apiKey = process.env.MISTRAL_API_KEY || "MZQObVTrMQoqmADbPDgLpTxNwAg07FT7";
const client = new Mistral({ apiKey: apiKey });

async function mistralLLMParsing(intent: string): Promise<any> {
    const systemPrompt = `
You are the TaskerOnChain V2 AI Agent. Your job is to translate natural language intents into on-chain automation parameters.

Here is the protocol manifest containing all available conditions and actions:
${JSON.stringify(manifest, null, 2)}

When the user provides an intent, you must:
1. Identify the correct 'action' (and 'condition' if applicable) from the manifest.
2. Extract or infer the required parameters for both.
3. If amount is in dollars, convert it to 6 decimals (e.g. 200 -> 200000000). If threshold is in dollars, convert to 8 decimals (e.g. 2000 -> 200000000000).
4. Output ONLY a valid JSON object matching this schema, no markdown blocks, no other text:
{
  "summary": "A human-readable summary of what will happen",
  "condition": { "id": "...", "params": { ... } }, // Only if applicable
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
        responseFormat: { type: "json_object" }
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
    if (placeholder.includes("TIMESTAMP")) {
        return (Math.floor(Date.now() / 1000) + 300).toString(); // 5 minutes
    }
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
    console.log("\n🚀 Starting AI-Driven End-to-End Automation Test on Fork...\n");

    const [deployer] = await ethers.getSigners();
    const deployerAddress = await deployer.getAddress();
    console.log("Using account:", deployerAddress);

    const taskFactoryAddress = manifest.contracts.TaskFactory;
    const taskFactory = await ethers.getContractAt("TaskFactory", taskFactoryAddress, deployer);

    // Deploy mock token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();
    const USDC_ADDRESS = await mockUSDC.getAddress();
    
    await mockUSDC.mint(deployerAddress, ethers.parseUnits("1000", 6));
    await mockUSDC.approve(taskFactoryAddress, ethers.MaxUint256);

    const intents = [
        "transfer 10 USDC to 0x1111111111111111111111111111111111111111 in 5 minutes",
        "bridge 5 USDC to Ethereum via CCTP",
        "transfer 2 USDC to 0x1111111111111111111111111111111111111111 if Stork price drops below $1"
    ];

    let txLogs = "\n\nTestnet Transactions (Simulated via Fork):\n";

    for (let i = 0; i < intents.length; i++) {
        const intent = intents[i];
        console.log(`\n======================================================`);
        console.log(`💬 Intent [${i+1}]: "${intent}"`);
        console.log(`🧠 AI is processing...`);
        
        try {
            const parsedData = await mistralLLMParsing(intent);
            console.log(`✅ AI Summary: ${parsedData.summary}`);
            
            for (const [key, value] of Object.entries(parsedData.action.params)) {
                if (typeof value === 'string' && value.startsWith('<') && value.endsWith('>')) {
                    parsedData.action.params[key] = await resolvePlaceholder(value, deployerAddress);
                }
            }

            let actionAdapterAddress = manifest.actions.find((a: any) => a.id === parsedData.action.id)?.address;
            
            // Construct transaction
            const abiCoder = new ethers.AbiCoder();
            let encodedAdapterParams = "0x";
            
            if (parsedData.action.id === "time_based_transfer") {
                encodedAdapterParams = abiCoder.encode(
                    ['address', 'uint256', 'uint256', 'address'],
                    [
                        USDC_ADDRESS, // Use mock
                        parsedData.action.params.amount,
                        parsedData.action.params.executeAfter || (Math.floor(Date.now() / 1000) + 300),
                        parsedData.action.params.recipient || "0x1111111111111111111111111111111111111111"
                    ]
                );
            } else if (parsedData.action.id === "cctp_bridge") {
                encodedAdapterParams = abiCoder.encode(
                    ['address', 'address', 'uint256', 'uint32', 'bytes32', 'uint256'],
                    [
                        "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA", // Messenger
                        USDC_ADDRESS,
                        parsedData.action.params.amount,
                        0, // Ethereum
                        "0x0000000000000000000000001111111111111111111111111111111111111111",
                        0
                    ]
                );
            } else if (parsedData.action.id === "stork_price_transfer") {
                encodedAdapterParams = abiCoder.encode(
                    ['address', 'address', 'uint256', 'int256', 'bool', 'address'],
                    [
                        "0xacC0a0cF13571d30B4b8637996F5D6D774d4fd62", // Stork Oracle
                        USDC_ADDRESS,
                        parsedData.action.params.amount,
                        parsedData.action.params.targetPrice || "100000000",
                        parsedData.action.params.isBelow !== undefined ? parsedData.action.params.isBelow : true,
                        parsedData.action.params.recipient || "0x1111111111111111111111111111111111111111"
                    ]
                );
            }

            const taskParams = {
                expiresAt: Math.floor(Date.now() / 1000) + 86400 * 7,
                maxExecutions: 1,
                recurringInterval: 0,
                rewardPerExecution: ethers.parseEther("0.001"),
                seedCommitment: ethers.ZeroHash
            };

            const actionParams = [{
                selector: ethers.id("execute(address,bytes)").slice(0, 10),
                protocol: actionAdapterAddress,
                params: encodedAdapterParams
            }];

            const tokenDeposits = [{
                token: USDC_ADDRESS,
                amount: BigInt(parsedData.action.params.amount)
            }];

            console.log(`\n🚀 Submitting createTaskWithTokens...`);
            const valueToSend = ethers.parseEther("0.002"); 

            const tx = await taskFactory.createTaskWithTokens(
                taskParams,
                actionParams,
                tokenDeposits,
                { value: valueToSend, gasLimit: 2000000 }
            );
            const receipt = await tx.wait();
            console.log(`✅ TX Mined: ${tx.hash}`);
            txLogs += `- [${parsedData.action.id}] TX Hash: ${tx.hash}\n  AI Log: ${parsedData.summary}\n\n`;
        } catch (e: any) {
            console.error(`❌ Failed:`, e.message);
        }
    }

    fs.appendFileSync(path.join(__dirname, "../../arc_tx_logs.txt"), txLogs);
    console.log(`\n🎉 End-to-End AI test complete! Logs saved to arc_tx_logs.txt`);
}

main().then(() => process.exit(0)).catch(console.error);