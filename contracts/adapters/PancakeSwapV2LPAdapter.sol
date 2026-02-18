// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IActionAdapter.sol";

/**
 * @title IPancakeRouter02
 * @notice PancakeSwap V2 Router interface for liquidity operations
 */
interface IPancakeRouter02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);

    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountToken, uint256 amountETH);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external view returns (uint256[] memory amounts);

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        external pure returns (uint256 amountB);
}

/**
 * @title IPancakeFactory
 * @notice PancakeSwap V2 Factory interface
 */
interface IPancakeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/**
 * @title IPancakePair
 * @notice PancakeSwap V2 Pair (LP Token) interface
 */
interface IPancakePair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function totalSupply() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}

/**
 * @title PancakeSwapV2LPAdapter
 * @notice Manages liquidity positions on PancakeSwap V2 AMM
 * @dev Implements add/remove liquidity for yield stacking strategies
 *
 * Use Cases:
 * - "Add harvested USDF + BNB to PancakeSwap LP"
 * - "Remove LP position when price drops below threshold"
 * - "Rebalance LP positions based on volatility"
 * - "Auto-compound trading fees into LP"
 *
 * Features:
 * - Add liquidity (token pair or token + BNB)
 * - Remove liquidity with slippage protection
 * - Optimal ratio calculation
 * - Price impact estimation
 * - LP token management
 *
 * Supported Actions:
 * - ADD_LIQUIDITY: Add two tokens to pool
 * - ADD_LIQUIDITY_ETH: Add token + BNB to pool
 * - REMOVE_LIQUIDITY: Remove and receive both tokens
 * - REMOVE_LIQUIDITY_ETH: Remove and receive token + BNB
 *
 * Security:
 * - Slippage protection via min amounts
 * - Deadline protection
 * - SafeERC20 for all token interactions
 * - Immutable router address
 */
contract PancakeSwapV2LPAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    // ============ Constants ============

    /// @notice PancakeSwap V2 Router on BNB Chain
    address public immutable router;

    /// @notice PancakeSwap V2 Factory on BNB Chain
    address public immutable factory;

    /// @notice WBNB address on BNB Chain
    address public immutable WBNB;

    /// @notice Maximum allowed slippage in basis points (10% = 1000)
    uint256 public constant MAX_SLIPPAGE_BPS = 1000;

    /// @notice Default deadline extension (5 minutes)
    uint256 public constant DEFAULT_DEADLINE = 300;

    // ============ Enums ============

    enum ActionType {
        ADD_LIQUIDITY,
        ADD_LIQUIDITY_ETH,
        REMOVE_LIQUIDITY,
        REMOVE_LIQUIDITY_ETH
    }

    // ============ Structs ============

    /**
     * @notice Parameters for liquidity operations
     * @dev Packed for gas efficiency
     */
    struct LiquidityParams {
        ActionType actionType;      // Type of liquidity operation
        address tokenA;             // First token (or only token for ETH pairs)
        address tokenB;             // Second token (ignored for ETH pairs)
        uint256 amountADesired;     // Desired amount of tokenA (or token for ETH pairs)
        uint256 amountBDesired;     // Desired amount of tokenB (or ETH for ETH pairs)
        uint256 amountAMin;         // Minimum tokenA to add/receive (slippage protection)
        uint256 amountBMin;         // Minimum tokenB to add/receive (slippage protection)
        uint256 liquidity;          // LP tokens to remove (for REMOVE actions)
        uint256 slippageBps;        // Slippage tolerance in basis points
        address recipient;          // Recipient of LP tokens or underlying tokens
    }

    /**
     * @notice Result of liquidity operation
     */
    struct LiquidityResult {
        uint256 amountA;            // Actual tokenA amount used/received
        uint256 amountB;            // Actual tokenB amount used/received
        uint256 liquidity;          // LP tokens minted/burned
    }

    // ============ Events ============

    event LiquidityAdded(
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity,
        address indexed recipient
    );

    event LiquidityRemoved(
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity,
        address indexed recipient
    );

    // ============ Constructor ============

    /**
     * @notice Initialize adapter with PancakeSwap V2 addresses
     * @param _router PancakeSwap V2 Router address
     * @dev Factory and WBNB are derived from router
     */
    constructor(address _router) {
        require(_router != address(0), "Invalid router");
        router = _router;
        factory = IPancakeRouter02(_router).factory();
        WBNB = IPancakeRouter02(_router).WETH();
    }

    // ============ Core Functions ============

    /// @inheritdoc IActionAdapter
    function execute(address vault, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        LiquidityParams memory p = abi.decode(params, (LiquidityParams));

        // Validate parameters
        _validateParams(p);

        LiquidityResult memory res;

        if (p.actionType == ActionType.ADD_LIQUIDITY) {
            res = _addLiquidity(vault, p);
        } else if (p.actionType == ActionType.ADD_LIQUIDITY_ETH) {
            res = _addLiquidityETH(vault, p);
        } else if (p.actionType == ActionType.REMOVE_LIQUIDITY) {
            res = _removeLiquidity(vault, p);
        } else if (p.actionType == ActionType.REMOVE_LIQUIDITY_ETH) {
            res = _removeLiquidityETH(vault, p);
        } else {
            revert("Invalid action type");
        }

        return (true, abi.encode(res));
    }

    /// @inheritdoc IActionAdapter
    function canExecute(bytes calldata params)
        external
        view
        override
        returns (bool executable, string memory reason)
    {
        LiquidityParams memory p = abi.decode(params, (LiquidityParams));

        // Check 1: Valid action type
        if (uint8(p.actionType) > 3) {
            return (false, "Invalid action type");
        }

        // Check 2: Valid tokens
        if (p.tokenA == address(0)) {
            return (false, "Invalid tokenA");
        }

        // Check 3: For non-ETH actions, tokenB must be valid
        if (p.actionType == ActionType.ADD_LIQUIDITY || p.actionType == ActionType.REMOVE_LIQUIDITY) {
            if (p.tokenB == address(0)) {
                return (false, "Invalid tokenB");
            }
        }

        // Check 4: Amounts must be positive for ADD actions
        if (p.actionType == ActionType.ADD_LIQUIDITY || p.actionType == ActionType.ADD_LIQUIDITY_ETH) {
            if (p.amountADesired == 0) {
                return (false, "amountADesired is zero");
            }
            if (p.amountBDesired == 0) {
                return (false, "amountBDesired is zero");
            }
        }

        // Check 5: Liquidity must be positive for REMOVE actions
        if (p.actionType == ActionType.REMOVE_LIQUIDITY || p.actionType == ActionType.REMOVE_LIQUIDITY_ETH) {
            if (p.liquidity == 0) {
                return (false, "Liquidity is zero");
            }
        }

        // Check 6: Valid recipient
        if (p.recipient == address(0)) {
            return (false, "Invalid recipient");
        }

        // Check 7: Slippage within bounds
        if (p.slippageBps > MAX_SLIPPAGE_BPS) {
            return (false, "Slippage too high");
        }

        // Check 8: Pair exists
        address tokenB = p.actionType == ActionType.ADD_LIQUIDITY_ETH ||
                         p.actionType == ActionType.REMOVE_LIQUIDITY_ETH
                         ? WBNB : p.tokenB;
        address pair = IPancakeFactory(factory).getPair(p.tokenA, tokenB);
        if (pair == address(0)) {
            return (false, "Pair does not exist");
        }

        return (true, "Ready to execute liquidity operation");
    }

    /// @inheritdoc IActionAdapter
    function getTokenRequirements(bytes calldata params)
        external
        view
        override
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        LiquidityParams memory p = abi.decode(params, (LiquidityParams));

        if (p.actionType == ActionType.ADD_LIQUIDITY) {
            // Need both tokens
            tokens = new address[](2);
            amounts = new uint256[](2);
            tokens[0] = p.tokenA;
            tokens[1] = p.tokenB;
            amounts[0] = p.amountADesired;
            amounts[1] = p.amountBDesired;
        } else if (p.actionType == ActionType.ADD_LIQUIDITY_ETH) {
            // Need token only (BNB comes from vault's native balance)
            tokens = new address[](1);
            amounts = new uint256[](1);
            tokens[0] = p.tokenA;
            amounts[0] = p.amountADesired;
        } else if (p.actionType == ActionType.REMOVE_LIQUIDITY || p.actionType == ActionType.REMOVE_LIQUIDITY_ETH) {
            // Need LP tokens
            address tokenB = p.actionType == ActionType.REMOVE_LIQUIDITY ? p.tokenB : WBNB;
            address pair = IPancakeFactory(factory).getPair(p.tokenA, tokenB);
            tokens = new address[](1);
            amounts = new uint256[](1);
            tokens[0] = pair;
            amounts[0] = p.liquidity;
        }

        return (tokens, amounts);
    }

    /// @inheritdoc IActionAdapter
    function name() external pure override returns (string memory) {
        return "PancakeSwapV2LPAdapter";
    }

    /// @inheritdoc IActionAdapter
    function isProtocolSupported(address protocol) external view override returns (bool) {
        return protocol == router || protocol == factory;
    }

    /// @inheritdoc IActionAdapter
    function validateParams(bytes calldata params)
        external
        view
        override
        returns (bool isValid, string memory errorMessage)
    {
        try this.decodeParams(params) returns (LiquidityParams memory p) {
            // Validate action type
            if (uint8(p.actionType) > 3) {
                return (false, "Invalid action type");
            }

            // Validate tokenA
            if (p.tokenA == address(0)) {
                return (false, "Invalid tokenA address");
            }

            // Validate tokenB for non-ETH operations
            if ((p.actionType == ActionType.ADD_LIQUIDITY || p.actionType == ActionType.REMOVE_LIQUIDITY)
                && p.tokenB == address(0)) {
                return (false, "Invalid tokenB address");
            }

            // Validate amounts for ADD operations
            if (p.actionType == ActionType.ADD_LIQUIDITY || p.actionType == ActionType.ADD_LIQUIDITY_ETH) {
                if (p.amountADesired == 0) {
                    return (false, "amountADesired must be > 0");
                }
                if (p.amountBDesired == 0) {
                    return (false, "amountBDesired must be > 0");
                }
            }

            // Validate liquidity for REMOVE operations
            if ((p.actionType == ActionType.REMOVE_LIQUIDITY || p.actionType == ActionType.REMOVE_LIQUIDITY_ETH)
                && p.liquidity == 0) {
                return (false, "Liquidity must be > 0");
            }

            // Validate slippage
            if (p.slippageBps > MAX_SLIPPAGE_BPS) {
                return (false, "Slippage exceeds maximum (10%)");
            }

            // Validate recipient
            if (p.recipient == address(0)) {
                return (false, "Invalid recipient address");
            }

            // Check pair exists
            address tokenB = (p.actionType == ActionType.ADD_LIQUIDITY_ETH ||
                             p.actionType == ActionType.REMOVE_LIQUIDITY_ETH)
                             ? WBNB : p.tokenB;
            address pair = IPancakeFactory(factory).getPair(p.tokenA, tokenB);
            if (pair == address(0) &&
                (p.actionType == ActionType.REMOVE_LIQUIDITY || p.actionType == ActionType.REMOVE_LIQUIDITY_ETH)) {
                return (false, "LP pair does not exist");
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
        returns (LiquidityParams memory)
    {
        return abi.decode(params, (LiquidityParams));
    }

    // ============ Internal Functions ============

    function _validateParams(LiquidityParams memory p) internal pure {
        require(p.tokenA != address(0), "Invalid tokenA");
        require(p.slippageBps <= MAX_SLIPPAGE_BPS, "Slippage too high");
        require(p.recipient != address(0), "Invalid recipient");
    }

    /**
     * @notice Add liquidity to token-token pair
     */
    function _addLiquidity(address /* vault */, LiquidityParams memory p)
        internal
        returns (LiquidityResult memory result)
    {
        // Approve router to spend tokens
        IERC20(p.tokenA).forceApprove(router, p.amountADesired);
        IERC20(p.tokenB).forceApprove(router, p.amountBDesired);

        // Calculate min amounts with slippage
        uint256 amountAMin = p.amountAMin > 0 ? p.amountAMin : _applySlippage(p.amountADesired, p.slippageBps);
        uint256 amountBMin = p.amountBMin > 0 ? p.amountBMin : _applySlippage(p.amountBDesired, p.slippageBps);

        // Add liquidity
        (result.amountA, result.amountB, result.liquidity) = IPancakeRouter02(router).addLiquidity(
            p.tokenA,
            p.tokenB,
            p.amountADesired,
            p.amountBDesired,
            amountAMin,
            amountBMin,
            p.recipient,
            block.timestamp + DEFAULT_DEADLINE
        );

        // Clear remaining approvals
        IERC20(p.tokenA).forceApprove(router, 0);
        IERC20(p.tokenB).forceApprove(router, 0);

        emit LiquidityAdded(p.tokenA, p.tokenB, result.amountA, result.amountB, result.liquidity, p.recipient);
    }

    /**
     * @notice Add liquidity to token-BNB pair
     */
    function _addLiquidityETH(address /* vault */, LiquidityParams memory p)
        internal
        returns (LiquidityResult memory result)
    {
        // Approve router to spend token
        IERC20(p.tokenA).forceApprove(router, p.amountADesired);

        // Calculate min amounts with slippage
        uint256 amountTokenMin = p.amountAMin > 0 ? p.amountAMin : _applySlippage(p.amountADesired, p.slippageBps);
        uint256 amountETHMin = p.amountBMin > 0 ? p.amountBMin : _applySlippage(p.amountBDesired, p.slippageBps);

        // Add liquidity with BNB
        (result.amountA, result.amountB, result.liquidity) = IPancakeRouter02(router).addLiquidityETH{
            value: p.amountBDesired
        }(
            p.tokenA,
            p.amountADesired,
            amountTokenMin,
            amountETHMin,
            p.recipient,
            block.timestamp + DEFAULT_DEADLINE
        );

        // Clear remaining approval
        IERC20(p.tokenA).forceApprove(router, 0);

        emit LiquidityAdded(p.tokenA, WBNB, result.amountA, result.amountB, result.liquidity, p.recipient);
    }

    /**
     * @notice Remove liquidity from token-token pair
     */
    function _removeLiquidity(address /* vault */, LiquidityParams memory p)
        internal
        returns (LiquidityResult memory result)
    {
        // Get LP token address
        address pair = IPancakeFactory(factory).getPair(p.tokenA, p.tokenB);
        require(pair != address(0), "Pair does not exist");

        // Approve router to spend LP tokens
        IERC20(pair).forceApprove(router, p.liquidity);

        // Calculate min amounts with slippage
        (uint256 amountAExpected, uint256 amountBExpected) = _getExpectedAmounts(pair, p.liquidity, p.tokenA, p.tokenB);
        uint256 amountAMin = p.amountAMin > 0 ? p.amountAMin : _applySlippage(amountAExpected, p.slippageBps);
        uint256 amountBMin = p.amountBMin > 0 ? p.amountBMin : _applySlippage(amountBExpected, p.slippageBps);

        // Remove liquidity
        (result.amountA, result.amountB) = IPancakeRouter02(router).removeLiquidity(
            p.tokenA,
            p.tokenB,
            p.liquidity,
            amountAMin,
            amountBMin,
            p.recipient,
            block.timestamp + DEFAULT_DEADLINE
        );

        result.liquidity = p.liquidity;

        emit LiquidityRemoved(p.tokenA, p.tokenB, result.amountA, result.amountB, result.liquidity, p.recipient);
    }

    /**
     * @notice Remove liquidity from token-BNB pair
     */
    function _removeLiquidityETH(address /* vault */, LiquidityParams memory p)
        internal
        returns (LiquidityResult memory result)
    {
        // Get LP token address
        address pair = IPancakeFactory(factory).getPair(p.tokenA, WBNB);
        require(pair != address(0), "Pair does not exist");

        // Approve router to spend LP tokens
        IERC20(pair).forceApprove(router, p.liquidity);

        // Calculate min amounts with slippage
        (uint256 amountTokenExpected, uint256 amountETHExpected) = _getExpectedAmounts(pair, p.liquidity, p.tokenA, WBNB);
        uint256 amountTokenMin = p.amountAMin > 0 ? p.amountAMin : _applySlippage(amountTokenExpected, p.slippageBps);
        uint256 amountETHMin = p.amountBMin > 0 ? p.amountBMin : _applySlippage(amountETHExpected, p.slippageBps);

        // Remove liquidity
        (result.amountA, result.amountB) = IPancakeRouter02(router).removeLiquidityETH(
            p.tokenA,
            p.liquidity,
            amountTokenMin,
            amountETHMin,
            p.recipient,
            block.timestamp + DEFAULT_DEADLINE
        );

        result.liquidity = p.liquidity;

        emit LiquidityRemoved(p.tokenA, WBNB, result.amountA, result.amountB, result.liquidity, p.recipient);
    }

    // ============ Helper Functions ============

    /**
     * @notice Apply slippage to an amount
     * @param amount Original amount
     * @param slippageBps Slippage in basis points
     * @return Reduced amount after slippage
     */
    function _applySlippage(uint256 amount, uint256 slippageBps) internal pure returns (uint256) {
        return (amount * (10000 - slippageBps)) / 10000;
    }

    /**
     * @notice Get expected token amounts for removing liquidity
     * @param pair LP token address
     * @param liquidity Amount of LP tokens
     * @param tokenA First token (used to determine ordering)
     * @return amountA Expected amount of tokenA
     * @return amountB Expected amount of tokenB
     */
    function _getExpectedAmounts(address pair, uint256 liquidity, address tokenA, address /* tokenB */)
        internal
        view
        returns (uint256 amountA, uint256 amountB)
    {
        uint256 totalSupply = IPancakePair(pair).totalSupply();
        if (totalSupply == 0) return (0, 0);

        (uint112 reserve0, uint112 reserve1,) = IPancakePair(pair).getReserves();
        address token0 = IPancakePair(pair).token0();

        uint256 amount0 = (uint256(reserve0) * liquidity) / totalSupply;
        uint256 amount1 = (uint256(reserve1) * liquidity) / totalSupply;

        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
    }

    /**
     * @notice Get LP token address for a pair
     * @param tokenA First token
     * @param tokenB Second token
     * @return pair LP token address
     */
    function getPairAddress(address tokenA, address tokenB) external view returns (address pair) {
        return IPancakeFactory(factory).getPair(tokenA, tokenB);
    }

    /**
     * @notice Get current reserves for a pair
     * @param tokenA First token
     * @param tokenB Second token
     * @return reserveA Reserve of tokenA
     * @return reserveB Reserve of tokenB
     */
    function getReserves(address tokenA, address tokenB)
        external
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        address pair = IPancakeFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) return (0, 0);

        (uint112 reserve0, uint112 reserve1,) = IPancakePair(pair).getReserves();
        address token0 = IPancakePair(pair).token0();

        (reserveA, reserveB) = tokenA == token0
            ? (uint256(reserve0), uint256(reserve1))
            : (uint256(reserve1), uint256(reserve0));
    }

    /**
     * @notice Calculate optimal amounts for adding liquidity
     * @param tokenA First token
     * @param tokenB Second token
     * @param amountADesired Desired amount of tokenA
     * @param amountBDesired Desired amount of tokenB
     * @return amountA Optimal amount of tokenA
     * @return amountB Optimal amount of tokenB
     */
    function getOptimalAmounts(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired
    ) external view returns (uint256 amountA, uint256 amountB) {
        address pair = IPancakeFactory(factory).getPair(tokenA, tokenB);

        // If pair doesn't exist, use desired amounts (will create pair)
        if (pair == address(0)) {
            return (amountADesired, amountBDesired);
        }

        (uint112 reserve0, uint112 reserve1,) = IPancakePair(pair).getReserves();

        // Empty reserves, use desired amounts
        if (reserve0 == 0 && reserve1 == 0) {
            return (amountADesired, amountBDesired);
        }

        address token0 = IPancakePair(pair).token0();
        (uint256 reserveA, uint256 reserveB) = tokenA == token0
            ? (uint256(reserve0), uint256(reserve1))
            : (uint256(reserve1), uint256(reserve0));

        // Calculate optimal amountB for given amountA
        uint256 amountBOptimal = IPancakeRouter02(router).quote(amountADesired, reserveA, reserveB);

        if (amountBOptimal <= amountBDesired) {
            return (amountADesired, amountBOptimal);
        }

        // Calculate optimal amountA for given amountB
        uint256 amountAOptimal = IPancakeRouter02(router).quote(amountBDesired, reserveB, reserveA);
        return (amountAOptimal, amountBDesired);
    }

    /**
     * @notice Estimate LP tokens to receive for adding liquidity
     * @param tokenA First token
     * @param tokenB Second token
     * @param amountA Amount of tokenA
     * @param amountB Amount of tokenB
     * @return liquidity Estimated LP tokens
     */
    function estimateLiquidityMinted(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external view returns (uint256 liquidity) {
        address pair = IPancakeFactory(factory).getPair(tokenA, tokenB);

        if (pair == address(0)) {
            // New pair - liquidity = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY
            // Simplified: return geometric mean (actual has 1000 minimum liquidity locked)
            return _sqrt(amountA * amountB);
        }

        uint256 totalSupply = IPancakePair(pair).totalSupply();
        (uint112 reserve0, uint112 reserve1,) = IPancakePair(pair).getReserves();

        address token0 = IPancakePair(pair).token0();
        (uint256 reserveA, uint256 reserveB) = tokenA == token0
            ? (uint256(reserve0), uint256(reserve1))
            : (uint256(reserve1), uint256(reserve0));

        // liquidity = min((amountA * totalSupply) / reserveA, (amountB * totalSupply) / reserveB)
        uint256 liquidityA = (amountA * totalSupply) / reserveA;
        uint256 liquidityB = (amountB * totalSupply) / reserveB;

        return liquidityA < liquidityB ? liquidityA : liquidityB;
    }

    /**
     * @notice Square root calculation (Babylonian method)
     */
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /**
     * @notice Receive BNB for liquidity operations
     */
    receive() external payable {}
}
