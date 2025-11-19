// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/ITaskLogic.sol";
import "../interfaces/ITaskCore.sol";
import "../interfaces/ITaskVault.sol";
import "../interfaces/IActionRegistry.sol";
import "../interfaces/IRewardManager.sol";
import "../interfaces/IActionAdapter.sol";
import "../libraries/MerkleProof.sol";

/**
 * @title TaskLogicV2
 * @notice Orchestrates task execution workflow with Merkle proof verification
 * @dev Coordinates condition checking, action execution, and reward distribution
 */
contract TaskLogicV2 is ITaskLogic, Ownable, ReentrancyGuard, Pausable {
    using MerkleProof for bytes32[];

    // ============ State Variables ============

    // ConditionOracle removed - conditions now checked by adapters
    address public actionRegistry;
    address public rewardManager;
    address public executorHub;
    address public taskRegistry; // GlobalRegistry

    // ============ Constructor ============

    constructor(address _owner) Ownable(_owner) {}

    // ============ Modifiers ============

    modifier onlyExecutorHub() {
        if (msg.sender != executorHub) revert OnlyExecutorHub();
        _;
    }

    // ============ Core Functions ============

    /// @inheritdoc ITaskLogic
    function executeTask(ExecutionParams calldata params)
        external
        onlyExecutorHub
        whenNotPaused
        nonReentrant
        returns (ExecutionResult memory result)
    {
        uint256 startGas = gasleft();

        emit ExecutionStarted(params.taskId, params.executor);

        // Step 1: Load task and validate
        (address taskCore, address taskVault) = _loadTask(params.taskId);

        ITaskCore.TaskMetadata memory metadata = ITaskCore(taskCore).getMetadata();

        // Step 2: Verify seed commitment
        if (metadata.seedCommitment != bytes32(0)) {
            bytes32 providedCommitment = keccak256(abi.encode(params.seed));
            if (providedCommitment != metadata.seedCommitment) {
                revert InvalidSeed();
            }
        }

        // Step 3: Mark task as executing
        bool canExecute = ITaskCore(taskCore).executeTask(params.executor);
        if (!canExecute) revert TaskNotExecutable();

        // Step 4: Fetch and execute actions from TaskCore
        // Actions are now stored on-chain during task creation
        bool actionsSuccess = _verifyAndExecuteActions(
            taskCore,
            taskVault,
            metadata.actionsHash
        );

        emit ActionsExecuted(params.taskId, actionsSuccess);

        if (!actionsSuccess) {
            // Mark execution as failed
            ITaskCore(taskCore).completeExecution(false);

            result.success = false;
            result.failureReason = "Actions failed";
            result.gasUsed = startGas - gasleft();
            return result;
        }

        // Step 6: Distribute reward
        uint256 gasUsed = startGas - gasleft();
        uint256 rewardPaid = _distributeReward(
            taskVault,
            params.executor,
            metadata.rewardPerExecution,
            gasUsed
        );

        emit RewardDistributed(params.taskId, params.executor, rewardPaid);

        // Step 7: Mark execution as complete
        ITaskCore(taskCore).completeExecution(true);

        result.success = true;
        result.gasUsed = startGas - gasleft();
        result.rewardPaid = rewardPaid;

        return result;
    }

    // ============ Internal Functions ============

    /**
     * @notice Load task addresses from registry
     * @param taskId Task identifier
     * @return taskCore Address of TaskCore
     * @return taskVault Address of TaskVault
     */
    function _loadTask(uint256 taskId)
        internal
        view
        returns (address taskCore, address taskVault)
    {
        require(taskRegistry != address(0), "Registry not set");

        // Call registry to get task addresses
        (bool success, bytes memory data) = taskRegistry.staticcall(
            abi.encodeWithSignature("getTaskAddresses(uint256)", taskId)
        );

        require(success, "Task not found");
        (taskCore, taskVault) = abi.decode(data, (address, address));

        require(taskCore != address(0), "Invalid task");
    }

    /**
     * @notice Verify condition proof and check if condition is met
     * @param conditionHash Stored hash of condition
     * @param conditionProof Encoded condition data with Merkle proof
     * @return bool Whether condition is met
     */
    // Condition checking removed - now handled by action adapters

    /**
     * @notice Fetch actions from TaskCore and execute them
     * @param taskCore Address of task core (contains stored actions)
     * @param taskVault Address of task vault
     * @param actionsHash Stored hash of actions (for verification)
     * @return bool Whether all actions succeeded
     */
    function _verifyAndExecuteActions(
        address taskCore,
        address taskVault,
        bytes32 actionsHash
    ) internal returns (bool) {
        require(actionRegistry != address(0), "Registry not set");

        // Fetch actions from TaskCore
        ITaskCore.Action[] memory actions = ITaskCore(taskCore).getActions();

        require(actions.length > 0, "No actions stored");

        // Verify actions hash matches stored hash
        bytes32 computedHash = keccak256(abi.encode(actions));
        if (computedHash != actionsHash) revert ActionsFailed();

        // Execute each action
        for (uint256 i = 0; i < actions.length; i++) {
            bool success = _executeAction(taskVault, actions[i]);
            if (!success) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Execute a single action
     * @param taskVault Address of task vault
     * @param action Action to execute
     * @return bool Whether action succeeded
     */
    function _executeAction(address taskVault, ITaskCore.Action memory action) internal returns (bool) {
        // Get adapter from registry
        IActionRegistry.AdapterInfo memory adapterInfo =
            IActionRegistry(actionRegistry).getAdapter(action.selector);

        if (!adapterInfo.isActive) revert ActionsFailed();

        // Check protocol is approved
        if (!IActionRegistry(actionRegistry).isProtocolApproved(action.protocol)) {
            revert ActionsFailed();
        }

        // ✅ REFACTORED: Use adapter's getTokenRequirements() instead of hardcoded decoding
        // This allows adapters to use ANY parameter structure they need
        // See: docs/TASKLOGICV2_ANALYSIS_AND_SOLUTIONS.md - Option 1 implementation
        (address[] memory tokens, uint256[] memory amounts) =
            IActionAdapter(adapterInfo.adapter).getTokenRequirements(action.params);

        // For single-token adapters (most common case)
        if (tokens.length == 1 && amounts.length == 1) {
            // Prepare adapter call
            bytes memory adapterCall = abi.encodeWithSelector(
                IActionAdapter.execute.selector,
                taskVault,
                action.params
            );

            // Execute through vault with correct token/amount
            (bool callSuccess, bytes memory returnData) = taskVault.call{gas: adapterInfo.gasLimit}(
                abi.encodeWithSignature(
                    "executeTokenAction(address,address,uint256,bytes)",
                    tokens[0],           // Token address from adapter
                    adapterInfo.adapter,
                    amounts[0],          // Amount from adapter
                    adapterCall
                )
            );

            // Decode the actual vault response (bool success, bytes memory result)
            if (callSuccess && returnData.length > 0) {
                (bool actionSuccess, ) = abi.decode(returnData, (bool, bytes));
                return actionSuccess;
            }
        }
        // Future: Handle multi-token adapters here
        // else if (tokens.length > 1) { ... }

        // Call failed, no data, or unsupported token configuration
        return false;
    }

    /**
     * @notice Distribute reward to executor
     * @param taskVault Address of task vault
     * @param executor Executor address
     * @param baseReward Base reward amount
     * @param gasUsed Gas consumed
     * @return uint256 Total reward paid
     */
    function _distributeReward(
        address taskVault,
        address executor,
        uint256 baseReward,
        uint256 gasUsed
    ) internal returns (uint256) {
        if (rewardManager == address(0)) {
            return 0;
        }

        // Calculate reward and distribute
        uint256 totalPaid = IRewardManager(rewardManager).distributeReward(
            taskVault,
            executor,
            baseReward,
            gasUsed
        );

        return totalPaid;
    }


    // ============ Structs ============

    struct Action {
        bytes4 selector;
        address protocol;
        bytes params;
    }

    // ============ Admin Functions ============

    // setConditionOracle removed - conditions now checked by adapters

    /// @inheritdoc ITaskLogic
    function setActionRegistry(address _actionRegistry) external onlyOwner {
        require(_actionRegistry != address(0), "Invalid registry");
        actionRegistry = _actionRegistry;
    }

    /// @inheritdoc ITaskLogic
    function setRewardManager(address _rewardManager) external onlyOwner {
        require(_rewardManager != address(0), "Invalid manager");
        rewardManager = _rewardManager;
    }

    /// @inheritdoc ITaskLogic
    function setExecutorHub(address _executorHub) external onlyOwner {
        require(_executorHub != address(0), "Invalid hub");
        executorHub = _executorHub;
    }

    function setTaskRegistry(address _taskRegistry) external onlyOwner {
        require(_taskRegistry != address(0), "Invalid registry");
        taskRegistry = _taskRegistry;
    }

    /// @notice Pause execution (emergency)
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause execution
    function unpause() external onlyOwner {
        _unpause();
    }
}
