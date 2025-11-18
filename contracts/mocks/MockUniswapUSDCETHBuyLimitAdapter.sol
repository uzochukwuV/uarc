// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IActionAdapter.sol";

/**
 * @title MockUniswapUSDCETHBuyLimitAdapter
 * @notice Mock adapter for USDC->ETH buy limit orders with embedded price conditions
 * @dev Demonstrates new architecture where conditions are in adapters, not separate oracle
 */
contract MockUniswapUSDCETHBuyLimitAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    // Immutable addresses (gas efficient, prevents user errors)
    address public immutable USDC;
    address public immutable WETH;
    address public immutable MOCK_ROUTER;
    address public immutable PRICE_FEED; // Mock Chainlink price feed

    uint256 private constant PRICE_DECIMALS = 8; // Chainlink standard
    uint256 private constant PRICE_STALENESS = 1 hours;

    struct BuyLimitParams {
        address router;            // Uniswap router address
        address tokenIn;           // USDC address
        address tokenOut;          // WETH address
        uint256 amountIn;          // Amount of USDC to spend
        uint256 minAmountOut;      // Minimum ETH to receive (slippage protection)
        address recipient;         // Who receives the ETH
        uint256 maxPriceUSD;       // Buy only if ETH price <= this (8 decimals, e.g., 3000e8 = $3000) - ADDITIONAL FIELD
    }

    constructor(
        address _usdc,
        address _weth,
        address _router,
        address _priceFeed
    ) {
        USDC = _usdc;
        WETH = _weth;
        MOCK_ROUTER = _router;
        PRICE_FEED = _priceFeed;
    }

    /// @inheritdoc IActionAdapter
    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        BuyLimitParams memory p = abi.decode(params, (BuyLimitParams));

        // STEP 1: Check conditions (embedded in adapter!)
        (bool conditionMet, string memory reason) = this.canExecute(params);
        if (!conditionMet) {
            return (false, bytes(reason));
        }

        // STEP 2: Execute swap
        // Pull tokens from vault
        IERC20(p.tokenIn).safeTransferFrom(vault, address(this), p.amountIn);

        // Approve router
        IERC20(p.tokenIn).approve(p.router, p.amountIn);

        // Build path
        address[] memory path = new address[](2);
        path[0] = p.tokenIn;
        path[1] = p.tokenOut;

        // Execute swap on mock router
        uint[] memory amounts = IMockRouter(p.router).swapExactTokensForTokens(
            p.amountIn,
            p.minAmountOut,
            path,
            p.recipient,
            block.timestamp + 15 minutes
        );

        emit ActionExecuted(vault, MOCK_ROUTER, true, abi.encode(amounts[1]));
        return (true, abi.encode(amounts[1]));
    }

    /// @inheritdoc IActionAdapter
    function canExecute(bytes calldata params)
        public
        view
        override
        returns (bool, string memory)
    {
        BuyLimitParams memory p = abi.decode(params, (BuyLimitParams));

        // Check price feed freshness
        IMockPriceFeed feed = IMockPriceFeed(PRICE_FEED);
        (, int256 price, , uint256 updatedAt, ) = feed.latestRoundData();

        if (block.timestamp - updatedAt > PRICE_STALENESS) {
            return (false, "Price feed stale");
        }

        // Check if price is at or below limit
        uint256 currentPrice = uint256(price);
        if (currentPrice > p.maxPriceUSD) {
            return (false, "ETH price too high");
        }

        return (true, "Conditions met - price within limit");
    }

    /// @inheritdoc IActionAdapter
    function getTokenRequirements(bytes calldata params)
        external
        pure
        override
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        BuyLimitParams memory p = abi.decode(params, (BuyLimitParams));

        // Single-token adapter: USDC in
        tokens = new address[](1);
        amounts = new uint256[](1);

        tokens[0] = p.tokenIn;    // USDC
        amounts[0] = p.amountIn;  // Amount of USDC to spend
    }

    /// @inheritdoc IActionAdapter
    function isProtocolSupported(address protocol) external view override returns (bool) {
        return protocol == MOCK_ROUTER;
    }

    /// @inheritdoc IActionAdapter
    function name() external pure override returns (string memory) {
        return "MockUniswapUSDCETHBuyLimitAdapter";
    }
}

// Minimal interfaces for mock contracts
interface IMockRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint[] memory amounts);
}

interface IMockPriceFeed {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
