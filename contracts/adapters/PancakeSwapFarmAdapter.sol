// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IActionAdapter.sol";

/**
 * @title IMasterChefV2
 * @notice PancakeSwap MasterChefV2 interface for LP staking and CAKE rewards
 */
interface IMasterChefV2 {
    /// @notice Info of each user in a pool
    struct UserInfo {
        uint256 amount;           // LP tokens provided
        uint256 rewardDebt;       // Reward debt
        uint256 boostMultiplier;  // Boost multiplier for veCAKE holders
    }

    /// @notice Info of each pool
    struct PoolInfo {
        uint256 accCakePerShare;      // Accumulated CAKE per share
        uint256 lastRewardBlock;       // Last block rewards were distributed
        uint256 allocPoint;            // Allocation points for this pool
        uint256 totalBoostedShare;     // Total boosted shares
        bool isRegular;                // Is this a regular farm pool
    }

    /// @notice Deposit LP tokens for CAKE rewards
    function deposit(uint256 _pid, uint256 _amount) external;

    /// @notice Withdraw LP tokens and claim CAKE rewards
    function withdraw(uint256 _pid, uint256 _amount) external;

    /// @notice View pending CAKE rewards
    function pendingCake(uint256 _pid, address _user) external view returns (uint256);

    /// @notice Get user info for a pool
    function userInfo(uint256 _pid, address _user) external view returns (uint256 amount, uint256 rewardDebt, uint256 boostMultiplier);

    /// @notice Get pool info
    function poolInfo(uint256 _pid) external view returns (
        uint256 accCakePerShare,
        uint256 lastRewardBlock,
        uint256 allocPoint,
        uint256 totalBoostedShare,
        bool isRegular
    );

    /// @notice Get LP token address for a pool
    function lpToken(uint256 _pid) external view returns (address);

    /// @notice Get total number of pools
    function poolLength() external view returns (uint256);

    /// @notice Emergency withdraw without caring about rewards
    function emergencyWithdraw(uint256 _pid) external;

    /// @notice CAKE token address
    function CAKE() external view returns (address);
}

/**
 * @title PancakeSwapFarmAdapter
 * @notice Manages LP staking on PancakeSwap MasterChefV2 for CAKE rewards
 * @dev Implements deposit, withdraw, and harvest operations for yield farming
 *
 * Use Cases:
 * - "Stake LP tokens when I receive them from liquidity provision"
 * - "Auto-harvest CAKE rewards every 6 hours"
 * - "Compound: harvest CAKE → swap to LP tokens → restake"
 * - "Withdraw staked LP when price drops (stop-loss)"
 *
 * Features:
 * - Stake LP tokens to earn CAKE
 * - Harvest CAKE rewards
 * - Withdraw staked LP tokens
 * - Emergency withdraw (forfeit rewards)
 * - Condition-based execution (min rewards, time interval)
 *
 * Supported Actions:
 * - DEPOSIT: Stake LP tokens into farm
 * - WITHDRAW: Unstake LP tokens and claim CAKE
 * - HARVEST: Claim pending CAKE without withdrawing LP
 * - EMERGENCY_WITHDRAW: Withdraw LP without claiming rewards
 *
 * Security:
 * - Validates pool IDs exist
 * - Minimum reward threshold for harvesting (gas efficiency)
 * - SafeERC20 for all token interactions
 * - Immutable MasterChef address
 */
contract PancakeSwapFarmAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice PancakeSwap MasterChefV2 on BNB Chain
    address public immutable masterChef;

    /// @notice CAKE token on BNB Chain
    address public immutable cakeToken;

    /// @notice Minimum harvest interval (1 hour)
    uint256 public constant MIN_HARVEST_INTERVAL = 1 hours;

    // ============ Enums ============

    enum ActionType {
        DEPOSIT,            // Stake LP tokens
        WITHDRAW,           // Unstake LP + claim CAKE
        HARVEST,            // Claim CAKE only
        EMERGENCY_WITHDRAW  // Emergency unstake (no CAKE)
    }

    // ============ Structs ============

    /**
     * @notice Parameters for farming operations
     */
    struct FarmParams {
        ActionType actionType;      // Type of farming operation
        uint256 poolId;             // MasterChef pool ID
        uint256 amount;             // LP tokens to deposit/withdraw
        uint256 minReward;          // Minimum CAKE reward for HARVEST (gas efficiency)
        uint256 harvestInterval;    // Time between harvests (for condition checking)
        uint256 lastHarvestTime;    // Last harvest timestamp (for condition checking)
        address recipient;          // Recipient of CAKE rewards and/or LP tokens
    }

    /**
     * @notice Result of farming operation
     */
    struct FarmResult {
        uint256 lpAmount;           // LP tokens deposited/withdrawn
        uint256 cakeReward;         // CAKE tokens claimed
    }

    // ============ Events ============

    event Deposited(
        uint256 indexed poolId,
        uint256 amount,
        address indexed recipient
    );

    event Withdrawn(
        uint256 indexed poolId,
        uint256 amount,
        uint256 cakeReward,
        address indexed recipient
    );

    event Harvested(
        uint256 indexed poolId,
        uint256 cakeReward,
        address indexed recipient
    );

    event EmergencyWithdrawn(
        uint256 indexed poolId,
        uint256 amount,
        address indexed recipient
    );

    // ============ Constructor ============

    /**
     * @notice Initialize adapter with MasterChefV2 address
     * @param _masterChef PancakeSwap MasterChefV2 address
     */
    constructor(address _masterChef) {
        require(_masterChef != address(0), "Invalid masterChef");
        masterChef = _masterChef;
        cakeToken = IMasterChefV2(_masterChef).CAKE();
    }

    // ============ Core Functions ============

    /// @inheritdoc IActionAdapter
    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        FarmParams memory p = abi.decode(params, (FarmParams));

        // Validate parameters
        _validateParams(p);

        FarmResult memory res;

        if (p.actionType == ActionType.DEPOSIT) {
            res = _deposit(vault, p);
        } else if (p.actionType == ActionType.WITHDRAW) {
            res = _withdraw(vault, p);
        } else if (p.actionType == ActionType.HARVEST) {
            res = _harvest(p);
        } else if (p.actionType == ActionType.EMERGENCY_WITHDRAW) {
            res = _emergencyWithdraw(vault, p);
        } else {
            revert("Invalid action type");
        }

        return (true, abi.encode(res));
    }

    /// @inheritdoc IActionAdapter
    function canExecute(bytes calldata params)
        external
        view
        override
        returns (bool executable, string memory reason)
    {
        FarmParams memory p = abi.decode(params, (FarmParams));

        // Check 1: Valid action type
        if (uint8(p.actionType) > 3) {
            return (false, "Invalid action type");
        }

        // Check 2: Valid pool ID
        uint256 poolLength = IMasterChefV2(masterChef).poolLength();
        if (p.poolId >= poolLength) {
            return (false, "Invalid pool ID");
        }

        // Check 3: Valid recipient
        if (p.recipient == address(0)) {
            return (false, "Invalid recipient");
        }

        // Check 4: For DEPOSIT, amount must be > 0
        if (p.actionType == ActionType.DEPOSIT && p.amount == 0) {
            return (false, "Deposit amount is zero");
        }

        // Check 5: For HARVEST, check pending rewards and interval
        if (p.actionType == ActionType.HARVEST) {
            // Check harvest interval
            if (p.harvestInterval > 0 && p.lastHarvestTime > 0) {
                if (block.timestamp < p.lastHarvestTime + p.harvestInterval) {
                    return (false, "Harvest interval not reached");
                }
            }

            // Check minimum rewards
            uint256 pending = IMasterChefV2(masterChef).pendingCake(p.poolId, p.recipient);
            if (pending < p.minReward) {
                return (false, "Pending rewards below minimum");
            }
        }

        // Check 6: For WITHDRAW, check user has staked amount
        if (p.actionType == ActionType.WITHDRAW && p.amount > 0) {
            (uint256 stakedAmount,,) = IMasterChefV2(masterChef).userInfo(p.poolId, p.recipient);
            if (stakedAmount < p.amount) {
                return (false, "Insufficient staked amount");
            }
        }

        return (true, "Ready to execute farming operation");
    }

    /// @inheritdoc IActionAdapter
    function getTokenRequirements(bytes calldata params)
        external
        view
        override
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        FarmParams memory p = abi.decode(params, (FarmParams));

        if (p.actionType == ActionType.DEPOSIT) {
            // Need LP tokens for deposit
            address lpToken = IMasterChefV2(masterChef).lpToken(p.poolId);
            tokens = new address[](1);
            amounts = new uint256[](1);
            tokens[0] = lpToken;
            amounts[0] = p.amount;
        } else {
            // WITHDRAW, HARVEST, EMERGENCY_WITHDRAW don't need tokens from vault
            tokens = new address[](0);
            amounts = new uint256[](0);
        }

        return (tokens, amounts);
    }

    /// @inheritdoc IActionAdapter
    function name() external pure override returns (string memory) {
        return "PancakeSwapFarmAdapter";
    }

    /// @inheritdoc IActionAdapter
    function isProtocolSupported(address protocol) external view override returns (bool) {
        return protocol == masterChef;
    }

    /// @inheritdoc IActionAdapter
    function validateParams(bytes calldata params)
        external
        view
        override
        returns (bool isValid, string memory errorMessage)
    {
        try this.decodeParams(params) returns (FarmParams memory p) {
            // Validate action type
            if (uint8(p.actionType) > 3) {
                return (false, "Invalid action type");
            }

            // Validate pool ID
            uint256 poolLength = IMasterChefV2(masterChef).poolLength();
            if (p.poolId >= poolLength) {
                return (false, "Pool ID does not exist");
            }

            // Validate recipient
            if (p.recipient == address(0)) {
                return (false, "Invalid recipient address");
            }

            // Validate amount for DEPOSIT
            if (p.actionType == ActionType.DEPOSIT && p.amount == 0) {
                return (false, "Deposit amount must be > 0");
            }

            // Validate harvest interval
            if (p.actionType == ActionType.HARVEST && p.harvestInterval > 0) {
                if (p.harvestInterval < MIN_HARVEST_INTERVAL) {
                    return (false, "Harvest interval too short (min 1 hour)");
                }
            }

            return (true, "");
        } catch Error(string memory reason) {
            return (false, string(abi.encodePacked("Decoding failed: ", reason)));
        } catch {
            return (false, "Decoding failed: Invalid parameter encoding");
        }
    }

    /**
     * @notice Helper to decode params safely
     */
    function decodeParams(bytes calldata params)
        external
        pure
        returns (FarmParams memory)
    {
        return abi.decode(params, (FarmParams));
    }

    // ============ Internal Functions ============

    function _validateParams(FarmParams memory p) internal view {
        require(p.recipient != address(0), "Invalid recipient");

        uint256 poolLength = IMasterChefV2(masterChef).poolLength();
        require(p.poolId < poolLength, "Invalid pool ID");
    }

    /**
     * @notice Deposit LP tokens into farm
     */
    function _deposit(address /* vault */, FarmParams memory p)
        internal
        returns (FarmResult memory result)
    {
        require(p.amount > 0, "Amount must be > 0");

        address lpToken = IMasterChefV2(masterChef).lpToken(p.poolId);

        // Approve MasterChef to spend LP tokens
        IERC20(lpToken).forceApprove(masterChef, p.amount);

        // Record CAKE balance before (in case deposit triggers pending rewards)
        uint256 cakeBefore = IERC20(cakeToken).balanceOf(address(this));

        // Deposit LP tokens
        IMasterChefV2(masterChef).deposit(p.poolId, p.amount);

        // Check for any CAKE rewards triggered by deposit
        uint256 cakeAfter = IERC20(cakeToken).balanceOf(address(this));
        result.cakeReward = cakeAfter - cakeBefore;

        // Transfer any received CAKE to recipient
        if (result.cakeReward > 0) {
            IERC20(cakeToken).safeTransfer(p.recipient, result.cakeReward);
        }

        result.lpAmount = p.amount;

        emit Deposited(p.poolId, p.amount, p.recipient);
    }

    /**
     * @notice Withdraw LP tokens and claim CAKE
     */
    function _withdraw(address /* vault */, FarmParams memory p)
        internal
        returns (FarmResult memory result)
    {
        address lpToken = IMasterChefV2(masterChef).lpToken(p.poolId);

        // Get CAKE balance before
        uint256 cakeBefore = IERC20(cakeToken).balanceOf(address(this));
        uint256 lpBefore = IERC20(lpToken).balanceOf(address(this));

        // Withdraw LP tokens (also claims pending CAKE)
        IMasterChefV2(masterChef).withdraw(p.poolId, p.amount);

        // Calculate received amounts
        uint256 cakeAfter = IERC20(cakeToken).balanceOf(address(this));
        uint256 lpAfter = IERC20(lpToken).balanceOf(address(this));

        result.cakeReward = cakeAfter - cakeBefore;
        result.lpAmount = lpAfter - lpBefore;

        // Transfer CAKE to recipient
        if (result.cakeReward > 0) {
            IERC20(cakeToken).safeTransfer(p.recipient, result.cakeReward);
        }

        // Transfer LP tokens to recipient
        if (result.lpAmount > 0) {
            IERC20(lpToken).safeTransfer(p.recipient, result.lpAmount);
        }

        emit Withdrawn(p.poolId, result.lpAmount, result.cakeReward, p.recipient);
    }

    /**
     * @notice Harvest CAKE rewards without withdrawing LP
     */
    function _harvest(FarmParams memory p)
        internal
        returns (FarmResult memory result)
    {
        // Check harvest conditions
        if (p.harvestInterval > 0 && p.lastHarvestTime > 0) {
            require(
                block.timestamp >= p.lastHarvestTime + p.harvestInterval,
                "Harvest interval not reached"
            );
        }

        // Check minimum rewards
        uint256 pending = IMasterChefV2(masterChef).pendingCake(p.poolId, p.recipient);
        require(pending >= p.minReward, "Pending rewards below minimum");

        // Get CAKE balance before
        uint256 cakeBefore = IERC20(cakeToken).balanceOf(address(this));

        // Withdraw 0 to claim pending CAKE without unstaking LP
        IMasterChefV2(masterChef).withdraw(p.poolId, 0);

        // Calculate received CAKE
        uint256 cakeAfter = IERC20(cakeToken).balanceOf(address(this));
        result.cakeReward = cakeAfter - cakeBefore;

        // Transfer CAKE to recipient
        if (result.cakeReward > 0) {
            IERC20(cakeToken).safeTransfer(p.recipient, result.cakeReward);
        }

        emit Harvested(p.poolId, result.cakeReward, p.recipient);
    }

    /**
     * @notice Emergency withdraw LP without claiming rewards
     */
    function _emergencyWithdraw(address /* vault */, FarmParams memory p)
        internal
        returns (FarmResult memory result)
    {
        address lpToken = IMasterChefV2(masterChef).lpToken(p.poolId);

        // Get LP balance before
        uint256 lpBefore = IERC20(lpToken).balanceOf(address(this));

        // Emergency withdraw
        IMasterChefV2(masterChef).emergencyWithdraw(p.poolId);

        // Calculate received LP
        uint256 lpAfter = IERC20(lpToken).balanceOf(address(this));
        result.lpAmount = lpAfter - lpBefore;

        // Transfer LP tokens to recipient
        if (result.lpAmount > 0) {
            IERC20(lpToken).safeTransfer(p.recipient, result.lpAmount);
        }

        emit EmergencyWithdrawn(p.poolId, result.lpAmount, p.recipient);
    }

    // ============ View Functions ============

    /**
     * @notice Get pending CAKE rewards for a user in a pool
     * @param poolId MasterChef pool ID
     * @param user User address
     * @return pending Pending CAKE rewards
     */
    function getPendingRewards(uint256 poolId, address user)
        external
        view
        returns (uint256 pending)
    {
        return IMasterChefV2(masterChef).pendingCake(poolId, user);
    }

    /**
     * @notice Get user's staked LP amount in a pool
     * @param poolId MasterChef pool ID
     * @param user User address
     * @return stakedAmount Staked LP tokens
     */
    function getStakedAmount(uint256 poolId, address user)
        external
        view
        returns (uint256 stakedAmount)
    {
        (stakedAmount,,) = IMasterChefV2(masterChef).userInfo(poolId, user);
    }

    /**
     * @notice Get LP token address for a pool
     * @param poolId MasterChef pool ID
     * @return lpToken LP token address
     */
    function getPoolLPToken(uint256 poolId)
        external
        view
        returns (address lpToken)
    {
        return IMasterChefV2(masterChef).lpToken(poolId);
    }

    /**
     * @notice Get pool info
     * @param poolId MasterChef pool ID
     * @return allocPoint Pool's share of total rewards
     * @return isRegular Is regular farm pool (not special)
     */
    function getPoolInfo(uint256 poolId)
        external
        view
        returns (uint256 allocPoint, bool isRegular)
    {
        (,, allocPoint,, isRegular) = IMasterChefV2(masterChef).poolInfo(poolId);
    }

    /**
     * @notice Check if harvesting is profitable (rewards > estimated gas cost)
     * @param poolId MasterChef pool ID
     * @param user User address
     * @param gasPriceGwei Current gas price in gwei
     * @param cakePriceUsd CAKE price in USD (18 decimals)
     * @return profitable True if rewards cover gas cost
     * @return pendingRewards Pending CAKE amount
     * @return estimatedGasCostUsd Estimated gas cost in USD (18 decimals)
     */
    function isHarvestProfitable(
        uint256 poolId,
        address user,
        uint256 gasPriceGwei,
        uint256 cakePriceUsd
    ) external view returns (bool profitable, uint256 pendingRewards, uint256 estimatedGasCostUsd) {
        pendingRewards = IMasterChefV2(masterChef).pendingCake(poolId, user);

        // Estimate gas for harvest: ~100k gas
        uint256 estimatedGas = 100000;
        // BNB price assumed ~$300 (can be parameterized)
        uint256 bnbPriceUsd = 300 * 1e18;

        // Gas cost in BNB = gas × gasPrice (in gwei) / 1e9
        // Gas cost in USD = gas cost in BNB × BNB price
        estimatedGasCostUsd = (estimatedGas * gasPriceGwei * bnbPriceUsd) / 1e9;

        // Reward value in USD
        uint256 rewardValueUsd = (pendingRewards * cakePriceUsd) / 1e18;

        // Profitable if rewards > 2x gas cost (safety margin)
        profitable = rewardValueUsd > (estimatedGasCostUsd * 2);
    }

    /**
     * @notice Get total number of pools
     * @return length Number of pools in MasterChef
     */
    function getPoolCount() external view returns (uint256 length) {
        return IMasterChefV2(masterChef).poolLength();
    }
}
