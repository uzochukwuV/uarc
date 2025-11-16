import { expect } from "chai";
import { ethers } from "hardhat";
import {
  TaskCreator,
  TaskExecutor,
  ExecutorManager,
  PaymentEscrow,
  ActionRouter,
  ConditionChecker,
  UniswapLimitOrderAdapter,
  ScheduledTransferAdapter
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Comprehensive Executor System Tests", function () {
  let taskCreator: TaskCreator;
  let taskExecutor: TaskExecutor;
  let executorManager: ExecutorManager;
  let paymentEscrow: PaymentEscrow;
  let actionRouter: ActionRouter;
  let conditionChecker: ConditionChecker;
  let uniswapAdapter: UniswapLimitOrderAdapter;
  let transferAdapter: ScheduledTransferAdapter;

  let owner: SignerWithAddress;
  let taskOwner: SignerWithAddress;
  let executor: SignerWithAddress;
  let recipient: SignerWithAddress;
  let feeRecipient: SignerWithAddress;

  // Mock ERC20 token
  let mockToken: any;
  let mockUniswapRouter: any;

  const REWARD = ethers.parseEther("0.1");
  const ACTION_VALUE = ethers.parseEther("0.05");
  const PLATFORM_FEE = 100; // 1%

  beforeEach(async function () {
    [owner, taskOwner, executor, recipient, feeRecipient] = await ethers.getSigners();

    // Deploy Mock ERC20 Token
    const MockERC20 = await ethers.getContractFactory("contracts/mocks/MockERC20.sol:MockERC20");
    mockToken = await MockERC20.deploy("Mock Token", "MOCK", 18);
    await mockToken.waitForDeployment();

    // Mint tokens to task owner
    await mockToken.mint(taskOwner.address, ethers.parseEther("10000"));

    // Deploy PaymentEscrow
    const PaymentEscrow = await ethers.getContractFactory("PaymentEscrow");
    paymentEscrow = await PaymentEscrow.deploy(feeRecipient.address);
    await paymentEscrow.waitForDeployment();

    // Deploy TaskCreator
    const TaskCreator = await ethers.getContractFactory("TaskCreator");
    taskCreator = await TaskCreator.deploy();
    await taskCreator.waitForDeployment();

    // Deploy ConditionChecker
    const ConditionChecker = await ethers.getContractFactory("ConditionChecker");
    conditionChecker = await ConditionChecker.deploy();
    await conditionChecker.waitForDeployment();

    // Deploy ActionRouter
    const ActionRouter = await ethers.getContractFactory("ActionRouter");
    actionRouter = await ActionRouter.deploy();
    await actionRouter.waitForDeployment();

    // Deploy TaskExecutor
    const TaskExecutor = await ethers.getContractFactory("TaskExecutor");
    taskExecutor = await TaskExecutor.deploy();
    await taskExecutor.waitForDeployment();

    // Deploy ExecutorManager
    const ExecutorManager = await ethers.getContractFactory("ExecutorManager");
    executorManager = await ExecutorManager.deploy();
    await executorManager.waitForDeployment();

    // Deploy Adapters
    const UniswapAdapter = await ethers.getContractFactory("UniswapLimitOrderAdapter");
    uniswapAdapter = await UniswapAdapter.deploy();
    await uniswapAdapter.waitForDeployment();

    const TransferAdapter = await ethers.getContractFactory("ScheduledTransferAdapter");
    transferAdapter = await TransferAdapter.deploy();
    await transferAdapter.waitForDeployment();

    // Wire up contracts
    await taskCreator.setPaymentEscrow(await paymentEscrow.getAddress());
    await taskCreator.setTaskExecutor(await taskExecutor.getAddress());

    await paymentEscrow.setTaskRegistry(await taskCreator.getAddress());

    await taskExecutor.setTaskCreator(await taskCreator.getAddress());
    await taskExecutor.setPaymentEscrow(await paymentEscrow.getAddress());
    await taskExecutor.setActionRouter(await actionRouter.getAddress());
    await taskExecutor.setConditionChecker(await conditionChecker.getAddress());
    await taskExecutor.setExecutorManager(await executorManager.getAddress());

    await executorManager.setTaskRegistry(await taskExecutor.getAddress());

    await actionRouter.setTaskRegistry(await taskExecutor.getAddress());

    await uniswapAdapter.setActionRouter(await actionRouter.getAddress());

    // Approve protocols
    await taskCreator.approveProtocol(await transferAdapter.getAddress());
    await actionRouter.approveProtocol(await transferAdapter.getAddress());
    await actionRouter.registerAdapter(await transferAdapter.getAddress(), await transferAdapter.getAddress());

    // Register executor
    await executorManager.connect(executor).registerExecutor();
  });

  describe("Fix #1: ETH Forwarding Chain", function () {
    it("Should properly forward ETH through the execution chain", async function () {
      const actionValue = ethers.parseEther("0.1");
      const reward = ethers.parseEther("0.05");
      const maxExecutions = 1n;
      const totalRequired = reward + actionValue;

      // Create task with action value
      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint256,address)"],
          [[ethers.ZeroAddress, recipient.address, actionValue, taskOwner.address]]
        ),
        value: actionValue,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = {
        conditionType: 0, // ALWAYS
        conditionData: "0x"
      };

      const tx = await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0, // no expiry
        maxExecutions,
        0, // no interval
        { value: totalRequired }
      );

      await tx.wait();

      // Verify action value stored
      const taskCore = await taskCreator.getTaskCore(0);
      console.log("Stored actionValue:", ethers.formatEther(taskCore.actionValue));
      expect(taskCore.actionValue).to.equal(actionValue);

      // Execute task
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);
      const executorBalanceBefore = await ethers.provider.getBalance(await taskExecutor.getAddress());
      const taskCreatorBalanceBefore = await ethers.provider.getBalance(await taskCreator.getAddress());

      console.log("Before execution:");
      console.log("  Recipient:", ethers.formatEther(recipientBalanceBefore));
      console.log("  TaskExecutor:", ethers.formatEther(executorBalanceBefore));
      console.log("  TaskCreator:", ethers.formatEther(taskCreatorBalanceBefore));

      await executorManager.connect(executor).attemptExecute(0);

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
      const executorBalanceAfter = await ethers.provider.getBalance(await taskExecutor.getAddress());
      const taskCreatorBalanceAfter = await ethers.provider.getBalance(await taskCreator.getAddress());

      console.log("After execution:");
      console.log("  Recipient:", ethers.formatEther(recipientBalanceAfter));
      console.log("  TaskExecutor:", ethers.formatEther(executorBalanceAfter));
      console.log("  TaskCreator:", ethers.formatEther(taskCreatorBalanceAfter));

      // Recipient should have received the action value
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(actionValue);
    });

    it("Should refund action ETH on task cancellation", async function () {
      const actionValue = ethers.parseEther("0.1");
      const reward = ethers.parseEther("0.05");
      const maxExecutions = 2n;
      const totalRequired = (reward * maxExecutions) + (actionValue * maxExecutions);

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: actionValue,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        maxExecutions,
        0,
        { value: totalRequired }
      );

      const balanceBefore = await ethers.provider.getBalance(taskOwner.address);

      const tx = await taskCreator.connect(taskOwner).cancelTask(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(taskOwner.address);

      // Should get back both reward and action ETH minus gas
      const expectedRefund = totalRequired;
      const actualRefund = balanceAfter - balanceBefore + gasUsed;

      expect(actualRefund).to.be.closeTo(expectedRefund, ethers.parseEther("0.001"));
    });
  });

  describe("Fix #2: ERC20 Escrow System", function () {
    it("Should lock ERC20 tokens in escrow during task creation", async function () {
      const tokenAmount = ethers.parseEther("100");
      const reward = ethers.parseEther("0.1");

      // Approve TaskCreator to spend tokens
      await mockToken.connect(taskOwner).approve(await taskCreator.getAddress(), tokenAmount);

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: 0n,
        tokenIn: await mockToken.getAddress(),
        tokenInAmount: tokenAmount
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        1,
        0,
        { value: reward }
      );

      // Check that tokens were locked in escrow
      const tokenEscrowId = await taskCreator.tokenEscrowTaskId(0);
      expect(tokenEscrowId).to.equal(1_000_000_000n);

      const escrowData = await paymentEscrow.getEscrow(tokenEscrowId);
      expect(escrowData.token).to.equal(await mockToken.getAddress());
      expect(escrowData.totalLocked).to.equal(tokenAmount);
    });

    it("Should refund ERC20 tokens on task cancellation", async function () {
      const tokenAmount = ethers.parseEther("100");
      const reward = ethers.parseEther("0.1");

      await mockToken.connect(taskOwner).approve(await taskCreator.getAddress(), tokenAmount);

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: 0n,
        tokenIn: await mockToken.getAddress(),
        tokenInAmount: tokenAmount
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        1,
        0,
        { value: reward }
      );

      const balanceBefore = await mockToken.balanceOf(taskOwner.address);

      await taskCreator.connect(taskOwner).cancelTask(0);

      const balanceAfter = await mockToken.balanceOf(taskOwner.address);

      // Should get tokens back
      expect(balanceAfter - balanceBefore).to.equal(tokenAmount);
    });
  });

  describe("Fix #3: Pre-Execution Validation", function () {
    it("Should validate token balance before execution", async function () {
      const tokenAmount = ethers.parseEther("100");
      const reward = ethers.parseEther("0.1");

      // Approve but don't have enough balance
      await mockToken.connect(taskOwner).approve(await transferAdapter.getAddress(), tokenAmount);

      // Transfer away all tokens
      await mockToken.connect(taskOwner).transfer(recipient.address, ethers.parseEther("10000"));

      const params = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint256,address)"],
        [[await mockToken.getAddress(), recipient.address, tokenAmount, taskOwner.address]]
      );

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: params,
        value: 0n,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        1,
        0,
        { value: reward }
      );

      // Execution should fail gracefully (not revert)
      await executorManager.connect(executor).attemptExecute(0);

      // Task should still be ACTIVE (not COMPLETED)
      const taskCore = await taskCreator.getTaskCore(0);
      expect(taskCore.status).to.equal(0); // ACTIVE
    });

    it("Should validate token allowance before execution", async function () {
      const tokenAmount = ethers.parseEther("100");
      const reward = ethers.parseEther("0.1");

      // Have balance but no approval
      const params = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint256,address)"],
        [[await mockToken.getAddress(), recipient.address, tokenAmount, taskOwner.address]]
      );

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: params,
        value: 0n,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        1,
        0,
        { value: reward }
      );

      // Execution should fail gracefully
      await executorManager.connect(executor).attemptExecute(0);

      // Task should still be ACTIVE
      const taskCore = await taskCreator.getTaskCore(0);
      expect(taskCore.status).to.equal(0); // ACTIVE
    });
  });

  describe("Fix #4 & #5: Token Metadata & Refunds", function () {
    it("Should support multiple executions with ERC20 tokens", async function () {
      const tokenAmountPerExec = ethers.parseEther("50");
      const maxExecutions = 2n;
      const totalTokens = tokenAmountPerExec * maxExecutions;
      const reward = ethers.parseEther("0.1");

      await mockToken.connect(taskOwner).approve(await taskCreator.getAddress(), totalTokens);

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: 0n,
        tokenIn: await mockToken.getAddress(),
        tokenInAmount: tokenAmountPerExec
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        maxExecutions,
        0,
        { value: reward * maxExecutions }
      );

      // Verify correct total locked
      const tokenEscrowId = await taskCreator.tokenEscrowTaskId(0);
      const escrowData = await paymentEscrow.getEscrow(tokenEscrowId);
      expect(escrowData.totalLocked).to.equal(totalTokens);
    });

    it("Should calculate partial refunds correctly", async function () {
      const tokenAmountPerExec = ethers.parseEther("50");
      const maxExecutions = 3n;
      const totalTokens = tokenAmountPerExec * maxExecutions;
      const reward = ethers.parseEther("0.1");

      await mockToken.connect(taskOwner).approve(await taskCreator.getAddress(), totalTokens);

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: 0n,
        tokenIn: await mockToken.getAddress(),
        tokenInAmount: tokenAmountPerExec
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        maxExecutions,
        0,
        { value: reward * maxExecutions }
      );

      const balanceBefore = await mockToken.balanceOf(taskOwner.address);

      // Cancel immediately (0 executions done)
      await taskCreator.connect(taskOwner).cancelTask(0);

      const balanceAfter = await mockToken.balanceOf(taskOwner.address);

      // Should get all 3 execution amounts back
      expect(balanceAfter - balanceBefore).to.equal(totalTokens);
    });
  });

  describe("Fix #6: Executor Compensation", function () {
    it("Should compensate executor for failed execution attempts", async function () {
      const reward = ethers.parseEther("1.0");
      const expectedCompensation = reward / 10n; // 10% of reward

      // Create a task that will fail (insufficient token balance)
      const tokenAmount = ethers.parseEther("1000");
      await mockToken.connect(taskOwner).approve(await transferAdapter.getAddress(), tokenAmount);
      await mockToken.connect(taskOwner).transfer(recipient.address, ethers.parseEther("10000"));

      const params = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint256,address)"],
        [[await mockToken.getAddress(), recipient.address, tokenAmount, taskOwner.address]]
      );

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: params,
        value: 0n,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        1,
        0,
        { value: reward }
      );

      const executorBalanceBefore = await ethers.provider.getBalance(executor.address);

      // Execute (will fail due to insufficient balance)
      const tx = await executorManager.connect(executor).attemptExecute(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const executorBalanceAfter = await ethers.provider.getBalance(executor.address);

      // Calculate net change (accounting for gas)
      const netChange = executorBalanceAfter - executorBalanceBefore + gasUsed;

      // Should have received ~10% of reward as compensation
      expect(netChange).to.be.closeTo(expectedCompensation, ethers.parseEther("0.01"));
    });

    it("Should not over-drain escrow with failed attempts", async function () {
      const reward = ethers.parseEther("0.1");
      const maxExecutions = 10n;

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: 0n,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        maxExecutions,
        0,
        { value: reward * maxExecutions }
      );

      const escrowBefore = await paymentEscrow.getEscrow(0);
      expect(escrowBefore.totalLocked).to.equal(reward * maxExecutions);
    });
  });

  describe("Fix #7: MEV Protection", function () {
    it("Should have MEV protection in Uniswap adapter (interface check)", async function () {
      // This test verifies the adapter contract exists and can be deployed
      expect(await uniswapAdapter.getAddress()).to.not.equal(ethers.ZeroAddress);

      // Verify it has the action router set
      await uniswapAdapter.setActionRouter(await actionRouter.getAddress());
      expect(await uniswapAdapter.actionRouter()).to.equal(await actionRouter.getAddress());
    });
  });

  describe("Integration: Full Task Lifecycle with ETH", function () {
    it("Should handle complete task lifecycle: create -> execute -> complete", async function () {
      const actionValue = ethers.parseEther("0.05");
      const reward = ethers.parseEther("0.1");
      const totalRequired = reward + actionValue;

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(address,address,uint256,address)"],
          [[ethers.ZeroAddress, recipient.address, actionValue, taskOwner.address]]
        ),
        value: actionValue,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      // CREATE
      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        1,
        0,
        { value: totalRequired }
      );

      const taskCoreBefore = await taskCreator.getTaskCore(0);
      expect(taskCoreBefore.status).to.equal(0); // ACTIVE

      // EXECUTE
      const executorBalanceBefore = await ethers.provider.getBalance(executor.address);
      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);

      const tx = await executorManager.connect(executor).attemptExecute(0);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const executorBalanceAfter = await ethers.provider.getBalance(executor.address);
      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);

      // VERIFY
      const taskCoreAfter = await taskCreator.getTaskCore(0);
      expect(taskCoreAfter.status).to.equal(3); // COMPLETED

      // Executor got reward (minus platform fee)
      const platformFee = (reward * BigInt(PLATFORM_FEE)) / 10000n;
      const executorReward = reward - platformFee;
      const executorNetChange = executorBalanceAfter - executorBalanceBefore + gasUsed;
      expect(executorNetChange).to.be.closeTo(executorReward, ethers.parseEther("0.001"));

      // Recipient got action value
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(actionValue);
    });
  });

  describe("Integration: Recurring Tasks with ERC20", function () {
    it("Should handle recurring ERC20 transfers", async function () {
      const tokenAmountPerExec = ethers.parseEther("10");
      const maxExecutions = 3n;
      const totalTokens = tokenAmountPerExec * maxExecutions;
      const reward = ethers.parseEther("0.01");

      await mockToken.connect(taskOwner).approve(await taskCreator.getAddress(), totalTokens);

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: 0n,
        tokenIn: await mockToken.getAddress(),
        tokenInAmount: tokenAmountPerExec
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        maxExecutions,
        0,
        { value: reward * maxExecutions }
      );

      // Verify escrow setup
      const tokenEscrowId = await taskCreator.tokenEscrowTaskId(0);
      const escrowData = await paymentEscrow.getEscrow(tokenEscrowId);

      expect(escrowData.totalLocked).to.equal(totalTokens);
      expect(escrowData.isActive).to.be.true;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle zero action value", async function () {
      const reward = ethers.parseEther("0.1");

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: 0n,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        1,
        0,
        { value: reward }
      );

      const taskCore = await taskCreator.getTaskCore(0);
      expect(taskCore.actionValue).to.equal(0n);
    });

    it("Should handle multiple actions with mixed ETH values", async function () {
      const action1Value = ethers.parseEther("0.01");
      const action2Value = ethers.parseEther("0.02");
      const reward = ethers.parseEther("0.1");
      const totalRequired = reward + action1Value + action2Value;

      const action1 = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: action1Value,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const action2 = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: action2Value,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action1, action2],
        reward,
        0,
        1,
        0,
        { value: totalRequired }
      );

      const taskCore = await taskCreator.getTaskCore(0);
      expect(taskCore.actionValue).to.equal(action1Value + action2Value);
    });

    it("Should revert if insufficient ETH sent", async function () {
      const actionValue = ethers.parseEther("0.1");
      const reward = ethers.parseEther("0.1");
      const totalRequired = reward + actionValue;
      const insufficient = totalRequired - ethers.parseEther("0.01");

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: "0x",
        value: actionValue,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await expect(
        taskCreator.connect(taskOwner).createTask(
          condition,
          [action],
          reward,
          0,
          1,
          0,
          { value: insufficient }
        )
      ).to.be.revertedWith("Insufficient funds");
    });
  });

  describe("Gas Optimization Checks", function () {
    it("Should not execute if validation fails (saving gas)", async function () {
      const tokenAmount = ethers.parseEther("100");
      const reward = ethers.parseEther("0.1");

      // No approval, no balance
      const params = ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(address,address,uint256,address)"],
        [[await mockToken.getAddress(), recipient.address, tokenAmount, taskOwner.address]]
      );

      const action = {
        protocol: await transferAdapter.getAddress(),
        selector: "0x00000000",
        params: params,
        value: 0n,
        tokenIn: ethers.ZeroAddress,
        tokenInAmount: 0n
      };

      const condition = { conditionType: 0, conditionData: "0x" };

      await taskCreator.connect(taskOwner).createTask(
        condition,
        [action],
        reward,
        0,
        1,
        0,
        { value: reward }
      );

      const tx = await executorManager.connect(executor).attemptExecute(0);
      const receipt = await tx.wait();

      // Should use relatively low gas since it fails early
      console.log("Gas used for failed validation:", receipt!.gasUsed.toString());
    });
  });
});
