// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAsterPerp
 * @notice Interface for Aster DEX Perpetuals — TradingPortalFacet (Diamond proxy)
 * @dev Contract: 0x5553f3b5e2fad83eda4031a3894ee59e25ee90bf (BSC mainnet)
 *
 * Type conventions (from on-chain source):
 *   qty   : 1e10  — so 1 BNB = 10_000_000_000
 *   price : 1e8   — so BNB at 300 USD = 30_000_000_000
 *   amountIn/margin: tokenIn decimals (USDT = 18 dec on BSC)
 *
 * Qty formula for delta-neutral BNB short:
 *   qty = collateralUsdt_1e18 / bnbPrice_1e8
 *   Example: 100 USDT, BNB at 300 USD: qty = 100e18 / 3e10 = 3.333e9 (= 0.333 BNB in 1e10)
 *
 * Hedging use-case:
 *   MetaYieldVault holds CAKE/WBNB LP which carries BNB price exposure.
 *   Opening a short BNB position here neutralises that delta while both
 *   the LP fees and asUSDF yield continue to accrue.
 */
interface IAsterPerp {

    // ============ Trade Input (from IBook.OpenDataInput) ============

    /**
     * @param pairBase    Base token of the trading pair (WBNB for BNB/USDT)
     * @param isLong      Direction: false = SHORT for delta-neutral hedge
     * @param tokenIn     Collateral token (USDT: 0x55d398326f99059fF775485246999027B3197955)
     * @param amountIn    Collateral amount in tokenIn decimals (uint96)
     * @param qty         Position size in 1e10 contract units (1 BNB = 1e10)
     * @param price       Worst acceptable execution price in 1e8 USD (0 = no limit)
     * @param stopLoss    Stop-loss trigger price in 1e8 USD (0 = disabled)
     * @param takeProfit  Take-profit trigger price in 1e8 USD (0 = disabled)
     * @param broker      Numeric broker/referral ID (uint24; 0 if none)
     */
    struct OpenDataInput {
        address pairBase;
        bool    isLong;
        address tokenIn;
        uint96  amountIn;
        uint80  qty;
        uint64  price;
        uint64  stopLoss;
        uint64  takeProfit;
        uint24  broker;
    }

    // ============ Trade Lifecycle ============

    /**
     * @notice Open a market-order perpetual position.
     * @dev Transfers amountIn of tokenIn from msg.sender — approve first.
     *      Trade enters PENDING state; settled when on-chain oracle publishes price.
     * @return tradeHash  Unique identifier for tracking the pending/open trade
     */
    function openMarketTrade(OpenDataInput memory data)
        external returns (bytes32 tradeHash);

    /**
     * @notice Open a market-order position using native BNB as margin.
     * @dev tokenIn overridden to nativeWrapped(), amountIn to msg.value.
     */
    function openMarketTradeBNB(OpenDataInput memory data)
        external payable returns (bytes32 tradeHash);

    /**
     * @notice Request closure of an open trade at current market price.
     * @dev Only callable by trade owner (ot.user == msg.sender).
     *      Settlement is async — occurs after next oracle price update.
     */
    function closeTrade(bytes32 tradeHash) external;

    /**
     * @notice Close multiple trades in a single call.
     */
    function batchCloseTrade(bytes32[] calldata tradeHashes) external;

    // ============ Position Management ============

    /**
     * @notice Update the take-profit trigger of an open position.
     * @param takeProfit  New TP price in 1e8 USD (must be > 0)
     */
    function updateTradeTp(bytes32 tradeHash, uint64 takeProfit) external;

    /**
     * @notice Update the stop-loss trigger of an open position.
     * @param stopLoss  New SL price in 1e8 USD (0 removes stop-loss)
     */
    function updateTradeSl(bytes32 tradeHash, uint64 stopLoss) external;

    /**
     * @notice Update both TP and SL in one transaction.
     */
    function updateTradeTpAndSl(
        bytes32 tradeHash,
        uint64  takeProfit,
        uint64  stopLoss
    ) external;

    /**
     * @notice Add additional margin to reduce leverage on an open position.
     * @param amount  Extra collateral in the trade's tokenIn decimals
     */
    function addMargin(bytes32 tradeHash, uint96 amount) external payable;

    // ============ Notes on Price Oracle ============
    // getPriceFromCacheOrOracle(address pairBase) is available on the same Diamond proxy.
    // Signature: returns (uint256 price_1e8, <impl-specific second value>).
    // MetaYieldVault calls it via low-level staticcall to avoid ABI type dependency.
}
