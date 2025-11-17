import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import {
  TaskFactory,
  TaskCore,
  TaskVault,
  TaskLogicV2,
  ExecutorHub,
  ActionRegistry,
  RewardManager,
  GlobalRegistry,
  TimeBasedTransferAdapter,
  MockERC20,
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("TimeBasedTransfer Integration Test - Full Flow", function () {
  let taskFactory: TaskFactory;
  let taskLogic: TaskLogicV2;
  let executorHub: ExecutorHub;
  let actionRegistry: ActionRegistry;
  let rewardManager: RewardManager;
  let globalRegistry: GlobalRegistry;
  let taskCoreImpl: TaskCore;
  let taskVaultImpl: TaskVault;
  let adapter: TimeBasedTransferAdapter;
  let mockUSDC: MockERC20;

  let deployer: SignerWithAddress;
  let taskCreator: SignerWithAddress;
  let executor: SignerWithAddress;
  let recipient: SignerWithAddress;

  const INITIAL_USDC_SUPPLY = ethers.parseUnits("1000000", 6); // 1M USDC (6 decimals)
  const TRANSFER_AMOUNT = ethers.parseUnits("100", 6); // 100 USDC
  const REWARD_PER_EXECUTION = ethers.parseEther("0.01"); // 0.01 ETH reward (matching working test)
  const EXECUTOR_STAKE = ethers.parseEther("1"); // 1 ETH stake

  beforeEach(async function () {
    [deployer, taskCreator, executor, recipient] = await ethers.getSigners();

    // 1. Deploy core protocol contracts
    console.log("\n=== Deploying Core Contracts ===");

    const TaskCore = await ethers.getContractFactory("TaskCore");
    taskCoreImpl = await TaskCore.deploy();
    await taskCoreImpl.waitForDeployment();
    console.log("✅ TaskCore implementation deployed:", await taskCoreImpl.getAddress());

    const TaskVault = await ethers.getContractFactory("TaskVault");
    taskVaultImpl = await TaskVault.deploy();
    await taskVaultImpl.waitForDeployment();
    console.log("✅ TaskVault implementation deployed:", await taskVaultImpl.getAddress());

    const ActionRegistry = await ethers.getContractFactory("ActionRegistry");
    actionRegistry = await ActionRegistry.deploy(deployer.address);
    await actionRegistry.waitForDeployment();
    console.log("✅ ActionRegistry deployed:", await actionRegistry.getAddress());

    const ExecutorHub = await ethers.getContractFactory("ExecutorHub");
    executorHub = await ExecutorHub.deploy(deployer.address);
    await executorHub.waitForDeployment();
    console.log("✅ ExecutorHub deployed:", await executorHub.getAddress());

    const GlobalRegistry = await ethers.getContractFactory("GlobalRegistry");
    globalRegistry = await GlobalRegistry.deploy(deployer.address);
    await globalRegistry.waitForDeployment();
    console.log("✅ GlobalRegistry deployed:", await globalRegistry.getAddress());

    const RewardManager = await ethers.getContractFactory("RewardManager");
    rewardManager = await RewardManager.deploy(deployer.address);
    await rewardManager.waitForDeployment();
    console.log("✅ RewardManager deployed:", await rewardManager.getAddress());

    const TaskLogicV2 = await ethers.getContractFactory("TaskLogicV2");
    taskLogic = await TaskLogicV2.deploy(deployer.address);
    await taskLogic.waitForDeployment();
    console.log("✅ TaskLogicV2 deployed:", await taskLogic.getAddress());

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
    console.log("✅ TaskFactory deployed:", await taskFactory.getAddress());

    // 2. Setup protocol permissions and connections
    console.log("\n=== Setting Up Permissions & Connections ===");

    await taskLogic.setActionRegistry(await actionRegistry.getAddress());
    await taskLogic.setRewardManager(await rewardManager.getAddress());
    await taskLogic.setExecutorHub(await executorHub.getAddress());
    await taskLogic.setTaskRegistry(await taskFactory.getAddress());
    console.log("✅ TaskLogicV2 configured");

    await executorHub.setTaskLogic(await taskLogic.getAddress());
    await executorHub.setTaskRegistry(await taskFactory.getAddress());
    console.log("✅ ExecutorHub configured");

    await rewardManager.setTaskLogic(await taskLogic.getAddress());
    await rewardManager.setExecutorHub(await executorHub.getAddress());
    await rewardManager.setGasReimbursementMultiplier(100);
    console.log("✅ RewardManager configured");

    await globalRegistry.authorizeFactory(await taskFactory.getAddress());
    await taskFactory.setGlobalRegistry(await globalRegistry.getAddress());
    console.log("✅ GlobalRegistry and TaskFactory linked");

    // 3. Deploy adapter and token
    console.log("\n=== Deploying Adapter & Token ===");

    const TimeBasedTransferAdapter = await ethers.getContractFactory("TimeBasedTransferAdapter");
    adapter = await TimeBasedTransferAdapter.deploy();
    await adapter.waitForDeployment();
    console.log("✅ TimeBasedTransferAdapter deployed:", await adapter.getAddress());

    // Register adapter with ActionRegistry
    const adapterSelector = "0x1cff79cd"; // executeAction(address,bytes)
    await actionRegistry.registerAdapter(
      adapterSelector,
      await adapter.getAddress(),
      500000, // gas limit
      true // isActive
    );
    console.log("✅ Adapter registered with ActionRegistry");

    // Note: We don't approve adapter as protocol - we'll use token address as protocol
    // This matches how Uniswap adapter uses router address as protocol

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();
    console.log("✅ Mock USDC deployed:", await mockUSDC.getAddress());

    // Approve USDC token address as protocol (will be used in action.protocol field)
    await actionRegistry.approveProtocol(await mockUSDC.getAddress());
    console.log("✅ USDC token approved as protocol");

    // 4. Setup token balances
    console.log("\n=== Setting Up Token Balances ===");
    await mockUSDC.mint(taskCreator.address, INITIAL_USDC_SUPPLY);
    console.log("✅ Minted USDC to task creator:", ethers.formatUnits(INITIAL_USDC_SUPPLY, 6));

    // 5. Register executor
    console.log("\n=== Registering Executor ===");
    await executorHub.connect(executor).registerExecutor({ value: EXECUTOR_STAKE });
    const executorData = await executorHub.getExecutor(executor.address);
    console.log("✅ Executor registered with stake:", ethers.formatEther(executorData.stakedAmount));
  });

  describe("Complete Task Lifecycle", function () {
    it("Should create task, wait for time, and execute successfully", async function () {
      console.log("\n=== TEST: Complete Task Lifecycle ===");

      // Step 1: Prepare task parameters (mimicking frontend)
      const executeAfterHours = 0.1; // 6 minutes (for testing)
      const currentTime = await time.latest();
      const executeAfter = BigInt(currentTime + Math.floor(executeAfterHours * 3600));

      console.log("\n--- Step 1: Encoding Adapter Params ---");
      // IMPORTANT: TaskLogicV2 decodes params as (router, tokenIn, tokenOut, amountIn, minAmountOut, recipient)
      // We need to encode our params to match this structure!
      // Mapping: (dummy, tokenIn=USDC, dummy, amountIn=100, dummy, recipient)
      // Then the adapter will decode it as (token, recipient, amount, executeAfter)
      // Wait - this won't work because the structures are different!

      // Actually, we need to encode in the format that TaskLogicV2 expects (6 params)
      // AND ALSO encode the data the adapter needs (4 params)
      // The trick: TaskLogicV2 uses params to extract tokenIn and amountIn
      // The adapter receives the same params and decodes them differently

      // Solution: Encode as 6 params matching Uniswap format, with our data in the right positions
      const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "address", "uint256", "uint256", "address"],
        [
          ethers.ZeroAddress,            // router (not used, but TaskLogicV2 expects it)
          await mockUSDC.getAddress(),   // tokenIn (TaskLogicV2 extracts this)
          ethers.ZeroAddress,            // tokenOut (not used)
          TRANSFER_AMOUNT,               // amountIn (TaskLogicV2 extracts this)
          executeAfter,                  // minAmountOut (we'll use this for executeAfter timestamp!)
          recipient.address,             // recipient
        ]
      );
      console.log("✅ Adapter params encoded (6-param Uniswap format)");
      console.log("   Token (tokenIn):", await mockUSDC.getAddress());
      console.log("   Amount (amountIn):", ethers.formatUnits(TRANSFER_AMOUNT, 6), "USDC");
      console.log("   Execute After (minAmountOut field):", new Date(Number(executeAfter) * 1000).toISOString());
      console.log("   Recipient:", recipient.address);

      // Step 2: Build TaskParams struct
      console.log("\n--- Step 2: Building Task Params ---");
      const taskParams = {
        expiresAt: BigInt(currentTime + 86400), // 24 hours from now
        maxExecutions: 1n,
        recurringInterval: 0n,
        rewardPerExecution: REWARD_PER_EXECUTION,
        seedCommitment: ethers.ZeroHash,
      };
      console.log("✅ TaskParams created");
      console.log("   Expires At:", new Date(Number(taskParams.expiresAt) * 1000).toISOString());
      console.log("   Max Executions:", taskParams.maxExecutions.toString());
      console.log("   Reward Per Execution:", ethers.formatEther(taskParams.rewardPerExecution), "ETH");

      // Step 3: Build ActionParams array
      console.log("\n--- Step 3: Building Action Params ---");
      const actions = [{
        selector: "0x1cff79cd", // executeAction(address,bytes) selector
        protocol: await mockUSDC.getAddress(), // Protocol = token address (since no external protocol)
        params: adapterParams,
      }];
      console.log("✅ Actions array created");
      console.log("   Selector:", actions[0].selector);
      console.log("   Protocol (Token):", actions[0].protocol);

      // Step 4: Build TokenDeposit array
      console.log("\n--- Step 4: Building Token Deposits ---");
      const tokenDeposits = [{
        token: await mockUSDC.getAddress(),
        amount: TRANSFER_AMOUNT,
      }];
      console.log("✅ Token deposits array created");
      console.log("   Token:", tokenDeposits[0].token);
      console.log("   Amount:", ethers.formatUnits(tokenDeposits[0].amount, 6), "USDC");

      // Step 5: Approve TaskFactory to spend USDC
      console.log("\n--- Step 5: Approving TaskFactory ---");
      await mockUSDC.connect(taskCreator).approve(
        await taskFactory.getAddress(),
        TRANSFER_AMOUNT
      );
      const allowance = await mockUSDC.allowance(
        taskCreator.address,
        await taskFactory.getAddress()
      );
      console.log("✅ Approved TaskFactory");
      console.log("   Allowance:", ethers.formatUnits(allowance, 6), "USDC");
      expect(allowance).to.equal(TRANSFER_AMOUNT);

      // Step 6: Create task with tokens (mimicking frontend exactly)
      console.log("\n--- Step 6: Creating Task ---");
      // Send extra ETH to cover gas reimbursement (multiplier is 100)
      const totalETHValue = ethers.parseEther("0.1"); // 0.1 ETH buffer for reward + gas
      console.log("   Total ETH to send:", ethers.formatEther(totalETHValue), "ETH (reward + gas buffer)");

      const tx = await taskFactory.connect(taskCreator).createTaskWithTokens(
        taskParams,
        actions,
        tokenDeposits,
        { value: totalETHValue }
      );
      const receipt = await tx.wait();
      console.log("✅ Task created! Transaction hash:", receipt?.hash);

      // Extract task ID from events
      const taskCreatedEvent = receipt?.logs.find(
        (log: any) => {
          try {
            const parsed = taskFactory.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
            return parsed?.name === "TaskCreated";
          } catch {
            return false;
          }
        }
      );

      expect(taskCreatedEvent).to.not.be.undefined;

      const parsedEvent = taskFactory.interface.parseLog({
        topics: taskCreatedEvent!.topics as string[],
        data: taskCreatedEvent!.data,
      });

      const taskId = parsedEvent!.args[0];
      console.log("   Task ID:", taskId);

      // Step 7: Verify task state
      console.log("\n--- Step 7: Verifying Task State ---");
      const [taskCoreAddress, taskVaultAddress] = await taskFactory.getTaskAddresses(taskId);
      console.log("   TaskCore address:", taskCoreAddress);
      console.log("   TaskVault address:", taskVaultAddress);

      const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);
      const taskVault = await ethers.getContractAt("TaskVault", taskVaultAddress);

      const metadata = await taskCore.getMetadata();
      console.log("✅ Task metadata retrieved");
      console.log("   Creator:", metadata.creator);
      console.log("   Max Executions:", metadata.maxExecutions.toString());
      console.log("   Execution Count:", metadata.executionCount.toString());
      expect(metadata.creator).to.equal(taskCreator.address);
      expect(metadata.maxExecutions).to.equal(taskParams.maxExecutions);

      // Step 8: Verify USDC transferred to TaskVault
      console.log("\n--- Step 8: Verifying Token Transfer to Vault ---");
      const vaultBalance = await mockUSDC.balanceOf(await taskVault.getAddress());
      console.log("✅ TaskVault USDC balance:", ethers.formatUnits(vaultBalance, 6), "USDC");
      expect(vaultBalance).to.equal(TRANSFER_AMOUNT);

      // Step 9: Verify adapter conditions not met yet (too early)
      console.log("\n--- Step 9: Verifying Time Condition (Should Fail) ---");
      const [canExecuteEarly] = await adapter.canExecute(adapterParams);
      expect(canExecuteEarly).to.be.false;
      console.log("✅ Adapter correctly reports conditions not met (too early)");

      // Step 10: Fast forward time
      console.log("\n--- Step 10: Fast Forwarding Time ---");
      await time.increaseTo(executeAfter + 1n);
      const newTime = await time.latest();
      console.log("✅ Time advanced to:", new Date(newTime * 1000).toISOString());

      // Step 11: Verify adapter conditions now met
      console.log("\n--- Step 11: Verifying Time Condition (Should Pass) ---");
      const [canExecuteNow, reason] = await adapter.canExecute(adapterParams);
      expect(canExecuteNow).to.be.true;
      console.log("✅ Adapter conditions met:", reason);

      // Step 12: Executor commits to task (commit-reveal pattern)
      console.log("\n--- Step 12: Executor Commits to Task ---");
      const reveal = ethers.randomBytes(32);
      const commitment = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [reveal])
      );

      const requestTx = await executorHub.connect(executor).requestExecution(taskId, commitment);
      await requestTx.wait();
      console.log("✅ Executor committed to task");
      console.log("   Commitment:", commitment);

      // Verify task is locked
      const isLocked = await executorHub.isTaskLocked(taskId);
      expect(isLocked).to.be.true;
      console.log("✅ Task is locked for executor");

      // Step 13: Wait for commit delay
      console.log("\n--- Step 13: Waiting for Commit Delay ---");
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine", []);
      console.log("✅ Commit delay passed");

      // Step 14: Prepare actions proof
      console.log("\n--- Step 14: Preparing Actions Proof ---");
      const actionForProof = {
        selector: "0x1cff79cd",
        protocol: await mockUSDC.getAddress(), // Must match what we used in task creation
        params: adapterParams,
      };

      const actionsProof = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(bytes4 selector, address protocol, bytes params)[]", "bytes32[]"],
        [[actionForProof], []] // Empty merkle proof for single action
      );
      console.log("✅ Actions proof prepared");

      // Step 15: Execute task
      console.log("\n--- Step 15: Executing Task ---");
      const executorBalanceBefore = await ethers.provider.getBalance(executor.address);
      const recipientBalanceBefore = await mockUSDC.balanceOf(recipient.address);

      const executeTx = await executorHub
        .connect(executor)
        .executeTask(taskId, reveal, actionsProof);

      const executeReceipt = await executeTx.wait();
      console.log("✅ Task executed! Transaction hash:", executeReceipt?.hash);

      // Step 16: Verify execution results
      console.log("\n--- Step 16: Verifying Execution Results ---");

      // Check recipient received USDC
      const recipientBalanceAfter = await mockUSDC.balanceOf(recipient.address);
      console.log("✅ Recipient USDC balance:", ethers.formatUnits(recipientBalanceAfter, 6), "USDC");
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(TRANSFER_AMOUNT);

      // Check executor received reward (accounting for gas)
      const executorBalanceAfter = await ethers.provider.getBalance(executor.address);
      const gasCost = executeReceipt!.gasUsed * executeReceipt!.gasPrice;
      const netGain = executorBalanceAfter - executorBalanceBefore + gasCost;
      console.log("✅ Executor net gain (reward - gas):", ethers.formatEther(netGain), "ETH");
      expect(netGain).to.be.gt(0n);

      // Check task metadata updated
      const metadataAfter = await taskCore.getMetadata();
      expect(metadataAfter.executionCount).to.equal(1);
      console.log("✅ Task execution count:", metadataAfter.executionCount.toString());

      // Check vault emptied
      const vaultBalanceAfter = await mockUSDC.balanceOf(taskVaultAddress);
      console.log("✅ TaskVault USDC balance after execution:", ethers.formatUnits(vaultBalanceAfter, 6), "USDC");
      expect(vaultBalanceAfter).to.equal(0);

      console.log("\n=== ✅ TEST PASSED: Complete Lifecycle Successful ===");
    });

    it("Should handle insufficient token approval", async function () {
      console.log("\n=== TEST: Insufficient Token Approval ===");

      const executeAfterHours = 0.1;
      const currentTime = await time.latest();
      const executeAfter = BigInt(currentTime + Math.floor(executeAfterHours * 3600));

      const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "uint256", "uint256"],
        [await mockUSDC.getAddress(), recipient.address, TRANSFER_AMOUNT, executeAfter]
      );

      const taskParams = {
        expiresAt: BigInt(currentTime + 86400),
        maxExecutions: 1n,
        recurringInterval: 0n,
        rewardPerExecution: REWARD_PER_EXECUTION,
        seedCommitment: ethers.ZeroHash,
      };

      const actions = [{
        selector: "0x1cff79cd",
        protocol: await adapter.getAddress(),
        params: adapterParams,
      }];

      const tokenDeposits = [{
        token: await mockUSDC.getAddress(),
        amount: TRANSFER_AMOUNT,
      }];

      // Don't approve - should fail
      console.log("❌ Attempting to create task without approval...");
      await expect(
        taskFactory.connect(taskCreator).createTaskWithTokens(
          taskParams,
          actions,
          tokenDeposits,
          { value: REWARD_PER_EXECUTION }
        )
      ).to.be.reverted;

      console.log("✅ Task creation correctly rejected without approval");
    });

    it("Should handle insufficient ETH for rewards", async function () {
      console.log("\n=== TEST: Insufficient ETH for Rewards ===");

      const executeAfterHours = 0.1;
      const currentTime = await time.latest();
      const executeAfter = BigInt(currentTime + Math.floor(executeAfterHours * 3600));

      const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "uint256", "uint256"],
        [await mockUSDC.getAddress(), recipient.address, TRANSFER_AMOUNT, executeAfter]
      );

      const taskParams = {
        expiresAt: BigInt(currentTime + 86400),
        maxExecutions: 1n,
        recurringInterval: 0n,
        rewardPerExecution: REWARD_PER_EXECUTION,
        seedCommitment: ethers.ZeroHash,
      };

      const actions = [{
        selector: "0x1cff79cd",
        protocol: await adapter.getAddress(),
        params: adapterParams,
      }];

      const tokenDeposits = [{
        token: await mockUSDC.getAddress(),
        amount: TRANSFER_AMOUNT,
      }];

      await mockUSDC.connect(taskCreator).approve(
        await taskFactory.getAddress(),
        TRANSFER_AMOUNT
      );

      // Send insufficient ETH (half of required reward)
      console.log("❌ Attempting to create task with insufficient ETH...");
      await expect(
        taskFactory.connect(taskCreator).createTaskWithTokens(
          taskParams,
          actions,
          tokenDeposits,
          { value: REWARD_PER_EXECUTION / 2n }
        )
      ).to.be.revertedWith("Insufficient native token deposited");

      console.log("✅ Task creation correctly rejected with insufficient ETH");
    });
  });
});
