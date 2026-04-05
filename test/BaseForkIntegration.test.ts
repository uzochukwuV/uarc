import { expect } from "chai";
import { ethers, network } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
    TaskCore,
    TaskFactory,
    ExecutorHub,
    GlobalRegistry,
    ActionRegistry,
    RewardManager,
    TimeBasedTransferAdapter,
    TaskVault,
    MockERC20
} from "../typechain-types";

// Base Mainnet Constants
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_WETH = "0x4200000000000000000000000000000000000006";
const BASE_WHALE = "0x4e65fE4dA7cC10Bf825227dFce5395E05dEcDF15".toLowerCase(); // Needs some USDC/ETH

function skipIfNoBaseFork() {
    if (!process.env.BASE_FORK_URL && network.name !== "baseFork") {
        console.log("    ⚠  Set BASE_FORK_URL or use --network baseFork to run Base fork tests.");
        return true;
    }
    return false;
}

async function impersonate(address: string): Promise<SignerWithAddress> {
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [address] });
    await network.provider.request({
        method: "hardhat_setBalance",
        params: [address, "0x" + ethers.parseEther("10").toString(16)],
    });
    return ethers.getSigner(address);
}

async function stopImpersonating(address: string) {
    await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [address] });
}

describe("Base Fork Integration - Task Automation System", function () {
    this.timeout(120_000);

    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let executor: SignerWithAddress;

    let registry: GlobalRegistry;
    let actionRegistry: ActionRegistry;
    let rewardManager: RewardManager;
    let taskCore: TaskCore;
    let taskFactory: TaskFactory;
    let executorHub: ExecutorHub;
    let timeAdapter: TimeBasedTransferAdapter;
    let usdc: any;

    before(async function () {
        if (skipIfNoBaseFork()) return this.skip();

        [deployer, user, executor] = await ethers.getSigners();

        // 1. Deploy GlobalRegistry
        const GlobalRegistryFactory = await ethers.getContractFactory("GlobalRegistry");
        registry = await GlobalRegistryFactory.deploy(deployer.address);
        await registry.waitForDeployment();

        // 2. Deploy Support Contracts
        const ActionRegistryFactory = await ethers.getContractFactory("ActionRegistry");
        actionRegistry = await ActionRegistryFactory.deploy(deployer.address);
        await actionRegistry.waitForDeployment();

        const RewardManagerFactory = await ethers.getContractFactory("RewardManager");
        rewardManager = await RewardManagerFactory.deploy(deployer.address);
        await rewardManager.waitForDeployment();

        // 3. Deploy Implementations and Logic
        const TaskCoreFactory = await ethers.getContractFactory("TaskCore");
        const taskCoreImpl = await TaskCoreFactory.deploy();
        await taskCoreImpl.waitForDeployment();

        const TaskVaultFactory = await ethers.getContractFactory("TaskVault");
        const taskVaultImpl = await TaskVaultFactory.deploy();
        await taskVaultImpl.waitForDeployment();

        const TaskLogicFactory = await ethers.getContractFactory("TaskLogicV2");
        const taskLogic = await TaskLogicFactory.deploy(deployer.address);
        await taskLogic.waitForDeployment();

        const ExecutorHubFactory = await ethers.getContractFactory("ExecutorHub");
        executorHub = await ExecutorHubFactory.deploy(deployer.address);
        await executorHub.waitForDeployment();

        await executorHub.setTaskRegistry(await registry.getAddress());
        await executorHub.setTaskLogic(await taskLogic.getAddress());

        await rewardManager.setTaskLogic(await taskLogic.getAddress());
        await rewardManager.setExecutorHub(await executorHub.getAddress());

        await taskLogic.setActionRegistry(await actionRegistry.getAddress());
        await taskLogic.setRewardManager(await rewardManager.getAddress());
        await taskLogic.setExecutorHub(await executorHub.getAddress());
        await taskLogic.setTaskRegistry(await registry.getAddress());

        const TaskFactoryFactory = await ethers.getContractFactory("TaskFactory");
        taskFactory = await TaskFactoryFactory.deploy(
            await taskCoreImpl.getAddress(),
            await taskVaultImpl.getAddress(),
            await taskLogic.getAddress(),
            await executorHub.getAddress(),
            await actionRegistry.getAddress(),
            await rewardManager.getAddress(),
            deployer.address
        );
        await taskFactory.waitForDeployment();
        await taskFactory.setGlobalRegistry(await registry.getAddress());

        // 4. Update Registry
        await registry.authorizeFactory(await taskFactory.getAddress());

        // 5. Deploy and Register Adapter
        const TimeAdapterFactory = await ethers.getContractFactory("TimeBasedTransferAdapter");
        timeAdapter = await TimeAdapterFactory.deploy();
        await timeAdapter.waitForDeployment();

        const timeTransferSelector = ethers.id("TIME_TRANSFER").substring(0, 10);
        await actionRegistry.registerAdapter(
            timeTransferSelector,
            await timeAdapter.getAddress(),
            500000, // gasLimit
            true  // requiresTokens
        );
        const timeAdapterAddr = await timeAdapter.getAddress();
        await actionRegistry.approveProtocol(timeAdapterAddr);

        // 6. Setup Executor
        await executorHub.connect(executor).registerExecutor({ value: ethers.parseEther("0.1") });

        const MockERC20Factory = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20Factory.deploy("Mock USDC", "USDC", 6);
        await usdc.waitForDeployment();
        
        // Mint to user
        await usdc.mint(user.address, ethers.parseUnits("10000", 6));
    });

    it("should create and execute a time-based task using Base USDC", async function () {
        if (skipIfNoBaseFork()) return this.skip();

        const transferAmount = 1000000n; // 1 USDC

        const currentTime = await ethers.provider.getBlock("latest").then(b => b!.timestamp);
        const executeAfter = currentTime + 3600; // 1 hour from now

        const timeAdapterAddr = await timeAdapter.getAddress();

        const usdcAddress = await usdc.getAddress();

        // Encode parameters for TimeBasedTransferAdapter
        const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "uint256", "uint256"],
            [usdcAddress, user.address, transferAmount, executeAfter]
        );

        // Calculate expected task vault address
        const taskId = 0;
        // The factory doesn't have predictVaultAddress, we just get it after creation
        // Approve and fund vault before creation by using createTaskWithTokens?
        // Wait, TaskFactory `createTask` with native token can be used, but we want to fund ERC20.
        // Actually, we can use `createTaskWithTokens`!
        
        // Create Task
        const taskParams = {
            expiresAt: 0,
            maxExecutions: 1,
            recurringInterval: 0,
            rewardPerExecution: ethers.parseEther("0.01"), // Native fee
            seedCommitment: ethers.ZeroHash
        };

        const actionParams = [{
            selector: ethers.id("TIME_TRANSFER").substring(0, 10),
            protocol: timeAdapterAddr,
            params: actionData
        }];

        const tokenDeposits = [{
            token: usdcAddress,
            amount: transferAmount
        }];

        // Approve Factory to spend USDC
        await usdc.connect(user).approve(await taskFactory.getAddress(), transferAmount);

        const tx = await taskFactory.connect(user).createTaskWithTokens(
            taskParams,
            actionParams,
            tokenDeposits,
            { value: ethers.parseEther("0.1") }
        );
        const receipt = await tx.wait();

        const taskAddresses = await taskFactory.getTaskAddresses(taskId);
        taskCore = await ethers.getContractAt("TaskCore", taskAddresses.taskCore);

        const taskInfo = await taskCore.getMetadata();
        expect(taskInfo.creator).to.equal(user.address);
        expect(taskInfo.status).to.equal(0); // ACTIVE

        // Try to execute before time
        const execTx = await executorHub.connect(executor).executeTask(taskId);
        await expect(execTx).to.emit(executorHub, "ExecutionCompleted")
            .withArgs(taskId, executor.address, false);

        // Fast forward time
        await network.provider.send("evm_increaseTime", [3601]);
        await network.provider.send("evm_mine");

        // Execute task
        const userBalBefore = await usdc.balanceOf(user.address);
        await executorHub.connect(executor).executeTask(taskId);
        const userBalAfter = await usdc.balanceOf(user.address);

        expect(userBalAfter - userBalBefore).to.equal(transferAmount);

        const updatedTask = await taskCore.getMetadata();
        expect(updatedTask.status).to.equal(3); // COMPLETED
    });
});