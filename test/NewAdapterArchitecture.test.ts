import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  MockUniswapUSDCETHBuyLimitAdapter,
  TaskFactory,
  TaskCore,
  TaskVault,
  TaskLogicV2,
  ExecutorHub,
  ActionRegistry,
  RewardManager,
  GlobalRegistry,
} from "../typechain-types";

/**
 * @title TaskerOnChain Flow Test
 * @notice Comprehensive test of task creation to execution flow with embedded adapter conditions
 *
 * ARCHITECTURE OVERVIEW:
 * 1. TaskFactory - Creates tasks, deploys TaskCore + TaskVault clones, stores actions on-chain
 * 2. TaskCore - Stores task metadata and actions, manages state
 * 3. TaskVault - Holds funds (ETH + ERC20), executes actions through adapters
 * 4. ExecutorHub - Manages executors, direct execution (no commit-reveal on testnet)
 * 5. TaskLogicV2 - Orchestrates execution: fetch actions from TaskCore, call adapters, distribute rewards
 * 6. Adapter - Checks conditions (canExecute) + executes actions (execute)
 *
 * FLOW:
 * User → TaskFactory.createTaskWithTokens()
 *   → deploys TaskCore + TaskVault
 *   → deposits tokens into vault
 *   → stores actions in TaskCore
 *   → registers with GlobalRegistry
 *
 * Executor → ExecutorHub.executeTask(taskId)
 *   → TaskLogicV2 fetches actions from TaskCore
 *   → calls adapter.execute() (adapter checks canExecute internally)
 *   → distributes rewards
 *   → marks task complete
 */
describe("TaskerOnChain - Complete Flow Test", function () {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let executor: SignerWithAddress;

  // Mock tokens and infrastructure
  let mockUSDC: any;
  let mockWETH: any;
  let mockRouter: any;
  let mockPriceFeed: any;

  // System contracts
  let taskFactory: TaskFactory;
  let taskLogic: TaskLogicV2;
  let executorHub: ExecutorHub;
  // ConditionOracle removed - conditions now checked by adapters
  let actionRegistry: ActionRegistry;
  let rewardManager: RewardManager;
  let globalRegistry: GlobalRegistry;
  let taskCoreImpl: TaskCore;
  let taskVaultImpl: TaskVault;

  // Adapter
  let adapter: MockUniswapUSDCETHBuyLimitAdapter;

  // Constants
  const INITIAL_ETH_PRICE = 3000e8; // $3000 with 8 decimals
  const MIN_STAKE = ethers.parseEther("0.1");
  const TASK_REWARD = ethers.parseEther("0.01");

  before(async function () {
    [deployer, user, executor] = await ethers.getSigners();
  });

  beforeEach(async function () {
    // ============ DEPLOY MOCK TOKENS AND INFRASTRUCTURE ============

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
    await mockUSDC.waitForDeployment();

    mockWETH = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    await mockWETH.waitForDeployment();

    const MockRouter = await ethers.getContractFactory("MockUniswapRouter");
    mockRouter = await MockRouter.deploy();
    await mockRouter.waitForDeployment();

    const MockPriceFeed = await ethers.getContractFactory("MockChainlinkPriceFeed");
    mockPriceFeed = await MockPriceFeed.deploy(INITIAL_ETH_PRICE);
    await mockPriceFeed.waitForDeployment();

    // ============ DEPLOY SYSTEM CONTRACTS ============

    const TaskCore = await ethers.getContractFactory("TaskCore");
    taskCoreImpl = await TaskCore.deploy();
    await taskCoreImpl.waitForDeployment();

    const TaskVault = await ethers.getContractFactory("TaskVault");
    taskVaultImpl = await TaskVault.deploy();
    await taskVaultImpl.waitForDeployment();

    // ConditionOracle removed - conditions now checked by adapters

    const ActionRegistry = await ethers.getContractFactory("ActionRegistry");
    actionRegistry = await ActionRegistry.deploy(deployer.address);
    await actionRegistry.waitForDeployment();

    const ExecutorHub = await ethers.getContractFactory("ExecutorHub");
    executorHub = await ExecutorHub.deploy(deployer.address);
    await executorHub.waitForDeployment();

    const GlobalRegistry = await ethers.getContractFactory("GlobalRegistry");
    globalRegistry = await GlobalRegistry.deploy(deployer.address);
    await globalRegistry.waitForDeployment();

    const RewardManager = await ethers.getContractFactory("RewardManager");
    rewardManager = await RewardManager.deploy(deployer.address);
    await rewardManager.waitForDeployment();

    const TaskLogicV2 = await ethers.getContractFactory("TaskLogicV2");
    taskLogic = await TaskLogicV2.deploy(deployer.address);
    await taskLogic.waitForDeployment();

    const TaskFactory = await ethers.getContractFactory("TaskFactory");
    taskFactory = await TaskFactory.deploy(
      await taskCoreImpl.getAddress(),
      await taskVaultImpl.getAddress(),
      await taskLogic.getAddress(),
      await executorHub.getAddress(),
      await actionRegistry.getAddress(),
      await rewardManager.getAddress(),
      deployer.address
    );
    await taskFactory.waitForDeployment();

    // ============ CONFIGURE SYSTEM CONTRACTS ============

    // ConditionOracle removed - conditions now checked by adapters
    await taskLogic.setActionRegistry(await actionRegistry.getAddress());
    await taskLogic.setRewardManager(await rewardManager.getAddress());
    await taskLogic.setExecutorHub(await executorHub.getAddress());
    await taskLogic.setTaskRegistry(await taskFactory.getAddress()); // TaskLogic reads from TaskFactory

    await executorHub.setTaskLogic(await taskLogic.getAddress());
    await executorHub.setTaskRegistry(await taskFactory.getAddress());

    await rewardManager.setTaskLogic(await taskLogic.getAddress());
    await rewardManager.setExecutorHub(await executorHub.getAddress());
    await rewardManager.setGasReimbursementMultiplier(100);

    await globalRegistry.authorizeFactory(await taskFactory.getAddress());
    await taskFactory.setGlobalRegistry(await globalRegistry.getAddress());

    // ============ DEPLOY AND REGISTER ADAPTER ============

    const MockUniswapUSDCETHBuyLimitAdapter = await ethers.getContractFactory(
      "MockUniswapUSDCETHBuyLimitAdapter"
    );
    adapter = await MockUniswapUSDCETHBuyLimitAdapter.deploy(
      await mockUSDC.getAddress(),
      await mockWETH.getAddress(),
      await mockRouter.getAddress(),
      await mockPriceFeed.getAddress()
    );
    await adapter.waitForDeployment();

    // Register adapter with selector
    const adapterSelector = ethers.id("buyLimitOrder").slice(0, 10);
    await actionRegistry.registerAdapter(
      adapterSelector,
      await adapter.getAddress(),
      500000,
      true
    );

    await actionRegistry.approveProtocol(await mockRouter.getAddress());

    // ============ SETUP MOCK ROUTER WITH LIQUIDITY ============

    await mockUSDC.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 6));
    await mockWETH.mint(await mockRouter.getAddress(), ethers.parseEther("1000"));

    // ============ SETUP USER BALANCES ============

    await mockUSDC.mint(user.address, ethers.parseUnits("10000", 6));

    // ============ REGISTER EXECUTOR ============

    await executorHub.connect(executor).registerExecutor({ value: MIN_STAKE });
  });

  describe("Adapter Interface Extension (getTokenRequirements)", function () {
    it("Should correctly extract token requirements from adapter params", async function () {
      console.log("\n========== TEST: getTokenRequirements() Method ==========");

      const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "uint256"],
        [
          await mockRouter.getAddress(),
          await mockUSDC.getAddress(), // tokenIn (USDC)
          await mockWETH.getAddress(),
          ethers.parseUnits("1000", 6), // amountIn
          ethers.parseEther("0.3"),
          user.address,
          3100e8,
        ]
      );

      // Call getTokenRequirements on adapter
      const [tokens, amounts] = await adapter.getTokenRequirements(actionParams);

      // Verify it returns correct token and amount
      expect(tokens.length).to.equal(1);
      expect(amounts.length).to.equal(1);
      expect(tokens[0]).to.equal(await mockUSDC.getAddress());
      expect(amounts[0]).to.equal(ethers.parseUnits("1000", 6));

      console.log(`✅ Token requirements extracted correctly:`);
      console.log(`   Token: ${tokens[0]}`);
      console.log(`   Amount: ${ethers.formatUnits(amounts[0], 6)} USDC`);
    });
  });

  describe("Complete Task Flow: Creation → Execution → Completion", function () {
    it("Should complete full task lifecycle with adapter-embedded conditions", async function () {
      // ========== STEP 1: CREATE TASK ==========

      console.log("\n========== STEP 1: CREATE TASK ==========");

      const taskParams = {
        expiresAt: (await ethers.provider.getBlock("latest"))!.timestamp + 86400, // 1 day
        maxExecutions: 1,
        recurringInterval: 0,
        rewardPerExecution: TASK_REWARD,
        seedCommitment: ethers.ZeroHash,
      };

      // Action: Buy ETH when price <= $3100 (current price is $3000, so conditions are met)
      // Params: (router, tokenIn, tokenOut, amountIn, minAmountOut, recipient, maxPriceUSD)
      const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "uint256"],
        [
          await mockRouter.getAddress(), // router
          await mockUSDC.getAddress(), // tokenIn (USDC)
          await mockWETH.getAddress(), // tokenOut (WETH)
          ethers.parseUnits("1000", 6), // amountIn - 1000 USDC
          ethers.parseEther("0.3"), // minAmountOut - Min 0.3 ETH
          user.address, // recipient
          3100e8, // maxPriceUSD - $3100 limit
        ]
      );

      // Prepare action for TaskFactory (ActionParams struct: selector, protocol, params)
      const actions = [
        {
          selector: ethers.id("buyLimitOrder").slice(0, 10),
          protocol: await mockRouter.getAddress(),
          params: actionParams,
        },
      ];

      // Approve USDC for TaskFactory (it will transfer to vault)
      await mockUSDC.connect(user).approve(
        await taskFactory.getAddress(),
        ethers.parseUnits("1000", 6)
      );

      const deposits = [
        {
          token: await mockUSDC.getAddress(),
          amount: ethers.parseUnits("1000", 6),
        },
      ];

      // Create task (send enough ETH for rewards + gas reimbursement + buffer)
      const createTx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        actions,
        deposits,
        { value: ethers.parseEther("0.1") } // Enough for reward + gas reimbursement
      );

      const createReceipt = await createTx.wait();

      // Get taskId from event
      const taskCreatedEvent = createReceipt?.logs.find((log: any) => {
        try {
          const parsed = taskFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === "TaskCreated";
        } catch {
          return false;
        }
      });

      expect(taskCreatedEvent).to.not.be.undefined;

      const parsedEvent = taskFactory.interface.parseLog({
        topics: taskCreatedEvent!.topics as string[],
        data: taskCreatedEvent!.data,
      });

      const taskId = parsedEvent!.args[0];
      console.log(`✅ Task created with ID: ${taskId}`);

      // Get task addresses
      const [taskCoreAddress, taskVaultAddress] = await taskFactory.getTaskAddresses(taskId);
      console.log(`   TaskCore: ${taskCoreAddress}`);
      console.log(`   TaskVault: ${taskVaultAddress}`);

      const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);
      const taskVault = await ethers.getContractAt("TaskVault", taskVaultAddress);

      // Verify task metadata
      const metadata = await taskCore.getMetadata();
      expect(metadata.creator).to.equal(user.address);
      expect(metadata.rewardPerExecution).to.equal(TASK_REWARD);
      expect(metadata.maxExecutions).to.equal(1);

      // Verify vault has USDC
      const vaultUSDCBalance = await mockUSDC.balanceOf(taskVaultAddress);
      expect(vaultUSDCBalance).to.equal(ethers.parseUnits("1000", 6));
      console.log(`   Vault USDC balance: ${ethers.formatUnits(vaultUSDCBalance, 6)} USDC`);

      // ========== STEP 2: VERIFY ACTIONS STORED ON-CHAIN ==========

      console.log("\n========== STEP 2: VERIFY ACTIONS STORED ON-CHAIN ==========");

      const storedActions = await taskCore.getActions();
      expect(storedActions.length).to.equal(1);
      expect(storedActions[0].selector).to.equal(ethers.id("buyLimitOrder").slice(0, 10));
      expect(storedActions[0].protocol).to.equal(await mockRouter.getAddress());
      console.log(`✅ Actions stored on-chain:`);
      console.log(`   Action count: ${storedActions.length}`);
      console.log(`   Selector: ${storedActions[0].selector}`);
      console.log(`   Protocol: ${storedActions[0].protocol}`);

      // ========== STEP 3: VERIFY ADAPTER CONDITIONS ==========

      console.log("\n========== STEP 3: VERIFY ADAPTER CONDITIONS ==========");

      const [canExecute, reason] = await adapter.canExecute(actionParams);
      expect(canExecute).to.be.true;
      console.log(`✅ Adapter conditions met: ${reason}`);

      // ========== STEP 4: EXECUTE TASK ==========

      console.log("\n========== STEP 4: EXECUTE TASK ==========");

      const executorBalanceBefore = await ethers.provider.getBalance(executor.address);
      const userWETHBefore = await mockWETH.balanceOf(user.address);

      // Execute task - actions are fetched from TaskCore by TaskLogic
      const executeTx = await executorHub
        .connect(executor)
        .executeTask(taskId);

      const executeReceipt = await executeTx.wait();

      console.log(`✅ Task executed successfully`);

      // ========== STEP 5: VERIFY RESULTS ==========

      console.log("\n========== STEP 5: VERIFY RESULTS ==========");

      // Check executor received reward
      const executorBalanceAfter = await ethers.provider.getBalance(executor.address);
      const gasCost = executeReceipt!.gasUsed * executeReceipt!.gasPrice;
      const netGain = executorBalanceAfter - executorBalanceBefore + gasCost;

      console.log(`   Executor reward received: ${ethers.formatEther(netGain)} ETH`);
      expect(netGain).to.be.gt(0n);

      // Check user received WETH (swap executed)
      const userWETHAfter = await mockWETH.balanceOf(user.address);
      const wethReceived = userWETHAfter - userWETHBefore;
      console.log(`   User WETH received: ${ethers.formatEther(wethReceived)} WETH`);
      expect(wethReceived).to.be.gte(ethers.parseEther("0.3")); // At least minEthOut

      // Check task metadata updated
      const metadataAfter = await taskCore.getMetadata();
      expect(metadataAfter.executionCount).to.equal(1);
      console.log(`   Task execution count: ${metadataAfter.executionCount}`);

      // Check executor stats updated
      const executorInfo = await executorHub.getExecutor(executor.address);
      expect(executorInfo.totalExecutions).to.equal(1);
      expect(executorInfo.successfulExecutions).to.equal(1);
      console.log(`   Executor total executions: ${executorInfo.totalExecutions}`);
      console.log(`   Executor successful executions: ${executorInfo.successfulExecutions}`);

      console.log("\n========== ✅ FULL FLOW COMPLETED SUCCESSFULLY ==========\n");
    });

    it("Should fail execution when adapter conditions are not met (price too high)", async function () {
      console.log("\n========== TEST: CONDITION NOT MET (PRICE TOO HIGH) ==========");

      // Create task with strict price limit (lower than current price)
      const taskParams = {
        expiresAt: (await ethers.provider.getBlock("latest"))!.timestamp + 86400,
        maxExecutions: 1,
        recurringInterval: 0,
        rewardPerExecution: TASK_REWARD,
        seedCommitment: ethers.ZeroHash,
      };

      // Action: Buy ETH only when price <= $2900 (current is $3000 - TOO HIGH)
      const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "uint256"],
        [
          await mockRouter.getAddress(),
          await mockUSDC.getAddress(),
          await mockWETH.getAddress(),
          ethers.parseUnits("1000", 6),
          ethers.parseEther("0.3"),
          user.address,
          2900e8, // Max price $2900 (condition will FAIL)
        ]
      );

      const actions = [
        {
          selector: ethers.id("buyLimitOrder").slice(0, 10),
          protocol: await mockRouter.getAddress(),
          params: actionParams,
        },
      ];

      // Approve and create task
      await mockUSDC.connect(user).approve(
        await taskFactory.getAddress(),
        ethers.parseUnits("1000", 6)
      );

      const deposits = [
        {
          token: await mockUSDC.getAddress(),
          amount: ethers.parseUnits("1000", 6),
        },
      ];

      const createTx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        actions,
        deposits,
        { value: ethers.parseEther("0.1") } // Enough for reward + gas reimbursement
      );

      const createReceipt = await createTx.wait();
      const taskCreatedEvent = createReceipt?.logs.find((log: any) => {
        try {
          const parsed = taskFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === "TaskCreated";
        } catch {
          return false;
        }
      });

      const parsedEvent = taskFactory.interface.parseLog({
        topics: taskCreatedEvent!.topics as string[],
        data: taskCreatedEvent!.data,
      });

      const taskId = parsedEvent!.args[0];
      console.log(`✅ Task created with ID: ${taskId}`);

      // Verify conditions are NOT met
      const [canExecute, reason] = await adapter.canExecute(actionParams);
      expect(canExecute).to.be.false;
      expect(reason).to.equal("ETH price too high");
      console.log(`✅ Adapter conditions NOT met: ${reason}`);

      // Verify actions are stored on-chain
      const [taskCoreAddressCheck] = await taskFactory.getTaskAddresses(taskId);
      const taskCoreCheck = await ethers.getContractAt("TaskCore", taskCoreAddressCheck);
      const storedActionsCheck = await taskCoreCheck.getActions();
      expect(storedActionsCheck.length).to.equal(1);
      console.log(`✅ Actions verified stored on-chain`);

      // Execute - should complete but actions will fail internally
      const executeTx = await executorHub
        .connect(executor)
        .executeTask(taskId);

      await executeTx.wait();

      // Verify execution was recorded as failed
      const [taskCoreAddressVerify] = await taskFactory.getTaskAddresses(taskId);
      const taskCoreVerify = await ethers.getContractAt("TaskCore", taskCoreAddressVerify);
      const metadata = await taskCoreVerify.getMetadata();

      // Task execution count should still be 0 (failed execution doesn't count)
      console.log(`   Task execution count: ${metadata.executionCount}`);

      const executorInfo = await executorHub.getExecutor(executor.address);
      // Note: Second execution recorded failure
      expect(executorInfo.totalExecutions).to.be.gte(1);
      expect(executorInfo.failedExecutions).to.be.gte(1);
      console.log(`✅ Execution failed as expected`);
      console.log(`   Total executions: ${executorInfo.totalExecutions}`);
      console.log(`   Failed executions: ${executorInfo.failedExecutions}`);
    });
  });

  describe("Multiple Execution Tests - Task Execution Validation", function () {
    it("Should prevent execution when maxExecutions is reached", async function () {
      this.timeout(30000); // Allow 30 seconds for this test
      console.log("\n========== TEST: PREVENT EXECUTION AT MAX EXECUTIONS ==========");

      // Create fresh executor for this test
      const [, , , freshExecutor] = await ethers.getSigners();
      await executorHub.connect(freshExecutor).registerExecutor({ value: MIN_STAKE });

      // Create task with maxExecutions = 1
      const taskParams = {
        expiresAt: (await ethers.provider.getBlock("latest"))!.timestamp + 3600, // 1 hour
        maxExecutions: 1, // Only allow ONE execution
        recurringInterval: 0,
        rewardPerExecution: TASK_REWARD,
        seedCommitment: ethers.ZeroHash,
      };

      const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "uint256"],
        [
          await mockRouter.getAddress(),
          await mockUSDC.getAddress(),
          await mockWETH.getAddress(),
          ethers.parseUnits("500", 6),
          ethers.parseEther("0.15"),
          user.address,
          3100e8, // Price condition will be met
        ]
      );

      const actions = [
        {
          selector: ethers.id("buyLimitOrder").slice(0, 10),
          protocol: await mockRouter.getAddress(),
          params: actionParams,
        },
      ];

      await mockUSDC.connect(user).approve(
        await taskFactory.getAddress(),
        ethers.parseUnits("500", 6)
      );

      const deposits = [
        {
          token: await mockUSDC.getAddress(),
          amount: ethers.parseUnits("500", 6),
        },
      ];

      const createTx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        actions,
        deposits,
        { value: ethers.parseEther("0.1") }
      );

      const createReceipt = await createTx.wait();
      const taskCreatedEvent = createReceipt?.logs.find((log: any) => {
        try {
          const parsed = taskFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === "TaskCreated";
        } catch {
          return false;
        }
      });

      const parsedEvent = taskFactory.interface.parseLog({
        topics: taskCreatedEvent!.topics as string[],
        data: taskCreatedEvent!.data,
      });

      const taskId = parsedEvent!.args[0];
      const [taskCoreAddress] = await taskFactory.getTaskAddresses(taskId);
      const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);

      console.log(`✅ Task created with maxExecutions: 1`);

      // First execution should succeed
      console.log(`\n📝 Executing task (execution #1)...`);
      const executeTx1 = await executorHub.connect(freshExecutor).executeTask(taskId);
      await executeTx1.wait();

      const metadata1 = await taskCore.getMetadata();
      expect(metadata1.executionCount).to.equal(1);
      expect(metadata1.status).to.equal(3); // COMPLETED status
      console.log(`✅ First execution succeeded`);
      console.log(`   Execution count: ${metadata1.executionCount}`);
      console.log(`   Status: COMPLETED`);

      // Second execution should FAIL - maxExecutions reached
      console.log(`\n📝 Attempting second execution (should fail)...`);
      try {
        await executorHub.connect(freshExecutor).executeTask(taskId);
        expect.fail("Should have reverted on second execution");
      } catch (error: any) {
        expect(error.message).to.include("Task not executable");
        console.log(`✅ Second execution correctly reverted: "Task not executable"`);
      }

      // Verify task is still COMPLETED
      const metadata2 = await taskCore.getMetadata();
      expect(metadata2.executionCount).to.equal(1);
      expect(metadata2.status).to.equal(3); // Still COMPLETED
      console.log(`✅ Task remains COMPLETED after failed execution attempt`);
    });

    it("Should allow multiple executions when maxExecutions > 1", async function () {
      console.log("\n========== TEST: ALLOW MULTIPLE EXECUTIONS WITH maxExecutions=3 ==========");

      // Create task with maxExecutions = 3 (recurring)
      const taskParams = {
        expiresAt: (await ethers.provider.getBlock("latest"))!.timestamp + 86400,
        maxExecutions: 3, // Allow up to 3 executions
        recurringInterval: 0, // No interval - can execute immediately
        rewardPerExecution: TASK_REWARD,
        seedCommitment: ethers.ZeroHash,
      };

      const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "uint256"],
        [
          await mockRouter.getAddress(),
          await mockUSDC.getAddress(),
          await mockWETH.getAddress(),
          ethers.parseUnits("300", 6),
          ethers.parseEther("0.09"),
          user.address,
          3100e8,
        ]
      );

      const actions = [
        {
          selector: ethers.id("buyLimitOrder").slice(0, 10),
          protocol: await mockRouter.getAddress(),
          params: actionParams,
        },
      ];

      await mockUSDC.connect(user).approve(
        await taskFactory.getAddress(),
        ethers.parseUnits("900", 6) // 300 * 3 executions
      );

      const deposits = [
        {
          token: await mockUSDC.getAddress(),
          amount: ethers.parseUnits("900", 6),
        },
      ];

      const createTx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        actions,
        deposits,
        { value: ethers.parseEther("0.1") }
      );

      const createReceipt = await createTx.wait();
      const taskCreatedEvent = createReceipt?.logs.find((log: any) => {
        try {
          const parsed = taskFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === "TaskCreated";
        } catch {
          return false;
        }
      });

      const parsedEvent = taskFactory.interface.parseLog({
        topics: taskCreatedEvent!.topics as string[],
        data: taskCreatedEvent!.data,
      });

      const taskId = parsedEvent!.args[0];
      const [taskCoreAddress] = await taskFactory.getTaskAddresses(taskId);
      const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);

      console.log(`✅ Task created with maxExecutions: 3`);

      // Execute 3 times
      for (let i = 1; i <= 3; i++) {
        console.log(`\n📝 Executing task (execution #${i})...`);
        const executeTx = await executorHub.connect(executor).executeTask(taskId);
        await executeTx.wait();

        const metadata = await taskCore.getMetadata();
        expect(metadata.executionCount).to.equal(i);
        console.log(`✅ Execution #${i} succeeded`);
        console.log(`   Execution count: ${metadata.executionCount}`);

        if (i === 3) {
          expect(metadata.status).to.equal(3); // COMPLETED
          console.log(`   Status: COMPLETED`);
        } else {
          expect(metadata.status).to.equal(0); // ACTIVE
          console.log(`   Status: ACTIVE (can continue)`);
        }
      }

      // Fourth execution should fail
      console.log(`\n📝 Attempting execution #4 (should fail)...`);
      try {
        await executorHub.connect(executor).executeTask(taskId);
        expect.fail("Should have reverted on 4th execution");
      } catch (error: any) {
        expect(error.message).to.include("Task not executable");
        console.log(`✅ Fourth execution correctly reverted: "Task not executable"`);
      }
    });

    it("Should prevent execution when task is paused", async function () {
      console.log("\n========== TEST: PREVENT EXECUTION WHEN TASK IS PAUSED ==========");

      // Create task
      const taskParams = {
        expiresAt: (await ethers.provider.getBlock("latest"))!.timestamp + 86400,
        maxExecutions: 5,
        recurringInterval: 0,
        rewardPerExecution: TASK_REWARD,
        seedCommitment: ethers.ZeroHash,
      };

      const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "uint256"],
        [
          await mockRouter.getAddress(),
          await mockUSDC.getAddress(),
          await mockWETH.getAddress(),
          ethers.parseUnits("400", 6),
          ethers.parseEther("0.12"),
          user.address,
          3100e8,
        ]
      );

      const actions = [
        {
          selector: ethers.id("buyLimitOrder").slice(0, 10),
          protocol: await mockRouter.getAddress(),
          params: actionParams,
        },
      ];

      await mockUSDC.connect(user).approve(
        await taskFactory.getAddress(),
        ethers.parseUnits("400", 6)
      );

      const deposits = [
        {
          token: await mockUSDC.getAddress(),
          amount: ethers.parseUnits("400", 6),
        },
      ];

      const createTx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        actions,
        deposits,
        { value: ethers.parseEther("0.1") }
      );

      const createReceipt = await createTx.wait();
      const taskCreatedEvent = createReceipt?.logs.find((log: any) => {
        try {
          const parsed = taskFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === "TaskCreated";
        } catch {
          return false;
        }
      });

      const parsedEvent = taskFactory.interface.parseLog({
        topics: taskCreatedEvent!.topics as string[],
        data: taskCreatedEvent!.data,
      });

      const taskId = parsedEvent!.args[0];
      const [taskCoreAddress] = await taskFactory.getTaskAddresses(taskId);
      const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);

      console.log(`✅ Task created`);

      // Pause the task
      console.log(`\n📝 Pausing task...`);
      await taskCore.connect(user).pause();
      const metadataPaused = await taskCore.getMetadata();
      expect(metadataPaused.status).to.equal(1); // PAUSED status
      console.log(`✅ Task paused`);

      // Try to execute - should fail
      console.log(`\n📝 Attempting execution on paused task (should fail)...`);
      try {
        await executorHub.connect(executor).executeTask(taskId);
        expect.fail("Should have reverted when task is paused");
      } catch (error: any) {
        expect(error.message).to.include("Task not executable");
        console.log(`✅ Execution correctly reverted: "Task not executable"`);
      }

      // Resume the task
      console.log(`\n📝 Resuming task...`);
      await taskCore.connect(user).resume();
      const metadataResumed = await taskCore.getMetadata();
      expect(metadataResumed.status).to.equal(0); // ACTIVE status
      console.log(`✅ Task resumed`);

      // Now execution should succeed
      console.log(`\n📝 Executing resumed task...`);
      const executeTx = await executorHub.connect(executor).executeTask(taskId);
      await executeTx.wait();
      console.log(`✅ Execution succeeded on resumed task`);
    });

    it("Should prevent execution when task is expired", async function () {
      this.timeout(60000); // Allow 60 seconds for this test
      console.log("\n========== TEST: PREVENT EXECUTION WHEN TASK IS EXPIRED ==========");

      // Create task that expires soon (15 seconds from now)
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const taskParams = {
        expiresAt: now + 15, // Expires in 15 seconds
        maxExecutions: 5,
        recurringInterval: 0,
        rewardPerExecution: TASK_REWARD,
        seedCommitment: ethers.ZeroHash,
      };

      const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "uint256"],
        [
          await mockRouter.getAddress(),
          await mockUSDC.getAddress(),
          await mockWETH.getAddress(),
          ethers.parseUnits("200", 6),
          ethers.parseEther("0.06"),
          user.address,
          3100e8,
        ]
      );

      const actions = [
        {
          selector: ethers.id("buyLimitOrder").slice(0, 10),
          protocol: await mockRouter.getAddress(),
          params: actionParams,
        },
      ];

      await mockUSDC.connect(user).approve(
        await taskFactory.getAddress(),
        ethers.parseUnits("200", 6)
      );

      const deposits = [
        {
          token: await mockUSDC.getAddress(),
          amount: ethers.parseUnits("200", 6),
        },
      ];

      const createTx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        actions,
        deposits,
        { value: ethers.parseEther("0.1") }
      );

      const createReceipt = await createTx.wait();
      const taskCreatedEvent = createReceipt?.logs.find((log: any) => {
        try {
          const parsed = taskFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === "TaskCreated";
        } catch {
          return false;
        }
      });

      const parsedEvent = taskFactory.interface.parseLog({
        topics: taskCreatedEvent!.topics as string[],
        data: taskCreatedEvent!.data,
      });

      const taskId = parsedEvent!.args[0];
      const [taskCoreAddress] = await taskFactory.getTaskAddresses(taskId);
      const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);

      console.log(`✅ Task created with expiration in 15 seconds`);

      // Wait for task to expire
      console.log(`\n📝 Fast forwarding time by 16 seconds for task to expire...`);
      await network.provider.send("evm_increaseTime", [16]);
      await network.provider.send("evm_mine");

      const metadataBeforeExp = await taskCore.getMetadata();
      console.log(`\n📝 Task Metadata before expiration check: expiresAt=${metadataBeforeExp.expiresAt}, currentTimestamp=${(await ethers.provider.getBlock("latest")).timestamp}`);

      // Check task is expired
      const isExecutable = await taskCore.isExecutable();
      expect(isExecutable).to.be.false;
      console.log(`✅ Task has expired`);

      // Try to execute - should fail
      console.log(`\n📝 Attempting execution on expired task (should fail)...`);
      try {
        await executorHub.connect(executor).executeTask(taskId);
        expect.fail("Should have reverted when task is expired");
      } catch (error: any) {
        expect(error.message).to.include("Task not executable");
        console.log(`✅ Execution correctly reverted: "Task not executable"`);
      }
    });

    it("Should prevent execution when recurring interval not met", async function () {
      this.timeout(60000); // Allow 60 seconds for this test
      console.log("\n========== TEST: RECURRING TASK INTERVAL VALIDATION ==========");

      // Create recurring task with 10 second interval
      const taskParams = {
        expiresAt: (await ethers.provider.getBlock("latest"))!.timestamp + 180, // 3 minutes
        maxExecutions: 0, // Unlimited executions
        recurringInterval: 10, // 10 second interval between executions
        rewardPerExecution: TASK_REWARD,
        seedCommitment: ethers.ZeroHash,
      };

      const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address", "uint256"],
        [
          await mockRouter.getAddress(),
          await mockUSDC.getAddress(),
          await mockWETH.getAddress(),
          ethers.parseUnits("100", 6),
          ethers.parseEther("0.03"),
          user.address,
          3100e8,
        ]
      );

      const actions = [
        {
          selector: ethers.id("buyLimitOrder").slice(0, 10),
          protocol: await mockRouter.getAddress(),
          params: actionParams,
        },
      ];

      await mockUSDC.connect(user).approve(
        await taskFactory.getAddress(),
        ethers.parseUnits("1000", 6) // Plenty for multiple executions
      );

      const deposits = [
        {
          token: await mockUSDC.getAddress(),
          amount: ethers.parseUnits("1000", 6),
        },
      ];

      const createTx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        actions,
        deposits,
        { value: ethers.parseEther("0.1") }
      );

      const createReceipt = await createTx.wait();
      const taskCreatedEvent = createReceipt?.logs.find((log: any) => {
        try {
          const parsed = taskFactory.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsed?.name === "TaskCreated";
        } catch {
          return false;
        }
      });

      const parsedEvent = taskFactory.interface.parseLog({
        topics: taskCreatedEvent!.topics as string[],
        data: taskCreatedEvent!.data,
      });

      const taskId = parsedEvent!.args[0];
      const [taskCoreAddress] = await taskFactory.getTaskAddresses(taskId);
      const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);

      console.log(`✅ Recurring task created with 10 second interval`);

      // First execution should succeed
      console.log(`\n📝 First execution...`);
      const executeTx1 = await executorHub.connect(executor).executeTask(taskId);
      await executeTx1.wait();

      const metadata1 = await taskCore.getMetadata();
      expect(metadata1.executionCount).to.equal(1);
      console.log(`✅ First execution succeeded`);
      console.log(`   Last execution time set`);

      // Second execution immediately should fail (interval not met)
      console.log(`\n📝 Attempting second execution immediately (should fail)...`);
      try {
        await executorHub.connect(executor).executeTask(taskId);
        expect.fail("Should have reverted - interval not met");
      } catch (error: any) {
        expect(error.message).to.include("Task not executable");
        console.log(`✅ Second execution correctly reverted: "Task not executable"`);
      }

      // Wait for interval to pass
      console.log(`\n📝 Waiting 11 seconds for interval to pass...`);
      await new Promise((resolve) => setTimeout(resolve, 11000));

      // Second execution should now succeed
      console.log(`\n📝 Second execution after interval...`);
      const executeTx2 = await executorHub.connect(executor).executeTask(taskId);
      await executeTx2.wait();

      const metadata2 = await taskCore.getMetadata();
      expect(metadata2.executionCount).to.equal(2);
      console.log(`✅ Second execution succeeded after interval`);
      console.log(`   Execution count: ${metadata2.executionCount}`);
    });

    it("Should revert with specific error when task registry not set", async function () {
      console.log("\n========== TEST: ERROR HANDLING - REGISTRY NOT SET ==========");

      // Create a new ExecutorHub instance without registry set
      const newExecutorHub = await (await ethers.getContractFactory("ExecutorHub")).deploy(deployer.address);
      await newExecutorHub.waitForDeployment();

      const taskId = 999; // Non-existent task

      console.log(`✅ Created new ExecutorHub without registry set`);

      // Try to execute - should fail with specific error
      console.log(`\n📝 Attempting execution without registry (should fail)...`);
      try {
        await newExecutorHub.connect(executor).executeTask(taskId);
        expect.fail("Should have reverted - registry not set");
      } catch (error: any) {
        expect(error.message).to.include("Task registry not set");
        console.log(`✅ Execution correctly reverted: "Task registry not set"`);
      }
    });

    it("Should revert with specific error when task not found", async function () {
      console.log("\n========== TEST: ERROR HANDLING - TASK NOT FOUND ==========");

      const invalidTaskId = 9999;

      console.log(`\n📝 Attempting execution for non-existent task...`);
      try {
        await executorHub.connect(executor).executeTask(invalidTaskId);
        expect.fail("Should have reverted - task not found");
      } catch (error: any) {
        expect(error.message).to.include("Task not found");
        console.log(`✅ Execution correctly reverted: "Task not found"`);
      }
    });
  });
});
