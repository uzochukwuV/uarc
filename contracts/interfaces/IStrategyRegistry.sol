// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IStrategyRegistry
 * @notice Protocol-level registry of audited strategy adapters.
 *
 * @dev This is the security perimeter for UserVaults.
 *      Only strategies registered here can be executed from any vault.
 *      When a new strategy is registered (after audit), ALL vaults gain access.
 *
 *      Extends IActionRegistry with:
 *      - isStrategyActive(address): non-reverting active check
 *      - isRequired(address): whether a strategy is required in batch execution
 *      - getStrategyOutputTokens(address): tokens a strategy may produce
 */
interface IStrategyRegistry {

    struct StrategyInfo {
        address adapter;
        bool isActive;
        uint256 gasLimit;
        bool requiresTokens;   // Whether this strategy needs ERC20 input
        bool requiredInBatch;  // If true, failure in batch reverts entire batch
        bool automationOnly;   // If true, only triggerable via ExecutorHub (not execute())
        address[] outputTokens; // Tokens the strategy may return to vault
    }

    // ── Registry Management (Governance) ──

    /// @notice Register a new strategy adapter after audit
    function registerStrategy(
        address adapter,
        uint256 gasLimit,
        bool requiresTokens,
        bool requiredInBatch,
        bool automationOnly,
        address[] calldata outputTokens
    ) external;

    /// @notice Deactivate a strategy (emergency or sunset)
    function deactivateStrategy(address adapter) external;

    /// @notice Reactivate a strategy
    function activateStrategy(address adapter) external;

    // ── View Functions ──

    /// @notice Non-reverting check: is a strategy registered AND active?
    function isStrategyActive(address adapter) external view returns (bool);

    /// @notice Get full strategy info
    function getStrategyInfo(address adapter) external view returns (StrategyInfo memory);

    /// @notice Get the output tokens a strategy may produce
    /// @dev Used by vault to discover yield tokens that land after execution
    function getStrategyOutputTokens(address adapter) external view returns (address[] memory);

    /// @notice Is this strategy required (batch failure causes revert)?
    function isRequired(address adapter) external view returns (bool);

    /// @notice Is this strategy automation-only (not executable via execute())?
    function isAutomation(address adapter) external view returns (bool);

}