// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IStrategyRegistry.sol";

/**
 * @title StrategyRegistry
 * @notice Protocol-level registry of audited strategy adapters.
 *
 * @dev This is the security perimeter for UserVaults.
 *      Only strategies registered here can be executed from any vault.
 *      When a new strategy is registered (after audit), ALL vaults gain access.
 *      When a strategy is deactivated, ALL vaults immediately lose access.
 *
 *      Keyed by address (not selector) — the new model addresses strategies
 *      by their contract address, which is cleaner than the old bytes4 selector approach.
 */
contract StrategyRegistry is IStrategyRegistry, Ownable {

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    mapping(address => StrategyInfo) private _strategies;
    address[] private _strategyList;
    mapping(address => bool) private _isRegistered;

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Registry Management (Governance only)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register a new strategy adapter after audit
    function registerStrategy(
        address adapter,
        uint256 gasLimit,
        bool requiresTokens,
        bool requiredInBatch,
        bool automationOnly,
        address[] calldata outputTokens
    ) external onlyOwner {
        if (adapter == address(0)) revert InvalidAdapter();
        require(gasLimit > 0 && gasLimit <= 5000000, "Invalid gas limit");

        StrategyInfo memory info = StrategyInfo({
            adapter: adapter,
            isActive: true,
            gasLimit: gasLimit,
            requiresTokens: requiresTokens,
            requiredInBatch: requiredInBatch,
            automationOnly: automationOnly,
            outputTokens: outputTokens
        });

        _strategies[adapter] = info;

        if (!_isRegistered[adapter]) {
            _strategyList.push(adapter);
            _isRegistered[adapter] = true;
        }

        emit StrategyRegistered(adapter, gasLimit, automationOnly);
    }

    /// @notice Deactivate a strategy (emergency or sunset)
    function deactivateStrategy(address adapter) external onlyOwner {
        _strategies[adapter].isActive = false;
        emit StrategyDeactivated(adapter);
    }

    /// @notice Reactivate a strategy
    function activateStrategy(address adapter) external onlyOwner {
        _strategies[adapter].isActive = true;
        emit StrategyActivated(adapter);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Non-reverting check: is a strategy registered AND active?
    function isStrategyActive(address adapter) external view returns (bool) {
        StrategyInfo storage info = _strategies[adapter];
        return info.adapter != address(0) && info.isActive;
    }

    /// @notice Get full strategy info
    function getStrategyInfo(address adapter) external view returns (StrategyInfo memory) {
        StrategyInfo memory info = _strategies[adapter];
        if (info.adapter == address(0)) revert StrategyNotFound();
        return info;
    }

    /// @notice Get the output tokens a strategy may produce
    function getStrategyOutputTokens(address adapter) external view returns (address[] memory) {
        StrategyInfo storage info = _strategies[adapter];
        if (info.adapter == address(0)) revert StrategyNotFound();
        return info.outputTokens;
    }

    /// @notice Is this strategy required (batch failure causes revert)?
    function isRequired(address adapter) external view returns (bool) {
        StrategyInfo storage info = _strategies[adapter];
        if (info.adapter == address(0)) return false;
        return info.requiredInBatch;
    }

    /// @notice Is this strategy automation-only?
    function isAutomation(address adapter) external view returns (bool) {
        StrategyInfo storage info = _strategies[adapter];
        if (info.adapter == address(0)) return false;
        return info.automationOnly;
    }

    /// @notice Get all registered strategies
    function getAllStrategies() external view returns (address[] memory) {
        return _strategyList;
    }

    /// @notice Get count of registered strategies
    function getStrategyCount() external view returns (uint256) {
        return _strategyList.length;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Events (additional beyond interface)
    // ─────────────────────────────────────────────────────────────────────────

    event StrategyRegistered(address indexed adapter, uint256 gasLimit, bool isAutomation);
    event StrategyDeactivated(address indexed adapter);
    event StrategyActivated(address indexed adapter);

    // ─────────────────────────────────────────────────────────────────────────
    // Errors (additional beyond interface)
    // ─────────────────────────────────────────────────────────────────────────

    error InvalidAdapter();
    error StrategyNotFound();
}