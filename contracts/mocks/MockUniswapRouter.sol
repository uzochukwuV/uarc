// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockUniswapRouter
 * @notice Simplified mock of Uniswap V2 Router for testing
 */
contract MockUniswapRouter {
    using SafeERC20 for IERC20;

    // Simple 1:1 exchange rate for testing
    // In reality, this would calculate based on reserves
    uint256 public constant MOCK_EXCHANGE_RATE = 3000; // 1 ETH = 3000 USDC

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint[] memory amounts) {
        require(deadline >= block.timestamp, "EXPIRED");
        require(path.length >= 2, "INVALID_PATH");

        // Pull input tokens from sender
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);

        // Calculate output amount (simplified)
        uint256 amountOut = _calculateOutput(path[0], path[1], amountIn);

        require(amountOut >= amountOutMin, "INSUFFICIENT_OUTPUT_AMOUNT");

        // Send output tokens to recipient
        IERC20(path[1]).safeTransfer(to, amountOut);

        // Return amounts array
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;

        return amounts;
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint[] memory amounts) {
        require(deadline >= block.timestamp, "EXPIRED");
        require(path.length >= 2, "INVALID_PATH");

        // Calculate input amount needed
        uint256 amountIn = _calculateInput(path[0], path[1], amountOut);

        require(amountIn <= amountInMax, "EXCESSIVE_INPUT_AMOUNT");

        // Pull input tokens from sender
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);

        // Send output tokens to recipient
        IERC20(path[1]).safeTransfer(to, amountOut);

        // Return amounts array
        amounts = new uint[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;

        return amounts;
    }

    /**
     * @notice Calculate output amount (simplified for testing)
     * @dev In reality, this would use (x * y = k) formula with fees
     */
    function _calculateOutput(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (uint256) {
        uint8 decimalsIn = _getDecimals(tokenIn);
        uint8 decimalsOut = _getDecimals(tokenOut);

        // Simplified calculation assuming USDC/WETH pair at 3000 rate
        if (decimalsIn == 6 && decimalsOut == 18) {
            // USDC -> WETH: divide by price and adjust decimals
            return (amountIn * 10**12) / MOCK_EXCHANGE_RATE;
        } else if (decimalsIn == 18 && decimalsOut == 6) {
            // WETH -> USDC: multiply by price and adjust decimals
            return (amountIn * MOCK_EXCHANGE_RATE) / 10**12;
        }

        // Default: 1:1
        return amountIn;
    }

    /**
     * @notice Calculate input amount needed for exact output
     */
    function _calculateInput(
        address tokenIn,
        address tokenOut,
        uint256 amountOut
    ) internal view returns (uint256) {
        uint8 decimalsIn = _getDecimals(tokenIn);
        uint8 decimalsOut = _getDecimals(tokenOut);

        // Simplified calculation
        if (decimalsIn == 6 && decimalsOut == 18) {
            // USDC -> WETH
            return (amountOut * MOCK_EXCHANGE_RATE) / 10**12;
        } else if (decimalsIn == 18 && decimalsOut == 6) {
            // WETH -> USDC
            return (amountOut * 10**12) / MOCK_EXCHANGE_RATE;
        }

        // Default: 1:1
        return amountOut;
    }

    function _getDecimals(address token) internal view returns (uint8) {
        try IERC20Metadata(token).decimals() returns (uint8 decimals) {
            return decimals;
        } catch {
            return 18; // Default
        }
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint[] memory amounts)
    {
        require(path.length >= 2, "INVALID_PATH");

        amounts = new uint[](path.length);
        amounts[0] = amountIn;

        for (uint256 i = 0; i < path.length - 1; i++) {
            amounts[i + 1] = _calculateOutput(path[i], path[i + 1], amounts[i]);
        }

        return amounts;
    }

    function getAmountsIn(uint256 amountOut, address[] calldata path)
        external
        view
        returns (uint[] memory amounts)
    {
        require(path.length >= 2, "INVALID_PATH");

        amounts = new uint[](path.length);
        amounts[amounts.length - 1] = amountOut;

        for (uint256 i = path.length - 1; i > 0; i--) {
            amounts[i - 1] = _calculateInput(path[i - 1], path[i], amounts[i]);
        }

        return amounts;
    }
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}
