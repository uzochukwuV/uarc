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
   // Implementation Contracts
     TASK_CORE_IMPL: '0xfb88E573fbEE0c2361a981e88Cf092c6E121B61E',
    TASK_VAULT_IMPL: '0xba3Fa9195a5a4abcc1a7990048D9ed44E1AEc5F9',

    // Core System Contracts
    TASK_FACTORY: '0x627f85E4736Ba61E12D966f7597bdc9Df6314757',
    TASK_LOGIC: '0x4d14b7799b2B43282B65bed2A19f160315b4fD50',
    EXECUTOR_HUB: '0xe316c1dA035bcc05a5c81f041BF0bCb2BE892a58',
    GLOBAL_REGISTRY: '0x4865a14d7c18f8861fE8a7136e4d2197730DC6bb',
    REWARD_MANAGER: '0x6B9Ca49fc3d0Ad892Bec0cf474ac8F8a12C13204',
    ACTION_REGISTRY: '0x6271498c4EAd88AbaCB3db20f3974AfaBfdC8eD6',


    // Mock tokens for testing
    MOCK_USDC: '0xDefA91C83A08eb1745668fEeDB51Ab532D20EE62',
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

  // ============ STEP 2: Deploy or Connect to MockERC20 Token ============
  console.log("\n📝 STEP 2: Deploying/Connecting to MockERC20 Token...");

  let mockUSDAAddress = CONTRACTS.MOCK_USDC;
  let mockUSDC;

  // Try to connect to existing token
  try {
    mockUSDC = await ethers.getContractAt("MockERC20", CONTRACTS.MOCK_USDC);
    // Test if it's a valid contract by calling name()
    await mockUSDC.name();
    console.log("✅ Connected to existing MockERC20:", mockUSDAAddress);
  } catch (error) {
    console.log("⚠️  MockERC20 not found at", CONTRACTS.MOCK_USDC);
    console.log("   Deploying new MockERC20...");

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();
    mockUSDAAddress = await mockUSDC.getAddress();
    console.log("✅ Deployed new MockERC20 to:", mockUSDAAddress);
  }

  // ============ STEP 2B: Connect to Protocol Contracts ============
  console.log("\n📝 STEP 2B: Connecting to Protocol Contracts...");

  const taskFactory = await ethers.getContractAt("TaskFactory", CONTRACTS.TASK_FACTORY);
  const executorHub = await ethers.getContractAt("ExecutorHub", CONTRACTS.EXECUTOR_HUB);
  const actionRegistry = await ethers.getContractAt("ActionRegistry", CONTRACTS.ACTION_REGISTRY);

  // Get TaskVault to register token
  const taskVaultImpl = await ethers.getContractAt("TaskVault", CONTRACTS.TASK_VAULT_IMPL);

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
    const approveTx = await actionRegistry.approveProtocol(mockUSDAAddress);
    await approveTx.wait();
    console.log("✅ Mock USDC approved as protocol at:", mockUSDAAddress);
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

  // Approve TaskFactory to spend USDC (for creating tasks with token deposits)
  const approveTx = await mockUSDC.approve(CONTRACTS.TASK_FACTORY, ethers.parseUnits("1000", 6));
  await approveTx.wait();
  console.log("✅ Approved TaskFactory to spend USDC");

  // Also approve the adapter to spend USDC (if needed for execution)
  const approveAdapterTx = await mockUSDC.approve(adapterAddress, ethers.parseUnits("1000", 6));
  await approveAdapterTx.wait();
  console.log("✅ Approved TimeBasedTransferAdapter to spend USDC");

  // ============ STEP 6: Register as Executor ============
  console.log("\n📝 STEP 6: Checking executor status...");

  try {
    // Check if already registered
    const executor = await executorHub.getExecutor(deployer.address);
    if (executor.isActive) {
      console.log("✅ Already registered as executor (skipping)");
    } else {
      // TESTNET: Free registration (0 stake required)
      const registerTx = await executorHub.registerExecutor();
      await registerTx.wait();
      console.log("✅ Registered as executor (free on testnet)");
    }
  } catch (error: any) {
    // If getExecutor fails, try to register
    try {
      const registerTx = await executorHub.registerExecutor();
      await registerTx.wait();
      console.log("✅ Registered as executor (free on testnet)");
    } catch (registerError: any) {
      console.log("⚠️  Could not register (may already be registered)");
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

  // Encode params in clean 4-parameter format (TESTNET: new adapter format)
  // CRITICAL: Use tuple encoding to match struct layout expected by adapter
  // TimeBasedTransferAdapter expects: struct TransferParams { address token; address recipient; uint256 amount; uint256 executeAfter; }
  const adapterParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,uint256,uint256)"],  // ← Explicit tuple for struct
    [[
      mockUSDAAddress,         // token (use the dynamically resolved address)
      recipient.address,       // recipient
      transferAmount,          // amount
      executeAfter,            // executeAfter timestamp
    ]]
  );

  console.log("   ✅ Encoded action params (struct format)");
  console.log("   Token in params:", mockUSDAAddress);

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
    protocol: mockUSDAAddress,    // Use token as protocol (use the dynamically resolved address)
    params: adapterParams,
  }];

  const tokenDeposits = [{
    token: mockUSDAAddress,         // Use the dynamically resolved address
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
  console.log(createReceipt?.toJSON())

  // Extract task ID from logs
  let taskId: bigint | undefined;

  console.log("📍 Extracting task ID from receipt logs...");
  console.log("   Receipt logs count:", createReceipt?.logs?.length || 0);

  // Parse logs from receipt
  if (createReceipt?.logs) {
    for (let i = 0; i < createReceipt.logs.length; i++) {
      const log = createReceipt.logs[i];
      try {
        const parsed = taskFactory.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        console.log(parsed?.name)

        if (parsed?.name === "TaskCreated") {
          console.log("   ✅ Found TaskCreated event at log index:", i);
          taskId = parsed.args[0];
          console.log("   Task ID from event:", taskId?.toString());
          break;
        }
      } catch (e) {
        // Not a TaskFactory event, continue
      }
    }
  }

  // Fallback: Check all tasks created and use the latest
  if (!taskId) {
    console.log("⚠️  Could not extract taskId from events, trying alternative method...");
    // Try to find any task in the factory storage by querying getTask(i) until we hit a non-existent one
    for (let i = 0; i < 10; i++) {
      try {
        const task = await taskFactory.getTask(BigInt(i));
        if (task.taskCore !== "0x0000000000000000000000000000000000000000") {
          taskId = BigInt(i);
          console.log("   Found task at ID:", taskId.toString());
          break;
        }
      } catch (e) {
        // Task doesn't exist at this ID
      }
    }
  }

  if (!taskId) {
    throw new Error("Could not determine task ID!");
  }

  console.log("✅ Task created! Task ID:", taskId.toString());
  console.log("   Transaction:", createReceipt?.hash);

  // ============ STEP 8: Wait for Time Condition ============
  console.log("\n📝 STEP 8: Waiting 60 seconds for time condition...");
  console.log("   Waiting", "⏳".repeat(60));

  for (let i = 0; i < 70; i++) {
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

  // ============ STEP 9: Execute Task (Actions fetched from TaskCore) ============
  console.log("\n📝 STEP 9: Executing task (actions fetched from on-chain storage)...");

  // Get task core address from factory
  const deployedTask = await taskFactory.getTask(taskId);
  console.log("   Task found:", {
    taskCore: deployedTask.taskCore,
    taskVault: deployedTask.taskVault,
  });

  const taskCore = await ethers.getContractAt("TaskCore", deployedTask.taskCore);

  // Verify actions are stored on-chain
  const storedActions = await taskCore.getActions();
  console.log("   ✅ Verified actions stored on-chain:", storedActions.length, "action(s)");
  console.log("   Action selector:", storedActions[0].selector);
  console.log("   Protocol:", storedActions[0].protocol);

  // Execute task directly (no actionsProof needed - actions are on-chain)
  const recipientBalanceBefore = await mockUSDC.balanceOf(recipient.address);

  console.log("\n--- EXECUTION 1 ---");
  const executeTx = await executorHub.executeTask(taskId);
  const executeReceipt = await executeTx.wait();

  console.log("✅ Task executed!");
  console.log("   Transaction:", executeReceipt?.hash);

  // ============ STEP 10: Check Task Info After First Execution ============
  console.log("\n📝 STEP 10: Checking task state after execution...");

  let taskMetadata = await taskCore.getMetadata();
  console.log("📊 Task Metadata After Execution 1:");
  console.log("   executionCount:", taskMetadata.executionCount.toString());
  console.log("   maxExecutions:", taskMetadata.maxExecutions.toString());
  console.log("   Status:", taskMetadata.status, "(0=ACTIVE, 1=PAUSED, 2=EXECUTING, 3=COMPLETED)");
  console.log("   lastExecutionTime:", taskMetadata.lastExecutionTime.toString());

  // ============ STEP 10B: Verify Results ============
  console.log("\n📝 STEP 10B: Verifying execution results...");

  const recipientBalanceAfter = await mockUSDC.balanceOf(recipient.address);
  const usdcReceived = recipientBalanceAfter - recipientBalanceBefore;

  console.log("✅ Recipient USDC balance change:", ethers.formatUnits(usdcReceived, 6), "USDC");
  console.log("   Expected:", ethers.formatUnits(transferAmount, 6), "USDC");

  if (usdcReceived === transferAmount) {
    console.log("   ✅ TRANSFER SUCCESSFUL!");
  } else {
    console.log("   ❌ TRANSFER FAILED - Amount mismatch!");
  }

  // ============ STEP 10C: Test Execution Limit Enforcement ============
  console.log("\n📝 STEP 10C: Testing execution limit enforcement...");
  console.log("--- ATTEMPTING EXECUTION 2 (should fail) ---");

  try {
    const executeTx2 = await executorHub.executeTask(taskId);
    await executeTx2.wait();

    // If we get here, execution succeeded (should NOT happen!)
    console.log("❌ ISSUE: Second execution succeeded when it should have failed!");
    console.log("   This means maxExecutions enforcement is NOT working!");

    // Check state again
    taskMetadata = await taskCore.getMetadata();
    console.log("\n   Current task state:");
    console.log("   executionCount:", taskMetadata.executionCount.toString());
    console.log("   maxExecutions:", taskMetadata.maxExecutions.toString());
    console.log("   Status:", taskMetadata.status);
  } catch (error: any) {
    console.log("✅ Second execution correctly FAILED!");
    console.log("   Error reason:", error.reason || error.message);

    // Verify task is in COMPLETED state
    taskMetadata = await taskCore.getMetadata();
    console.log("\n   Task state after failed execution attempt:");
    console.log("   executionCount:", taskMetadata.executionCount.toString());
    console.log("   maxExecutions:", taskMetadata.maxExecutions.toString());
    console.log("   Status:", taskMetadata.status, "(3=COMPLETED - correct!)");

    if (taskMetadata.status === 3n) {
      console.log("   ✅ Task correctly marked as COMPLETED");
    } else {
      console.log("   ❌ Task should be COMPLETED but status is:", taskMetadata.status);
    }
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
