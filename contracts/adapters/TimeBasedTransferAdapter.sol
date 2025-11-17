// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IActionAdapter.sol";
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title TimeBasedTransferAdapter
 * @notice Simple adapter for testing: transfers tokens when a specific timestamp is reached
 * @dev Perfect for testnet protocol testing - just set a time and recipient
 *
 * Use Case:
 * - User deposits USDC into TaskVault
 * - Creates task with execution time (e.g., "transfer at 2pm tomorrow")
 * - When time arrives, executor can trigger the transfer
 * - Tokens go to specified recipient
 */
contract TimeBasedTransferAdapter is IActionAdapter {
    /**
     * @notice Params must match TaskLogicV2 expectations (6 params like Uniswap)
     * @dev TaskLogicV2 decodes as: (router, tokenIn, tokenOut, amountIn, minAmountOut, recipient)
     * We map: (ignored, token, ignored, amount, executeAfter, recipient)
     */
    struct TransferParams {
        address ignored1;        // router field (ignored, for TaskLogicV2 compatibility)
        address token;           // tokenIn - Token to transfer (e.g., Mock USDC)
        address ignored2;        // tokenOut field (ignored, for TaskLogicV2 compatibility)
        uint256 amount;          // amountIn - Amount to transfer
        uint256 executeAfter;    // minAmountOut - Timestamp when task can execute (repurposed field)
        address recipient;       // recipient - Where to send tokens
    }

    /**
     * @notice Check if the time condition is met
     * @param params ABI-encoded TransferParams (6 fields for TaskLogicV2 compatibility)
     * @return canExec True if current time >= executeAfter
     * @return reason Human-readable reason
     */
    function canExecute(bytes calldata params)
        external
        view
        override
        returns (bool canExec, string memory reason)
    {
        TransferParams memory p = abi.decode(params, (TransferParams));

        // Check if time has arrived
        if (block.timestamp < p.executeAfter) {
            return (
                false,
                string(
                    abi.encodePacked(
                        'Too early - execute after ',
                        _uint2str(p.executeAfter),
                        ' (current: ',
                        _uint2str(block.timestamp),
                        ')'
                    )
                )
            );
        }

        return (true, 'Time condition met - ready to execute');
    }

    /**
     * @notice Execute the token transfer
     * @param vault Address of TaskVault holding the tokens
     * @param params ABI-encoded TransferParams (6 fields for TaskLogicV2 compatibility)
     * @return success True if transfer succeeded
     * @return result Encoded result data
     */
    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        // Step 1: Check time condition
        (bool conditionMet, string memory reason) = this.canExecute(params);
        if (!conditionMet) {
            return (false, bytes(reason));
        }

        // Step 2: Decode parameters
        TransferParams memory p = abi.decode(params, (TransferParams));

        // Step 3: Validate parameters
        if (p.recipient == address(0)) {
            return (false, bytes('Invalid recipient'));
        }
        if (p.amount == 0) {
            return (false, bytes('Invalid amount'));
        }

        // Step 4: Transfer tokens from vault to recipient
        try IERC20(p.token).transferFrom(vault, p.recipient, p.amount) returns (
            bool transferSuccess
        ) {
            if (!transferSuccess) {
                return (false, bytes('Token transfer failed'));
            }

            return (
                true,
                abi.encode(
                    p.recipient,
                    p.amount,
                    block.timestamp,
                    'Transfer successful'
                )
            );
        } catch Error(string memory err) {
            return (false, bytes(err));
        } catch {
            return (false, bytes('Transfer reverted'));
        }
    }

    /**
     * @notice Helper to convert uint to string for error messages
     */
    function _uint2str(uint256 _i) internal pure returns (string memory str) {
        if (_i == 0) {
            return '0';
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        j = _i;
        while (j != 0) {
            bstr[--k] = bytes1(uint8(48 + (j % 10)));
            j /= 10;
        }
        str = string(bstr);
    }


    /// @inheritdoc IActionAdapter
    function isProtocolSupported(address protocol) external view override returns (bool) {
        return true;
    }

    /// @inheritdoc IActionAdapter
    function name() external pure override returns (string memory) {
        return "TimeBasedTransferAdapter";
    }
}
