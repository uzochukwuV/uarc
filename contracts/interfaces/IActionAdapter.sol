// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IActionAdapter
 * @notice Standard interface for all action adapters
 */
interface IActionAdapter {

    // ============ Events ============

    event ActionExecuted(
        address indexed vault,
        address indexed protocol,
        bool success,
        bytes result
    );

    // ============ Errors ============

    error OnlyVault();
    error OnlyActionRegistry();
    error ProtocolNotSupported();
    error ExecutionFailed(string reason);
    error InvalidParams(string reason);

    // ============ Functions ============

    /// @notice Execute action (called by TaskVault)
    /// @param vault Address of the task vault
    /// @param params ABI-encoded parameters for the action
    /// @return success Whether the action succeeded
    /// @return result Return data from the action
    function execute(address vault, bytes calldata params)
        external
        returns (bool success, bytes memory result);

    /// @notice Check if action conditions are met and can be executed
    /// @dev Adapters implement their own condition checking logic
    /// @param params ABI-encoded parameters for the action
    /// @return canExecute Whether the action can be executed now
    /// @return reason Human-readable reason (e.g., "Price too high", "Conditions met")
    function canExecute(bytes calldata params)
        external
        view
        returns (bool canExecute, string memory reason);

    /// @notice Get token requirements for executing this action
    /// @dev Allows TaskLogic to know which tokens and amounts are needed without hardcoded param decoding
    /// @param params ABI-encoded parameters for the action
    /// @return tokens Array of token addresses required for execution
    /// @return amounts Array of token amounts required (same length as tokens array)
    function getTokenRequirements(bytes calldata params)
        external
        view
        returns (address[] memory tokens, uint256[] memory amounts);

    /// @notice Check if protocol is supported
    function isProtocolSupported(address protocol) external view returns (bool);

    /// @notice Get adapter name/version
    function name() external view returns (string memory);

    /// @notice Validate parameters before task creation
    /// @dev Called during task creation to catch encoding/format errors early
    /// @param params ABI-encoded parameters to validate
    /// @return isValid Whether the parameters are valid
    /// @return errorMessage Empty if valid, error description if invalid
    function validateParams(bytes calldata params)
        external
        view
        returns (bool isValid, string memory errorMessage);
}
