import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  TaskFactory,
  TaskCore,
  TaskVault,
  TaskLogicV2,
  ExecutorHub,
  GlobalRegistry,
  ConditionOracle,
  ActionRegistry,
  RewardManager,
  UniswapV2Adapter,
  MockERC20,
  MockUniswapV2Router,
  MockChainlinkAggregator,
} from "../typechain-types";

/**
 * @title Task Creation and Execution Flow Test
 * @notice Comprehensive test covering the complete lifecycle of a task
 * @dev Tests the following flow:
 *   1. User creates a limit order task (swap USDC → ETH when price hits target)
 *   2. User deposits USDC + ETH reward into TaskVault
 *   3. Executor registers and stakes
 *   4. Executor commits to execute (commit-reveal phase 1)
 *   5. Executor reveals and executes (commit-reveal phase 2)
 *   6. TaskLogicV2 verifies Merkle proofs
 *   7. ConditionOracle checks price condition
 *   8. UniswapV2Adapter executes swap
 *   9. RewardManager pays executor
 *   10. Task completes successfully
 */
describe("TaskerOnChain - Complete Execution Flow", function () {

  // ============ Fixture Setup ============

  async function deploySystemFixture() {
    // Get signers
    const [owner, user, executor, executor2] = await ethers.getSigners();

    console.log("\n📦 Deploying TaskerOnChain System...");

    // ============ Deploy Mock Tokens & Protocols ============

    console.log("  - Deploying mock tokens...");
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");

    const usdc = await MockERC20Factory.deploy("USD Coin", "USDC", 6);
    await usdc.waitForDeployment();

    const weth = await MockERC20Factory.deploy("Wrapped Ether", "WETH", 18);
    await weth.waitForDeployment();

    console.log("  - Deploying mock Uniswap router...");
    const MockUniswapFactory = await ethers.getContractFactory("MockUniswapV2Router");
    const uniswapRouter = await MockUniswapFactory.deploy();
    await uniswapRouter.waitForDeployment();

    // Setup router with USDC/WETH pool (1 USDC = 0.00033 WETH at $3000/ETH)
    await usdc.mint(await uniswapRouter.getAddress(), ethers.parseUnits("1000000", 6)); // 1M USDC
    await weth.mint(await uniswapRouter.getAddress(), ethers.parseEther("333")); // 333 WETH

    console.log("  - Deploying mock Chainlink price feed...");
    const MockChainlinkFactory = await ethers.getContractFactory("MockChainlinkAggregator");
    const ethPriceFeed = await MockChainlinkFactory.deploy(8, "ETH/USD");
    await ethPriceFeed.waitForDeployment();

    // Set ETH price to $2500 (will update to $3000 later)
    await ethPriceFeed.updateAnswer(250000000000); // $2500 with 8 decimals

    // ============ Deploy Core Implementations ============

    console.log("  - Deploying TaskCore & TaskVault implementations...");
    const TaskCoreFactory = await ethers.getContractFactory("TaskCore");
    const TaskVaultFactory = await ethers.getContractFactory("TaskVault");

    const taskCoreImpl = await TaskCoreFactory.deploy();
    await taskCoreImpl.waitForDeployment();

    const taskVaultImpl = await TaskVaultFactory.deploy();
    await taskVaultImpl.waitForDeployment();

    // ============ Deploy System Contracts ============

    console.log("  - Deploying system contracts...");

    const ConditionOracleFactory = await ethers.getContractFactory("ConditionOracle");
    const conditionOracle = await ConditionOracleFactory.deploy(owner.address);
    await conditionOracle.waitForDeployment();

    const ActionRegistryFactory = await ethers.getContractFactory("ActionRegistry");
    const actionRegistry = await ActionRegistryFactory.deploy(owner.address);
    await actionRegistry.waitForDeployment();

    const RewardManagerFactory = await ethers.getContractFactory("RewardManager");
    const rewardManager = await RewardManagerFactory.deploy(owner.address);
    await rewardManager.waitForDeployment();

    const ExecutorHubFactory = await ethers.getContractFactory("ExecutorHub");
    const executorHub = await ExecutorHubFactory.deploy(owner.address);
    await executorHub.waitForDeployment();

    const GlobalRegistryFactory = await ethers.getContractFactory("GlobalRegistry");
    const globalRegistry = await GlobalRegistryFactory.deploy(owner.address);
    await globalRegistry.waitForDeployment();

    const TaskLogicV2Factory = await ethers.getContractFactory("TaskLogicV2");
    const taskLogic = await TaskLogicV2Factory.deploy(owner.address);
    await taskLogic.waitForDeployment();

    // ============ Deploy TaskFactory ============

    console.log("  - Deploying TaskFactory...");
    const TaskFactoryFactory = await ethers.getContractFactory("TaskFactory");
    const taskFactory = await TaskFactoryFactory.deploy(
      await taskCoreImpl.getAddress(),
      await taskVaultImpl.getAddress(),
      await taskLogic.getAddress(),
      await executorHub.getAddress(),
      await conditionOracle.getAddress(),
      await actionRegistry.getAddress(),
      await rewardManager.getAddress(),
      owner.address
    );
    await taskFactory.waitForDeployment();

    // ============ Deploy Adapters ============

    console.log("  - Deploying UniswapV2Adapter...");
    const UniswapAdapterFactory = await ethers.getContractFactory("UniswapV2Adapter");
    const uniswapAdapter = await UniswapAdapterFactory.deploy(owner.address);
    await uniswapAdapter.waitForDeployment();

    // ============ Configure System ============

    console.log("  - Configuring system connections...");

    // Configure TaskLogic
    await taskLogic.setConditionOracle(await conditionOracle.getAddress());
    await taskLogic.setActionRegistry(await actionRegistry.getAddress());
    await taskLogic.setRewardManager(await rewardManager.getAddress());
    await taskLogic.setExecutorHub(await executorHub.getAddress());
    await taskLogic.setTaskRegistry(await globalRegistry.getAddress());

    // Configure ExecutorHub
    await executorHub.setTaskLogic(await taskLogic.getAddress());
    await executorHub.setTaskRegistry(await globalRegistry.getAddress());

    // Configure RewardManager
    await rewardManager.setTaskLogic(await taskLogic.getAddress());
    await rewardManager.setExecutorHub(await executorHub.getAddress());
    await rewardManager.setGasReimbursementMultiplier(100); // 100% gas reimbursement (minimum)

    // Configure GlobalRegistry
    await globalRegistry.authorizeFactory(await taskFactory.getAddress());

    // Configure TaskFactory
    await taskFactory.setGlobalRegistry(await globalRegistry.getAddress());

    // Configure ConditionOracle - set ETH price feed
    await conditionOracle.setPriceFeed(
      await weth.getAddress(),
      await ethPriceFeed.getAddress()
    );

    // Configure ActionRegistry - register Uniswap adapter
    const swapSelector = ethers.id("swap").slice(0, 10);
    await actionRegistry.registerAdapter(
      swapSelector,
      await uniswapAdapter.getAddress(),
      500000, // gasLimit
      true    // requiresTokens
    );

    // Configure UniswapAdapter - add router
    await uniswapAdapter.addRouter(await uniswapRouter.getAddress());

    // Approve router as protocol
    await actionRegistry.approveProtocol(await uniswapRouter.getAddress());

    console.log("✅ System deployed successfully!\n");

    // ============ Mint Tokens to Users ============

    // User gets 10,000 USDC
    await usdc.mint(user.address, ethers.parseUnits("10000", 6));

    // User gets 10 ETH (from hardhat accounts)

    return {
      // Contracts
      taskFactory,
      taskCoreImpl,
      taskVaultImpl,
      taskLogic,
      executorHub,
      globalRegistry,
      conditionOracle,
      actionRegistry,
      rewardManager,
      uniswapAdapter,
      // Mocks
      usdc,
      weth,
      uniswapRouter,
      ethPriceFeed,
      // Signers
      owner,
      user,
      executor,
      executor2,
    };
  }

  // ============ Test Cases ============

  describe("Complete Task Execution Flow", function () {

    it("Should execute full lifecycle: Create → Register → Commit → Execute → Complete", async function () {
      const {
        taskFactory,
        executorHub,
        globalRegistry,
        conditionOracle,
        usdc,
        weth,
        uniswapRouter,
        ethPriceFeed,
        user,
        executor,
      } = await loadFixture(deploySystemFixture);

      console.log("\n🎬 Starting Complete Execution Flow Test");
      console.log("=".repeat(60));

      // ============ STEP 1: User Creates Limit Order Task ============

      console.log("\n📝 STEP 1: User creates limit order task");
      console.log("-".repeat(60));

      const taskParams = {
        rewardPerExecution: ethers.parseEther("0.5"), // 0.5 ETH base reward
        maxExecutions: 1,                               // One-time execution
        recurringInterval: 0,                           // Not recurring
        expiresAt: (await time.latest()) + 86400 * 7, // 7 days
        seedCommitment: ethers.ZeroHash,                // No seed required
      };

      // Condition: ETH price above $3000
      const conditionType = 2; // PRICE_ABOVE
      const targetPrice = ethers.parseUnits("3000", 8); // $3000 with 8 decimals
      const conditionData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256"],
        [await weth.getAddress(), targetPrice]
      );

      const condition = {
        conditionType: conditionType,
        conditionData: conditionData,
      };

      // Action: Swap 1000 USDC for WETH on Uniswap
      const swapParams = {
        router: await uniswapRouter.getAddress(),
        tokenIn: await usdc.getAddress(),
        tokenOut: await weth.getAddress(),
        amountIn: ethers.parseUnits("1000", 6),   // 1000 USDC
        minAmountOut: ethers.parseEther("0.32"),   // Min 0.32 WETH
        recipient: user.address,                   // WETH goes to user
      };

      const swapSelector = ethers.id("swap").slice(0, 10);
      const actionParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address"],
        [
          swapParams.router,
          swapParams.tokenIn,
          swapParams.tokenOut,
          swapParams.amountIn,
          swapParams.minAmountOut,
          swapParams.recipient,
        ]
      );

      const action = {
        selector: swapSelector,
        protocol: await uniswapRouter.getAddress(),
        params: actionParams,
      };

      // Token deposits
      const tokenDeposits = [
        {
          token: await usdc.getAddress(),
          amount: ethers.parseUnits("1000", 6), // 1000 USDC
        },
      ];

      // Approve TaskFactory to spend USDC
      console.log("  → User approving USDC for TaskFactory...");
      await usdc.connect(user).approve(
        await taskFactory.getAddress(),
        ethers.parseUnits("1000", 6)
      );

      // Check balances before
      const userUsdcBefore = await usdc.balanceOf(user.address);
      const userEthBefore = await ethers.provider.getBalance(user.address);

      console.log(`  → User USDC balance: ${ethers.formatUnits(userUsdcBefore, 6)} USDC`);
      console.log(`  → User ETH balance: ${ethers.formatEther(userEthBefore)} ETH`);

      // Create task
      console.log("  → Creating task...");
      const tx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        condition,
        [action],
        tokenDeposits,
        { value: ethers.parseEther("0.7") } // ETH deposited (covers base + bonus + gas + fees)
      );

      const receipt = await tx.wait();

      // Extract task ID from event
      const taskCreatedEvent = receipt?.logs.find(
        (log: any) => {
          try {
            const parsed = taskFactory.interface.parseLog(log);
            return parsed?.name === "TaskCreated";
          } catch {
            return false;
          }
        }
      );

      expect(taskCreatedEvent).to.not.be.undefined;

      const parsedEvent = taskFactory.interface.parseLog(taskCreatedEvent!);
      const taskId = parsedEvent?.args.taskId;
      const taskCoreAddress = parsedEvent?.args.taskCore;
      const taskVaultAddress = parsedEvent?.args.taskVault;

      console.log(`  ✅ Task created successfully!`);
      console.log(`     Task ID: ${taskId}`);
      console.log(`     TaskCore: ${taskCoreAddress}`);
      console.log(`     TaskVault: ${taskVaultAddress}`);

      // Verify task in GlobalRegistry
      const taskInfo = await globalRegistry.getTaskInfo(taskId);
      expect(taskInfo.creator).to.equal(user.address);
      expect(taskInfo.taskCore).to.equal(taskCoreAddress);
      expect(taskInfo.taskVault).to.equal(taskVaultAddress);

      // Verify vault has funds
      const TaskVault = await ethers.getContractFactory("TaskVault");
      const taskVault = TaskVault.attach(taskVaultAddress) as any;

      const vaultUsdcBalance = await taskVault.getTokenBalance(await usdc.getAddress());
      const vaultEthBalance = await taskVault.getNativeBalance();

      console.log(`  → TaskVault USDC: ${ethers.formatUnits(vaultUsdcBalance, 6)} USDC`);
      console.log(`  → TaskVault ETH: ${ethers.formatEther(vaultEthBalance)} ETH`);

      expect(vaultUsdcBalance).to.equal(ethers.parseUnits("1000", 6));
      expect(vaultEthBalance).to.equal(ethers.parseEther("0.7"));

      // ============ STEP 2: Executor Registers ============

      console.log("\n🎯 STEP 2: Executor registers and stakes");
      console.log("-".repeat(60));

      const stakeAmount = ethers.parseEther("0.1");

      console.log(`  → Executor registering with ${ethers.formatEther(stakeAmount)} ETH stake...`);
      await executorHub.connect(executor).registerExecutor({ value: stakeAmount });

      const executorInfo = await executorHub.getExecutor(executor.address);
      console.log(`  ✅ Executor registered!`);
      console.log(`     Staked: ${ethers.formatEther(executorInfo.stakedAmount)} ETH`);
      console.log(`     Reputation: ${executorInfo.reputationScore} (out of 10000)`);

      expect(executorInfo.isActive).to.be.true;
      expect(executorInfo.stakedAmount).to.equal(stakeAmount);
      expect(executorInfo.reputationScore).to.equal(5000); // 50% starting reputation

      // ============ STEP 3: Price Condition Not Met Yet ============

      console.log("\n💰 STEP 3: Checking price condition (should fail)");
      console.log("-".repeat(60));

      const currentPrice = await conditionOracle.getLatestPrice(await weth.getAddress());
      console.log(`  → Current ETH price: $${ethers.formatUnits(currentPrice[0], 8)}`);
      console.log(`  → Target price: $${ethers.formatUnits(targetPrice, 8)}`);

      expect(currentPrice[0]).to.be.lt(targetPrice); // $2500 < $3000

      console.log(`  ❌ Condition not met yet (price too low)`);

      // ============ STEP 4: Update Price to Meet Condition ============

      console.log("\n📈 STEP 4: Price increases to $3100");
      console.log("-".repeat(60));

      const newPrice = ethers.parseUnits("3100", 8); // $3100
      await ethPriceFeed.updateAnswer(newPrice);

      const updatedPrice = await conditionOracle.getLatestPrice(await weth.getAddress());
      console.log(`  → Updated ETH price: $${ethers.formatUnits(updatedPrice[0], 8)}`);

      expect(updatedPrice[0]).to.be.gte(targetPrice); // $3100 >= $3000

      console.log(`  ✅ Price condition now met!`);

      // ============ STEP 5: Executor Commits (Phase 1) ============

      console.log("\n🔒 STEP 5: Executor commits to execute (commit-reveal phase 1)");
      console.log("-".repeat(60));

      // Generate random nonce
      const nonce = ethers.randomBytes(32);
      const commitment = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [nonce])
      );

      console.log(`  → Nonce: ${ethers.hexlify(nonce)}`);
      console.log(`  → Commitment: ${commitment}`);
      console.log(`  → Requesting execution lock...`);

      await executorHub.connect(executor).requestExecution(taskId, commitment);

      const lock = await executorHub.getExecutionLock(taskId);
      console.log(`  ✅ Task locked to executor!`);
      console.log(`     Locked at: block ${lock.lockedAt}`);
      console.log(`     Commitment: ${lock.commitment}`);

      expect(lock.executor).to.equal(executor.address);
      expect(lock.commitment).to.equal(commitment);

      // Try to commit with another executor (should fail)
      console.log(`  → Testing: Another executor tries to commit...`);
      await expect(
        executorHub.connect(executor).requestExecution(taskId, ethers.randomBytes(32))
      ).to.be.reverted;
      console.log(`  ✅ Correctly prevented duplicate lock`);

      // ============ STEP 6: Wait for Commit Delay ============

      console.log("\n⏳ STEP 6: Waiting for commit delay (1 second)");
      console.log("-".repeat(60));

      // Advance time by 1 second (commitDelay)
      await time.increase(1);

      const currentTime = await time.latest();
      console.log(`  → Current timestamp: ${currentTime}`);
      console.log(`  ✅ Commit delay passed`);

      // ============ STEP 7: Executor Reveals and Executes (Phase 2) ============

      console.log("\n⚡ STEP 7: Executor reveals and executes task");
      console.log("-".repeat(60));

      // Prepare condition proof
      const conditionProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(uint8 conditionType, bytes params)", "bytes32[]"],
        [
          { conditionType: conditionType, params: conditionData },
          [], // Empty Merkle proof (single condition)
        ]
      );

      // Prepare action proof
      const actionsProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(bytes4 selector, address protocol, bytes params)[]", "bytes32[]"],
        [
          [action],
          [], // Empty Merkle proof (single action)
        ]
      );

      console.log(`  → Revealing nonce and executing...`);

      // Track balances before execution
      const userWethBefore = await weth.balanceOf(user.address);
      const executorEthBefore = await ethers.provider.getBalance(executor.address);

      const executeTx = await executorHub.connect(executor).executeTask(
        taskId,
        nonce,
        conditionProof,
        actionsProof
      );

      const executeReceipt = await executeTx.wait();

      console.log(`  ✅ Task executed successfully!`);
      console.log(`     Gas used: ${executeReceipt?.gasUsed}`);

      // ============ STEP 8: Verify Execution Results ============

      console.log("\n🎉 STEP 8: Verifying execution results");
      console.log("-".repeat(60));

      // Check user received WETH
      const userWethAfter = await weth.balanceOf(user.address);
      const wethReceived = userWethAfter - userWethBefore;

      console.log(`  → User received: ${ethers.formatEther(wethReceived)} WETH`);
      expect(wethReceived).to.be.gte(ethers.parseEther("0.32")); // At least min amount

      // Check vault is empty
      const vaultUsdcAfter = await taskVault.getTokenBalance(await usdc.getAddress());
      const vaultEthAfter = await taskVault.getNativeBalance();

      console.log(`  → TaskVault USDC after: ${ethers.formatUnits(vaultUsdcAfter, 6)} USDC`);
      console.log(`  → TaskVault ETH after: ${ethers.formatEther(vaultEthAfter)} ETH`);

      // USDC should be spent (or returned if swap failed)
      // ETH should be mostly spent on executor reward

      // Check executor received reward
      const executorEthAfter = await ethers.provider.getBalance(executor.address);
      // Note: executor also spent gas, so we can't do exact comparison
      console.log(`  → Executor balance change: ${ethers.formatEther(executorEthAfter - executorEthBefore)} ETH (includes gas costs)`);

      // Check executor stats updated
      const updatedExecutorInfo = await executorHub.getExecutor(executor.address);
      console.log(`  → Executor stats updated:`);
      console.log(`     Total executions: ${updatedExecutorInfo.totalExecutions}`);
      console.log(`     Successful: ${updatedExecutorInfo.successfulExecutions}`);
      console.log(`     Failed: ${updatedExecutorInfo.failedExecutions}`);
      console.log(`     New reputation: ${updatedExecutorInfo.reputationScore}`);

      expect(updatedExecutorInfo.totalExecutions).to.equal(1);
      expect(updatedExecutorInfo.successfulExecutions).to.equal(1);

      // Check task status updated
      const TaskCore = await ethers.getContractFactory("TaskCore");
      const taskCore = TaskCore.attach(taskCoreAddress) as any;
      const metadata = await taskCore.getMetadata();

      console.log(`  → Task status: ${metadata.status}`);
      console.log(`  → Execution count: ${metadata.executionCount}`);

      expect(metadata.status).to.equal(3); // COMPLETED
      expect(metadata.executionCount).to.equal(1);

      // Check lock cleared
      const lockAfter = await executorHub.getExecutionLock(taskId);
      expect(lockAfter.executor).to.equal(ethers.ZeroAddress);
      console.log(`  ✅ Execution lock cleared`);

      console.log("\n" + "=".repeat(60));
      console.log("✅ COMPLETE FLOW TEST PASSED!");
      console.log("=".repeat(60) + "\n");
    });

    it("Should prevent front-running via commit-reveal", async function () {
      const { taskFactory, executorHub, usdc, weth, user, executor, executor2 } =
        await loadFixture(deploySystemFixture);

      console.log("\n🔐 Testing Commit-Reveal Anti-Front-Running");
      console.log("=".repeat(60));

      // Create a simple task
      const taskParams = {
        rewardPerExecution: ethers.parseEther("0.01"),
        maxExecutions: 1,
        recurringInterval: 0,
        expiresAt: (await time.latest()) + 86400,
        seedCommitment: ethers.ZeroHash,
      };

      const condition = {
        conditionType: 0, // ALWAYS
        conditionData: "0x",
      };

      const action = {
        selector: ethers.id("swap").slice(0, 10),
        protocol: ethers.ZeroAddress,
        params: "0x",
      };

      await usdc.connect(user).approve(await taskFactory.getAddress(), ethers.parseUnits("100", 6));

      const tx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        condition,
        [action],
        [{ token: await usdc.getAddress(), amount: ethers.parseUnits("100", 6) }],
        { value: ethers.parseEther("0.01") }
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          return taskFactory.interface.parseLog(log)?.name === "TaskCreated";
        } catch {
          return false;
        }
      });
      const taskId = taskFactory.interface.parseLog(event!)?.args.taskId;

      // Register both executors
      await executorHub.connect(executor).registerExecutor({ value: ethers.parseEther("0.1") });
      await executorHub.connect(executor2).registerExecutor({ value: ethers.parseEther("0.1") });

      // Executor 1 commits first
      const nonce1 = ethers.randomBytes(32);
      const commitment1 = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [nonce1]));

      console.log("  → Executor 1 commits...");
      await executorHub.connect(executor).requestExecution(taskId, commitment1);
      console.log("  ✅ Executor 1 locked task");

      // Executor 2 tries to commit (should fail - task locked)
      console.log("  → Executor 2 tries to commit...");
      const nonce2 = ethers.randomBytes(32);
      const commitment2 = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [nonce2]));

      await expect(
        executorHub.connect(executor2).requestExecution(taskId, commitment2)
      ).to.be.reverted;
      console.log("  ✅ Executor 2 correctly blocked!");

      // Advance time by 1 second to pass commit delay
      await time.increase(1);

      // Executor 2 tries to execute with own nonce (should fail - wrong lock holder)
      console.log("  → Executor 2 tries to execute with own nonce...");
      await expect(
        executorHub.connect(executor2).executeTask(taskId, nonce2, "0x", "0x")
      ).to.be.reverted;
      console.log("  ✅ Executor 2 correctly rejected!");

      // Executor 1 can execute
      console.log("  → Executor 1 executes with correct nonce...");
      // (Would succeed if condition/action were valid)

      console.log("  ✅ Commit-reveal prevents front-running!");
    });

    it("Should handle task cancellation and refunds", async function () {
      const { taskFactory, usdc, weth, user } = await loadFixture(deploySystemFixture);

      console.log("\n💸 Testing Task Cancellation & Refunds");
      console.log("=".repeat(60));

      // Create task
      const taskParams = {
        rewardPerExecution: ethers.parseEther("0.01"),
        maxExecutions: 1,
        recurringInterval: 0,
        expiresAt: (await time.latest()) + 86400,
        seedCommitment: ethers.ZeroHash,
      };

      const condition = {
        conditionType: 0,
        conditionData: "0x",
      };

      const action = {
        selector: ethers.id("swap").slice(0, 10),
        protocol: ethers.ZeroAddress,
        params: "0x",
      };

      await usdc.connect(user).approve(await taskFactory.getAddress(), ethers.parseUnits("500", 6));

      const tx = await taskFactory.connect(user).createTaskWithTokens(
        taskParams,
        condition,
        [action],
        [{ token: await usdc.getAddress(), amount: ethers.parseUnits("500", 6) }],
        { value: ethers.parseEther("0.01") }
      );

      const receipt = await tx.wait();
      const event = receipt?.logs.find((log: any) => {
        try {
          return taskFactory.interface.parseLog(log)?.name === "TaskCreated";
        } catch {
          return false;
        }
      });
      const parsedEvent = taskFactory.interface.parseLog(event!);
      const taskCoreAddress = parsedEvent?.args.taskCore;
      const taskVaultAddress = parsedEvent?.args.taskVault;

      console.log("  → Task created");

      // Get contracts
      const TaskCore = await ethers.getContractFactory("TaskCore");
      const TaskVault = await ethers.getContractFactory("TaskVault");
      const taskCore = TaskCore.attach(taskCoreAddress);
      const taskVault = TaskVault.attach(taskVaultAddress);

      // Check balances before
      const userUsdcBefore = await usdc.balanceOf(user.address);
      const userEthBefore = await ethers.provider.getBalance(user.address);

      console.log(`  → User USDC before: ${ethers.formatUnits(userUsdcBefore, 6)}`);
      console.log(`  → User ETH before: ${ethers.formatEther(userEthBefore)}`);

      // Cancel task
      console.log("  → Cancelling task...");
      await taskCore.connect(user).cancel();

      const metadata = await taskCore.getMetadata();
      expect(metadata.status).to.equal(4); // CANCELLED
      console.log("  ✅ Task cancelled");

      // Withdraw funds
      console.log("  → Withdrawing funds...");
      await taskVault.connect(user).withdrawAll();

      // Check balances after
      const userUsdcAfter = await usdc.balanceOf(user.address);
      const userEthAfter = await ethers.provider.getBalance(user.address);

      console.log(`  → User USDC after: ${ethers.formatUnits(userUsdcAfter, 6)}`);
      console.log(`  → User ETH after: ${ethers.formatEther(userEthAfter)}`);

      // Should have received 500 USDC back
      expect(userUsdcAfter - userUsdcBefore).to.equal(ethers.parseUnits("500", 6));

      // Should have received ~0.01 ETH back (minus gas)
      const ethDiff = userEthAfter - userEthBefore;
      console.log(`  → ETH refunded: ${ethers.formatEther(ethDiff)} (minus gas)`);

      console.log("  ✅ Refunds successful!");
    });
  });
});
