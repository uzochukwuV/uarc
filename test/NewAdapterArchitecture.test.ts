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
 * 1. TaskFactory - Creates tasks, deploys TaskCore + TaskVault clones
 * 2. TaskCore - Stores task metadata, manages state
 * 3. TaskVault - Holds funds (ETH + ERC20), executes actions through adapters
 * 4. ExecutorHub - Manages executors, implements commit-reveal for execution
 * 5. TaskLogicV2 - Orchestrates execution: verify proofs, call adapters, distribute rewards
 * 6. Adapter - Checks conditions (canExecute) + executes actions (execute)
 *
 * FLOW:
 * User → TaskFactory.createTaskWithTokens()
 *   → deploys TaskCore + TaskVault
 *   → deposits tokens into vault
 *   → registers with GlobalRegistry
 *
 * Executor → ExecutorHub.requestExecution(commitment)
 *   → locks task for executor
 *
 * Executor → ExecutorHub.executeTask(reveal, actionsProof)
 *   → verifies commitment
 *   → calls TaskLogicV2.executeTask()
 *     → verifies action proofs
 *     → calls adapter.execute() (adapter checks canExecute internally)
 *     → distributes rewards
 *     → marks task complete
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
        expiresAt: Math.floor(Date.now() / 1000) + 86400, // 1 day
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

      // ========== STEP 2: VERIFY ADAPTER CONDITIONS ==========

      console.log("\n========== STEP 2: VERIFY ADAPTER CONDITIONS ==========");

      const [canExecute, reason] = await adapter.canExecute(actionParams);
      expect(canExecute).to.be.true;
      console.log(`✅ Adapter conditions met: ${reason}`);

      // ========== STEP 3: PREPARE FOR EXECUTION ==========
      // TESTNET: No commit-reveal pattern, execution is direct

      console.log("\n========== STEP 3: PREPARE FOR EXECUTION ==========");
      console.log(`✅ Ready to execute task ${taskId} directly (no commit-reveal on testnet)`);

      // ========== STEP 4: PREPARE ACTIONS PROOF ==========

      console.log("\n========== STEP 4: PREPARE ACTIONS PROOF ==========");

      // Build actions array matching TaskLogicV2.Action struct
      const actionForProof = {
        selector: ethers.id("buyLimitOrder").slice(0, 10),
        protocol: await mockRouter.getAddress(),
        params: actionParams,
      };

      // Encode actions proof (single action, no merkle proof needed)
      const actionsProof = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          "tuple(bytes4 selector, address protocol, bytes params)[]",
          "bytes32[]"
        ],
        [
          [actionForProof],
          [] // Empty merkle proof for single action
        ]
      );

      console.log(`✅ Actions proof prepared`);

      // ========== STEP 5: EXECUTE TASK ==========

      console.log("\n========== STEP 5: EXECUTE TASK ==========");

      const executorBalanceBefore = await ethers.provider.getBalance(executor.address);
      const userWETHBefore = await mockWETH.balanceOf(user.address);

      // TESTNET: Direct execution, no commit-reveal
      const executeTx = await executorHub
        .connect(executor)
        .executeTask(taskId, actionsProof);

      const executeReceipt = await executeTx.wait();

      console.log(`✅ Task executed successfully`);

      // ========== STEP 6: VERIFY RESULTS ==========

      console.log("\n========== STEP 6: VERIFY RESULTS ==========");

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

      // Check task lock cleared
      const isLockedAfter = await executorHub.isTaskLocked(taskId);
      expect(isLockedAfter).to.be.false;
      console.log(`   Task lock cleared: ${!isLockedAfter}`);

      console.log("\n========== ✅ FULL FLOW COMPLETED SUCCESSFULLY ==========\n");
    });

    it("Should fail execution when adapter conditions are not met (price too high)", async function () {
      console.log("\n========== TEST: CONDITION NOT MET (PRICE TOO HIGH) ==========");

      // Create task with strict price limit (lower than current price)
      const taskParams = {
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
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

      // TESTNET: No commit-reveal, direct execution

      // Prepare proof
      const actionForProof = {
        selector: ethers.id("buyLimitOrder").slice(0, 10),
        protocol: await mockRouter.getAddress(),
        params: actionParams,
      };

      const actionsProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(bytes4 selector, address protocol, bytes params)[]", "bytes32[]"],
        [[actionForProof], []]
      );

      // Execute - should complete but actions will fail
      const executeTx = await executorHub
        .connect(executor)
        .executeTask(taskId, actionsProof);

      await executeTx.wait();

      // Verify execution was recorded as failed
      const [taskCoreAddress] = await taskFactory.getTaskAddresses(taskId);
      const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);
      const metadata = await taskCore.getMetadata();

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
});
