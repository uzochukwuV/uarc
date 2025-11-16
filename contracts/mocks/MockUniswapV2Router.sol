// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MockUniswapV2Router
 * @notice Mock Uniswap V2 Router for testing
 * @dev Simulates token swaps with a simple fixed exchange rate
 */
contract MockUniswapV2Router {
    using SafeERC20 for IERC20;

    // Simple mock: 1 USDC = 1/3000 ETH (assuming ETH price = $3000)
    // Need to account for decimals: USDC has 6, WETH has 18
    // 1 USDC (1e6) should give 1/3000 ETH (0.000333e18 = 333333333333333)
    // Formula: amountOut = amountIn * 1e18 / (3000 * 1e6) = amountIn * 1e12 / 3000
    uint256 public constant EXCHANGE_RATE = 1e12; // Decimal adjustment
    uint256 public constant RATE_PRECISION = 3000; // Price: $3000 per ETH

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(deadline >= block.timestamp, "Expired");
        require(path.length == 2, "Invalid path");

        address tokenIn = path[0];
        address tokenOut = path[1];

        // Calculate output amount (simple mock rate)
        uint256 amountOut = (amountIn * EXCHANGE_RATE) / RATE_PRECISION;

        require(amountOut >= amountOutMin, "Insufficient output amount");

        // Transfer tokens
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(to, amountOut);

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;

        return amounts;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        pure
        returns (uint256[] memory amounts)
    {
        require(path.length == 2, "Invalid path");

        uint256 amountOut = (amountIn * EXCHANGE_RATE) / RATE_PRECISION;

        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = amountOut;

        return amounts;
    }
}
