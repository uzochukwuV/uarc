// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IActionAdapter.sol";

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

interface IQuoter {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut);
}

/**
 * @title DCAAdapter (Dollar-Cost Averaging)
 * @notice Automates recurring token purchases at fixed intervals using Uniswap V3
 * @dev Implements time-based recurring swaps with concentrated liquidity
 *
 * Use Cases:
 * - "Buy $100 of ETH every Monday for 52 weeks"
 * - "DCA into BTC with $500 every 2 weeks"
 * - "Accumulate governance tokens monthly"
 *
 * Features:
 * - Fixed amount purchases (ignore price volatility)
 * - Configurable intervals (daily, weekly, monthly)
 * - Slippage protection
 * - Uniswap V3 concentrated liquidity
 * - Auto-stop after N executions
 *
 * Architecture:
 * - Task created with: tokenIn, tokenOut, amountPerPurchase, interval, maxExecutions
 * - Executor checks: Has enough time passed since last execution?
 * - If yes: Swap tokens, track execution count, update last execution time
 *
 * Security:
 * - Validates router whitelist
 * - Slippage protection via minAmountOut
 * - Balance checks before execution
 * - SafeERC20 for all token interactions
 */
contract DCAAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    // ============ Immutable Configuration ============

    address public immutable swapRouter; // Uniswap V3 SwapRouter
    address public immutable quoter; // Uniswap V3 Quoter for price quotes
    uint256 public constant MAX_SLIPPAGE = 500; // 5% max slippage (in basis points)

    // ============ Structs ============

    /**
     * @notice Parameters for DCA strategy
     * @dev Packed for gas efficiency
     */
    struct DCAParams {
        address tokenIn;            // Token to sell (e.g., USDC)
        address tokenOut;           // Token to buy (e.g., WETH)
        uint24 poolFee;             // Uniswap V3 pool fee (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
        uint256 amountPerPurchase;  // Fixed amount to spend each time (e.g., 100 USDC)
        uint256 interval;           // Time between purchases (seconds, e.g., 7 days)
        uint256 lastExecutionTime;  // Timestamp of last purchase (0 for first)
        uint256 executionCount;     // How many purchases completed
        uint256 maxExecutions;      // Stop after N purchases (0 = unlimited)
        uint256 minAmountOut;       // Minimum tokens to receive (slippage protection)
        address recipient;          // Who receives purchased tokens
    }

    // ============ Constructor ============

    constructor(address _swapRouter, address _quoter) {
        require(_swapRouter != address(0), "Invalid swap router");
        require(_quoter != address(0), "Invalid quoter");
        swapRouter = _swapRouter;
        quoter = _quoter;
    }

    // ============ Core Functions ============

    /// @inheritdoc IActionAdapter
    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        DCAParams memory p = abi.decode(params, (DCAParams));

        // STEP 1: Validate time-based condition
        require(
            block.timestamp >= p.lastExecutionTime + p.interval,
            "Interval not met"
        );

        // STEP 2: Validate execution count
        if (p.maxExecutions > 0) {
            require(p.executionCount < p.maxExecutions, "Max executions reached");
        }

        // STEP 3: Validate parameters
        _validateParams(p);

        // STEP 4: Check vault has enough tokens
        uint256 balance = IERC20(p.tokenIn).balanceOf(vault);
        require(balance >= p.amountPerPurchase, "Insufficient vault balance");

        // STEP 5: Approve router to spend tokens
        IERC20(p.tokenIn).forceApprove(swapRouter, p.amountPerPurchase);

        // STEP 6: Execute Uniswap V3 swap
        ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: p.tokenIn,
                tokenOut: p.tokenOut,
                fee: p.poolFee,
                recipient: p.recipient,
                deadline: block.timestamp + 300, // 5 min deadline
                amountIn: p.amountPerPurchase,
                amountOutMinimum: p.minAmountOut,
                sqrtPriceLimitX96: 0 // No price limit
            });

        uint256 amountOut = ISwapRouter(swapRouter).exactInputSingle(swapParams);

        // STEP 7: Return success with purchased amount
        return (true, abi.encode(amountOut));
    }

    /// @inheritdoc IActionAdapter
    function canExecute(bytes calldata params)
        external
        view
        override
        returns (bool executable, string memory reason)
    {
        DCAParams memory p = abi.decode(params, (DCAParams));

        // Check 1: Time interval met?
        if (block.timestamp < p.lastExecutionTime + p.interval) {
            return (false, "Interval not yet reached");
        }

        // Check 2: Max executions reached?
        if (p.maxExecutions > 0 && p.executionCount >= p.maxExecutions) {
            return (false, "Max executions reached");
        }

        // Check 3: Valid parameters?
        if (p.tokenIn == address(0) || p.tokenOut == address(0)) {
            return (false, "Invalid token addresses");
        }

        if (p.amountPerPurchase == 0) {
            return (false, "Amount per purchase is zero");
        }

        if (p.interval == 0) {
            return (false, "Interval is zero");
        }

        // All checks passed
        return (true, "Ready to execute DCA purchase");
    }

    /// @inheritdoc IActionAdapter
    function getTokenRequirements(bytes calldata params)
        external
        pure
        override
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        DCAParams memory p = abi.decode(params, (DCAParams));

        tokens = new address[](1);
        amounts = new uint256[](1);

        tokens[0] = p.tokenIn;
        amounts[0] = p.amountPerPurchase;

        return (tokens, amounts);
    }

    /// @inheritdoc IActionAdapter
    function name() external pure override returns (string memory) {
        return "DCAAdapter";
    }

    /// @inheritdoc IActionAdapter
    function isProtocolSupported(address protocol) external view override returns (bool) {
        // For DCA, we only support the configured Uniswap V3 router
        return protocol == swapRouter;
    }

    /// @inheritdoc IActionAdapter
    function validateParams(bytes calldata params)
        external
        view
        override
        returns (bool isValid, string memory errorMessage)
    {
        try this.decodeParams(params) returns (DCAParams memory p) {
            if (p.tokenIn == address(0)) {
                return (false, "Invalid tokenIn address");
            }
            if (p.tokenOut == address(0)) {
                return (false, "Invalid tokenOut address");
            }
            if (p.tokenIn == p.tokenOut) {
                return (false, "tokenIn and tokenOut must be different");
            }
            if (p.amountPerPurchase == 0) {
                return (false, "Amount per purchase must be > 0");
            }
            if (p.interval == 0) {
                return (false, "Interval must be > 0");
            }
            if (p.interval < 1 hours) {
                return (false, "Interval too short (min 1 hour)");
            }
            if (p.minAmountOut == 0) {
                return (false, "minAmountOut must be > 0");
            }
            if (p.recipient == address(0)) {
                return (false, "Invalid recipient address");
            }
            if (p.poolFee != 500 && p.poolFee != 3000 && p.poolFee != 10000) {
                return (false, "Invalid pool fee (must be 500, 3000, or 10000)");
            }
            return (true, "");
        } catch Error(string memory reason) {
            return (false, string(abi.encodePacked("Decoding failed: ", reason)));
        } catch {
            return (false, "Decoding failed: Invalid parameter encoding");
        }
    }

    /**
     * @notice Helper to decode params safely
     * @dev Used by validateParams for try-catch pattern
     */
    function decodeParams(bytes calldata params)
        external
        pure
        returns (DCAParams memory)
    {
        return abi.decode(params, (DCAParams));
    }

    // ============ Internal Helpers ============

    function _validateParams(DCAParams memory p) internal pure {
        require(p.tokenIn != address(0), "Invalid tokenIn");
        require(p.tokenOut != address(0), "Invalid tokenOut");
        require(p.tokenIn != p.tokenOut, "Tokens must differ");
        require(p.amountPerPurchase > 0, "Amount must be > 0");
        require(p.interval >= 1 hours, "Interval too short");
        require(p.minAmountOut > 0, "minAmountOut must be > 0");
        require(p.recipient != address(0), "Invalid recipient");
        require(
            p.poolFee == 500 || p.poolFee == 3000 || p.poolFee == 10000,
            "Invalid pool fee (must be 500, 3000, or 10000)"
        );
    }

    /**
     * @notice Calculate recommended minAmountOut based on current price
     * @dev External helper for frontend/task creators using Uniswap V3 Quoter
     * @param tokenIn Token being sold
     * @param tokenOut Token being bought
     * @param poolFee Uniswap V3 pool fee tier
     * @param amountIn Amount of tokenIn to swap
     * @param slippageBps Slippage tolerance in basis points (e.g., 100 = 1%)
     * @return minOut Minimum amount of tokenOut to accept
     */
    function calculateMinAmountOut(
        address tokenIn,
        address tokenOut,
        uint24 poolFee,
        uint256 amountIn,
        uint256 slippageBps
    ) external returns (uint256 minOut) {
        require(slippageBps <= MAX_SLIPPAGE, "Slippage too high");
        require(
            poolFee == 500 || poolFee == 3000 || poolFee == 10000,
            "Invalid pool fee"
        );

        // Get quote from Uniswap V3 Quoter
        uint256 expectedOut = IQuoter(quoter).quoteExactInputSingle(
            tokenIn,
            tokenOut,
            poolFee,
            amountIn,
            0 // No price limit
        );

        // Apply slippage: minOut = expectedOut * (10000 - slippageBps) / 10000
        minOut = (expectedOut * (10000 - slippageBps)) / 10000;

        return minOut;
    }
}
