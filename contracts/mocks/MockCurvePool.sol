// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockCurvePool {
    using SafeERC20 for IERC20;

    IERC20 public token0;
    IERC20 public token1;

    // Exchange rate: 1 token0 = 1 token1 for simplicity
    constructor(address _token0, address _token1) {
        token0 = IERC20(_token0);
        token1 = IERC20(_token1);
    }

    function exchange(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external returns (uint256) {
        IERC20 tokenIn = i == 0 ? token0 : token1;
        IERC20 tokenOut = j == 0 ? token0 : token1;

        tokenIn.safeTransferFrom(msg.sender, address(this), dx);

        // Assume 1:1 exchange rate for testing
        uint256 dy = dx;
        require(dy >= min_dy, "Slippage tolerance exceeded");

        tokenOut.safeTransfer(msg.sender, dy);

        return dy;
    }
}