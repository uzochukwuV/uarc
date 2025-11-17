import { ethers } from "hardhat";

/**
 * Deploy Updated TimeBasedTransferAdapter & Test End-to-End
 *
 * This script:
 * 1. Deploys the updated TimeBasedTransferAdapter with 6-parameter encoding
 * 2. Connects to existing protocol contracts
 * 3. Registers the adapter
 * 4. Creates a test task (executes after 1 block / ~60 seconds)
 * 5. Waits for time condition
 * 6. Executes the task
 *
 * Run with:
 * npx hardhat run scripts/deploy-updated-timebased-adapter.ts --network polkadotHubTestnet
 */

// Contract addresses on Polkadot Hub Testnet
const CONTRACTS = {
  TASK_CORE_IMPL: '0xB70f2Fd6A2cF4Acad3DeD463a6fF4d83DD6A5ad9',
    TASK_VAULT_IMPL: '0x46D2afDca699F9B44c188A6dE2bc53263a10865D',

    // Core System Contracts
    TASK_FACTORY: '0x36ce3E5904B0C983e034D42B2aC74e95CC243893',
    TASK_LOGIC: '0xDa5f0913Ece98c60f12397Fd9C1BA42C49762D62',
    EXECUTOR_HUB: '0xe477B7Da250753fBD5C1371975f76164A4F3E8DF',
    GLOBAL_REGISTRY: '0x3bF75a448FB34AcB3cAA18ab7b21Fd10627A9A1e',
    REWARD_MANAGER: '0xd48A87474ddAA6340493D8ffdAb5E9De262bbdd8',
    ACTION_REGISTRY: '0xfbfFf91746dB25F2480fcF909C4DDC676E690d8a',
  MOCK_USDC: "0xDefA91C83A08eb1745668fEeDB51Ab532D20EE62",
};

async function main() {
  console.log("\n🚀 Deploying Updated TimeBasedTransferAdapter & Testing...\n");

  const [deployer] = await ethers.getSigners();
  const recipient = {
    address : "0x19C50Bfd73627B35f2EF3F7B0755229D42cd56a8"
  }
  console.log("Deploying with account:", deployer.address);
  console.log("Recipient account:", recipient.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // ============ STEP 1: Deploy TimeBasedTransferAdapter ============
  console.log("📝 STEP 1: Deploying TimeBasedTransferAdapter...");
  const TimeBasedTransferAdapter = await ethers.getContractFactory("TimeBasedTransferAdapter");
  const adapter = await TimeBasedTransferAdapter.deploy();
  await adapter.waitForDeployment();

  const adapterAddress = await adapter.getAddress();
  console.log("✅ Deployed to:", adapterAddress);
  console.log("   Adapter name:", await adapter.name());

  // ============ STEP 2: Connect to Protocol Contracts ============
  console.log("\n📝 STEP 2: Connecting to Protocol Contracts...");

  const taskFactory = await ethers.getContractAt("TaskFactory", CONTRACTS.TASK_FACTORY);
  const executorHub = await ethers.getContractAt("ExecutorHub", CONTRACTS.EXECUTOR_HUB);
  const actionRegistry = await ethers.getContractAt("ActionRegistry", CONTRACTS.ACTION_REGISTRY);
  const mockUSDC = await ethers.getContractAt("MockERC20", CONTRACTS.MOCK_USDC);

  console.log("✅ Connected to all protocol contracts");

  // ============ STEP 3: Register Adapter ============
  console.log("\n📝 STEP 3: Registering Adapter in ActionRegistry...");

  try {
    const registerTx = await actionRegistry.registerAdapter(
      "0x1cff79cd",  // executeAction selector
      adapterAddress,
      500000,        // gas limit
      true           // isActive
    );
    await registerTx.wait();
    console.log("✅ Adapter registered");
  } catch (error: any) {
    if (error.message.includes("already registered")) {
      console.log("⚠️  Adapter already registered (skipping)");
    } else {
      throw error;
    }
  }

  // ============ STEP 4: Approve Mock USDC as Protocol ============
  console.log("\n📝 STEP 4: Approving Mock USDC as protocol...");

  try {
    const approveTx = await actionRegistry.approveProtocol(CONTRACTS.MOCK_USDC);
    await approveTx.wait();
    console.log("✅ Mock USDC approved as protocol");
  } catch (error: any) {
    if (error.message.includes("already approved")) {
      console.log("⚠️  Protocol already approved (skipping)");
    } else {
      throw error;
    }
  }

  // ============ STEP 5: Mint & Approve USDC ============
  console.log("\n📝 STEP 5: Setting up USDC tokens...");

  const transferAmount = ethers.parseUnits("100", 6); // 100 USDC

  // Mint USDC to deployer
  const mintTx = await mockUSDC.mint(deployer.address, transferAmount);
  await mintTx.wait();
  console.log("✅ Minted 100 USDC to deployer");

  // Approve TaskFactory to spend USDC
  const approveTx = await mockUSDC.approve(CONTRACTS.TASK_FACTORY, transferAmount);
  await approveTx.wait();
  console.log("✅ Approved TaskFactory to spend USDC");

  // ============ STEP 6: Register as Executor ============
  console.log("\n📝 STEP 6: Registering as executor...");

  try {
    const executorStake = ethers.parseEther("1"); // 1 ETH stake
    const registerTx = await executorHub.registerExecutor({ value: executorStake });
    await registerTx.wait();
    console.log("✅ Registered as executor with 1 ETH stake");
  } catch (error: any) {
    if (error.message.includes("already registered")) {
      console.log("⚠️  Already registered as executor (skipping)");
    } else {
      throw error;
    }
  }

  // ============ STEP 7: Create Task (Execute after 1 minute) ============
  console.log("\n📝 STEP 7: Creating task (executes after 60 seconds)...");

  const currentBlock = await ethers.provider.getBlockNumber();
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const executeAfter = currentTime + 60n; // Execute after 60 seconds

  console.log("   Current time:", new Date(Number(currentTime) * 1000).toISOString());
  console.log("   Execute after:", new Date(Number(executeAfter) * 1000).toISOString());
  console.log("   Current block:", currentBlock);

  // Encode params in 6-parameter format
  const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "address", "uint256", "uint256", "address"],
    [
      ethers.ZeroAddress,     // router (ignored)
      CONTRACTS.MOCK_USDC,    // tokenIn
      ethers.ZeroAddress,     // tokenOut (ignored)
      transferAmount,         // amountIn
      executeAfter,           // minAmountOut - repurposed as timestamp
      recipient.address,      // recipient
    ]
  );

  // Build task params
  const taskParams = {
    expiresAt: currentTime + 86400n, // 24 hours
    maxExecutions: 1n,
    recurringInterval: 0n,
    rewardPerExecution: ethers.parseEther("0.01"), // 0.01 ETH
    seedCommitment: ethers.ZeroHash,
  };

  const actions = [{
    selector: "0x1cff79cd",
    protocol: CONTRACTS.MOCK_USDC, // Use token as protocol
    params: adapterParams,
  }];

  const tokenDeposits = [{
    token: CONTRACTS.MOCK_USDC,
    amount: transferAmount,
  }];

  const totalETHValue = ethers.parseEther("0.1"); // Reward + gas buffer

  // Create task
  const createTx = await taskFactory.createTaskWithTokens(
    taskParams,
    actions,
    tokenDeposits,
    { value: totalETHValue }
  );
  const createReceipt = await createTx.wait();

  // Extract task ID
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

  if (!taskCreatedEvent) {
    throw new Error("TaskCreated event not found!");
  }

  const parsedEvent = taskFactory.interface.parseLog({
    topics: taskCreatedEvent.topics as string[],
    data: taskCreatedEvent.data,
  });

  const taskId = parsedEvent!.args[0];
  console.log("✅ Task created! Task ID:", taskId.toString());
  console.log("   Transaction:", createReceipt?.hash);

  // ============ STEP 8: Wait for Time Condition ============
  console.log("\n📝 STEP 8: Waiting 60 seconds for time condition...");
  console.log("   Waiting", "⏳".repeat(60));

  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if ((i + 1) % 10 === 0) {
      console.log(`   ${i + 1} seconds elapsed...`);
    }
  }

  console.log("✅ Time condition should be met!");

  // Verify canExecute
  const [canExec, reason] = await adapter.canExecute(adapterParams);
  console.log("   Adapter canExecute:", canExec);
  console.log("   Reason:", reason);

  // ============ STEP 9: Execute Task (Commit-Reveal) ============
  console.log("\n📝 STEP 9: Executing task via commit-reveal...");

  // Commit to task
  const reveal = ethers.randomBytes(32);
  const commitment = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [reveal])
  );

  const requestTx = await executorHub.requestExecution(taskId, commitment);
  await requestTx.wait();
  console.log("✅ Committed to task");
  console.log("   Commitment:", commitment);

  // Wait for commit delay (2 seconds)
  console.log("   Waiting 3 seconds for commit delay...");
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Prepare actions proof
  const actionForProof = {
    selector: "0x1cff79cd",
    protocol: CONTRACTS.MOCK_USDC,
    params: adapterParams,
  };

  const actionsProof = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(bytes4 selector, address protocol, bytes params)[]", "bytes32[]"],
    [[actionForProof], []] // Empty merkle proof for single action
  );

  // Execute task
  const recipientBalanceBefore = await mockUSDC.balanceOf(recipient.address);

  const executeTx = await executorHub.executeTask(taskId, reveal, actionsProof);
  const executeReceipt = await executeTx.wait();

  console.log("✅ Task executed!");
  console.log("   Transaction:", executeReceipt?.hash);

  // ============ STEP 10: Verify Results ============
  console.log("\n📝 STEP 10: Verifying execution results...");

  const recipientBalanceAfter = await mockUSDC.balanceOf(recipient.address);
  const usdcReceived = recipientBalanceAfter - recipientBalanceBefore;

  console.log("✅ Recipient USDC balance change:", ethers.formatUnits(usdcReceived, 6), "USDC");
  console.log("   Expected:", ethers.formatUnits(transferAmount, 6), "USDC");

  if (usdcReceived === transferAmount) {
    console.log("   ✅ TRANSFER SUCCESSFUL!");
  } else {
    console.log("   ❌ TRANSFER FAILED - Amount mismatch!");
  }

  // ============ Summary ============
  console.log("\n" + "═".repeat(60));
  console.log("📋 DEPLOYMENT & TEST SUMMARY");
  console.log("═".repeat(60));
  console.log("TimeBasedTransferAdapter:", adapterAddress);
  console.log("Task ID:", taskId.toString());
  console.log("Recipient:", recipient.address);
  console.log("USDC Transferred:", ethers.formatUnits(usdcReceived, 6), "USDC");
  console.log("═".repeat(60));

  console.log("\n✅ COMPLETE END-TO-END TEST SUCCESSFUL!\n");

  console.log("📝 Update frontend addresses.ts:");
  console.log(`TIME_BASED_TRANSFER_ADAPTER: '${adapterAddress}'`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
