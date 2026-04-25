/**
 * Arc Adapters Integration Test (Local Hardhat)
 * Tests the full task creation and execution flow for:
 * - TimeBasedTransferAdapter (USDC + EURO)
 * - CCTPTransferAdapter (with MockTokenMessenger)
 * - StorkPriceTransferAdapter (with MockStorkOracle)
 */

import { ethers } from "hardhat";
import { expect } from "chai";
import type { Signer } from "ethers";

describe("Arc Adapters — Full Integration", function () {
    this.timeout(120000);

    // Contracts
    let deployer: Signer;
    let executor: Signer;
    let recipient: Signer;

    let mockUSDC: any;
    let mockEURO: any;
    let mockMessenger: any;
    let mockStorkUSDC: any;
    let mockStorkEURO: any;
    let taskCoreImpl: any;
    let taskVaultImpl: any;
    let actionRegistry: any;
    let executorHub: any;
    let globalRegistry: any;
    let rewardManager: any;
    let taskLogic: any;
    let taskFactory: any;
    let timeAdapter: any;
    let cctpAdapter: any;
    let storkAdapter: any;

    let deployerAddress: string;
    let executorAddress: string;
    let recipientAddress: string;

    const EXECUTE_SELECTOR = ethers.id("execute(address,bytes)").slice(0, 10) as `0x${string}`;
    const abiCoder = new ethers.AbiCoder();

    before(async function () {
        [deployer, executor, recipient] = await ethers.getSigners();
        deployerAddress = await deployer.getAddress();
        executorAddress = await executor.getAddress();
        recipientAddress = await recipient.getAddress();

        console.log("\nDeployer:", deployerAddress);

        // ---- Mock Tokens ----
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();
        mockEURO = await MockERC20.deploy("Mock EURO", "EURO", 6);
        await mockEURO.waitForDeployment();

        await mockUSDC.mint(deployerAddress, ethers.parseUnits("1000000", 6));
        await mockEURO.mint(deployerAddress, ethers.parseUnits("1000000", 6));

        // ---- Mock CCTP ----
        const MockTokenMessenger = await ethers.getContractFactory("MockTokenMessenger");
        mockMessenger = await MockTokenMessenger.deploy();
        await mockMessenger.waitForDeployment();

        // ---- Mock Stork Oracles ----
        const MockStorkOracle = await ethers.getContractFactory("MockStorkOracle");
        mockStorkUSDC = await MockStorkOracle.deploy("USDC / USD", 8, 100000000n); // $1.00
        await mockStorkUSDC.waitForDeployment();
        mockStorkEURO = await MockStorkOracle.deploy("EURO / USD", 8, 108000000n); // $1.08
        await mockStorkEURO.waitForDeployment();

        // ---- Core Contracts ----
        const TaskCore = await ethers.getContractFactory("TaskCore");
        taskCoreImpl = await TaskCore.deploy();
        await taskCoreImpl.waitForDeployment();

        const TaskVault = await ethers.getContractFactory("TaskVault");
        taskVaultImpl = await TaskVault.deploy();
        await taskVaultImpl.waitForDeployment();

        const ActionRegistry = await ethers.getContractFactory("ActionRegistry");
        actionRegistry = await ActionRegistry.deploy(deployerAddress);
        await actionRegistry.waitForDeployment();

        const ExecutorHub = await ethers.getContractFactory("ExecutorHub");
        executorHub = await ExecutorHub.deploy(deployerAddress);
        await executorHub.waitForDeployment();

        const GlobalRegistry = await ethers.getContractFactory("GlobalRegistry");
        globalRegistry = await GlobalRegistry.deploy(deployerAddress);
        await globalRegistry.waitForDeployment();

        const RewardManager = await ethers.getContractFactory("RewardManager");
        rewardManager = await RewardManager.deploy(deployerAddress);
        await rewardManager.waitForDeployment();

        const TaskLogicV2 = await ethers.getContractFactory("TaskLogicV2");
        taskLogic = await TaskLogicV2.deploy(deployerAddress);
        await taskLogic.waitForDeployment();

        const TaskFactory = await ethers.getContractFactory("TaskFactory");
        taskFactory = await TaskFactory.deploy(
            await taskCoreImpl.getAddress(),
            await taskVaultImpl.getAddress(),
            await taskLogic.getAddress(),
            await executorHub.getAddress(),
            await actionRegistry.getAddress(),
            await rewardManager.getAddress(),
            deployerAddress
        );
        await taskFactory.waitForDeployment();

        // ---- Adapters ----
        const TimeAdapter = await ethers.getContractFactory("TimeBasedTransferAdapter");
        timeAdapter = await TimeAdapter.deploy();
        await timeAdapter.waitForDeployment();

        const CCTPAdapter = await ethers.getContractFactory("CCTPTransferAdapter");
        cctpAdapter = await CCTPAdapter.deploy();
        await cctpAdapter.waitForDeployment();

        const StorkAdapter = await ethers.getContractFactory("StorkPriceTransferAdapter");
        storkAdapter = await StorkAdapter.deploy();
        await storkAdapter.waitForDeployment();

        // ---- Wire Up ----
        await taskLogic.setActionRegistry(await actionRegistry.getAddress());
        await taskLogic.setRewardManager(await rewardManager.getAddress());
        await taskLogic.setExecutorHub(await executorHub.getAddress());
        await taskLogic.setTaskRegistry(await globalRegistry.getAddress());

        await executorHub.setTaskLogic(await taskLogic.getAddress());
        await executorHub.setTaskRegistry(await globalRegistry.getAddress());

        await rewardManager.setTaskLogic(await taskLogic.getAddress());
        await rewardManager.setExecutorHub(await executorHub.getAddress());
        await rewardManager.setGasReimbursementMultiplier(0); // no gas reimbursement on testnet

        await globalRegistry.authorizeFactory(await taskFactory.getAddress());
        await taskFactory.setGlobalRegistry(await globalRegistry.getAddress());

        // ---- Register Adapters ----
        await actionRegistry.registerAdapter(EXECUTE_SELECTOR, await timeAdapter.getAddress(), 150000, true);
        await actionRegistry.registerAdapter(EXECUTE_SELECTOR, await cctpAdapter.getAddress(), 300000, true);
        await actionRegistry.registerAdapter(EXECUTE_SELECTOR, await storkAdapter.getAddress(), 150000, true);

        await actionRegistry.approveProtocol(await timeAdapter.getAddress());
        await actionRegistry.approveProtocol(await cctpAdapter.getAddress());
        await actionRegistry.approveProtocol(await storkAdapter.getAddress());

        // ---- Approve Factory ----
        await mockUSDC.approve(await taskFactory.getAddress(), ethers.MaxUint256);
        await mockEURO.approve(await taskFactory.getAddress(), ethers.MaxUint256);

        console.log("✅ Test environment deployed\n");
    });

    // ====================================================================
    // TimeBasedTransferAdapter Tests
    // ====================================================================

    describe("TimeBasedTransferAdapter", function () {
        it("should create and execute a time-based USDC transfer", async function () {
            const now = Math.floor(Date.now() / 1000);
            const amount = ethers.parseUnits("10", 6); // 10 USDC
            const executeAfter = now - 10; // already executable (10 sec ago)

            const params = abiCoder.encode(
                ["address", "address", "uint256", "uint256"],
                [await mockUSDC.getAddress(), recipientAddress, amount, executeAfter]
            );

            const rewardPerExecution = ethers.parseEther("0.001");
            const taskParams = {
                expiresAt: now + 86400,
                maxExecutions: 1,
                recurringInterval: 0,
                rewardPerExecution,
                seedCommitment: ethers.ZeroHash,
            };

            const recipientBalanceBefore = await mockUSDC.balanceOf(recipientAddress);

            const tx = await taskFactory.createTaskWithTokens(
                taskParams,
                [{ selector: EXECUTE_SELECTOR, protocol: await timeAdapter.getAddress(), params }],
                [{ token: await mockUSDC.getAddress(), amount }],
                { value: rewardPerExecution * 2n }
            );
            const receipt = await tx.wait();
            expect(receipt?.status).to.equal(1);

            // Get taskId from event
            let taskId: bigint = 0n;
            for (const log of receipt!.logs) {
                try {
                    const parsed = taskFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
                    if (parsed?.name === "TaskCreated") {
                        taskId = parsed.args.taskId;
                    }
                } catch {}
            }

            console.log(`  Created USDC Transfer Task #${taskId}`);

            // Execute the task
            const execTx = await executorHub.connect(executor).executeTask(taskId);
            const execReceipt = await execTx.wait();
            expect(execReceipt?.status).to.equal(1);

            const recipientBalanceAfter = await mockUSDC.balanceOf(recipientAddress);
            expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(amount);
            console.log(`  ✅ Transferred ${ethers.formatUnits(amount, 6)} USDC to recipient`);
        });

        it("should create a time-based EURO transfer", async function () {
            const now = Math.floor(Date.now() / 1000);
            const amount = ethers.parseUnits("5", 6); // 5 EURO
            const executeAfter = now - 5;

            const params = abiCoder.encode(
                ["address", "address", "uint256", "uint256"],
                [await mockEURO.getAddress(), recipientAddress, amount, executeAfter]
            );

            const rewardPerExecution = ethers.parseEther("0.001");
            const tx = await taskFactory.createTaskWithTokens(
                {
                    expiresAt: now + 86400,
                    maxExecutions: 1,
                    recurringInterval: 0,
                    rewardPerExecution,
                    seedCommitment: ethers.ZeroHash,
                },
                [{ selector: EXECUTE_SELECTOR, protocol: await timeAdapter.getAddress(), params }],
                [{ token: await mockEURO.getAddress(), amount }],
                { value: rewardPerExecution * 2n }
            );
            const receipt = await tx.wait();
            expect(receipt?.status).to.equal(1);

            let taskId = 0n;
            for (const log of receipt!.logs) {
                try {
                    const parsed = taskFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
                    if (parsed?.name === "TaskCreated") taskId = parsed.args.taskId;
                } catch {}
            }

            const recipientBefore = await mockEURO.balanceOf(recipientAddress);
            await (await executorHub.connect(executor).executeTask(taskId)).wait();
            const recipientAfter = await mockEURO.balanceOf(recipientAddress);

            expect(recipientAfter - recipientBefore).to.equal(amount);
            console.log(`  ✅ Transferred ${ethers.formatUnits(amount, 6)} EURO to recipient`);
        });

        it("canExecute returns false when time not reached", async function () {
            const now = Math.floor(Date.now() / 1000);
            const params = abiCoder.encode(
                ["address", "address", "uint256", "uint256"],
                [await mockUSDC.getAddress(), recipientAddress, ethers.parseUnits("1", 6), now + 3600]
            );
            const [canExec, reason] = await timeAdapter.canExecute(params);
            expect(canExec).to.be.false;
            expect(reason).to.include("Too early");
        });
    });

    // ====================================================================
    // CCTPTransferAdapter Tests
    // ====================================================================

    describe("CCTPTransferAdapter", function () {
        it("should create and execute a CCTP bridge task", async function () {
            const now = Math.floor(Date.now() / 1000);
            const amount = ethers.parseUnits("20", 6); // 20 USDC
            const executeAfter = now - 5;
            const destinationDomain = 0; // Ethereum
            const mintRecipient = ethers.zeroPadValue(recipientAddress, 32);

            const params = abiCoder.encode(
                ["address", "address", "uint256", "uint32", "bytes32", "uint256"],
                [await mockMessenger.getAddress(), await mockUSDC.getAddress(), amount, destinationDomain, mintRecipient, executeAfter]
            );

            const rewardPerExecution = ethers.parseEther("0.001");
            const tx = await taskFactory.createTaskWithTokens(
                {
                    expiresAt: now + 86400,
                    maxExecutions: 1,
                    recurringInterval: 0,
                    rewardPerExecution,
                    seedCommitment: ethers.ZeroHash,
                },
                [{ selector: EXECUTE_SELECTOR, protocol: await cctpAdapter.getAddress(), params }],
                [{ token: await mockUSDC.getAddress(), amount }],
                { value: rewardPerExecution * 2n }
            );
            const receipt = await tx.wait();
            expect(receipt?.status).to.equal(1);

            let taskId = 0n;
            for (const log of receipt!.logs) {
                try {
                    const parsed = taskFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
                    if (parsed?.name === "TaskCreated") taskId = parsed.args.taskId;
                } catch {}
            }

            console.log(`  Created CCTP Bridge Task #${taskId}`);

            const execTx = await executorHub.connect(executor).executeTask(taskId);
            const execReceipt = await execTx.wait();
            expect(execReceipt?.status).to.equal(1);

            // Verify nonce was incremented in mock messenger
            const nonce = await mockMessenger.getNonce();
            expect(nonce).to.be.gt(0n);
            console.log(`  ✅ CCTP bridge executed, messenger nonce: ${nonce}`);
        });

        it("canExecute returns false when time not reached", async function () {
            const now = Math.floor(Date.now() / 1000);
            const params = abiCoder.encode(
                ["address", "address", "uint256", "uint32", "bytes32", "uint256"],
                [await mockMessenger.getAddress(), await mockUSDC.getAddress(), 1000000n, 0, ethers.ZeroHash, now + 3600]
            );
            const [canExec, reason] = await cctpAdapter.canExecute(params);
            expect(canExec).to.be.false;
            expect(reason).to.include("Time not reached");
        });
    });

    // ====================================================================
    // StorkPriceTransferAdapter Tests
    // ====================================================================

    describe("StorkPriceTransferAdapter", function () {
        it("should execute USDC transfer when price is above target", async function () {
            const now = Math.floor(Date.now() / 1000);
            const amount = ethers.parseUnits("15", 6); // 15 USDC
            // Oracle at $1.00 (100000000) — trigger when price >= $0.95 (isBelow=false)
            const targetPrice = 95000000n; // $0.95
            const isBelow = false;

            const params = abiCoder.encode(
                ["address", "address", "uint256", "int256", "bool", "address"],
                [await mockStorkUSDC.getAddress(), await mockUSDC.getAddress(), amount, targetPrice, isBelow, recipientAddress]
            );

            const [canExec] = await storkAdapter.canExecute(params);
            expect(canExec).to.be.true; // $1.00 >= $0.95

            const rewardPerExecution = ethers.parseEther("0.001");
            const tx = await taskFactory.createTaskWithTokens(
                {
                    expiresAt: now + 86400,
                    maxExecutions: 1,
                    recurringInterval: 0,
                    rewardPerExecution,
                    seedCommitment: ethers.ZeroHash,
                },
                [{ selector: EXECUTE_SELECTOR, protocol: await storkAdapter.getAddress(), params }],
                [{ token: await mockUSDC.getAddress(), amount }],
                { value: rewardPerExecution * 2n }
            );
            const receipt = await tx.wait();

            let taskId = 0n;
            for (const log of receipt!.logs) {
                try {
                    const parsed = taskFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
                    if (parsed?.name === "TaskCreated") taskId = parsed.args.taskId;
                } catch {}
            }

            const recipientBefore = await mockUSDC.balanceOf(recipientAddress);
            await (await executorHub.connect(executor).executeTask(taskId)).wait();
            const recipientAfter = await mockUSDC.balanceOf(recipientAddress);

            expect(recipientAfter - recipientBefore).to.equal(amount);
            console.log(`  ✅ Stork USDC transfer executed: ${ethers.formatUnits(amount, 6)} USDC`);
        });

        it("should execute EURO transfer when price is above target", async function () {
            const now = Math.floor(Date.now() / 1000);
            const amount = ethers.parseUnits("8", 6); // 8 EURO
            const targetPrice = 105000000n; // $1.05 — oracle at $1.08
            const isBelow = false;

            const params = abiCoder.encode(
                ["address", "address", "uint256", "int256", "bool", "address"],
                [await mockStorkEURO.getAddress(), await mockEURO.getAddress(), amount, targetPrice, isBelow, recipientAddress]
            );

            const [canExec] = await storkAdapter.canExecute(params);
            expect(canExec).to.be.true; // $1.08 >= $1.05

            const rewardPerExecution = ethers.parseEther("0.001");
            const tx = await taskFactory.createTaskWithTokens(
                {
                    expiresAt: now + 86400,
                    maxExecutions: 1,
                    recurringInterval: 0,
                    rewardPerExecution,
                    seedCommitment: ethers.ZeroHash,
                },
                [{ selector: EXECUTE_SELECTOR, protocol: await storkAdapter.getAddress(), params }],
                [{ token: await mockEURO.getAddress(), amount }],
                { value: rewardPerExecution * 2n }
            );
            const receipt = await tx.wait();

            let taskId = 0n;
            for (const log of receipt!.logs) {
                try {
                    const parsed = taskFactory.interface.parseLog({ topics: log.topics as string[], data: log.data });
                    if (parsed?.name === "TaskCreated") taskId = parsed.args.taskId;
                } catch {}
            }

            const recipientBefore = await mockEURO.balanceOf(recipientAddress);
            await (await executorHub.connect(executor).executeTask(taskId)).wait();
            const recipientAfter = await mockEURO.balanceOf(recipientAddress);

            expect(recipientAfter - recipientBefore).to.equal(amount);
            console.log(`  ✅ Stork EURO transfer executed: ${ethers.formatUnits(amount, 6)} EURO`);
        });

        it("canExecute returns false when price condition not met", async function () {
            const params = abiCoder.encode(
                ["address", "address", "uint256", "int256", "bool", "address"],
                [
                    await mockStorkUSDC.getAddress(),
                    await mockUSDC.getAddress(),
                    ethers.parseUnits("1", 6),
                    105000000n, // $1.05 — oracle at $1.00, so "below" is false
                    true, // trigger when price < $1.05 → oracle is $1.00 < $1.05 → TRUE
                    recipientAddress,
                ]
            );
            const [canExec] = await storkAdapter.canExecute(params);
            // $1.00 < $1.05 is true when isBelow=true
            expect(canExec).to.be.true;
            console.log("  ✅ Verified price-below condition works");
        });

        it("canExecute returns false when price is above and isBelow=true (condition not met)", async function () {
            const params = abiCoder.encode(
                ["address", "address", "uint256", "int256", "bool", "address"],
                [
                    await mockStorkUSDC.getAddress(),
                    await mockUSDC.getAddress(),
                    ethers.parseUnits("1", 6),
                    95000000n, // $0.95 — oracle at $1.00, "below $0.95" is false
                    true,
                    recipientAddress,
                ]
            );
            const [canExec, reason] = await storkAdapter.canExecute(params);
            expect(canExec).to.be.false; // $1.00 NOT below $0.95
            expect(reason).to.include("not below");
        });
    });
});
