// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IMetaYieldVault
 * @notice View interface used by MetaYieldVaultKeeperAdapter to inspect vault state
 *         before deciding whether to trigger harvest() or rebalance().
 */
interface IMetaYieldVault {

    // ============ Autonomous Operations ============

    /// @notice Harvest CAKE from farm, swap → USDT, compound. Permissionless.
    function harvest() external;

    /// @notice Re-align allocation when drift > rebalanceDriftBps. Permissionless.
    function rebalance() external;

    // ============ Strategy Config Views ============

    /// @notice Basis points allocated to AsterDEX Earn (asUSDF).
    function earnBps() external view returns (uint256);

    /// @notice Basis points allocated to PancakeSwap LP + Farm.
    function lpBps() external view returns (uint256);

    /// @notice Basis points kept as liquid USDT buffer.
    function bufferBps() external view returns (uint256);

    /// @notice Drift threshold (bps) before rebalance is allowed.
    function rebalanceDriftBps() external view returns (uint256);

    /// @notice Minimum CAKE (wei) before harvest is triggered.
    function minHarvestCake() external view returns (uint256);

    // ============ NAV Views ============

    /// @notice Total assets under management in USDT (18 decimals).
    function totalAssets() external view returns (uint256);

    /// @notice NAV per share in USDT × 1e18.
    function sharePrice() external view returns (uint256);

    /// @notice Current allocation split in basis points.
    function currentAllocation()
        external view
        returns (uint256 earnAlloc, uint256 lpAlloc, uint256 bufferAlloc);

    // ============ Yield Data Views ============

    /// @notice CAKE rewards pending in MasterChef farm for this vault.
    function pendingCake() external view returns (uint256);

    /// @notice Live asUSDF exchange rate from ASUSDF_MINTER (USDF per 1e18 asUSDF).
    function asUsdfExchangeRate() external view returns (uint256);

    // ============ Dynamic Allocation Views (A) ============

    /// @notice Whether dynamic APR-based allocation adjustment is enabled.
    function dynamicAlloc() external view returns (bool);

    /// @notice Last computed annualised earn APR in basis points.
    function earnAprBps() external view returns (uint256);

    /// @notice Last computed annualised LP farm APR in basis points.
    function lpAprBps() external view returns (uint256);

    /// @notice Minimum earnBps allowed when dynamic allocation is enabled.
    function minEarnBps() external view returns (uint256);

    /// @notice Maximum earnBps allowed when dynamic allocation is enabled.
    function maxEarnBps() external view returns (uint256);

    // ============ Autonomous Trigger Views (Upgrade 3 + 5) ============

    /**
     * @notice On-chain gas-profitability check for harvest.
     * @return true when pending CAKE value exceeds estimated gas cost × safety factor.
     * @dev Used by MetaYieldVaultKeeperAdapter.canExecute() to skip unprofitable harvests.
     */
    function shouldHarvest() external view returns (bool);

    /**
     * @notice Current operating regime of the vault.
     * @return 0 = NORMAL, 1 = DEFENSIVE (high volatility), 2 = AGGRESSIVE (low vol + LP leads)
     */
    function currentRegime() external view returns (uint8);
}
