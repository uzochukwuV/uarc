// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IExecutorHub
 * @notice Interface for ExecutorHub contract that manages executor lifecycle
 */
interface IExecutorHub {

    // ============ Structs ============

    struct Executor {
        address addr;
        uint128 stakedAmount;
        uint128 registeredAt;
        uint256 totalExecutions;
        uint256 successfulExecutions;
        uint256 failedExecutions;
        uint256 reputationScore;
        bool isActive;
        bool isSlashed;
    }

    // ============ Events ============

    event ExecutorRegistered(address indexed executor, uint256 stakeAmount);
    event ExecutorUnregistered(address indexed executor);
    event StakeAdded(address indexed executor, uint256 amount);
    event StakeWithdrawn(address indexed executor, uint256 amount);
    event ExecutionCompleted(uint256 indexed taskId, address indexed executor, bool success);
    event ExecutorSlashed(address indexed executor, uint256 amount, string reason);

    // ============ Errors ============

    error AlreadyRegistered();
    error NotRegistered();
    error InsufficientStake();
    error ExecutorBlacklisted();

    // ============ Functions ============

    /// @notice Register as an executor
    function registerExecutor() external payable;

    /// @notice Unregister and withdraw stake
    function unregisterExecutor() external;

    /// @notice Add more stake
    function addStake() external payable;

    /// @notice Withdraw stake (only when not active)
    function withdrawStake(uint256 amount) external;

    /// @notice Execute task (actions are fetched from TaskCore)
    function executeTask(
        uint256 taskId
    ) external returns (bool success);

    /// @notice Record execution result (called by TaskLogic)
    function recordExecution(uint256 taskId, address executor, bool success, uint256 gasUsed) external;

    /// @notice Slash executor for misbehavior
    function slashExecutor(address executor, uint256 amount, string calldata reason) external;

    /// @notice Check if executor can execute
    function canExecute(address executor) external view returns (bool);

    /// @notice Get executor info
    function getExecutor(address executor) external view returns (Executor memory);
}
