// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@fhenixprotocol/contracts/experimental/token/FHERC20/IFHERC20.sol";
import "@fhenixprotocol/contracts/FHE.sol";

import "../../contracts/interfaces/ITaskCore.sol";
import "../../contracts/interfaces/ITaskVault.sol";

/**
 * @title ConfidentialTaskVault
 * @notice Handles FHERC20 token holdings and public reward logic securely.
 *         Maintains compatibility with TaskLogicV2 while tracking encrypted balances.
 */
contract ConfidentialTaskVault is ITaskVault, Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    address public override taskCore;
    address public override creator;
    address public rewardManager;
    address public factory;
    address public taskLogic;

    uint256 private nativeBalance;
    uint256 private nativeReserved;

    // Standard Token Tracking (for ITaskVault compliance)
    mapping(address => uint256) private tokenBalances;
    address[] private trackedTokens;
    mapping(address => bool) private isTracked;

    // FHERC20 Encrypted Token Tracking
    mapping(address => euint128) private encryptedTokenBalances;
    address[] private trackedFHERC20Tokens;
    mapping(address => bool) private isFHERC20Tracked;

    // Active adapter during execution to ensure only approved adapters can transfer FHERC20
    address private activeAdapter;
    bool private isConfidentialExecution;

    // ============ Errors & Events ============

    error Unauthorized();

    event FHERC20Deposited(address indexed token);
    event ConfidentialActionExecuted(address indexed token, address indexed adapter, bool success);

    // ============ Modifiers ============

    modifier onlyCreator() {
        if (msg.sender != creator) revert Unauthorized();
        _;
    }

    modifier onlyTaskLogic() {
        if (msg.sender != taskLogic && msg.sender != rewardManager) revert Unauthorized();
        _;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert Unauthorized();
        _;
    }

    modifier onlyFinished() {
        ITaskCore.TaskStatus status = ITaskCore(taskCore).getMetadata().status;
        if (status != ITaskCore.TaskStatus.CANCELLED && status != ITaskCore.TaskStatus.COMPLETED) {
            revert TaskNotFinished();
        }
        _;
    }

    // ============ Initialization ============

    function initialize(
        address _taskCore,
        address _creator,
        address _rewardManager
    ) external override initializer {
        require(_taskCore != address(0), "Invalid task core");
        require(_creator != address(0), "Invalid creator");
        
        taskCore = _taskCore;
        creator = _creator;
        rewardManager = _rewardManager;
        factory = msg.sender;
        taskLogic = ITaskCore(_taskCore).logic();
    }

    receive() external payable {
        nativeBalance += msg.value;
        emit NativeDeposited(msg.sender, msg.value);
    }

    // ============ Deposit Functions ============

    function depositNative() external payable override {
        nativeBalance += msg.value;
        emit NativeDeposited(msg.sender, msg.value);
    }

    function depositToken(address token, uint256 amount) external override nonReentrant {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Zero amount");

        if (!isTracked[token]) {
            trackedTokens.push(token);
            isTracked[token] = true;
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalances[token] += amount;
        
        emit TokenDeposited(token, msg.sender, amount);
    }

    /// @notice securely track an FHERC20 deposit sent via the Factory
    function trackFHERC20Deposit(address token, euint128 amount) external onlyFactory {
        require(token != address(0), "Invalid FHERC20 token");
        
        if (!isFHERC20Tracked[token]) {
            require(trackedFHERC20Tokens.length < 5, "Max FHERC20 limit reached"); // Prevent Gas DoS
            trackedFHERC20Tokens.push(token);
            isFHERC20Tracked[token] = true;
        }

        if (FHE.isInitialized(encryptedTokenBalances[token])) {
            encryptedTokenBalances[token] = FHE.add(encryptedTokenBalances[token], amount);
        } else {
            encryptedTokenBalances[token] = amount;
        }

        emit FHERC20Deposited(token);
    }

    /// @notice allows a creator to deposit FHERC20 tokens securely after creation
    function depositFHERC20(address token, inEuint128 calldata amount) external onlyCreator nonReentrant {
        require(token != address(0), "Invalid token");
        
        if (!isFHERC20Tracked[token]) {
            require(trackedFHERC20Tokens.length < 5, "Max FHERC20 limit reached"); // Prevent Gas DoS
            trackedFHERC20Tokens.push(token);
            isFHERC20Tracked[token] = true;
        }

        // Securely pull the encrypted payload from the creator using the inEuint interface
        euint128 actualTransferred = IFHERC20(token).transferFromEncrypted(msg.sender, address(this), amount);

        if (FHE.isInitialized(encryptedTokenBalances[token])) {
            encryptedTokenBalances[token] = FHE.add(encryptedTokenBalances[token], actualTransferred);
        } else {
            encryptedTokenBalances[token] = actualTransferred;
        }

        emit FHERC20Deposited(token);
    }

    // ============ Execution Logic ============

    function executeTokenAction(
        address token,
        address adapter,
        uint256 amount,
        bytes calldata actionData
    ) external override onlyTaskLogic nonReentrant returns (bool success, bytes memory result) {
        require(token != address(0), "Invalid token");
        require(adapter != address(0), "Invalid adapter");

        if (isTracked[token] && amount > 0) {
            // Standard ERC20 Logic
            if (tokenBalances[token] < amount) revert InsufficientBalance();
            uint256 balanceBefore = IERC20(token).balanceOf(address(this));
            
            IERC20(token).approve(adapter, amount);
            (bool callSuccess, bytes memory returnData) = adapter.call(actionData);
            
            if (callSuccess && returnData.length > 0) {
                (success, result) = abi.decode(returnData, (bool, bytes));
            } else {
                success = false;
                result = returnData;
            }
            
            IERC20(token).approve(adapter, 0);
            
            uint256 balanceAfter = IERC20(token).balanceOf(address(this));
            uint256 spent = balanceBefore > balanceAfter ? balanceBefore - balanceAfter : 0;
            if (spent > amount) spent = amount;
            tokenBalances[token] -= spent;
            
            emit TokenActionExecuted(token, adapter, spent, success);
            return (success, result);
        } else {
            // Confidential FHERC20 Logic
            activeAdapter = adapter;
            isConfidentialExecution = true;
            
            (bool callSuccess, bytes memory returnData) = adapter.call(actionData);
            
            activeAdapter = address(0);
            isConfidentialExecution = false;

            if (callSuccess && returnData.length > 0) {
                (success, result) = abi.decode(returnData, (bool, bytes));
            } else {
                success = false;
                result = returnData;
            }

            emit ConfidentialActionExecuted(token, adapter, success);
            return (success, result);
        }
    }

    /// @notice Allows the currently active adapter to transfer FHERC20 tokens during execution
    function transferFHERC20(address token, address to, euint128 encryptedAmount) external returns (euint128) {
        require(isConfidentialExecution && msg.sender == activeAdapter, "Only active adapter");
        require(isFHERC20Tracked[token], "Token not tracked");

        // Physically transfer encrypted tokens
        euint128 actualTransferred = IFHERC20(token)._transferEncrypted(to, encryptedAmount);
        
        // Subtract from our tracked internal balance safely
        encryptedTokenBalances[token] = FHE.sub(encryptedTokenBalances[token], actualTransferred);
        
        return actualTransferred;
    }

    // ============ Reward & Withdrawals ============

    function releaseReward(address executor, uint256 amount) external override onlyTaskLogic nonReentrant {
        if (nativeBalance < amount) revert InsufficientBalance();
        
        nativeBalance -= amount;
        nativeReserved += amount;

        (bool success, ) = executor.call{value: amount}("");
        if (!success) revert TransferFailed();

        nativeReserved -= amount;
        emit RewardReleased(executor, amount);
    }

    function withdrawAll() external override onlyCreator onlyFinished nonReentrant returns (uint256 nativeAmount, TokenAmount[] memory tokens) {
        nativeAmount = nativeBalance - nativeReserved;
        
        // Withdraw standard tokens
        uint256 tokenCount = trackedTokens.length;
        tokens = new TokenAmount[](tokenCount);

        for (uint256 i = 0; i < tokenCount; i++) {
            address token = trackedTokens[i];
            uint256 available = tokenBalances[token];

            tokens[i] = TokenAmount({
                token: token,
                amount: available
            });

            if (available > 0) {
                tokenBalances[token] = 0;
                IERC20(token).safeTransfer(creator, available);
            }
        }

        // Withdraw Native tokens
        if (nativeAmount > 0) {
            nativeBalance -= nativeAmount;
            (bool success, ) = creator.call{value: nativeAmount}("");
            if (!success) revert TransferFailed();
        }

        // Withdraw FHERC20 Tokens confidentially
        for (uint256 i = 0; i < trackedFHERC20Tokens.length; i++) {
            address fToken = trackedFHERC20Tokens[i];
            if (FHE.isInitialized(encryptedTokenBalances[fToken])) {
                euint128 bal = encryptedTokenBalances[fToken];
                IFHERC20(fToken)._transferEncrypted(creator, bal);
                encryptedTokenBalances[fToken] = FHE.asEuint128(0);
            }
        }

        emit FundsWithdrawn(creator, nativeAmount, tokens);
    }

    // ============ View Functions ============

    function getNativeBalance() external view override returns (uint256) {
        return nativeBalance;
    }

    function getTokenBalance(address token) external view override returns (uint256) {
        return tokenBalances[token];
    }

    function getAvailableForRewards() external view override returns (uint256) {
        return nativeBalance - nativeReserved;
    }
}
