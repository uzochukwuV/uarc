// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IExecutorHub.sol";
import "../interfaces/IUserVault.sol";
import "../interfaces/IStrategyAdapter.sol";
import "../interfaces/IRewardManager.sol";

/**
 * @title ExecutorHub
 * @notice Push-based task registry with admin-managed executor management.
 *
 * @dev V5 Architecture: Vaults register tasks directly via cross-contract calls.
 *      - Vaults call registerTask/removeTask/updateTaskParams when automations change
 *      - ExecutorHub maintains its own task list — no more polling vaults
 *      - Executors query getTasks()/getExecutableTasks() to discover work
 *      - Executors call executeAutomation() to trigger execution
 *      - canExecute() delegates to the strategy adapter's condition check
 *      - msg.sender is used as vault address for task registration (no spoofing)
 */
contract ExecutorHub is IExecutorHub, Ownable, ReentrancyGuard {

    // ─────────────────────────────────────────────────────────────────────────
    // State: Executors
    // ─────────────────────────────────────────────────────────────────────────

    mapping(address => Executor) public executors;
    address[] public executorList;
    mapping(address => uint256) public executorIndex;

    // ─────────────────────────────────────────────────────────────────────────
    // State: Tasks (push-based registry)
    // ─────────────────────────────────────────────────────────────────────────

    struct TaskKey {
        address vault;
        uint256 automationId;
    }

    mapping(address => mapping(uint256 => Task)) private _tasks;
    TaskKey[] private _taskKeys;
    mapping(address => mapping(uint256 => uint256)) private _taskIndex; // vault => automationId => index in _taskKeys + 1 (0 = not registered)

    // ─────────────────────────────────────────────────────────────────────────
    // State: RewardManager
    // ─────────────────────────────────────────────────────────────────────────

    address public rewardManager;

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyExecutor() {
        if (!executors[msg.sender].isActive) revert NotExecutor();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin: Executor Management
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IExecutorHub
    function addExecutor(address executor) external onlyOwner {
        if (executor == address(0)) revert("Invalid executor");
        if (executors[executor].isActive) revert AlreadyExecutor();

        executors[executor] = Executor({
            addr: executor,
            isActive: true,
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0
        });

        executorIndex[executor] = executorList.length;
        executorList.push(executor);

        emit ExecutorAdded(executor);
    }

    /// @inheritdoc IExecutorHub
    function removeExecutor(address executor) external onlyOwner {
        if (!executors[executor].isActive) revert NotActiveExecutor();

        executors[executor].isActive = false;

        // Swap-and-pop to maintain a dense array
        uint256 index = executorIndex[executor];
        uint256 lastIndex = executorList.length - 1;
        if (index != lastIndex) {
            address lastExecutor = executorList[lastIndex];
            executorList[index] = lastExecutor;
            executorIndex[lastExecutor] = index;
        }
        executorList.pop();
        delete executorIndex[executor];

        emit ExecutorRemoved(executor);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Vault-Called Functions: Task Registration
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IExecutorHub
    /// @dev msg.sender is used as the vault address — only the vault can register its own tasks
    function registerTask(uint256 automationId, address strategy, bytes calldata params) external {
        address vault = msg.sender;

        if (_taskIndex[vault][automationId] != 0) revert TaskAlreadyRegistered();

        _tasks[vault][automationId] = Task({
            vault: vault,
            automationId: automationId,
            strategy: strategy,
            params: params,
            active: true
        });

        _taskIndex[vault][automationId] = _taskKeys.length + 1; // 1-indexed (0 = not registered)
        _taskKeys.push(TaskKey({ vault: vault, automationId: automationId }));

        emit TaskRegistered(vault, automationId, strategy);
    }

    /// @inheritdoc IExecutorHub
    /// @dev msg.sender is used as the vault address — only the vault can remove its own tasks
    function removeTask(uint256 automationId) external {
        address vault = msg.sender;

        if (_taskIndex[vault][automationId] == 0) revert TaskNotFound();

        // Mark as inactive
        _tasks[vault][automationId].active = false;

        // Swap-and-pop from _taskKeys
        uint256 index = _taskIndex[vault][automationId] - 1; // convert to 0-indexed
        uint256 lastIndex = _taskKeys.length - 1;

        if (index != lastIndex) {
            TaskKey memory lastKey = _taskKeys[lastIndex];
            _taskKeys[index] = lastKey;
            _taskIndex[lastKey.vault][lastKey.automationId] = index + 1; // update moved element's index
        }
        _taskKeys.pop();

        // Clean up mappings
        delete _taskIndex[vault][automationId];
        delete _tasks[vault][automationId];

        emit TaskRemoved(vault, automationId);
    }

    /// @inheritdoc IExecutorHub
    /// @dev msg.sender is used as the vault address — only the vault can update its own tasks
    function updateTaskParams(uint256 automationId, bytes calldata params) external {
        address vault = msg.sender;

        if (_taskIndex[vault][automationId] == 0) revert TaskNotFound();
        if (!_tasks[vault][automationId].active) revert TaskNotFound();

        _tasks[vault][automationId].params = params;

        emit TaskParamsUpdated(vault, automationId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Automation Execution
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IExecutorHub
    function executeAutomation(address vault, uint256 automationId)
        external
        onlyExecutor
        nonReentrant
    {
        require(vault != address(0), "Invalid vault");

        Executor storage executor = executors[msg.sender];
        executor.totalExecutions++;

        bool success = IUserVault(vault).triggerAutomation(automationId);

        if (success) {
            executor.successfulExecutions++;
        } else {
            executor.failedExecutions++;
        }

        emit AutomationExecuted(vault, automationId, msg.sender, success);

        // Distribute reward if reward manager is configured.
        // Wrapped in try/catch so a reward failure cannot revert the execution.
        if (success && rewardManager != address(0)) {
            try IRewardManager(rewardManager).distributeReward(
                vault,
                msg.sender,
                0, // baseReward — calculated by RewardManager
                0  // gasUsed — calculated by RewardManager
            ) {
                // Reward distributed successfully
            } catch {
                // Reward distribution failed, but execution succeeded
            }
        }
    }

    /// @inheritdoc IExecutorHub
    function executeAutomationBatch(
        address[] calldata vaults,
        uint256[] calldata automationIds
    ) external onlyExecutor nonReentrant {
        require(vaults.length == automationIds.length, "Length mismatch");

        Executor storage executor = executors[msg.sender];

        for (uint256 i = 0; i < vaults.length; i++) {
            require(vaults[i] != address(0), "Invalid vault");

            executor.totalExecutions++;

            bool success = IUserVault(vaults[i]).triggerAutomation(automationIds[i]);

            if (success) {
                executor.successfulExecutions++;
            } else {
                executor.failedExecutions++;
            }

            emit AutomationExecuted(vaults[i], automationIds[i], msg.sender, success);

            if (success && rewardManager != address(0)) {
                try IRewardManager(rewardManager).distributeReward(
                    vaults[i],
                    msg.sender,
                    0,
                    0
                ) {
                    // Reward distributed successfully
                } catch {
                    // Reward distribution failed, but execution succeeded
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IExecutorHub
    function canExecute(address vault, uint256 automationId)
        external
        view
        returns (bool canExec, string memory reason)
    {
        Task storage task = _tasks[vault][automationId];
        if (!task.active) return (false, "Task not active");

        try IStrategyAdapter(task.strategy).canExecute(task.params)
            returns (bool result, string memory r)
        {
            return (result, r);
        } catch {
            return (false, "Strategy check failed");
        }
    }

    /// @inheritdoc IExecutorHub
    function getTasks() external view returns (Task[] memory) {
        Task[] memory result = new Task[](_taskKeys.length);
        for (uint256 i = 0; i < _taskKeys.length; i++) {
            TaskKey memory key = _taskKeys[i];
            result[i] = _tasks[key.vault][key.automationId];
        }
        return result;
    }

    /// @inheritdoc IExecutorHub
    function getTasksByVault(address vault) external view returns (Task[] memory) {
        // First pass: count tasks for this vault
        uint256 count;
        for (uint256 i = 0; i < _taskKeys.length; i++) {
            if (_taskKeys[i].vault == vault) {
                count++;
            }
        }

        // Second pass: collect tasks
        Task[] memory result = new Task[](count);
        uint256 idx;
        for (uint256 i = 0; i < _taskKeys.length; i++) {
            if (_taskKeys[i].vault == vault) {
                result[idx++] = _tasks[_taskKeys[i].vault][_taskKeys[i].automationId];
            }
        }
        return result;
    }

    /// @inheritdoc IExecutorHub
    /// @dev Gas-heavy — intended for off-chain use by executor bots
    function getExecutableTasks() external view returns (Task[] memory) {
        // First pass: count executable tasks
        uint256 count;
        for (uint256 i = 0; i < _taskKeys.length; i++) {
            TaskKey memory key = _taskKeys[i];
            Task storage task = _tasks[key.vault][key.automationId];

            bool execReady;
            try IStrategyAdapter(task.strategy).canExecute(task.params)
                returns (bool canExecResult, string memory)
            {
                execReady = canExecResult;
            } catch {
                execReady = false;
            }

            if (execReady) {
                count++;
            }
        }

        // Second pass: collect executable tasks
        Task[] memory tasks = new Task[](count);
        uint256 idx;
        for (uint256 i = 0; i < _taskKeys.length; i++) {
            TaskKey memory key = _taskKeys[i];
            Task storage task = _tasks[key.vault][key.automationId];

            bool execReady;
            try IStrategyAdapter(task.strategy).canExecute(task.params)
                returns (bool canExecResult, string memory)
            {
                execReady = canExecResult;
            } catch {
                execReady = false;
            }

            if (execReady) {
                tasks[idx++] = task;
            }
        }
        return tasks;
    }

    /// @inheritdoc IExecutorHub
    function isExecutor(address account) external view returns (bool) {
        return executors[account].isActive;
    }

    /// @inheritdoc IExecutorHub
    function getExecutor(address account) external view returns (Executor memory) {
        return executors[account];
    }

    /// @inheritdoc IExecutorHub
    function getTaskCount() external view returns (uint256) {
        return _taskKeys.length;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setRewardManager(address _rewardManager) external onlyOwner {
        require(_rewardManager != address(0), "Invalid manager");
        rewardManager = _rewardManager;
    }

    /// @notice Get all executor addresses (kept for backward compatibility)
    function getAllExecutors() external view returns (address[] memory) {
        return executorList;
    }
}
