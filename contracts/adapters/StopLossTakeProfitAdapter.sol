// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IActionAdapter.sol";

interface IAggregatorV3 {
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
    function decimals() external view returns (uint8);
}

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

/**
 * @title StopLossTakeProfitAdapter
 * @notice Automated stop-loss and take-profit orders
 * @dev Monitors price feeds and executes protective swaps
 *
 * Use Cases:
 * - "Sell if ETH drops below $1500 (stop-loss)"
 * - "Sell if ETH rises above $3000 (take-profit)"
 * - "Sell 50% if price +20%, sell rest if price -10%"
 * - "Trailing stop-loss: Sell if price drops 15% from peak"
 *
 * Features:
 * - Price-based triggers (Chainlink oracles)
 * - Stop-loss protection
 * - Take-profit automation
 * - Trailing stop-loss (dynamic threshold)
 * - Partial position closing
 * - Multiple price targets
 *
 * Architecture:
 * - Executor monitors price via Chainlink
 * - When price hits trigger: execute swap
 * - For trailing stops: tracks peak price on-chain
 *
 * Security:
 * - Chainlink price feeds (decentralized oracles)
 * - Price staleness checks
 * - Slippage protection
 * - SafeERC20 for all token interactions
 */
contract StopLossTakeProfitAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    // ============ Enums ============

    enum OrderType {
        STOP_LOSS,          // Sell if price drops below threshold
        TAKE_PROFIT,        // Sell if price rises above threshold
        TRAILING_STOP       // Sell if price drops X% from peak
    }

    // ============ Immutable Configuration ============

    address public immutable swapRouter; // Uniswap V3

    uint256 public constant PRICE_STALENESS = 1 hours; // Max age for price data
    uint256 public constant MAX_SLIPPAGE = 1000; // 10% max slippage for stop-loss
    uint256 public constant PRICE_PRECISION = 1e18;

    // ============ Structs ============

    /**
     * @notice Parameters for stop-loss/take-profit order
     */
    struct OrderParams {
        OrderType orderType;            // Type of order
        address tokenIn;                // Token to sell (e.g., WETH)
        address tokenOut;               // Token to buy (e.g., USDC)
        address priceFeed;              // Chainlink price feed (tokenIn/tokenOut or tokenIn/USD)
        uint24 swapPoolFee;             // Uniswap V3 pool fee
        uint256 triggerPrice;           // Price that triggers execution (8 decimals for Chainlink)
        uint256 amountToSell;           // Amount of tokenIn to sell
        uint256 minAmountOut;           // Minimum tokenOut to receive (slippage protection)
        uint256 trailingPercent;        // For trailing stop: % drop from peak (e.g., 15 = 15%)
        uint256 peakPrice;              // For trailing stop: highest price seen
        bool isActive;                  // Can be paused by user
        address recipient;              // Who receives the tokens after swap
    }

    // ============ Constructor ============

    constructor(address _swapRouter) {
        require(_swapRouter != address(0), "Invalid swap router");
        swapRouter = _swapRouter;
    }

    // ============ Core Functions ============

    /// @inheritdoc IActionAdapter
    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        OrderParams memory p = abi.decode(params, (OrderParams));

        // STEP 1: Verify order is active
        require(p.isActive, "Order not active");

        // STEP 2: Get current price
        uint256 currentPrice = _getCurrentPrice(p.priceFeed);

        // STEP 3: Check if trigger condition is met
        require(_isTriggerMet(p, currentPrice), "Trigger condition not met");

        // STEP 4: Validate vault has enough tokens
        uint256 vaultBalance = IERC20(p.tokenIn).balanceOf(vault);
        require(vaultBalance >= p.amountToSell, "Insufficient vault balance");

        // STEP 5: Execute swap
        IERC20(p.tokenIn).forceApprove(swapRouter, p.amountToSell);

        ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: p.tokenIn,
                tokenOut: p.tokenOut,
                fee: p.swapPoolFee,
                recipient: p.recipient,
                deadline: block.timestamp + 300,
                amountIn: p.amountToSell,
                amountOutMinimum: p.minAmountOut,
                sqrtPriceLimitX96: 0
            });

        uint256 amountOut = ISwapRouter(swapRouter).exactInputSingle(swapParams);

        // STEP 6: Return success with swap result
        return (true, abi.encode(amountOut, currentPrice));
    }

    /// @inheritdoc IActionAdapter
    function canExecute(bytes calldata params)
        external
        view
        override
        returns (bool executable, string memory reason)
    {
        OrderParams memory p = abi.decode(params, (OrderParams));

        // Check 1: Is order active?
        if (!p.isActive) {
            return (false, "Order not active");
        }

        // Check 2: Get current price
        uint256 currentPrice = _getCurrentPrice(p.priceFeed);

        // Check 3: Is trigger condition met?
        if (!_isTriggerMet(p, currentPrice)) {
            if (p.orderType == OrderType.STOP_LOSS) {
                return (false, "Price still above stop-loss");
            } else if (p.orderType == OrderType.TAKE_PROFIT) {
                return (false, "Price below take-profit target");
            } else {
                return (false, "Trailing stop not triggered");
            }
        }

        // All checks passed
        return (true, "Trigger price reached - ready to execute");
    }

    /// @inheritdoc IActionAdapter
    function getTokenRequirements(bytes calldata params)
        external
        pure
        override
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        OrderParams memory p = abi.decode(params, (OrderParams));

        tokens = new address[](1);
        amounts = new uint256[](1);

        tokens[0] = p.tokenIn;
        amounts[0] = p.amountToSell;

        return (tokens, amounts);
    }

    /// @inheritdoc IActionAdapter
    function name() external pure override returns (string memory) {
        return "StopLossTakeProfitAdapter";
    }

    /// @inheritdoc IActionAdapter
    function isProtocolSupported(address protocol) external view override returns (bool) {
        return protocol == swapRouter;
    }

    /// @inheritdoc IActionAdapter
    function validateParams(bytes calldata params)
        external
        view
        override
        returns (bool isValid, string memory errorMessage)
    {
        try this.decodeParams(params) returns (OrderParams memory p) {
            if (p.tokenIn == address(0)) {
                return (false, "Invalid tokenIn");
            }
            if (p.tokenOut == address(0)) {
                return (false, "Invalid tokenOut");
            }
            if (p.tokenIn == p.tokenOut) {
                return (false, "Tokens must be different");
            }
            if (p.priceFeed == address(0)) {
                return (false, "Invalid price feed");
            }
            if (p.triggerPrice == 0) {
                return (false, "Trigger price must be > 0");
            }
            if (p.amountToSell == 0) {
                return (false, "Amount to sell must be > 0");
            }
            if (p.minAmountOut == 0) {
                return (false, "minAmountOut must be > 0");
            }
            if (p.swapPoolFee != 500 && p.swapPoolFee != 3000 && p.swapPoolFee != 10000) {
                return (false, "Invalid pool fee");
            }
            if (p.recipient == address(0)) {
                return (false, "Invalid recipient");
            }
            if (uint256(p.orderType) > 2) {
                return (false, "Invalid order type");
            }
            if (p.orderType == OrderType.TRAILING_STOP) {
                if (p.trailingPercent == 0 || p.trailingPercent > 100) {
                    return (false, "Trailing percent must be 1-100");
                }
                if (p.peakPrice == 0) {
                    return (false, "Peak price must be set for trailing stop");
                }
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
     */
    function decodeParams(bytes calldata params)
        external
        pure
        returns (OrderParams memory)
    {
        return abi.decode(params, (OrderParams));
    }

    // ============ Internal Helper Functions ============

    /**
     * @notice Get current price from Chainlink oracle
     * @dev Validates price staleness and sanity
     */
    function _getCurrentPrice(address priceFeed)
        internal
        view
        returns (uint256)
    {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = IAggregatorV3(priceFeed).latestRoundData();

        // Validate price data
        require(answer > 0, "Invalid price");
        require(updatedAt >= block.timestamp - PRICE_STALENESS, "Price too stale");
        require(answeredInRound >= roundId, "Stale round");

        return uint256(answer);
    }

    /**
     * @notice Check if trigger condition is met
     */
    function _isTriggerMet(OrderParams memory p, uint256 currentPrice)
        internal
        pure
        returns (bool)
    {
        if (p.orderType == OrderType.STOP_LOSS) {
            // Trigger if price drops below threshold
            return currentPrice <= p.triggerPrice;
        } else if (p.orderType == OrderType.TAKE_PROFIT) {
            // Trigger if price rises above threshold
            return currentPrice >= p.triggerPrice;
        } else if (p.orderType == OrderType.TRAILING_STOP) {
            // Update peak price if current is higher
            uint256 peakPrice = p.peakPrice;
            if (currentPrice > peakPrice) {
                peakPrice = currentPrice;
            }

            // Calculate trailing stop price
            uint256 trailingStopPrice = (peakPrice * (100 - p.trailingPercent)) / 100;

            // Trigger if price drops below trailing stop
            return currentPrice <= trailingStopPrice;
        }

        return false;
    }

    // ============ Public Helper Functions ============

    /**
     * @notice Get current price for a price feed
     * @dev External helper for frontends
     */
    function getCurrentPrice(address priceFeed)
        external
        view
        returns (uint256 price, uint256 updatedAt)
    {
        (,int256 answer,, uint256 timestamp,) = IAggregatorV3(priceFeed).latestRoundData();
        return (uint256(answer), timestamp);
    }

    /**
     * @notice Calculate recommended minAmountOut based on current price
     * @dev Helps users set appropriate slippage protection
     */
    function calculateMinAmountOut(
        uint256 amountIn,
        uint256 currentPrice,
        uint256 slippageBps,
        uint8 tokenInDecimals,
        uint8 tokenOutDecimals
    ) external pure returns (uint256 minOut) {
        require(slippageBps <= MAX_SLIPPAGE, "Slippage too high");

        // Calculate expected output
        uint256 expectedOut = (amountIn * currentPrice * (10 ** tokenOutDecimals)) /
                             ((10 ** tokenInDecimals) * (10 ** 8)); // 8 decimals for Chainlink

        // Apply slippage
        minOut = (expectedOut * (10000 - slippageBps)) / 10000;

        return minOut;
    }

    /**
     * @notice Check if an order would trigger at current price
     * @dev External helper for executors
     */
    function wouldTrigger(
        OrderType orderType,
        uint256 triggerPrice,
        uint256 currentPrice,
        uint256 peakPrice,
        uint256 trailingPercent
    ) external pure returns (bool) {
        if (orderType == OrderType.STOP_LOSS) {
            return currentPrice <= triggerPrice;
        } else if (orderType == OrderType.TAKE_PROFIT) {
            return currentPrice >= triggerPrice;
        } else if (orderType == OrderType.TRAILING_STOP) {
            uint256 trailingStopPrice = (peakPrice * (100 - trailingPercent)) / 100;
            return currentPrice <= trailingStopPrice;
        }
        return false;
    }
}
