// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/ITaskCore.sol";

/**
 * @title TaskCore
 * @notice Manages task metadata and lifecycle
 * @dev Minimal storage, most state changes happen through TaskLogic
 */
contract TaskCore is ITaskCore {

    // ============ State Variables ============

    TaskMetadata public metadata;
    address public vault;
    address public logic;
    address public creator;
    uint256 public taskId;

    bool private initialized;

    // ============ Action Storage ============
    // Store the actual actions for execution
    // Action[] cannot be public (compiler limitation), so we use private with getter
    ITaskCore.Action[] private storedActions;

    // ============ Modifiers ============

    modifier onlyCreator() {
        require(msg.sender == creator, "Only creator");
        _;
    }

    modifier onlyLogic() {
        require(msg.sender == logic, "Only logic");
        _;
    }

    modifier whenNotExecuting() {
        require(metadata.status != TaskStatus.EXECUTING, "Task executing");
        _;
    }

    // ============ Initialization ============

    /// @inheritdoc ITaskCore
    function initialize(
        uint256 _id,
        address _creator,
        address _vault,
        address _logic,
        TaskMetadata calldata _metadata
    ) external {
        require(!initialized, "Already initialized");
        require(_creator != address(0), "Invalid creator");
        require(_vault != address(0), "Invalid vault");
        require(_logic != address(0), "Invalid logic");

        initialized = true;
        taskId = _id;
        creator = _creator;
        vault = _vault;
        logic = _logic;
        metadata = _metadata;

        emit TaskStatusChanged(_id, TaskStatus.ACTIVE, metadata.status);
    }

    // ============ Core Functions ============

    /// @inheritdoc ITaskCore
    function executeTask(address executor) external onlyLogic returns (bool success) {
        require(metadata.status == TaskStatus.ACTIVE, "Not active");

        bool canExecute = isExecutable();

        // Debug: Emit checkpoint before blocking
        emit ExecutionCheckpoint(
            taskId,
            metadata.executionCount,
            metadata.maxExecutions,
            canExecute,
            "executeTask_check"
        );

        require(canExecute, "Not executable");

        // Set to executing
        TaskStatus oldStatus = metadata.status;
        metadata.status = TaskStatus.EXECUTING;
        emit TaskStatusChanged(taskId, oldStatus, TaskStatus.EXECUTING);

        // Execution happens in TaskLogic, this is just state management
        return true;
    }

    /// @notice Complete execution (called by TaskLogic after success)
    function completeExecution(bool success) external onlyLogic {
        require(metadata.status == TaskStatus.EXECUTING, "Not executing");

        if (success) {
            metadata.executionCount++;
            metadata.lastExecutionTime = block.timestamp;

            // Debug: Emit checkpoint after increment
            emit ExecutionCheckpoint(
                taskId,
                metadata.executionCount,
                metadata.maxExecutions,
                true,
                "after_increment"
            );

            // Check if task is completed
            if (metadata.maxExecutions > 0 && metadata.executionCount >= metadata.maxExecutions) {
                _setStatus(TaskStatus.COMPLETED);

                // Debug: Task completed
                emit ExecutionCheckpoint(
                    taskId,
                    metadata.executionCount,
                    metadata.maxExecutions,
                    false,
                    "task_completed"
                );
            } else {
                _setStatus(TaskStatus.ACTIVE);
            }

            emit TaskExecuted(taskId, tx.origin, true, metadata.rewardPerExecution, 0);
        } else {
            // Failed execution, revert to active
            _setStatus(TaskStatus.ACTIVE);
            emit TaskExecuted(taskId, tx.origin, false, 0, 0);
        }
    }

    /// @inheritdoc ITaskCore
    function cancel() external onlyCreator whenNotExecuting returns (uint256 refundAmount) {
        require(
            metadata.status == TaskStatus.ACTIVE || metadata.status == TaskStatus.PAUSED,
            "Cannot cancel"
        );

        _setStatus(TaskStatus.CANCELLED);

        // Calculate refund
        uint256 remainingExecutions = metadata.maxExecutions == 0
            ? 1
            : metadata.maxExecutions - metadata.executionCount;

        refundAmount = metadata.rewardPerExecution * remainingExecutions;

        emit TaskCancelled(taskId, creator);
        return refundAmount;
    }

    /// @inheritdoc ITaskCore
    function pause() external onlyCreator {
        require(metadata.status == TaskStatus.ACTIVE, "Not active");
        _setStatus(TaskStatus.PAUSED);
    }

    /// @inheritdoc ITaskCore
    function resume() external onlyCreator {
        require(metadata.status == TaskStatus.PAUSED, "Not paused");
        _setStatus(TaskStatus.ACTIVE);
    }

    /// @inheritdoc ITaskCore
    function updateReward(uint256 newReward) external payable onlyCreator {
        require(metadata.status == TaskStatus.ACTIVE, "Not active");
        require(newReward > 0, "Invalid reward");

        uint256 oldReward = metadata.rewardPerExecution;
        metadata.rewardPerExecution = newReward;

        emit TaskRewardUpdated(taskId, oldReward, newReward);
    }

    // ============ View Functions ============

    /// @inheritdoc ITaskCore
    function isExecutable() public view returns (bool) {
        // Check status
        if (metadata.status != TaskStatus.ACTIVE) {
            return false;
        }

        // Check expiration
        if (metadata.expiresAt != 0 && block.timestamp > metadata.expiresAt) {
            return false;
        }

        // Check max executions
        if (metadata.maxExecutions > 0 && metadata.executionCount >= metadata.maxExecutions) {
            return false;
        }

        // Check recurring interval
        if (metadata.recurringInterval > 0 && metadata.lastExecutionTime > 0) {
            if (block.timestamp < metadata.lastExecutionTime + metadata.recurringInterval) {
                return false;
            }
        }

        return true;
    }

    /// @inheritdoc ITaskCore
    function getMetadata() external view returns (TaskMetadata memory) {
        return metadata;
    }

    // ============ Action Storage Functions ============

    /// @notice Set the actions for this task (called by TaskFactory during creation)
    /// @param actions Array of actions to execute
    function setActions(ITaskCore.Action[] calldata actions) external {
        // Only allow setting actions once, during initialization
        // TaskFactory (caller in this case) is the only one who can call this
        require(storedActions.length == 0, "Actions already set");

        // Store actions
        for (uint256 i = 0; i < actions.length; i++) {
            storedActions.push(actions[i]);
        }
    }

    /// @notice Get all actions for this task
    /// @return Array of actions
    function getActions() external view returns (ITaskCore.Action[] memory) {
        return storedActions;
    }

    /// @notice Get a specific action by index
    /// @param index Index of the action
    /// @return The action at the specified index
    function getAction(uint256 index) external view returns (ITaskCore.Action memory) {
        require(index < storedActions.length, "Index out of bounds");
        return storedActions[index];
    }

    /// @notice Get the number of actions
    /// @return Number of stored actions
    function getActionsLength() external view returns (uint256) {
        return storedActions.length;
    }

    // ============ Internal Functions ============

    function _setStatus(TaskStatus newStatus) internal {
        TaskStatus oldStatus = metadata.status;
        metadata.status = newStatus;
        emit TaskStatusChanged(taskId, oldStatus, newStatus);
    }
}
