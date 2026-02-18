/**
 * TaskerOnChain + MetaYieldVault — BNB Chain Mainnet Deployment
 *
 * Deploys two systems in one script:
 *   A) TaskerOnChain V2 automation infrastructure
 *   B) MetaYieldVault self-driving yield engine + keeper adapter
 *
 * Then wires them together:
 *   - Registers MetaYieldVaultKeeperAdapter in ActionRegistry
 *   - Creates two keeper tasks (HARVEST + REBALANCE) via TaskFactory
 *
 * Usage:
 *   npx hardhat vars set DEPLOYER_PRIVATE_KEY <your-key>
 *   npx hardhat vars set BSC_RPC_URL <your-archive-rpc>   # optional, defaults to public
 *   npx hardhat run scripts/deploy-bnb.ts --network bnb
 *
 * Cost estimate: ~0.15–0.20 BNB total (contracts + task creation + executor stake)
 */

import { ethers, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ─── BSC Mainnet Constants ─────────────────────────────────────────────────
const BSC = {
    USDT:           "0x55d398326f99059fF775485246999027B3197955",
    WBNB:           "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    CAKE:           "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    PANCAKE_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    MASTERCHEF_V2:  "0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652",
};

// ─── Keeper Task Config ────────────────────────────────────────────────────
const KEEPER = {
    HARVEST_INTERVAL:   3_600,                        // 1 hour minimum between autonomous harvests
    REBALANCE_INTERVAL: 86_400,                       // 1 day minimum between rebalances
    REWARD_PER_EXEC:    ethers.parseEther("0.00002"), // 0.00002 BNB per execution (low for testnet/demo)
    MAX_EXECUTIONS:     0n,                           // 0 = unlimited
    EXPIRES_AT:         0n,                           // 0 = never expires
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const sep = () => console.log("─".repeat(60));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deploy(factoryName: string, ...args: any[]): Promise<any> {
    const f = await ethers.getContractFactory(factoryName);
    const c = await f.deploy(...args);
    await c.waitForDeployment();
    return c as any;
}

async function main() {
    console.log("\n" + "═".repeat(60));
    console.log("  TaskerOnChain + MetaYieldVault — BNB Chain Deployment");
    console.log("═".repeat(60) + "\n");

    const [deployer] = await ethers.getSigners();
    const deployerAddr = await deployer.getAddress();
    const balance      = await ethers.provider.getBalance(deployerAddr);
    const network      = await ethers.provider.getNetwork();

    console.log("Deployer  :", deployerAddr);
    console.log("Balance   :", ethers.formatEther(balance), "BNB");
    console.log("Network   :", network.name, "| Chain ID:", network.chainId.toString());
    const balanceBNBBefore = ethers.formatEther(balance);
    sep();

    if (balance < ethers.parseEther("0.15")) {
        console.warn("WARNING: Balance below 0.15 BNB. Deployment may run out of gas.");
    }

    // ================================================================
    // PART A — TaskerOnChain V2 Infrastructure
    // ================================================================
    console.log("\n[A] Deploying TaskerOnChain V2 Infrastructure\n");

    // A.1  Implementation contracts (cloned by factory)
    console.log("  Deploying TaskCore implementation...");
    const taskCoreImpl = await deploy("TaskCore");
    const taskCoreImplAddr = await taskCoreImpl.getAddress();
    console.log("  ✓ TaskCore impl         :", taskCoreImplAddr);

    console.log("  Deploying TaskVault implementation...");
    const taskVaultImpl = await deploy("TaskVault");
    const taskVaultImplAddr = await taskVaultImpl.getAddress();
    console.log("  ✓ TaskVault impl        :", taskVaultImplAddr);

    // A.2  Core system
    console.log("\n  Deploying ActionRegistry...");
    const actionRegistry = await deploy("ActionRegistry", deployerAddr);
    const actionRegistryAddr = await actionRegistry.getAddress();
    console.log("  ✓ ActionRegistry        :", actionRegistryAddr);

    console.log("  Deploying ExecutorHub...");
    const executorHub = await deploy("ExecutorHub", deployerAddr);
    const executorHubAddr = await executorHub.getAddress();
    console.log("  ✓ ExecutorHub           :", executorHubAddr);
    console.log("    Min stake: 0.1 BNB");

    console.log("  Deploying GlobalRegistry...");
    const globalRegistry = await deploy("GlobalRegistry", deployerAddr);
    const globalRegistryAddr = await globalRegistry.getAddress();
    console.log("  ✓ GlobalRegistry        :", globalRegistryAddr);

    console.log("  Deploying RewardManager...");
    const rewardManager = await deploy("RewardManager", deployerAddr);
    const rewardManagerAddr = await rewardManager.getAddress();
    console.log("  ✓ RewardManager         :", rewardManagerAddr);

    console.log("  Deploying TaskLogicV2...");
    const taskLogic = await deploy("TaskLogicV2", deployerAddr);
    const taskLogicAddr = await taskLogic.getAddress();
    console.log("  ✓ TaskLogicV2           :", taskLogicAddr);

    console.log("  Deploying TaskFactory...");
    const taskFactory = await deploy(
        "TaskFactory",
        taskCoreImplAddr,
        taskVaultImplAddr,
        taskLogicAddr,
        executorHubAddr,
        actionRegistryAddr,
        rewardManagerAddr,
        deployerAddr,
    );
    const taskFactoryAddr = await taskFactory.getAddress();
    console.log("  ✓ TaskFactory           :", taskFactoryAddr);
    console.log("    Creation fee: 0.001 BNB | Min reward: 0.001 BNB");

    // A.3  Wire up
    console.log("\n  Configuring contract connections...");

    await taskLogic.setActionRegistry(actionRegistryAddr);
    await taskLogic.setRewardManager(rewardManagerAddr);
    await taskLogic.setExecutorHub(executorHubAddr);
    await taskLogic.setTaskRegistry(globalRegistryAddr);
    console.log("  ✓ TaskLogicV2 configured");

    await executorHub.setTaskLogic(taskLogicAddr);
    await executorHub.setTaskRegistry(globalRegistryAddr);
    console.log("  ✓ ExecutorHub configured");

    await rewardManager.setTaskLogic(taskLogicAddr);
    await rewardManager.setExecutorHub(executorHubAddr);
    await rewardManager.setGasReimbursementMultiplier(100);
    console.log("  ✓ RewardManager configured");

    await globalRegistry.authorizeFactory(taskFactoryAddr);
    await taskFactory.setGlobalRegistry(globalRegistryAddr);
    console.log("  ✓ GlobalRegistry + TaskFactory configured");

    // ================================================================
    // PART B — MetaYieldVault + Adapters
    // ================================================================
    console.log("\n[B] Deploying MetaYieldVault Self-Driving Yield Engine\n");

    console.log("  Deploying AsterDEXEarnAdapter...");
    const earnAdapter = await deploy("AsterDEXEarnAdapter");
    const earnAdapterAddr = await earnAdapter.getAddress();
    console.log("  ✓ AsterDEXEarnAdapter   :", earnAdapterAddr);

    console.log("  Deploying PancakeSwapV2LPAdapter...");
    const lpAdapter = await deploy("PancakeSwapV2LPAdapter", BSC.PANCAKE_ROUTER);
    const lpAdapterAddr = await lpAdapter.getAddress();
    console.log("  ✓ PancakeSwapV2LPAdapter:", lpAdapterAddr);

    console.log("  Deploying PancakeSwapFarmAdapter...");
    const farmAdapter = await deploy("PancakeSwapFarmAdapter", BSC.MASTERCHEF_V2);
    const farmAdapterAddr = await farmAdapter.getAddress();
    console.log("  ✓ PancakeSwapFarmAdapter:", farmAdapterAddr);

    console.log("  Deploying MetaYieldVault...");
    const vault = await deploy("MetaYieldVault", earnAdapterAddr, lpAdapterAddr, farmAdapterAddr);
    const vaultAddr = await vault.getAddress();
    console.log("  ✓ MetaYieldVault        :", vaultAddr);
    console.log("    Strategy: 60% asUSDF earn | 39% CAKE/WBNB LP+Farm | 1% buffer");
    console.log("    ERC4626 token: MYV (shares backed by USDT NAV)");

    console.log("  Deploying MetaYieldVaultKeeperAdapter...");
    const keeperAdapter = await deploy("MetaYieldVaultKeeperAdapter");
    const keeperAdapterAddr = await keeperAdapter.getAddress();
    console.log("  ✓ MetaYieldVaultKeeperAdapter:", keeperAdapterAddr);

    // ================================================================
    // PART C — Register Keeper Adapter + Create Keeper Tasks
    // ================================================================
    console.log("\n[C] Wiring TaskerOnChain → MetaYieldVault\n");

    // C.0  Lower minTaskReward to match our keeper reward amount
    //      Default in TaskFactory is 0.0002 BNB; we want 0.00002 BNB for low-cost demo.
    await taskFactory.setMinTaskReward(KEEPER.REWARD_PER_EXEC);
    console.log("  ✓ minTaskReward set to", ethers.formatEther(KEEPER.REWARD_PER_EXEC), "BNB");

    // C.1  Register the keeper adapter in ActionRegistry
    // Selector = execute(address,bytes) — the IAdapter interface method
    const executeSelector = ethers.id("execute(address,bytes)").slice(0, 10) as `0x${string}`;
    await actionRegistry.registerAdapter(
        executeSelector,
        keeperAdapterAddr,
        600_000,  // gas limit — harvest + swap + allocate is ~350k, leave headroom
        false,    // requiresTokens = false (keeper adapter does zero-transfer)
    );
    console.log("  ✓ MetaYieldVaultKeeperAdapter registered in ActionRegistry");
    console.log("    Selector:", executeSelector, "| Gas limit: 600,000");

    // C.2  Encode KeeperParams for harvest task
    const harvestParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint8", "uint256", "uint256"],
        [vaultAddr, 0, KEEPER.HARVEST_INTERVAL, 0],
    );

    // C.3  Encode KeeperParams for rebalance task
    const rebalanceParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint8", "uint256", "uint256"],
        [vaultAddr, 1, KEEPER.REBALANCE_INTERVAL, 0],
    );

    // C.4  Create HARVEST keeper task
    // Each task needs: creationFee (0.001 BNB) + at least 1× rewardPerExecution in TaskVault
    // Deposit 0.0002 BNB reward pool (covers 10 harvest executions at 0.00002 BNB each)
    const harvestRewardPool = ethers.parseEther("0.0002");
    const creationFee       = await taskFactory.creationFee();
    const harvestValue      = creationFee + harvestRewardPool;

    console.log("\n  Creating HARVEST keeper task...");
    const harvestTx = await taskFactory.createTask(
        {
            expiresAt:          KEEPER.EXPIRES_AT,
            maxExecutions:      KEEPER.MAX_EXECUTIONS,
            recurringInterval:  BigInt(KEEPER.HARVEST_INTERVAL),
            rewardPerExecution: KEEPER.REWARD_PER_EXEC,
            seedCommitment:     ethers.ZeroHash,
        },
        [
            {
                selector: executeSelector,
                protocol: vaultAddr,
                params:   harvestParams,
            }
        ],
        { value: harvestValue },
    );
    const harvestReceipt = await harvestTx.wait();

    // Parse TaskCreated event for taskId + vault address
    const harvestEvent = harvestReceipt!.logs
        .map((log: any) => { try { return taskFactory.interface.parseLog(log); } catch (_e: any) { return null; } })
        .find((e: any) => e?.name === "TaskCreated");

    const harvestTaskId   = harvestEvent?.args?.taskId ?? "unknown";
    const harvestTaskVault = harvestEvent?.args?.taskVault ?? "unknown";
    console.log("  ✓ HARVEST task created");
    console.log("    Task ID   :", harvestTaskId.toString());
    console.log("    TaskVault :", harvestTaskVault);
    console.log("    Reward    : 0.00002 BNB/execution | Pool: 0.0002 BNB");
    console.log("    Interval  : 1 hour minimum between executions");

    // C.5  Create REBALANCE keeper task
    const rebalanceRewardPool = ethers.parseEther("0.0002");
    const rebalanceValue      = creationFee + rebalanceRewardPool;

    console.log("\n  Creating REBALANCE keeper task...");
    const rebalanceTx = await taskFactory.createTask(
        {
            expiresAt:          KEEPER.EXPIRES_AT,
            maxExecutions:      KEEPER.MAX_EXECUTIONS,
            recurringInterval:  BigInt(KEEPER.REBALANCE_INTERVAL),
            rewardPerExecution: KEEPER.REWARD_PER_EXEC,
            seedCommitment:     ethers.ZeroHash,
        },
        [
            {
                selector: executeSelector,
                protocol: vaultAddr,
                params:   rebalanceParams,
            }
        ],
        { value: rebalanceValue },
    );
    const rebalanceReceipt = await rebalanceTx.wait();

    const rebalanceEvent = rebalanceReceipt!.logs
        .map((log: any) => { try { return taskFactory.interface.parseLog(log); } catch (_e: any) { return null; } })
        .find((e: any) => e?.name === "TaskCreated");

    const rebalanceTaskId    = rebalanceEvent?.args?.taskId ?? "unknown";
    const rebalanceTaskVault = rebalanceEvent?.args?.taskVault ?? "unknown";
    console.log("  ✓ REBALANCE task created");
    console.log("    Task ID   :", rebalanceTaskId.toString());
    console.log("    TaskVault :", rebalanceTaskVault);
    console.log("    Reward    : 0.00002 BNB/execution | Pool: 0.0002 BNB");
    console.log("    Interval  : 24 hours minimum between executions");

    // ================================================================
    // DEPLOYMENT SUMMARY
    // ================================================================
    sep();
    console.log("  DEPLOYMENT COMPLETE");
    sep();

    console.log("\nTaskerOnChain V2:");
    console.log("  TaskFactory     :", taskFactoryAddr);
    console.log("  TaskLogicV2     :", taskLogicAddr);
    console.log("  ExecutorHub     :", executorHubAddr);
    console.log("  ActionRegistry  :", actionRegistryAddr);
    console.log("  GlobalRegistry  :", globalRegistryAddr);
    console.log("  RewardManager   :", rewardManagerAddr);

    console.log("\nMetaYieldVault:");
    console.log("  MetaYieldVault          :", vaultAddr);
    console.log("  AsterDEXEarnAdapter     :", earnAdapterAddr);
    console.log("  PancakeSwapV2LPAdapter  :", lpAdapterAddr);
    console.log("  PancakeSwapFarmAdapter  :", farmAdapterAddr);
    console.log("  KeeperAdapter           :", keeperAdapterAddr);

    console.log("\nKeeper Tasks:");
    console.log("  HARVEST   task", harvestTaskId.toString(), "→ TaskVault:", harvestTaskVault);
    console.log("  REBALANCE task", rebalanceTaskId.toString(), "→ TaskVault:", rebalanceTaskVault);

    // ================================================================
    // SAVE DEPLOYMENT MANIFEST
    // ================================================================
    const manifest = {
        network:   "bnb",
        chainId:   "56",
        deployer:  deployerAddr,
        timestamp: new Date().toISOString(),
        taskerOnChain: {
            TaskFactory:    taskFactoryAddr,
            TaskLogicV2:    taskLogicAddr,
            ExecutorHub:    executorHubAddr,
            ActionRegistry: actionRegistryAddr,
            GlobalRegistry: globalRegistryAddr,
            RewardManager:  rewardManagerAddr,
            TaskCoreImpl:   taskCoreImplAddr,
            TaskVaultImpl:  taskVaultImplAddr,
        },
        metaYieldVault: {
            MetaYieldVault:           vaultAddr,
            AsterDEXEarnAdapter:      earnAdapterAddr,
            PancakeSwapV2LPAdapter:   lpAdapterAddr,
            PancakeSwapFarmAdapter:   farmAdapterAddr,
            MetaYieldVaultKeeperAdapter: keeperAdapterAddr,
        },
        keeperTasks: {
            harvest: {
                taskId:    harvestTaskId.toString(),
                taskVault: harvestTaskVault,
                interval:  KEEPER.HARVEST_INTERVAL,
                reward:    ethers.formatEther(KEEPER.REWARD_PER_EXEC) + " BNB",
            },
            rebalance: {
                taskId:    rebalanceTaskId.toString(),
                taskVault: rebalanceTaskVault,
                interval:  KEEPER.REBALANCE_INTERVAL,
                reward:    ethers.formatEther(KEEPER.REWARD_PER_EXEC) + " BNB",
            },
        },
        bscConstants: BSC,
    };

    const dir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = path.join(dir, `bnb-mainnet-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
    console.log("\nManifest saved to:", file);

    // ================================================================
    // CONTRACT VERIFICATION (BscScan)
    // ================================================================
    console.log("\n[D] Verifying contracts on BscScan...\n");

    const toVerify: Array<{ name: string; address: string; args: any[] }> = [
        { name: "TaskCore",                       address: taskCoreImplAddr,   args: [] },
        { name: "TaskVault",                      address: taskVaultImplAddr,  args: [] },
        { name: "ActionRegistry",                 address: actionRegistryAddr, args: [deployerAddr] },
        { name: "ExecutorHub",                    address: executorHubAddr,    args: [deployerAddr] },
        { name: "GlobalRegistry",                 address: globalRegistryAddr, args: [deployerAddr] },
        { name: "RewardManager",                  address: rewardManagerAddr,  args: [deployerAddr] },
        { name: "TaskLogicV2",                    address: taskLogicAddr,      args: [deployerAddr] },
        { name: "TaskFactory",                    address: taskFactoryAddr,    args: [taskCoreImplAddr, taskVaultImplAddr, taskLogicAddr, executorHubAddr, actionRegistryAddr, rewardManagerAddr, deployerAddr] },
        { name: "AsterDEXEarnAdapter",            address: earnAdapterAddr,    args: [] },
        { name: "PancakeSwapV2LPAdapter",         address: lpAdapterAddr,      args: [BSC.PANCAKE_ROUTER] },
        { name: "PancakeSwapFarmAdapter",         address: farmAdapterAddr,    args: [BSC.MASTERCHEF_V2] },
        { name: "MetaYieldVault",                 address: vaultAddr,          args: [earnAdapterAddr, lpAdapterAddr, farmAdapterAddr] },
        { name: "MetaYieldVaultKeeperAdapter",    address: keeperAdapterAddr,  args: [] },
    ];

    for (const c of toVerify) {
        try {
            await run("verify:verify", { address: c.address, constructorArguments: c.args });
            console.log("  ✓ Verified:", c.name, c.address);
        } catch (e: any) {
            if (e?.message?.includes("Already Verified") || e?.message?.includes("already verified")) {
                console.log("  ✓ Already verified:", c.name);
            } else {
                console.warn("  ✗ Verification failed for", c.name, "—", e?.message ?? e);
            }
        }
    }

    // ================================================================
    // NEXT STEPS
    // ================================================================
    console.log("\nNext steps:");
    console.log("1. Register as executor (0.1 BNB stake):");
    console.log(`   await executorHub.registerExecutor({ value: ethers.parseEther("0.1") })`);
    console.log("");
    console.log("2. Deposit USDT into vault as a user:");
    console.log(`   await usdt.approve("${vaultAddr}", amount)`);
    console.log(`   await vault.deposit(amount, yourAddress)`);
    console.log("");
    console.log("3. Executor checks keeper tasks:");
    console.log(`   const [canExec, reason] = await keeperAdapter.canExecute(harvestParams)`);
    console.log("   if (canExec) await executorHub.executeTask(harvestTaskId)");
    console.log("");
    console.log("4. Vault harvest() and rebalance() are also callable directly (permissionless):");
    console.log(`   await vault.harvest()`);
    console.log(`   await vault.rebalance()`);



    console.log("Deployer  :", deployerAddr);
    console.log("Balance   :", ethers.formatEther(balance), "BNB");
    console.log("Network   :", network.name, "| Chain ID:", network.chainId.toString());

    const balanceBNBAfter = ethers.formatEther(await ethers.provider.getBalance(deployerAddr));
    const cost = balanceBNBBefore - balanceBNBAfter;
    console.log("Cost      :", cost.toFixed(5), "BNB");
    
    sep();
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error("\nDeployment failed:", err);
        process.exit(1);
    });
