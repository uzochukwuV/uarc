import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * @title Debug Task Execution Test
 * @notice Detailed debugging of the task execution flow
 * @dev This test adds extensive logging to trace exactly what happens
 */
describe("DEBUG: Task Execution Flow", function () {

  async function deploySystemFixture() {
    const [owner, user, executor] = await ethers.getSigners();

    // Deploy mocks
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USDC", "USDC", 6);
    const weth = await MockERC20.deploy("WETH", "WETH", 18);

    const MockUniswap = await ethers.getContractFactory("MockUniswapV2Router");
    const uniswapRouter = await MockUniswap.deploy();

    const MockChainlink = await ethers.getContractFactory("MockChainlinkAggregator");
    const ethPriceFeed = await MockChainlink.deploy(8, "ETH/USD");

    // Setup liquidity
    await usdc.mint(await uniswapRouter.getAddress(), ethers.parseUnits("1000000", 6));
    await weth.mint(await uniswapRouter.getAddress(), ethers.parseEther("333"));
    await ethPriceFeed.updateAnswer(250000000000);

    // Deploy core
    const TaskCore = await ethers.getContractFactory("TaskCore");
    const TaskVault = await ethers.getContractFactory("TaskVault");
    const taskCoreImpl = await TaskCore.deploy();
    const taskVaultImpl = await TaskVault.deploy();

    // Deploy system
    const ConditionOracle = await ethers.getContractFactory("ConditionOracle");
    const conditionOracle = await ConditionOracle.deploy(owner.address);

    const ActionRegistry = await ethers.getContractFactory("ActionRegistry");
    const actionRegistry = await ActionRegistry.deploy(owner.address);

    const RewardManager = await ethers.getContractFactory("RewardManager");
    const rewardManager = await RewardManager.deploy(owner.address);

    const ExecutorHub = await ethers.getContractFactory("ExecutorHub");
    const executorHub = await ExecutorHub.deploy(owner.address);

    const GlobalRegistry = await ethers.getContractFactory("GlobalRegistry");
    const globalRegistry = await GlobalRegistry.deploy(owner.address);

    const TaskLogicV2 = await ethers.getContractFactory("TaskLogicV2");
    const taskLogic = await TaskLogicV2.deploy(owner.address);

    const TaskFactory = await ethers.getContractFactory("TaskFactory");
    const taskFactory = await TaskFactory.deploy(
      await taskCoreImpl.getAddress(),
      await taskVaultImpl.getAddress(),
      await taskLogic.getAddress(),
      await executorHub.getAddress(),
      await conditionOracle.getAddress(),
      await actionRegistry.getAddress(),
      await rewardManager.getAddress(),
      owner.address
    );

    const UniswapAdapter = await ethers.getContractFactory("UniswapV2Adapter");
    const uniswapAdapter = await UniswapAdapter.deploy(owner.address);

    // Configure
    await taskLogic.setConditionOracle(await conditionOracle.getAddress());
    await taskLogic.setActionRegistry(await actionRegistry.getAddress());
    await taskLogic.setRewardManager(await rewardManager.getAddress());
    await taskLogic.setExecutorHub(await executorHub.getAddress());
    await taskLogic.setTaskRegistry(await globalRegistry.getAddress());

    await executorHub.setTaskLogic(await taskLogic.getAddress());
    await executorHub.setTaskRegistry(await globalRegistry.getAddress());

    await globalRegistry.authorizeFactory(await taskFactory.getAddress());
    await taskFactory.setGlobalRegistry(await globalRegistry.getAddress());

    await conditionOracle.setPriceFeed(await weth.getAddress(), await ethPriceFeed.getAddress());

    const swapSelector = ethers.id("swap").slice(0, 10);
    await actionRegistry.registerAdapter(swapSelector, await uniswapAdapter.getAddress(), 500000, true);
    await uniswapAdapter.addRouter(await uniswapRouter.getAddress());
    await actionRegistry.approveProtocol(await uniswapRouter.getAddress());

    await usdc.mint(user.address, ethers.parseUnits("10000", 6));

    return {
      taskFactory,
      executorHub,
      conditionOracle,
      actionRegistry,
      usdc,
      weth,
      uniswapRouter,
      uniswapAdapter,
      ethPriceFeed,
      owner,
      user,
      executor,
    };
  }

  it("DEBUG: Trace swap execution step by step", async function () {
    const {
      taskFactory,
      executorHub,
      usdc,
      weth,
      uniswapRouter,
      uniswapAdapter,
      ethPriceFeed,
      user,
      executor,
    } = await loadFixture(deploySystemFixture);

    console.log("\n" + "=".repeat(80));
    console.log("🔍 DEBUGGING TASK EXECUTION FLOW");
    console.log("=".repeat(80));

    // Create task
    const taskParams = {
      rewardPerExecution: ethers.parseEther("0.01"),
      maxExecutions: 1,
      recurringInterval: 0,
      expiresAt: (await time.latest()) + 86400,
      seedCommitment: ethers.ZeroHash,
    };

    const conditionType = 2; // PRICE_ABOVE
    const targetPrice = ethers.parseUnits("3000", 8);
    const conditionData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [await weth.getAddress(), targetPrice]
    );

    const condition = {
      conditionType: conditionType,
      conditionData: conditionData,
    };

    // Create action with swap params
    const swapParams = {
      router: await uniswapRouter.getAddress(),
      tokenIn: await usdc.getAddress(),
      tokenOut: await weth.getAddress(),
      amountIn: ethers.parseUnits("1000", 6),
      minAmountOut: ethers.parseEther("0.32"),
      recipient: user.address,
    };

    console.log("\n📋 SWAP PARAMETERS:");
    console.log("  Router:", swapParams.router);
    console.log("  Token In:", swapParams.tokenIn, "(USDC)");
    console.log("  Token Out:", swapParams.tokenOut, "(WETH)");
    console.log("  Amount In:", ethers.formatUnits(swapParams.amountIn, 6), "USDC");
    console.log("  Min Amount Out:", ethers.formatEther(swapParams.minAmountOut), "WETH");
    console.log("  Recipient:", swapParams.recipient);

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

    console.log("\n🔧 ACTION STRUCTURE:");
    console.log("  Selector:", action.selector);
    console.log("  Protocol:", action.protocol);
    console.log("  Params length:", action.params.length, "bytes");

    const tokenDeposits = [
      {
        token: await usdc.getAddress(),
        amount: ethers.parseUnits("1000", 6),
      },
    ];

    // Check adapter is registered
    console.log("\n🔍 CHECKING ADAPTER REGISTRATION:");
    const adapterInfo = await actionRegistry.getAdapter(swapSelector);
    console.log("  Adapter address:", adapterInfo.adapter);
    console.log("  Is active:", adapterInfo.isActive);
    console.log("  Gas limit:", adapterInfo.gasLimit.toString());
    console.log("  Requires tokens:", adapterInfo.requiresTokens);

    // Check protocol is approved
    const isApproved = await actionRegistry.isProtocolApproved(await uniswapRouter.getAddress());
    console.log("\n🔍 PROTOCOL APPROVAL:");
    console.log("  Uniswap router approved:", isApproved);

    // Check router has liquidity
    const routerUsdcBalance = await usdc.balanceOf(await uniswapRouter.getAddress());
    const routerWethBalance = await weth.balanceOf(await uniswapRouter.getAddress());
    console.log("\n💰 ROUTER LIQUIDITY:");
    console.log("  USDC:", ethers.formatUnits(routerUsdcBalance, 6));
    console.log("  WETH:", ethers.formatEther(routerWethBalance));

    // Approve and create task
    await usdc.connect(user).approve(await taskFactory.getAddress(), ethers.parseUnits("1000", 6));

    console.log("\n📝 CREATING TASK...");
    const tx = await taskFactory.connect(user).createTaskWithTokens(
      taskParams,
      condition,
      [action],
      tokenDeposits,
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
    const taskId = parsedEvent?.args.taskId;
    const taskCoreAddress = parsedEvent?.args.taskCore;
    const taskVaultAddress = parsedEvent?.args.taskVault;

    console.log("  ✅ Task created!");
    console.log("  Task ID:", taskId.toString());
    console.log("  TaskCore:", taskCoreAddress);
    console.log("  TaskVault:", taskVaultAddress);

    // Check vault balances
    const TaskVault = await ethers.getContractFactory("TaskVault");
    const taskVault = TaskVault.attach(taskVaultAddress);

    const vaultUsdcBalance = await taskVault.getTokenBalance(await usdc.getAddress());
    const vaultEthBalance = await taskVault.getNativeBalance();

    console.log("\n💰 VAULT BALANCES AFTER CREATION:");
    console.log("  USDC:", ethers.formatUnits(vaultUsdcBalance, 6));
    console.log("  ETH:", ethers.formatEther(vaultEthBalance));

    // Check task metadata
    const TaskCore = await ethers.getContractFactory("TaskCore");
    const taskCore = TaskCore.attach(taskCoreAddress);
    const metadata = await taskCore.getMetadata();

    console.log("\n📊 TASK METADATA:");
    console.log("  Condition hash:", metadata.conditionHash);
    console.log("  Actions hash:", metadata.actionsHash);

    // Manually verify the hash matches
    const expectedActionsHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["tuple(bytes4 selector, address protocol, bytes params)[]"],
        [[action]]
      )
    );
    console.log("  Expected actions hash:", expectedActionsHash);
    console.log("  Hashes match:", metadata.actionsHash === expectedActionsHash);

    // Register executor
    await executorHub.connect(executor).registerExecutor({ value: ethers.parseEther("0.1") });

    // Update price
    await ethPriceFeed.updateAnswer(ethers.parseUnits("3100", 8));

    // Commit
    const nonce = ethers.randomBytes(32);
    const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [nonce]));

    await executorHub.connect(executor).requestExecution(taskId, commitment);
    await time.increase(1);

    // Prepare proofs
    const conditionProof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(uint8 conditionType, bytes params)", "bytes32[]"],
      [{ conditionType: conditionType, params: conditionData }, []]
    );

    const actionsProof = ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(bytes4 selector, address protocol, bytes params)[]", "bytes32[]"],
      [[action], []]
    );

    console.log("\n📦 EXECUTION PROOFS:");
    console.log("  Condition proof length:", conditionProof.length);
    console.log("  Actions proof length:", actionsProof.length);

    // Track balances before
    const userWethBefore = await weth.balanceOf(user.address);
    const vaultUsdcBefore = await taskVault.getTokenBalance(await usdc.getAddress());

    console.log("\n💰 BALANCES BEFORE EXECUTION:");
    console.log("  User WETH:", ethers.formatEther(userWethBefore));
    console.log("  Vault USDC:", ethers.formatUnits(vaultUsdcBefore, 6));

    // Execute with event listeners
    console.log("\n⚡ EXECUTING TASK...");

    // Listen for all events
    const filter = { address: taskVaultAddress };
    const vaultEvents: any[] = [];

    taskVault.on("*", (event) => {
      vaultEvents.push(event);
    });

    try {
      const executeTx = await executorHub.connect(executor).executeTask(
        taskId,
        nonce,
        conditionProof,
        actionsProof,
        {
          gasLimit: 5000000, // High gas limit for debugging
        }
      );

      const executeReceipt = await executeTx.wait();

      console.log("  ✅ Transaction succeeded!");
      console.log("  Gas used:", executeReceipt?.gasUsed.toString());
      console.log("  Status:", executeReceipt?.status);

      // Parse all events
      console.log("\n📡 EVENTS EMITTED:");
      for (const log of executeReceipt!.logs) {
        try {
          // Try TaskVault events
          const parsed = taskVault.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed) {
            console.log(`  [TaskVault] ${parsed.name}:`, parsed.args);
          }
        } catch {
          try {
            // Try TaskCore events
            const parsed = taskCore.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            });
            if (parsed) {
              console.log(`  [TaskCore] ${parsed.name}:`, parsed.args);
            }
          } catch {
            try {
              // Try ExecutorHub events
              const parsed = executorHub.interface.parseLog({
                topics: log.topics as string[],
                data: log.data,
              });
              if (parsed) {
                console.log(`  [ExecutorHub] ${parsed.name}:`, parsed.args);
              }
            } catch {
              // Unknown event
            }
          }
        }
      }
    } catch (error: any) {
      console.log("  ❌ Transaction failed!");
      console.log("  Error:", error.message);

      // Try to get revert reason
      if (error.data) {
        console.log("  Revert data:", error.data);
      }

      throw error;
    }

    // Check balances after
    const userWethAfter = await weth.balanceOf(user.address);
    const vaultUsdcAfter = await taskVault.getTokenBalance(await usdc.getAddress());
    const routerUsdcAfter = await usdc.balanceOf(await uniswapRouter.getAddress());
    const routerWethAfter = await weth.balanceOf(await uniswapRouter.getAddress());

    console.log("\n💰 BALANCES AFTER EXECUTION:");
    console.log("  User WETH:", ethers.formatEther(userWethAfter), `(+${ethers.formatEther(userWethAfter - userWethBefore)})`);
    console.log("  Vault USDC:", ethers.formatUnits(vaultUsdcAfter, 6), `(-${ethers.formatUnits(vaultUsdcBefore - vaultUsdcAfter, 6)})`);
    console.log("  Router USDC:", ethers.formatUnits(routerUsdcAfter, 6));
    console.log("  Router WETH:", ethers.formatEther(routerWethAfter));

    // Check if swap actually happened
    console.log("\n🔍 SWAP ANALYSIS:");
    console.log("  USDC moved from vault:", vaultUsdcBefore > vaultUsdcAfter);
    console.log("  WETH received by user:", userWethAfter > userWethBefore);
    console.log("  Expected WETH:", ethers.formatEther(ethers.parseEther("0.32")));
    console.log("  Actual WETH:", ethers.formatEther(userWethAfter - userWethBefore));

    if (userWethAfter === userWethBefore) {
      console.log("\n❌ PROBLEM IDENTIFIED: NO WETH RECEIVED!");
      console.log("   Possible causes:");
      console.log("   1. Adapter wasn't called");
      console.log("   2. Adapter was called but failed silently");
      console.log("   3. Token approval issue");
      console.log("   4. Swap reverted but was caught");
    }

    // Final verification
    expect(userWethAfter).to.be.gt(userWethBefore, "User should have received WETH");
  });

  it("DEBUG: Test adapter directly", async function () {
    const { usdc, weth, uniswapRouter, uniswapAdapter, user } = await loadFixture(deploySystemFixture);

    console.log("\n" + "=".repeat(80));
    console.log("🧪 TESTING UNISWAP ADAPTER DIRECTLY");
    console.log("=".repeat(80));

    // Mint tokens to user (simulating vault)
    await usdc.mint(user.address, ethers.parseUnits("1000", 6));

    // Approve adapter
    await usdc.connect(user).approve(await uniswapAdapter.getAddress(), ethers.parseUnits("1000", 6));

    const swapParams = {
      router: await uniswapRouter.getAddress(),
      tokenIn: await usdc.getAddress(),
      tokenOut: await weth.getAddress(),
      amountIn: ethers.parseUnits("1000", 6),
      minAmountOut: ethers.parseEther("0.01"), // Lower threshold for test
      recipient: user.address,
    };

    const params = ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient)"],
      [swapParams]
    );

    console.log("\n💰 BEFORE:");
    console.log("  User USDC:", ethers.formatUnits(await usdc.balanceOf(user.address), 6));
    console.log("  User WETH:", ethers.formatEther(await weth.balanceOf(user.address)));

    try {
      const [success, result] = await uniswapAdapter.connect(user).execute.staticCall(user.address, params);

      console.log("\n✅ STATIC CALL RESULT:");
      console.log("  Success:", success);
      console.log("  Result:", result);

      // Actually execute
      await uniswapAdapter.connect(user).execute(user.address, params);

      console.log("\n💰 AFTER:");
      console.log("  User USDC:", ethers.formatUnits(await usdc.balanceOf(user.address), 6));
      console.log("  User WETH:", ethers.formatEther(await weth.balanceOf(user.address)));
    } catch (error: any) {
      console.log("\n❌ ADAPTER CALL FAILED:");
      console.log("  Error:", error.message);
      throw error;
    }
  });
});
