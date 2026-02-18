// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IActionAdapter.sol";

// ─── Interface: asBNB Minter (Minter.sol pattern) ─────────────────────────────

/**
 * @title IMinterAster
 * @notice Interface for the asBNB minter (Astherus Minter.sol)
 *
 * Deposit flow (smartMint):
 *   - underlying (slisBNB) is split: mintRatio% locked directly, rest bought on PancakeSwap
 *   - caller receives asBNB tokens
 *
 * Exchange rate: totalTokens() / assToken.totalSupply()
 *   - Read via convertToTokens(1e18) — returns slisBNB per 1e18 asBNB
 */
interface IMinterAster {
    function smartMint(uint256 _amountIn, uint256 _mintRatio, uint256 _minOut) external returns (uint256);
    function withdraw(uint256 amount) external;                      // Sunset mode only
    function convertToAssTokens(uint256 tokens) external view returns (uint256);
    function convertToTokens(uint256 assTokens) external view returns (uint256);
    function estimateTotalOut(uint256 _amountIn, uint256 _mintRatio) external view returns (uint256);
    function totalTokens() external view returns (uint256);
    function maxSwapRatio() external view returns (uint256);
    function minSwapRatio() external view returns (uint256);
}

// ─── Interface: asUSDF / USDF Earn (asUSDFEarn.sol pattern) ───────────────────

/**
 * @title ISimpleEarn
 * @notice Interface for asUSDF and USDF earn contracts (asUSDFEarn.sol pattern)
 *
 * Deposit flow:
 *   - User sends underlying (USDF for asUSDF; USDT for USDF)
 *   - Vault mints yield-bearing token to caller
 *   - Exchange price increases over time as rewards are dispatched
 *
 * Exchange rate: exchangePrice() — underlying per 1 yield token (in 1e18 units)
 *   e.g. 1.05e18 means 1 asUSDF = 1.05 USDF
 *
 * Withdraw flow (queue-based):
 *   1. requestWithdraw(amount)     → burns yield tokens, queues underlying for release
 *   2. claimWithdraw([requestId])  → claims released underlying after wait period
 */
interface ISimpleEarn {
    function deposit(uint256 amountIn) external;
    function requestWithdraw(uint256 amount) external;
    function claimWithdraw(uint256[] calldata requestWithdrawNos) external;
    function exchangePrice() external view returns (uint256);
}

/**
 * @title AsterDEXEarnAdapter
 * @notice Adapter for all three AsterDEX Earn yield products
 * @dev Primary yield source for the Self-Driving Yield Engine hackathon submission.
 *
 * Products and their underlying interfaces:
 *
 *   ASSET    │ TOKEN   │ UNDERLYING │ MINTER PATTERN
 *   ─────────┼─────────┼────────────┼──────────────────────────────────────────
 *   USDF     │ USDF    │ USDT       │ ISimpleEarn.deposit()
 *   asBNB    │ asBNB   │ slisBNB    │ IMinterAster.smartMint()
 *   asUSDF   │ asUSDF  │ USDF       │ ISimpleEarn.deposit() + requestWithdraw()
 *
 * Supported Actions:
 *   DEPOSIT          → deposit underlying, receive yield token
 *   WITHDRAW         → asBNB only: burn assToken (sunset mode)
 *   REQUEST_WITHDRAW → asUSDF/USDF: queue a withdrawal request
 *   CLAIM_WITHDRAW   → asUSDF/USDF: claim a matured withdrawal
 *
 * Exchange Rate:
 *   asBNB  → convertToTokens(1e18)    (slisBNB per asBNB, from Minter.sol)
 *   asUSDF → exchangePrice()          (USDF per asUSDF, from asUSDFEarn.sol)
 *   USDF   → exchangePrice()          (USDT per USDF, assumed same pattern)
 */
contract AsterDEXEarnAdapter is IActionAdapter {
    using SafeERC20 for IERC20;

    // ============ Constants — BSC Mainnet ============

    uint256 public constant DENOMINATOR = 10_000;
    uint256 public constant EXCHANGE_PRICE_DECIMALS = 1e18;

    /// @notice USDF yield-bearing stablecoin (underlying: USDT)
    address public constant USDF        = 0x5A110fC00474038f6c02E89C707D638602EA44B5;
    /// @notice USDF Minter contract
    address public constant USDF_MINTER = 0xC271fc70dD9E678ac1AB632f797894fe4BE2C345;
    /// @notice USDT on BSC (18 decimals)
    address public constant USDT        = 0x55d398326f99059fF775485246999027B3197955;

    /// @notice asBNB liquid staked BNB (underlying: slisBNB)
    address public constant ASBNB        = 0x77734e70b6E88b4d82fE632a168EDf6e700912b6;
    /// @notice asBNB Minter (Minter.sol / smartMint pattern)
    address public constant ASBNB_MINTER = 0x2F31ab8950c50080E77999fa456372f276952fD8;
    /// @notice Lista DAO slisBNB — ERC20 liquid staked BNB, underlying for asBNB
    address public constant SLISBNB      = 0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B;

    /// @notice asUSDF staked USDF (underlying: USDF)
    address public constant ASUSDF        = 0x917AF46B3C3c6e1Bb7286B9F59637Fb7C65851Fb;
    /// @notice asUSDF contract (asUSDFEarn.sol / deposit + requestWithdraw pattern)
    address public constant ASUSDF_MINTER = 0xdB57a53C428a9faFcbFefFB6dd80d0f427543695;

    // ============ Enums ============

    enum Asset {
        USDF,   // yield stablecoin (USDT → USDF)
        ASBNB,  // liquid staked BNB (slisBNB → asBNB)
        ASUSDF  // staked USDF (USDF → asUSDF)
    }

    enum ActionType {
        DEPOSIT,          // All: deposit underlying → yield token
        WITHDRAW,         // asBNB only: burn assToken (sunset mode)
        REQUEST_WITHDRAW, // asUSDF/USDF: queue withdrawal (yields USDF/USDT after delay)
        CLAIM_WITHDRAW    // asUSDF/USDF: claim a matured withdrawal by request ID
    }

    // ============ Structs ============

    /**
     * @notice Parameters for AsterDEX Earn operations
     *
     * @param actionType    DEPOSIT / WITHDRAW / REQUEST_WITHDRAW / CLAIM_WITHDRAW
     * @param asset         USDF | ASBNB | ASUSDF
     * @param amount        Underlying amount (DEPOSIT/REQUEST_WITHDRAW) or yield token amount (WITHDRAW)
     * @param mintRatio     ASBNB DEPOSIT only — fraction minted directly vs PancakeSwap buyback
     *                      Range [10000-maxSwapRatio, 10000-minSwapRatio]. Pass 0 for auto.
     * @param minReceived   Minimum output (slippage protection). 0 = 99% of estimate.
     * @param requestId     CLAIM_WITHDRAW only — the withdrawal request number to claim
     * @param recipient     Recipient of output tokens
     */
    struct EarnParams {
        ActionType actionType;
        Asset      asset;
        uint256    amount;
        uint256    mintRatio;
        uint256    minReceived;
        uint256    requestId;
        address    recipient;
    }

    /**
     * @notice Result returned from execute()
     */
    struct EarnResult {
        uint256 amountIn;      // Input tokens used
        uint256 amountOut;     // Output tokens received
        uint256 exchangeRate;  // Underlying per 1e18 yield tokens at execution
        uint256 requestId;     // Populated for REQUEST_WITHDRAW (0 if not applicable)
    }

    // ============ Events ============

    event Deposited(
        Asset indexed asset, uint256 amountIn, uint256 yieldOut, address indexed recipient
    );
    event Withdrawn(
        Asset indexed asset, uint256 yieldIn, uint256 underlyingOut, address indexed recipient
    );
    event WithdrawRequested(
        Asset indexed asset, uint256 yieldIn, address indexed requester
    );
    event WithdrawClaimed(
        Asset indexed asset, uint256 requestId, uint256 underlyingOut, address indexed recipient
    );

    // ============ IActionAdapter ============

    /// @inheritdoc IActionAdapter
    function execute(address /* vault */, bytes calldata params)
        external
        override
        returns (bool success, bytes memory result)
    {
        EarnParams memory p = abi.decode(params, (EarnParams));
        _validateParams(p);

        EarnResult memory res;

        if (p.actionType == ActionType.DEPOSIT) {
            res = _deposit(p);
        } else if (p.actionType == ActionType.WITHDRAW) {
            res = _withdraw(p);
        } else if (p.actionType == ActionType.REQUEST_WITHDRAW) {
            res = _requestWithdraw(p);
        } else {
            res = _claimWithdraw(p);
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
        EarnParams memory p = abi.decode(params, (EarnParams));

        if (uint8(p.actionType) > 3)   return (false, "Invalid action type");
        if (uint8(p.asset) > 2)        return (false, "Invalid asset");
        if (p.recipient == address(0)) return (false, "Invalid recipient");

        // Amount required for most actions
        if (p.actionType != ActionType.CLAIM_WITHDRAW && p.amount == 0) {
            return (false, "Amount is zero");
        }

        // WITHDRAW only valid for asBNB
        if (p.actionType == ActionType.WITHDRAW && p.asset != Asset.ASBNB) {
            return (false, "WITHDRAW (sunset) only valid for asBNB; use REQUEST_WITHDRAW for asUSDF/USDF");
        }

        // REQUEST_WITHDRAW / CLAIM_WITHDRAW not applicable for asBNB
        if ((p.actionType == ActionType.REQUEST_WITHDRAW || p.actionType == ActionType.CLAIM_WITHDRAW)
             && p.asset == Asset.ASBNB) {
            return (false, "Use WITHDRAW for asBNB (sunset mode)");
        }

        // Validate mintRatio for asBNB deposits
        if (p.actionType == ActionType.DEPOSIT && p.asset == Asset.ASBNB && p.mintRatio != 0) {
            try IMinterAster(ASBNB_MINTER).maxSwapRatio() returns (uint256 maxSwap) {
                uint256 minSwap = IMinterAster(ASBNB_MINTER).minSwapRatio();
                uint256 minMint = DENOMINATOR - maxSwap;
                uint256 maxMint = DENOMINATOR - minSwap;
                if (p.mintRatio < minMint || p.mintRatio > maxMint) {
                    return (false, "mintRatio out of valid range");
                }
            } catch {
                // If minter view is unavailable, allow execution and let it revert on-chain
            }
        }

        return (true, "Ready to execute Earn operation");
    }

    /// @inheritdoc IActionAdapter
    function getTokenRequirements(bytes calldata params)
        external
        pure
        override
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        EarnParams memory p = abi.decode(params, (EarnParams));

        tokens  = new address[](1);
        amounts = new uint256[](1);
        amounts[0] = p.amount;

        if (p.actionType == ActionType.DEPOSIT) {
            tokens[0] = _getUnderlying(p.asset);
        } else if (p.actionType == ActionType.WITHDRAW || p.actionType == ActionType.REQUEST_WITHDRAW) {
            tokens[0] = _getYieldToken(p.asset);
        } else {
            // CLAIM_WITHDRAW: no ERC20 input needed
            amounts[0] = 0;
        }
    }

    /// @inheritdoc IActionAdapter
    function name() external pure override returns (string memory) {
        return "AsterDEXEarnAdapter";
    }

    /// @inheritdoc IActionAdapter
    function isProtocolSupported(address protocol) external pure override returns (bool) {
        return protocol == USDF_MINTER ||
               protocol == ASBNB_MINTER ||
               protocol == ASUSDF_MINTER;
    }

    /// @inheritdoc IActionAdapter
    function validateParams(bytes calldata params)
        external
        view
        override
        returns (bool isValid, string memory errorMessage)
    {
        try this.decodeParams(params) returns (EarnParams memory p) {
            if (uint8(p.actionType) > 3)   return (false, "Invalid action type");
            if (uint8(p.asset) > 2)         return (false, "Invalid asset");
            if (p.recipient == address(0))  return (false, "Invalid recipient");
            if (p.actionType != ActionType.CLAIM_WITHDRAW && p.amount == 0) {
                return (false, "Amount must be > 0");
            }
            return (true, "");
        } catch {
            return (false, "Invalid parameter encoding");
        }
    }

    /// @notice Decode params (used by validateParams try/catch)
    function decodeParams(bytes calldata params) external pure returns (EarnParams memory) {
        return abi.decode(params, (EarnParams));
    }

    // ============ View Helpers ============

    /**
     * @notice Get current exchange rate — underlying per 1e18 yield tokens
     * @param asset Which yield asset
     * @return rate Underlying tokens per 1e18 yield tokens
     *
     * asBNB:  returns slisBNB per 1e18 asBNB  (from convertToTokens)
     * asUSDF: returns USDF per 1e18 asUSDF    (from exchangePrice)
     * USDF:   returns USDT per 1e18 USDF      (from exchangePrice)
     */
    function getExchangeRate(Asset asset) external view returns (uint256 rate) {
        return _getExchangeRate(asset);
    }

    /**
     * @notice Estimate yield tokens received for a USDF/asUSDF deposit
     * @param asset      USDF or ASUSDF
     * @param amountIn   Amount of underlying
     * @return           Estimated yield tokens
     */
    function estimateSimpleDeposit(Asset asset, uint256 amountIn) external view returns (uint256) {
        require(asset != Asset.ASBNB, "Use estimateSmartMint for asBNB");
        uint256 price = ISimpleEarn(_getMinter(asset)).exchangePrice();
        // asUSDFAmount = amountIn * 1e18 / exchangePrice
        return (amountIn * EXCHANGE_PRICE_DECIMALS) / price;
    }

    /**
     * @notice Estimate asBNB received for a slisBNB deposit
     * @param amountIn   Amount of slisBNB
     * @param mintRatio  Mint ratio (0 = auto)
     * @return           Estimated asBNB received
     */
    function estimateSmartMint(uint256 amountIn, uint256 mintRatio) external view returns (uint256) {
        uint256 ratio = _resolveMintRatio(ASBNB_MINTER, mintRatio);
        return IMinterAster(ASBNB_MINTER).estimateTotalOut(amountIn, ratio);
    }

    function getSupportedAssets() external pure returns (address usdf, address asbnb, address asusdf) {
        return (USDF, ASBNB, ASUSDF);
    }

    function getMinters() external pure returns (address usdfMinter, address asbnbMinter, address asusdfMinter) {
        return (USDF_MINTER, ASBNB_MINTER, ASUSDF_MINTER);
    }

    // ============ Internal: Action Dispatch ============

    function _validateParams(EarnParams memory p) internal pure {
        require(uint8(p.asset) <= 2,       "Invalid asset");
        require(p.recipient != address(0),  "Invalid recipient");
        if (p.actionType != ActionType.CLAIM_WITHDRAW) {
            require(p.amount > 0, "Amount must be > 0");
        }
    }

    /**
     * @notice DEPOSIT: underlying → yield token
     *   asBNB  → smartMint(amount, mintRatio, minOut)
     *   asUSDF → deposit(amount)
     *   USDF   → deposit(amount)
     */
    function _deposit(EarnParams memory p) internal returns (EarnResult memory result) {
        if (p.asset == Asset.ASBNB) {
            return _depositSmartMint(p);
        } else {
            return _depositSimple(p);
        }
    }

    /**
     * @notice asBNB deposit via Minter.sol smartMint()
     */
    function _depositSmartMint(EarnParams memory p) internal returns (EarnResult memory result) {
        uint256 mintRatio  = _resolveMintRatio(ASBNB_MINTER, p.mintRatio);
        uint256 estimated  = IMinterAster(ASBNB_MINTER).estimateTotalOut(p.amount, mintRatio);
        uint256 minOut     = p.minReceived > 0 ? p.minReceived : (estimated * 99) / 100;

        IERC20(SLISBNB).forceApprove(ASBNB_MINTER, p.amount);

        // smartMint sends asBNB to this adapter
        uint256 received = IMinterAster(ASBNB_MINTER).smartMint(p.amount, mintRatio, minOut);

        IERC20(SLISBNB).forceApprove(ASBNB_MINTER, 0);

        // Forward asBNB to recipient
        IERC20(ASBNB).safeTransfer(p.recipient, received);

        result.amountIn    = p.amount;
        result.amountOut   = received;
        result.exchangeRate = _getExchangeRate(Asset.ASBNB);

        emit Deposited(Asset.ASBNB, p.amount, received, p.recipient);
    }

    /**
     * @notice asUSDF or USDF deposit via ISimpleEarn.deposit()
     * @dev deposit() mints yield tokens directly to msg.sender (this adapter)
     */
    function _depositSimple(EarnParams memory p) internal returns (EarnResult memory result) {
        address minter     = _getMinter(p.asset);
        address underlying = _getUnderlying(p.asset);
        address yieldToken = _getYieldToken(p.asset);

        // Track yield token balance before (deposit sends to msg.sender)
        uint256 yieldBefore = IERC20(yieldToken).balanceOf(address(this));

        // Approve minter to pull underlying from adapter
        IERC20(underlying).forceApprove(minter, p.amount);

        // deposit() pulls underlying and mints yield tokens to this adapter
        ISimpleEarn(minter).deposit(p.amount);

        IERC20(underlying).forceApprove(minter, 0);

        uint256 yieldAfter = IERC20(yieldToken).balanceOf(address(this));
        uint256 received   = yieldAfter - yieldBefore;

        // Slippage check
        if (p.minReceived > 0) {
            require(received >= p.minReceived, "Slippage: received less than minimum");
        }

        // Forward yield tokens to recipient
        IERC20(yieldToken).safeTransfer(p.recipient, received);

        result.amountIn    = p.amount;
        result.amountOut   = received;
        result.exchangeRate = _getExchangeRate(p.asset);

        emit Deposited(p.asset, p.amount, received, p.recipient);
    }

    /**
     * @notice WITHDRAW: asBNB only, sunset mode
     * @dev Calls Minter.sol withdraw() which burns asBNB and returns slisBNB
     */
    function _withdraw(EarnParams memory p) internal returns (EarnResult memory result) {
        require(p.asset == Asset.ASBNB, "WITHDRAW only for asBNB");

        IERC20(ASBNB).forceApprove(ASBNB_MINTER, p.amount);

        uint256 slisbnbBefore = IERC20(SLISBNB).balanceOf(address(this));

        // withdraw() burns asBNB from adapter (safeTransferFrom), sends slisBNB to adapter
        IMinterAster(ASBNB_MINTER).withdraw(p.amount);

        uint256 received = IERC20(SLISBNB).balanceOf(address(this)) - slisbnbBefore;

        IERC20(ASBNB).forceApprove(ASBNB_MINTER, 0);

        if (p.minReceived > 0) {
            require(received >= p.minReceived, "Slippage: received less than minimum");
        }

        IERC20(SLISBNB).safeTransfer(p.recipient, received);

        result.amountIn    = p.amount;
        result.amountOut   = received;
        result.exchangeRate = _getExchangeRate(Asset.ASBNB);

        emit Withdrawn(Asset.ASBNB, p.amount, received, p.recipient);
    }

    /**
     * @notice REQUEST_WITHDRAW: asUSDF/USDF queue system
     * @dev asUSDFEarn.requestWithdraw(amount) burns yield tokens, queues underlying release
     *      requestId must be tracked from the emitted event off-chain
     */
    function _requestWithdraw(EarnParams memory p) internal returns (EarnResult memory result) {
        address minter    = _getMinter(p.asset);
        address yieldToken = _getYieldToken(p.asset);

        // Approve minter to pull yield tokens from adapter
        IERC20(yieldToken).forceApprove(minter, p.amount);

        // requestWithdraw burns yield tokens and queues underlying
        ISimpleEarn(minter).requestWithdraw(p.amount);

        IERC20(yieldToken).forceApprove(minter, 0);

        result.amountIn    = p.amount;
        result.exchangeRate = _getExchangeRate(p.asset);
        // requestId = 0: must be read from emitted event off-chain

        emit WithdrawRequested(p.asset, p.amount, p.recipient);
    }

    /**
     * @notice CLAIM_WITHDRAW: asUSDF/USDF queue system
     * @dev asUSDFEarn.claimWithdraw([requestId]) releases underlying to caller
     */
    function _claimWithdraw(EarnParams memory p) internal returns (EarnResult memory result) {
        address minter     = _getMinter(p.asset);
        address underlying = _getUnderlying(p.asset);

        uint256 underlyingBefore = IERC20(underlying).balanceOf(address(this));

        uint256[] memory ids = new uint256[](1);
        ids[0] = p.requestId;
        ISimpleEarn(minter).claimWithdraw(ids);

        uint256 received = IERC20(underlying).balanceOf(address(this)) - underlyingBefore;

        if (p.minReceived > 0) {
            require(received >= p.minReceived, "Slippage: received less than minimum");
        }

        if (received > 0) {
            IERC20(underlying).safeTransfer(p.recipient, received);
        }

        result.amountOut   = received;
        result.requestId   = p.requestId;
        result.exchangeRate = _getExchangeRate(p.asset);

        emit WithdrawClaimed(p.asset, p.requestId, received, p.recipient);
    }

    // ============ Internal: Rate & Address Helpers ============

    /**
     * @notice Get exchange rate — underlying per 1e18 yield tokens
     *   asBNB:  IMinterAster.convertToTokens(1e18)  → real on-chain rate (confirmed working)
     *   asUSDF: ISimpleEarn.exchangePrice()          → USDF per asUSDF
     *   USDF:   ISimpleEarn.exchangePrice()          → USDT per USDF
     */
    function _getExchangeRate(Asset asset) internal view returns (uint256) {
        address minter = _getMinter(asset);

        if (asset == Asset.ASBNB) {
            try IMinterAster(minter).convertToTokens(1e18) returns (uint256 rate) {
                return rate;
            } catch {
                return 1e18;
            }
        } else {
            try ISimpleEarn(minter).exchangePrice() returns (uint256 price) {
                return price;
            } catch {
                return 1e18;
            }
        }
    }

    /**
     * @notice Resolve mintRatio for asBNB smartMint
     * @param minter    ASBNB_MINTER address
     * @param mintRatio User-provided value (0 = auto-calculate midpoint)
     */
    function _resolveMintRatio(address minter, uint256 mintRatio) internal view returns (uint256) {
        if (mintRatio != 0) return mintRatio;

        try IMinterAster(minter).maxSwapRatio() returns (uint256 maxSwap) {
            uint256 minSwap = IMinterAster(minter).minSwapRatio();
            uint256 minMint = DENOMINATOR - maxSwap;
            uint256 maxMint = DENOMINATOR - minSwap;
            return (minMint + maxMint) / 2;
        } catch {
            return DENOMINATOR; // Default: 100% mint, 0% swap
        }
    }

    function _getMinter(Asset asset) internal pure returns (address) {
        if (asset == Asset.USDF)  return USDF_MINTER;
        if (asset == Asset.ASBNB) return ASBNB_MINTER;
        return ASUSDF_MINTER;
    }

    function _getYieldToken(Asset asset) internal pure returns (address) {
        if (asset == Asset.USDF)  return USDF;
        if (asset == Asset.ASBNB) return ASBNB;
        return ASUSDF;
    }

    function _getUnderlying(Asset asset) internal pure returns (address) {
        if (asset == Asset.USDF)  return USDT;    // USDT → USDF
        if (asset == Asset.ASBNB) return SLISBNB; // slisBNB → asBNB
        return USDF;                               // USDF → asUSDF
    }
}
