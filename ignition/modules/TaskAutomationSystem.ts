import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Hardhat Ignition module for deploying TaskerOnChain V2
 * Post-Audit Architecture with Adapter-Based Conditions
 *
 * Deployment Order:
 * 1. Deploy Implementation Contracts (clones)
 * 2. Deploy Core System Contracts
 * 3. Deploy Adapters (optional)
 * 4. Configure Contract Connections
 * 5. Register Adapters
 *
 * Key Changes from V1:
 * - ConditionOracle REMOVED (conditions now in adapters)
 * - Actions stored ON-CHAIN during task creation
 * - Token requirements declared by adapters
 * - Adapters verify their own conditions via canExecute()
 */
const TaskAutomationModule = buildModule("TaskerOnChainV2", (m) => {

  // ============ Parameters ============

  const deployer = m.getAccount(0);
  const deployTimeAdapter = m.getParameter("deployTimeAdapter", true);

  // ============ STEP 1: Deploy Implementation Contracts ============

  // 1.1 TaskCore Implementation (clone template)
  const taskCoreImpl = m.contract("TaskCore");

  // 1.2 TaskVault Implementation (clone template)
  const taskVaultImpl = m.contract("TaskVault");

  // ============ STEP 2: Deploy Core System Contracts ============

  // 2.1 ActionRegistry (adapter management)
  const actionRegistry = m.contract("ActionRegistry", [deployer]);

  // 2.2 ExecutorHub (executor management & execution entry point)
  const executorHub = m.contract("ExecutorHub", [deployer]);

  // 2.3 GlobalRegistry (task discovery & indexing)
  const globalRegistry = m.contract("GlobalRegistry", [deployer]);

  // 2.4 RewardManager (reward calculation & distribution)
  const rewardManager = m.contract("RewardManager", [deployer]);

  // 2.5 TaskLogicV2 (execution orchestration - NO ConditionOracle!)
  const taskLogic = m.contract("TaskLogicV2", [deployer]);

  // 2.6 TaskFactory (task creation with on-chain action storage)
  const taskFactory = m.contract("TaskFactory", [
    taskCoreImpl,
    taskVaultImpl,
    taskLogic,
    executorHub,
    actionRegistry,
    rewardManager,
    deployer,
  ]);

  // ============ STEP 3: Deploy Adapters ============

  // TimeBasedTransferAdapter (time-based token transfers with embedded conditions)
  const timeBasedAdapter = deployTimeAdapter
    ? m.contract("TimeBasedTransferAdapter")
    : null;

  // ============ STEP 4: Configure Contract Connections ============

  // Configure TaskLogicV2
  m.call(taskLogic, "setActionRegistry", [actionRegistry], {
    id: "configure_tasklogic_registry",
  });

  m.call(taskLogic, "setRewardManager", [rewardManager], {
    id: "configure_tasklogic_rewards",
  });

  m.call(taskLogic, "setExecutorHub", [executorHub], {
    id: "configure_tasklogic_executor",
  });

  m.call(taskLogic, "setTaskRegistry", [globalRegistry], {
    id: "configure_tasklogic_global_registry",
  });

  // Configure ExecutorHub
  m.call(executorHub, "setTaskLogic", [taskLogic], {
    id: "configure_executor_logic",
  });

  m.call(executorHub, "setTaskRegistry", [globalRegistry], {
    id: "configure_executor_registry",
  });

  // Configure RewardManager
  m.call(rewardManager, "setTaskLogic", [taskLogic], {
    id: "configure_reward_logic",
  });

  m.call(rewardManager, "setExecutorHub", [executorHub], {
    id: "configure_reward_executor",
  });

  m.call(rewardManager, "setGasReimbursementMultiplier", [100], {
    id: "configure_reward_gas",
  });

  // Configure GlobalRegistry
  m.call(globalRegistry, "authorizeFactory", [taskFactory], {
    id: "configure_registry_factory",
  });

  // Configure TaskFactory
  m.call(taskFactory, "setGlobalRegistry", [globalRegistry], {
    id: "configure_factory_registry",
  });

  // ============ STEP 5: Register Adapters ============

  // if (deployTimeAdapter && timeBasedAdapter) {
  //   // Register TimeBasedTransferAdapter
  //   // Selector: first 4 bytes of execute(address,bytes)
  //   const executeSelector = "0x1cff79cd"; // execute(address,bytes)

  //   m.call(actionRegistry, "registerAdapter", [
  //     executeSelector,
  //     timeBasedAdapter,
  //     100000,  // gasLimit
  //     true,    // requiresTokens
  //   ], {
  //     id: "register_time_adapter",
  //   });
  // }

  // ============ Return Deployed Contracts ============

  const returnObj: any = {
    taskCoreImpl,
    taskVaultImpl,
    actionRegistry,
    executorHub,
    globalRegistry,
    rewardManager,
    taskLogic,
    taskFactory,
  };

  if (timeBasedAdapter) {
    returnObj.timeBasedAdapter = timeBasedAdapter;
  }

  return returnObj;
});

export default TaskAutomationModule;
