// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IRewardManager.sol";
import "../interfaces/IExecutorHub.sol";
import "../interfaces/IUserVault.sol";

/**
 * @title RewardManager
 * @notice Calculates and distributes rewards to executors.
 *
 * @dev V3: Works with UserVault instead of TaskVault.
 *      Executors are paid from vault's native ETH balance.
 *      The vault transfers ETH to the executor via its transferNative() function.
 *
 *      Reward flow:
 *      1. ExecutorHub.executeAutomation() triggers vault
 *      2. ExecutorHub calls RewardManager.distributeReward()
 *      3. RewardManager calls vault.transferNative() to pay executor
 *
 *      Note: vault.transferNative() is owner-only. We need a separate function
 *      for the vault to release rewards. This will be added to UserVault
 *      as releaseReward().
 */
contract RewardManager is IRewardManager, Ownable, ReentrancyGuard {

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    address public executorHub;

    uint256 public platformFeePercentage = 100; // 1% (basis points)
    uint256 public constant MAX_PLATFORM_FEE = 500;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant BASE_REPUTATION_SCORE = 5000;
    uint256 public constant MAX_REPUTATION_MULTIPLIER = 12500;

    uint256 public totalFeesCollected;
    uint256 public gasReimbursementMultiplier = 120;
    uint256 public maxGasReimbursement = 0.002 ether;

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyExecutorHub() {
        if (msg.sender != executorHub) revert OnlyExecutorHub();
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core Functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Distribute reward to executor for triggering an automation
    /// @dev Called by ExecutorHub after successful automation execution.
    ///      The vault must have a releaseReward() function that only ExecutorHub
    ///      (or RewardManager) can call.
    function distributeReward(
        address vault,
        address executor,
        uint256 baseReward,
        uint256 gasUsed
    ) external onlyExecutorHub nonReentrant returns (uint256 totalPaid) {
        RewardCalculation memory calc = this.calculateReward(baseReward, executor, gasUsed);

        // Check vault has sufficient ETH
        uint256 available = address(vault).balance;
        if (available < calc.totalFromVault) revert InsufficientVaultBalance();

        // Pay executor directly from vault's ETH balance
        // UserVault.releaseReward() is callable only by this contract
        IUserVault(vault).releaseReward(executor, calc.executorReward + calc.gasReimbursement);

        // Collect platform fee
        if (calc.platformFee > 0) {
            IUserVault(vault).releaseReward(address(this), calc.platformFee);
            totalFeesCollected += calc.platformFee;
        }

        emit RewardDistributed(0, executor, calc.executorReward, calc.platformFee, calc.gasReimbursement);

        return calc.totalFromVault;
    }

    /// @inheritdoc IRewardManager
    function calculateReward(
        uint256 baseReward,
        address executor,
        uint256 gasUsed
    ) external view returns (RewardCalculation memory) {
        uint256 multiplier = getReputationMultiplier(executor);
        uint256 executorReward = (baseReward * multiplier) / BASIS_POINTS;
        uint256 platformFee = (baseReward * platformFeePercentage) / BASIS_POINTS;
        uint256 gasReimbursement = (gasUsed * tx.gasprice * gasReimbursementMultiplier) / 100;
        if (gasReimbursement > maxGasReimbursement) {
            gasReimbursement = maxGasReimbursement;
        }

        uint256 totalFromVault = executorReward + platformFee + gasReimbursement;

        return RewardCalculation({
            executorReward: executorReward,
            platformFee: platformFee,
            gasReimbursement: gasReimbursement,
            totalFromVault: totalFromVault
        });
    }

    /// @inheritdoc IRewardManager
    function collectFees(address recipient) external onlyOwner nonReentrant returns (uint256 amount) {
        require(recipient != address(0), "Invalid recipient");
        amount = totalFeesCollected;
        totalFeesCollected = 0;

        (bool success,) = recipient.call{value: amount}("");
        require(success, "Transfer failed");

        emit PlatformFeeCollected(recipient, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setPlatformFee(uint256 feePercentage) external onlyOwner {
        if (feePercentage > MAX_PLATFORM_FEE) revert InvalidFeePercentage();
        uint256 oldFee = platformFeePercentage;
        platformFeePercentage = feePercentage;
        emit PlatformFeeUpdated(oldFee, feePercentage);
    }

    function setExecutorHub(address _executorHub) external onlyOwner {
        require(_executorHub != address(0), "Invalid hub");
        executorHub = _executorHub;
    }

    function setGasReimbursementMultiplier(uint256 _multiplier) external onlyOwner {
        require(_multiplier <= 200, "Invalid multiplier");
        gasReimbursementMultiplier = _multiplier;
    }

    function setMaxGasReimbursement(uint256 _maxGasReimbursement) external onlyOwner {
        maxGasReimbursement = _maxGasReimbursement;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IRewardManager
    function getReputationMultiplier(address) public pure returns (uint256) {
        // Reputation multipliers are disabled in the simplified ExecutorHub V4.
        // All active executors receive the base multiplier.
        return BASIS_POINTS;
    }

    /// @inheritdoc IRewardManager
    function getMaxRewardCost(uint256 baseReward) external view returns (uint256) {
        uint256 maxExecutorReward = (baseReward * MAX_REPUTATION_MULTIPLIER) / BASIS_POINTS;
        uint256 platformFee = (baseReward * platformFeePercentage) / BASIS_POINTS;
        uint256 gasReserve = gasReimbursementMultiplier == 0 ? 0 : maxGasReimbursement;
        return maxExecutorReward + platformFee + gasReserve;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Receive
    // ─────────────────────────────────────────────────────────────────────────

    receive() external payable {}
}