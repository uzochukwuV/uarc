// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@fhenixprotocol/contracts/experimental/token/FHERC20/IFHERC20.sol";
import "@fhenixprotocol/contracts/FHE.sol";

import "../../contracts/interfaces/ITaskFactory.sol";
import "../../contracts/interfaces/ITaskCore.sol";
import "../../contracts/interfaces/IActionAdapter.sol";
import "../../contracts/interfaces/IActionRegistry.sol";

interface IConfidentialTaskVault {
    function trackFHERC20Deposit(address token, euint128 amount) external;
    function initialize(address _taskCore, address _creator, address _rewardManager) external;
    function depositNative() external payable;
}

/**
 * @title ConfidentialTaskFactory
 * @notice Deploys TaskCore with a ConfidentialTaskVault holding FHERC20 tokens.
 * @dev Reuses public TaskCore but enforces privacy using a robust, tracked FHERC20 vault.
 */
contract ConfidentialTaskFactory is Ownable, ReentrancyGuard {
    using Clones for address;
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    address public immutable taskCoreImplementation;
    address public immutable confidentialVaultImplementation;
    address public immutable taskLogic;
    address public immutable actionRegistry;
    address public immutable rewardManager;
    address public globalRegistry;

    uint256 public minTaskReward = 0.0002 ether;
    uint256 public maxTaskDuration = 365 days;
    uint256 public creationFee = 0;

    uint256 public nextTaskId;

    struct DeployedTask {
        uint256 taskId;
        address taskCore;
        address taskVault;
        address creator;
    }

    mapping(uint256 => DeployedTask) private tasks;

    // ============ Events ============

    event ConfidentialTaskCreated(
        uint256 indexed taskId,
        address indexed creator,
        address taskCore,
        address taskVault,
        uint256 rewardPerExecution,
        uint256 maxExecutions
    );

    // ============ Constructor ============

    constructor(
        address _taskCoreImpl,
        address _vaultImpl,
        address _taskLogic,
        address _actionRegistry,
        address _rewardManager,
        address _owner
    ) Ownable(_owner) {
        require(_taskCoreImpl != address(0), "Invalid core impl");
        require(_vaultImpl != address(0), "Invalid vault impl");
        require(_taskLogic != address(0), "Invalid task logic");
        require(_actionRegistry != address(0), "Invalid registry");
        require(_rewardManager != address(0), "Invalid reward manager");

        taskCoreImplementation = _taskCoreImpl;
        confidentialVaultImplementation = _vaultImpl;
        taskLogic = _taskLogic;
        actionRegistry = _actionRegistry;
        rewardManager = _rewardManager;
    }

    // ============ Core Functions ============

    struct ConfidentialTokenDeposit {
        address token;
        inEuint128 amount;
    }

    function createConfidentialTask(
        ITaskFactory.TaskParams calldata params,
        ITaskFactory.ActionParams[] calldata actions,
        ConfidentialTokenDeposit[] calldata deposits
    ) external payable nonReentrant returns (uint256 taskId, address taskCore, address taskVault) {
        // Validate parameters securely
        _validateTaskParams(params, actions);

        if (creationFee > 0) {
            require(msg.value >= creationFee, "Insufficient creation fee");
        }

        taskId = nextTaskId++;

        // Deploy Clones securely
        taskCore = taskCoreImplementation.clone();
        taskVault = confidentialVaultImplementation.clone();

        uint256 totalReward = params.maxExecutions == 0
            ? params.rewardPerExecution
            : params.rewardPerExecution * params.maxExecutions;

        uint256 providedValue = msg.value - creationFee;
        require(providedValue >= totalReward, "Insufficient reward funding");

        bytes32 actionsHash = keccak256(abi.encode(actions));

        ITaskCore.TaskMetadata memory metadata = ITaskCore.TaskMetadata({
            id: taskId,
            creator: msg.sender,
            createdAt: uint96(block.timestamp),
            expiresAt: params.expiresAt,
            maxExecutions: params.maxExecutions,
            executionCount: 0,
            lastExecutionTime: 0,
            recurringInterval: params.recurringInterval,
            rewardPerExecution: params.rewardPerExecution,
            status: ITaskCore.TaskStatus.ACTIVE,
            actionsHash: actionsHash,
            seedCommitment: params.seedCommitment
        });

        // Initialize core and map actions
        ITaskCore(taskCore).initialize(taskId, msg.sender, taskVault, taskLogic, metadata);

        ITaskCore.Action[] memory coreActions = new ITaskCore.Action[](actions.length);
        for (uint256 i = 0; i < actions.length; i++) {
            coreActions[i] = ITaskCore.Action({
                selector: actions[i].selector,
                protocol: actions[i].protocol,
                params: actions[i].params
            });
        }
        ITaskCore(taskCore).setActions(coreActions);

        // Initialize vault logic
        IConfidentialTaskVault(taskVault).initialize(taskCore, msg.sender, rewardManager);

        if (providedValue > 0) {
            IConfidentialTaskVault(taskVault).depositNative{value: providedValue}();
        }

        // Pull FHERC20 securely from user and map into vault securely via track
        for (uint256 i = 0; i < deposits.length; i++) {
            require(deposits[i].token != address(0), "Invalid token");
            
            // Transfer to factory first securely
            euint128 transferred = IFHERC20(deposits[i].token).transferFromEncrypted(
                msg.sender,
                address(this),
                deposits[i].amount
            );
            
            // Re-route to vault
            IFHERC20(deposits[i].token)._transferEncrypted(taskVault, transferred);
            
            // Register tracking directly on Vault
            IConfidentialTaskVault(taskVault).trackFHERC20Deposit(deposits[i].token, transferred);
        }

        tasks[taskId] = DeployedTask({
            taskId: taskId,
            taskCore: taskCore,
            taskVault: taskVault,
            creator: msg.sender
        });

        emit ConfidentialTaskCreated(
            taskId,
            msg.sender,
            taskCore,
            taskVault,
            metadata.rewardPerExecution,
            metadata.maxExecutions
        );

        if (globalRegistry != address(0)) {
            (bool successReg, ) = globalRegistry.call(
                abi.encodeWithSignature(
                    "registerTask(uint256,address,address,address)",
                    taskId,
                    taskCore,
                    taskVault,
                    msg.sender
                )
            );
            require(successReg, "Registry registration failed");
        }

        return (taskId, taskCore, taskVault);
    }

    // ============ Validation & Security ============

    function _validateTaskParams(ITaskFactory.TaskParams calldata params, ITaskFactory.ActionParams[] calldata actions) internal view {
        if (params.rewardPerExecution < minTaskReward) revert("InvalidReward");

        if (params.expiresAt != 0) {
            if (params.expiresAt <= block.timestamp) revert("InvalidExpiration");
            if (params.expiresAt > block.timestamp + maxTaskDuration) revert("InvalidExpiration");
        }

        if (actions.length == 0 || actions.length > 10) revert("InvalidActions");

        require(actionRegistry != address(0), "ActionRegistry not set");
        for (uint256 i = 0; i < actions.length; i++) {
            IActionRegistry.AdapterInfo memory adapterInfo = IActionRegistry(actionRegistry).getAdapter(actions[i].selector);
            require(adapterInfo.isActive, "Adapter not active");

            (bool isValid, string memory errorMessage) = IActionAdapter(adapterInfo.adapter).validateParams(actions[i].params);
            if (!isValid) revert(string(abi.encodePacked("Action validation failed: ", errorMessage)));
        }
    }

    // ============ View Functions ============

    function getTask(uint256 taskId) external view returns (DeployedTask memory) {
        return tasks[taskId];
    }

    // ============ Admin Settings ============

    function setMinTaskReward(uint256 _minReward) external onlyOwner { minTaskReward = _minReward; }
    function setCreationFee(uint256 _fee) external onlyOwner { creationFee = _fee; }
    function setMaxTaskDuration(uint256 _duration) external onlyOwner { maxTaskDuration = _duration; }
    function setGlobalRegistry(address _globalRegistry) external onlyOwner { globalRegistry = _globalRegistry; }
    
    function withdrawFees(address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        (bool success, ) = recipient.call{value: address(this).balance}("");
        require(success, "Transfer failed");
    }

    receive() external payable {}
}
