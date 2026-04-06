// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhenixprotocol/contracts/FHE.sol";
import "@fhenixprotocol/contracts/experimental/token/FHERC20/IFHERC20.sol";
import "../interfaces/IActionAdapter.sol";

interface IConfidentialTaskVault {
    function transferFHERC20(address token, address to, euint128 encryptedAmount) external returns (euint128);
}

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

    // ==========================================
    // IActionAdapter implementations for standard 
    // integration with TaskVault
    // ==========================================
    
    function getTokenRequirements(bytes calldata /* params */)
        external
        pure
        override
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        tokens = new address[](0);
        amounts = new uint256[](0);
    }

    function canExecute(bytes calldata /* params */)
        external
        pure
        override
        returns (bool canExec, string memory reason)
    {
        // In a confidential environment, public views cannot decrypt FHE variables.
        // We always return true here, and let the FHE.select handle the logic on-chain.
        return (true, "Confidential execution: always attemptable");
    }

    /**
     * @notice Executor submits current value (e.g. current price/time) as encrypted data
     *         packed inside the `params` via TaskCore execution flow.
     */
    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        // Decode the parameters provided by the executor during `executeTask`
        (uint256 taskId, inEuint32 memory inCurrentValue) = abi.decode(params, (uint256, inEuint32));
        
        ConfidentialParams memory cParams = confidentialTasks[taskId];
        require(cParams.fherc20Token != address(0), "Task not found");
        
        euint32 currentValue = FHE.asEuint32(inCurrentValue);
        
        // Evaluate: is current value >= threshold?
        ebool conditionMet = FHE.gte(currentValue, cParams.encryptedThreshold);
        
        // If condition met -> amount, else -> 0
        euint128 transferAmount = FHE.select(conditionMet, cParams.encryptedAmount, FHE.asEuint128(0));
        
        // Securely instruct the vault to transfer the encrypted amount.
        // The vault physically holds the FHERC20 tokens and only allows this transfer
        // because the adapter is the `activeAdapter` in the current context.
        IConfidentialTaskVault(vault).transferFHERC20(cParams.fherc20Token, cParams.recipient, transferAmount);
        
        return (true, bytes("Confidential executed"));
    }

    function validateParams(bytes calldata /* params */)
        external
        pure
        override
        returns (bool isValid, string memory errorMessage)
    {
        return (true, "");
    }

    function isProtocolSupported(address /* protocol */) external pure override returns (bool) {
        return true;
    }

    function name() external pure override returns (string memory) {
        return "ConfidentialTransferAdapter";
    }
}
