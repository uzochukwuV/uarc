// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IActionAdapter.sol";
import "../interfaces/IMetaYieldVault.sol";

/**
 * @title MetaYieldVaultKeeperAdapter
 * @notice TaskerOnChain adapter that triggers MetaYieldVault's autonomous operations.
 *
 * This adapter is the bridge between TaskerOnChain's permissioned keeper network
 * and MetaYieldVault's permissionless harvest() / rebalance() functions.
 *
 * Integration with TaskLogicV2:
 *   - Registered in ActionRegistry with a keeper selector
 *   - Task creator sets action.protocol = MetaYieldVault address
 *   - getTokenRequirements() returns ([USDT, 0]) — zero token transfer needed
 *     (harvest/rebalance are permissionless and need no vault funds)
 *   - canExecute() checks on-chain conditions so executors know when to act
 *
 * Two action types:
 *   ACTION_HARVEST   (0): Claim CAKE from farm, swap USDT, compound back
 *   ACTION_REBALANCE (1): Re-align allocation when drift > threshold
 *
 * Keeper incentives:
 *   Executors registered in ExecutorHub earn rewardPerExecution from the task
 *   vault (BNB deposited by the vault owner at task creation time).
 */
contract MetaYieldVaultKeeperAdapter is IActionAdapter {

    string private constant ADAPTER_NAME = "MetaYieldVaultKeeperAdapter v1";

    /// @dev BSC USDT — used as the dummy single-token requirement so TaskLogicV2
    ///      takes the single-token code path (amounts[0] = 0, no actual transfer).
    address public constant USDT = 0x55d398326f99059fF775485246999027B3197955;

    uint8 public constant ACTION_HARVEST   = 0;
    uint8 public constant ACTION_REBALANCE = 1;

    // ============ Params Struct ============

    /**
     * @param vault           MetaYieldVault address to keep
     * @param action          0 = HARVEST, 1 = REBALANCE
     * @param interval        Minimum seconds between executions (0 = no interval)
     * @param lastExecTime    Timestamp of last successful execution (caller-maintained)
     */
    struct KeeperParams {
        address vault;
        uint8   action;
        uint256 interval;
        uint256 lastExecTime;
    }

    // ============ IActionAdapter Implementation ============

    /// @inheritdoc IActionAdapter
    function name() external pure override returns (string memory) {
        return ADAPTER_NAME;
    }

    /**
     * @notice Execute harvest() or rebalance() on the target MetaYieldVault.
     * @dev Called by TaskVault.executeTokenAction() via TaskLogicV2.
     *      The `taskVault` parameter is the TaskerOnChain task vault (not MetaYieldVault).
     */
    function execute(address /*taskVault*/, bytes calldata params)
        external override
        returns (bool success, bytes memory result)
    {
        KeeperParams memory p = abi.decode(params, (KeeperParams));

        if (p.action == ACTION_HARVEST) {
            try IMetaYieldVault(p.vault).harvest() {
                emit ActionExecuted(p.vault, p.vault, true, abi.encode("harvest", block.timestamp));
                return (true, abi.encode("harvest", block.timestamp));
            } catch Error(string memory reason) {
                emit ActionExecuted(p.vault, p.vault, false, bytes(reason));
                return (false, bytes(reason));
            } catch {
                emit ActionExecuted(p.vault, p.vault, false, bytes("harvest reverted"));
                return (false, bytes("harvest reverted"));
            }
        }

        if (p.action == ACTION_REBALANCE) {
            try IMetaYieldVault(p.vault).rebalance() {
                emit ActionExecuted(p.vault, p.vault, true, abi.encode("rebalance", block.timestamp));
                return (true, abi.encode("rebalance", block.timestamp));
            } catch Error(string memory reason) {
                emit ActionExecuted(p.vault, p.vault, false, bytes(reason));
                return (false, bytes(reason));
            } catch {
                emit ActionExecuted(p.vault, p.vault, false, bytes("rebalance reverted"));
                return (false, bytes("rebalance reverted"));
            }
        }

        return (false, bytes("Unknown action"));
    }

    /**
     * @notice Check whether the keeper action should be triggered now.
     * @dev Executors call this off-chain before submitting a transaction.
     *
     *   HARVEST  ready when: pendingCake >= minHarvestCake AND interval elapsed
     *   REBALANCE ready when: drift >= rebalanceDriftBps AND vault non-empty
     */
    function canExecute(bytes calldata params)
        external view override
        returns (bool canExec, string memory reason)
    {
        KeeperParams memory p = abi.decode(params, (KeeperParams));

        if (p.vault == address(0)) {
            return (false, "Invalid vault address");
        }

        // Interval guard
        if (p.interval > 0 && block.timestamp < p.lastExecTime + p.interval) {
            return (false, "Interval not elapsed");
        }

        if (p.action == ACTION_HARVEST) {
            // Upgrade 3: delegate to vault's on-chain gas-profitability check
            if (!IMetaYieldVault(p.vault).shouldHarvest()) {
                return (false, "Harvest not gas-profitable");
            }
            return (true, "Harvest ready");
        }

        if (p.action == ACTION_REBALANCE) {
            uint256 nav = IMetaYieldVault(p.vault).totalAssets();
            if (nav == 0) {
                return (false, "Vault is empty");
            }
            (uint256 earnAlloc,,) = IMetaYieldVault(p.vault).currentAllocation();
            uint256 earnTarget    = IMetaYieldVault(p.vault).earnBps();
            uint256 driftThreshold = IMetaYieldVault(p.vault).rebalanceDriftBps();

            uint256 drift = earnAlloc > earnTarget
                ? earnAlloc - earnTarget
                : earnTarget - earnAlloc;

            if (drift < driftThreshold) {
                return (false, "Allocation within target");
            }
            return (true, "Rebalance needed");
        }

        return (false, "Unknown action");
    }

    /**
     * @notice Returns a single USDT token requirement with zero amount.
     * @dev TaskLogicV2._executeAction() requires tokens.length == 1 to take the
     *      single-token execution path. We declare USDT with amount=0 so the
     *      TaskVault calls executeTokenAction(USDT, adapter, 0, ...) — which
     *      approves 0 tokens and forwards the call without any fund movement.
     *      harvest() and rebalance() are permissionless; no vault funds required.
     */
    function getTokenRequirements(bytes calldata /*params*/)
        external pure override
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        tokens  = new address[](1);
        amounts = new uint256[](1);
        tokens[0]  = USDT;
        amounts[0] = 0; // zero transfer — permissionless calls need no funds
    }

    /// @inheritdoc IActionAdapter
    function validateParams(bytes calldata params)
        external pure override
        returns (bool isValid, string memory errorMessage)
    {
        if (params.length < 4 * 32) {
            return (false, "Params too short");
        }
        KeeperParams memory p = abi.decode(params, (KeeperParams));
        if (p.vault == address(0)) {
            return (false, "Invalid vault address");
        }
        if (p.action > ACTION_REBALANCE) {
            return (false, "Unknown action type");
        }
        return (true, "");
    }

    /// @inheritdoc IActionAdapter
    function isProtocolSupported(address /*protocol*/)
        external pure override
        returns (bool)
    {
        // Any MetaYieldVault deployment is supported
        return true;
    }
}
