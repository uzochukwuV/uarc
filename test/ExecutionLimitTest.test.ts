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
 * @title Execution Limit Enforcement Test
 * @notice Comprehensive test to verify task execution limits are enforced
 *
 * Tests:
 * 1. Single execution task (maxExecutions: 1)
 * 2. Limited execution task (maxExecutions: 5)
 * 3. Unlimited execution task (maxExecutions: 0)
 * 4. Execution state transitions
 * 5. Execution count increments
 * 6. Task status changes to COMPLETED when limit reached
 */
describe("TaskerOnChain - Execution Limit Enforcement", function () {
  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let executor: SignerWithAddress;

  let mockUSDC: any;
  let mockWETH: any;
  let mockRouter: any;
  let mockPriceFeed: any;

  let taskFactory: TaskFactory;
  let taskLogic: TaskLogicV2;
  let executorHub: ExecutorHub;
  let actionRegistry: ActionRegistry;
  let rewardManager: RewardManager;
  let globalRegistry: GlobalRegistry;
  let taskCoreImpl: TaskCore;
  let taskVaultImpl: TaskVault;
  let adapter: MockUniswapUSDCETHBuyLimitAdapter;

  const INITIAL_ETH_PRICE = 3000e8;
  const MIN_STAKE = ethers.parseEther("0.1");
  const TASK_REWARD = ethers.parseEther("0.01");

  before(async function () {
    [deployer, user, executor] = await ethers.getSigners();
  });

  beforeEach(async function () {
    // Deploy mock tokens
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

    // Deploy system contracts
    const TaskCore = await ethers.getContractFactory("TaskCore");
    taskCoreImpl = await TaskCore.deploy();
    await taskCoreImpl.waitForDeployment();

    const TaskVault = await ethers.getContractFactory("TaskVault");
    taskVaultImpl = await TaskVault.deploy();
    await taskVaultImpl.waitForDeployment();

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

    // Configure system contracts
    await taskLogic.setActionRegistry(await actionRegistry.getAddress());
    await taskLogic.setRewardManager(await rewardManager.getAddress());
    await taskLogic.setExecutorHub(await executorHub.getAddress());
    await taskLogic.setTaskRegistry(await taskFactory.getAddress());

    await executorHub.setTaskLogic(await taskLogic.getAddress());
    await executorHub.setTaskRegistry(await taskFactory.getAddress());

    await rewardManager.setTaskLogic(await taskLogic.getAddress());
    await rewardManager.setExecutorHub(await executorHub.getAddress());
    await rewardManager.setGasReimbursementMultiplier(100);

    await globalRegistry.authorizeFactory(await taskFactory.getAddress());
    await taskFactory.setGlobalRegistry(await globalRegistry.getAddress());

    // Deploy and register adapter
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

    const adapterSelector = ethers.id("buyLimitOrder").slice(0, 10);
    await actionRegistry.registerAdapter(
      adapterSelector,
      await adapter.getAddress(),
      500000,
      true
    );

    await actionRegistry.approveProtocol(await mockRouter.getAddress());

    // Setup liquidity
    await mockUSDC.mint(await mockRouter.getAddress(), ethers.parseUnits("1000000", 6));
    await mockWETH.mint(await mockRouter.getAddress(), ethers.parseEther("1000"));

    // Setup user balance
    await mockUSDC.mint(user.address, ethers.parseUnits("100000", 6));

    // Register executor
    await executorHub.connect(executor).registerExecutor({ value: MIN_STAKE });
  });

  describe("Execution Limit Enforcement", function () {
    it("Should enforce single execution limit (maxExecutions: 1)", async function () {
      console.log("\n========== TEST: Single Execution Limit ==========");

      // Create task with maxExecutions: 1
      const taskParams = {
        expiresAt: (await ethers.provider.getBlock("latest"))!.timestamp + 86400,
        maxExecutions: 1,
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
          ethers.parseUnits("1000", 6),
          ethers.parseEther("0.3"),
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

      // EXECUTION 1: Should succeed
      console.log("\n--- Execution 1 ---");
      let metadata = await taskCore.getMetadata();
      console.log(`Before execution 1:`);
      console.log(`  Status: ${metadata.status}`);
      console.log(`  executionCount: ${metadata.executionCount}`);
      console.log(`  maxExecutions: ${metadata.maxExecutions}`);

      const executeTx1 = await executorHub.connect(executor).executeTask(taskId);
      const executeReceipt1 = await executeTx1.wait();

      metadata = await taskCore.getMetadata();
      console.log(`After execution 1:`);
      console.log(`  Status: ${metadata.status} (0=ACTIVE, 3=COMPLETED)`);
      console.log(`  executionCount: ${metadata.executionCount}`);
      console.log(`  Task should be COMPLETED now`);

      expect(metadata.executionCount).to.equal(1n, "Execution count should be 1");
      expect(metadata.status).to.equal(3, "Task should be COMPLETED (status 3)");

      // EXECUTION 2: Should fail
      console.log("\n--- Execution 2 (should fail) ---");
      try {
        const executeTx2 = await executorHub.connect(executor).executeTask(taskId);
        await executeTx2.wait();
        throw new Error("Execution 2 should have failed!");
      } catch (error: any) {
        console.log(`✅ Execution 2 correctly failed: ${error.reason || error.message}`);
      }

      metadata = await taskCore.getMetadata();
      console.log(`After failed execution 2:`);
      console.log(`  Status: ${metadata.status}`);
      console.log(`  executionCount: ${metadata.executionCount}`);
      console.log(`  Task should still be COMPLETED`);

      expect(metadata.executionCount).to.equal(1n, "Execution count should still be 1");
      expect(metadata.status).to.equal(3, "Task should still be COMPLETED");

      console.log("\n✅ Single execution limit enforcement PASSED");
    });

    it("Should enforce multiple execution limits (maxExecutions: 3)", async function () {
      console.log("\n========== TEST: Multiple Execution Limit ==========");

      const taskParams = {
        expiresAt: (await ethers.provider.getBlock("latest"))!.timestamp + 86400,
        maxExecutions: 3,
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
          ethers.parseUnits("1000", 6),
          ethers.parseEther("0.3"),
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
        ethers.parseUnits("3000", 6)
      );

      const deposits = [
        {
          token: await mockUSDC.getAddress(),
          amount: ethers.parseUnits("3000", 6),
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

      // Execute 3 times
      for (let i = 1; i <= 3; i++) {
        console.log(`\n--- Execution ${i} ---`);
        const metadata = await taskCore.getMetadata();
        console.log(`Before: executionCount=${metadata.executionCount}, status=${metadata.status}`);

        const executeTx = await executorHub.connect(executor).executeTask(taskId);
        await executeTx.wait();

        const metadataAfter = await taskCore.getMetadata();
        console.log(`After: executionCount=${metadataAfter.executionCount}, status=${metadataAfter.status}`);
        expect(metadataAfter.executionCount).to.equal(BigInt(i));
      }

      // 4th execution should fail
      console.log(`\n--- Execution 4 (should fail) ---`);
      try {
        await executorHub.connect(executor).executeTask(taskId);
        throw new Error("Execution 4 should have failed!");
      } catch (error: any) {
        console.log(`✅ Execution 4 correctly failed`);
      }

      const finalMetadata = await taskCore.getMetadata();
      expect(finalMetadata.executionCount).to.equal(3n);
      expect(finalMetadata.status).to.equal(3); // COMPLETED

      console.log("\n✅ Multiple execution limit enforcement PASSED");
    });

    it("Should allow unlimited executions when maxExecutions is 0", async function () {
      console.log("\n========== TEST: Unlimited Executions (maxExecutions: 0) ==========");

      const taskParams = {
        expiresAt: (await ethers.provider.getBlock("latest"))!.timestamp + 86400,
        maxExecutions: 0, // ← UNLIMITED
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
          ethers.parseUnits("1000", 6),
          ethers.parseEther("0.3"),
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
        ethers.parseUnits("10000", 6)
      );

      const deposits = [
        {
          token: await mockUSDC.getAddress(),
          amount: ethers.parseUnits("10000", 6),
        },
      ];

      const createTx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        actions,
        deposits,
        { value: ethers.parseEther("1") }  // More funds for many executions
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

      // Execute multiple times
      for (let i = 1; i <= 5; i++) {
        const metadata = await taskCore.getMetadata();
        console.log(`Execution ${i}: count=${metadata.executionCount}, maxExecutions=${metadata.maxExecutions}, status=${metadata.status}`);

        const executeTx = await executorHub.connect(executor).executeTask(taskId);
        await executeTx.wait();

        const metadataAfter = await taskCore.getMetadata();
        expect(metadataAfter.executionCount).to.equal(BigInt(i));
        expect(metadataAfter.status).to.equal(0); // Should stay ACTIVE, not COMPLETED
      }

      const finalMetadata = await taskCore.getMetadata();
      console.log(`\nFinal state: executionCount=${finalMetadata.executionCount}, status=${finalMetadata.status}`);
      console.log(`Task should still be ACTIVE because maxExecutions=0 (unlimited)`);

      expect(finalMetadata.executionCount).to.equal(5n);
      expect(finalMetadata.status).to.equal(0); // ACTIVE, not COMPLETED

      console.log("\n✅ Unlimited execution test PASSED");
    });
  });
});
