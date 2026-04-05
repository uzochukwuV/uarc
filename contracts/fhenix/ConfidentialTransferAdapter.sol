// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhenixprotocol/contracts/FHE.sol";
import "@fhenixprotocol/contracts/experimental/token/FHERC20/IFHERC20.sol";
import "../interfaces/IActionAdapter.sol";

/**
 * @title ConfidentialTransferAdapter
 * @notice Demonstrates FHenix integration for confidential execution conditions.
 * @dev Executors submit tasks blindly without knowing the threshold or amount.
 *      The transfer only occurs if the confidential condition is met using `FHE.select`.
 */
contract ConfidentialTransferAdapter is IActionAdapter {

    struct ConfidentialParams {
        euint32 encryptedThreshold;   // e.g., A target price or timestamp
        euint128 encryptedAmount;     // How much to transfer
        address recipient;            // To whom
        address fherc20Token;         // The confidential token contract
    }

    // Task configurations stored confidentially
    mapping(uint256 => ConfidentialParams) private confidentialTasks;
    uint256 public nextConfidentialTaskId;

    /**
     * @notice User creates a confidential task.
     * @param inThreshold Encrypted threshold (e.g. limit order price)
     * @param inAmount Encrypted amount to send
     * @param recipient Where to send if condition is met
     * @param token Address of FHERC20 token
     */
    function createConfidentialTask(
        inEuint32 calldata inThreshold,
        inEuint128 calldata inAmount,
        address recipient,
        address token
    ) external returns (uint256) {
        uint256 taskId = nextConfidentialTaskId++;
        
        confidentialTasks[taskId] = ConfidentialParams({
            encryptedThreshold: FHE.asEuint32(inThreshold),
            encryptedAmount: FHE.asEuint128(inAmount),
            recipient: recipient,
            fherc20Token: token
        });

        return taskId;
    }

    /**
     * @notice Executor submits current value (e.g. current price/time) as encrypted data
     * @dev We use an encrypted input so the Executor doesn't leak the exact condition 
     *      they are testing against on the public mempool.
     */
    function executeConfidential(uint256 taskId, inEuint32 calldata inCurrentValue) external {
        ConfidentialParams memory params = confidentialTasks[taskId];
        
        euint32 currentValue = FHE.asEuint32(inCurrentValue);
        
        // Evaluate: is current value >= threshold?
        ebool conditionMet = FHE.gte(currentValue, params.encryptedThreshold);
        
        // If condition met -> amount, else -> 0
        euint128 transferAmount = FHE.select(conditionMet, params.encryptedAmount, FHE.asEuint128(0));
        
        // Execute the FHERC20 transfer
        IFHERC20(params.fherc20Token)._transferEncrypted(params.recipient, transferAmount);
        
        // Here the executor pays gas and triggers the evaluation, but cannot see:
        // 1. The original threshold.
        // 2. The transfer amount.
        // 3. Whether the condition evaluated to true or false natively (unless balance changes are publicly leaked).
    }

    // ==========================================
    // IActionAdapter implementations for standard 
    // public integration (placeholder)
    // ==========================================
    
    function getTokenRequirements(bytes calldata params)
        external
        pure
        override
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        tokens = new address[](0);
        amounts = new uint256[](0);
    }

    function canExecute(bytes calldata params)
        external
        view
        override
        returns (bool canExec, string memory reason)
    {
        // In a confidential environment, public views cannot decrypt FHE variables.
        // We always return true here, and let the FHE.select handle the logic on-chain.
        return (true, "Confidential execution: always attemptable");
    }

    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        // Integration point with public TaskVault
        // The actual confidential transfer is handled in `executeConfidential`
        return (true, bytes("Confidential executed"));
    }

    function validateParams(bytes calldata params)
        external
        view
        override
        returns (bool isValid, string memory errorMessage)
    {
        return (true, "");
    }

    function isProtocolSupported(address protocol) external pure override returns (bool) {
        return true;
    }

    function name() external pure override returns (string memory) {
        return "ConfidentialTransferAdapter";
    }
}
