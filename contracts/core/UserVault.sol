// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IUserVault.sol";
import "../interfaces/IStrategyAdapter.sol";
import "../interfaces/IStrategyRegistry.sol";
import "../interfaces/IExecutorHub.sol";

/**
 * @title UserVault
 * @notice Persistent smart account vault for a single user.
 *
 * @dev DESIGN PRINCIPLES
 *   1. No deposit functions — users send tokens directly to this address (like any wallet)
 *   2. No internal balance tracking — IERC20.balanceOf(address(this)) is truth
 *   3. Tokens never leave ownership — adapters get temporary ERC20 approval only
 *   4. Automations live here; ExecutorHub triggers them via triggerAutomation()
 *   5. Operator system: AI agent can manage automations but NEVER withdraw funds
 *   6. Spending rules: hard per-execution, per-day, per-total limits per operator+token
 *   7. StrategyRegistry is the security perimeter — only audited strategies allowed
 *
 * PERMISSION MODEL:
 *   Owner:     full control (execute, create/cancel/update automation, transfer, admin)
 *   Operator:  limited control (execute immediate, create/cancel/update automation)
 *              NO: transferToken, transferNative, transferOwnership, setOperator
 *   ExecutorHub: trigger automation only
 *
 * FUND SAFETY:
 *   - Owner can always transfer tokens out (escape hatch)
 *   - Operators can NEVER move funds to external wallets
 *   - Spending rules cap how much operators can deploy into strategies
 *   - All approvals are revoked after each execution
 */
contract UserVault is IUserVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    address public owner;
    address public strategyRegistry;
    address public executorHub;
    address private _rewardManager;

    bool private _initialized;

    // Token discovery: track WHICH tokens the vault holds (amounts via balanceOf)
    address[] private _heldTokens;
    mapping(address => bool) private _isTracked;

    // Automations: keeper-triggered recurring / conditional strategies
    mapping(uint256 => Automation) private _automations;
    uint256[] private _automationIds;
    uint256 public nextAutomationId;

    // Operators: AI agents with limited permissions
    mapping(address => Operator) private _operators;
    address[] private _operatorList;

    // Spending rules: per operator + per token limits
    mapping(address => mapping(address => SpendingRule)) private _spendingRules;

    // Nonce for replay protection
    uint256 public nonce;

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyExecutorHub() {
        if (msg.sender != executorHub) revert NotExecutorHub();
        _;
    }

    modifier onlyOwnerOrOperator() {
        if (msg.sender == owner) {
            _;  // Owner has full access
        } else if (_operators[msg.sender].active) {
            _;  // Operator has limited access (checked per-function)
        } else {
            revert NotOperator();
        }
    }

    modifier onlyRegistered(address strategy) {
        if (!IStrategyRegistry(strategyRegistry).isStrategyActive(strategy))
            revert StrategyNotRegistered(strategy);
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initialization
    // ─────────────────────────────────────────────────────────────────────────

    function initialize(
        address _owner,
        address _strategyRegistry,
        address _executorHub
    ) external {
        if (_initialized) revert AlreadyInitialized();
        if (_owner == address(0)) revert ZeroAddress();
        if (_strategyRegistry == address(0)) revert ZeroAddress();
        if (_executorHub == address(0)) revert ZeroAddress();

        _initialized = true;
        owner = _owner;
        strategyRegistry = _strategyRegistry;
        executorHub = _executorHub;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Transfer (Owner only — escape hatch, NOT for operators)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Transfer ERC20 tokens to a recipient (owner escape hatch)
    /// @dev Users don't need deposit() — they just send tokens to this address.
    ///      But they do need a way to get tokens OUT. This is it.
    function transferToken(address token, address recipient, uint256 amount)
        external onlyOwner nonReentrant
    {
        if (token == address(0)) revert ZeroAddress();
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransfer(recipient, amount);
        emit Withdrawn(token, amount);
    }

    /// @notice Transfer native ETH to a recipient (owner escape hatch)
    function transferNative(address recipient, uint256 amount)
        external onlyOwner nonReentrant
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (address(this).balance < amount) revert InsufficientBalance(address(0), amount);
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(address(0), amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Strategy Execution (Owner OR Operator with canExecuteImmediate)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Execute a single strategy immediately
    /// @dev Owner: unrestricted. Operator: must have canExecuteImmediate + spending rules
    function execute(
        address strategy,
        uint256 value,
        bytes calldata params
    )
        external
        onlyOwnerOrOperator
        onlyRegistered(strategy)
        nonReentrant
        returns (bool success, bytes memory result)
    {
        // Operator permission check
        if (msg.sender != owner) {
            if (!_operators[msg.sender].canExecuteImmediate)
                revert OperatorNotPermitted(msg.sender, "execute");
            _checkSpendingRules(msg.sender, strategy, params);
        }

        nonce++;
        (success, result) = _executeStrategy(strategy, value, params);
        emit StrategyExecuted(strategy, success, nonce);
    }

    /// @notice Execute multiple strategies atomically
    function executeBatch(Call[] calldata calls)
        external
        onlyOwnerOrOperator
        nonReentrant
        returns (bool[] memory successes)
    {
        // Operator permission check
        if (msg.sender != owner) {
            if (!_operators[msg.sender].canExecuteImmediate)
                revert OperatorNotPermitted(msg.sender, "executeBatch");
        }

        successes = new bool[](calls.length);
        nonce++;

        for (uint256 i = 0; i < calls.length; i++) {
            address strategy = calls[i].strategy;
            if (!IStrategyRegistry(strategyRegistry).isStrategyActive(strategy))
                revert StrategyNotRegistered(strategy);

            // Operator: check spending rules for each call
            if (msg.sender != owner) {
                _checkSpendingRules(msg.sender, strategy, calls[i].params);
            }

            (bool ok, bytes memory result) = _executeStrategy(
                strategy, calls[i].value, calls[i].params
            );

            if (!ok && IStrategyRegistry(strategyRegistry).isRequired(strategy)) {
                revert BatchStrategyFailed(i, result);
            }

            successes[i] = ok;
            emit StrategyExecuted(strategy, ok, nonce);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Automation Management (Owner OR Operator with permissions)
    // ─────────────────────────────────────────────────────────────────────────

    function createAutomation(
        address strategy,
        bytes calldata params,
        uint256 maxExecutions,
        string calldata label
    )
        external
        onlyOwnerOrOperator
        onlyRegistered(strategy)
        returns (uint256 automationId)
    {
        // Operator permission check
        if (msg.sender != owner) {
            if (!_operators[msg.sender].canCreateAutomation)
                revert OperatorNotPermitted(msg.sender, "createAutomation");
            _checkSpendingRules(msg.sender, strategy, params);
        }

        (bool valid, string memory err) = IStrategyAdapter(strategy).validateParams(params);
        if (!valid) revert InvalidParams(err);

        automationId = nextAutomationId++;

        _automations[automationId] = Automation({
            id: automationId,
            strategy: strategy,
            params: params,
            status: AutomationStatus.ACTIVE,
            createdAt: block.timestamp,
            executionCount: 0,
            lastExecutionTime: 0,
            maxExecutions: maxExecutions,
            label: label
        });

        _automationIds.push(automationId);

        // Register task with ExecutorHub (push-based task registry)
        IExecutorHub(executorHub).registerTask(automationId, strategy, params);

        emit AutomationCreated(automationId, strategy, label);
    }

    function updateAutomation(uint256 automationId, bytes calldata newParams)
        external onlyOwnerOrOperator
    {
        Automation storage auto_ = _automations[automationId];
        if (auto_.status != AutomationStatus.ACTIVE) revert AutomationNotActive(automationId);

        // Operator permission check
        if (msg.sender != owner) {
            if (!_operators[msg.sender].canUpdateAutomation)
                revert OperatorNotPermitted(msg.sender, "updateAutomation");
            _checkSpendingRules(msg.sender, auto_.strategy, newParams);
        }

        (bool valid, string memory err) = IStrategyAdapter(auto_.strategy).validateParams(newParams);
        if (!valid) revert InvalidParams(err);

        auto_.params = newParams;

        // Update task params in ExecutorHub
        IExecutorHub(executorHub).updateTaskParams(automationId, newParams);

        emit AutomationUpdated(automationId, newParams);
    }

    function cancelAutomation(uint256 automationId) external onlyOwnerOrOperator {
        Automation storage auto_ = _automations[automationId];

        // Operator permission check
        if (msg.sender != owner) {
            if (!_operators[msg.sender].canCancelAutomation)
                revert OperatorNotPermitted(msg.sender, "cancelAutomation");
        }

        if (auto_.status != AutomationStatus.ACTIVE) revert AutomationNotActive(automationId);
        auto_.status = AutomationStatus.CANCELLED;

        // Remove task from ExecutorHub
        IExecutorHub(executorHub).removeTask(automationId);

        emit AutomationCancelled(automationId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ExecutorHub-Triggered Automation Execution
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice ExecutorHub triggers a ready automation.
     *         This is the ONLY function ExecutorHub calls on the vault.
     *         Not called by owner or operator — keepers trigger it.
     */
    function triggerAutomation(uint256 automationId)
        external
        onlyExecutorHub
        nonReentrant
        returns (bool success)
    {
        Automation storage auto_ = _automations[automationId];
        if (auto_.status != AutomationStatus.ACTIVE) revert AutomationNotActive(automationId);

        // Check max executions
        if (auto_.maxExecutions > 0 && auto_.executionCount >= auto_.maxExecutions) {
            auto_.status = AutomationStatus.COMPLETED;

            // Remove completed task from ExecutorHub
            IExecutorHub(executorHub).removeTask(automationId);

            emit AutomationCompleted(automationId);
            return false;
        }

        // Strategy checks its own conditions
        (bool canExec, string memory reason) = IStrategyAdapter(auto_.strategy).canExecute(auto_.params);
        if (!canExec) revert ConditionsNotMet(automationId, reason);

        // Execute
        (success,) = _executeStrategy(auto_.strategy, 0, auto_.params);

        // Update state
        auto_.executionCount++;
        auto_.lastExecutionTime = block.timestamp;

        if (auto_.maxExecutions > 0 && auto_.executionCount >= auto_.maxExecutions) {
            auto_.status = AutomationStatus.COMPLETED;

            // Remove completed task from ExecutorHub
            IExecutorHub(executorHub).removeTask(automationId);

            emit AutomationCompleted(automationId);
        }

        emit AutomationTriggered(automationId, success, auto_.executionCount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Operator Management (Owner only)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set or update an operator's permissions
    /// @dev Operators can NEVER: transferToken, transferNative, transferOwnership, setOperator
    function setOperator(
        address operator,
        bool canCreateAutomation,
        bool canCancelAutomation,
        bool canUpdateAutomation,
        bool canExecuteImmediate
    ) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();

        bool wasActive = _operators[operator].active;

        _operators[operator] = Operator({
            account: operator,
            canCreateAutomation: canCreateAutomation,
            canCancelAutomation: canCancelAutomation,
            canUpdateAutomation: canUpdateAutomation,
            canExecuteImmediate: canExecuteImmediate,
            active: true
        });

        if (!wasActive) {
            _operatorList.push(operator);
        }

        emit OperatorSet(operator, canCreateAutomation, canCancelAutomation, canUpdateAutomation, canExecuteImmediate);
    }

    /// @notice Remove an operator entirely
    function removeOperator(address operator) external onlyOwner {
        _operators[operator].active = false;
        emit OperatorRemoved(operator);
    }

    /// @notice Set spending rules for an operator on a specific token
    /// @dev Hard limits: per-execution, per-day, per-total lifetime
    function setSpendingRule(
        address operator,
        address token,
        uint256 maxPerExecution,
        uint256 maxPerDay,
        uint256 maxTotal
    ) external onlyOwner {
        if (!_operators[operator].active) revert NotOperator();

        SpendingRule storage rule = _spendingRules[operator][token];
        rule.token = token;
        rule.maxPerExecution = maxPerExecution;
        rule.maxPerDay = maxPerDay;
        rule.maxTotal = maxTotal;
        rule.lastDayReset = block.timestamp;

        emit SpendingRuleSet(operator, token, maxPerExecution, maxPerDay, maxTotal);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: Spending Rule Enforcement
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @dev Check that an operator's strategy execution respects spending limits.
     *      Only applies to operators — owner is unrestricted.
     */
    function _checkSpendingRules(
        address operator,
        address strategy,
        bytes memory params
    ) internal {
        (address[] memory tokens, uint256[] memory amounts) =
            IStrategyAdapter(strategy).getTokenRequirements(params);

        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0) || amounts[i] == 0) continue;

            SpendingRule storage rule = _spendingRules[operator][tokens[i]];

            // If no rule set, operator can't spend this token
            if (rule.maxTotal == 0) revert SpendingLimitExceeded(tokens[i], amounts[i], 0);

            // Reset daily counter if day has passed
            if (block.timestamp >= rule.lastDayReset + 1 days) {
                rule.spentToday = 0;
                rule.lastDayReset = block.timestamp;
            }

            // Check per-execution limit
            if (amounts[i] > rule.maxPerExecution)
                revert SpendingLimitExceeded(tokens[i], amounts[i], rule.maxPerExecution);

            // Check per-day limit
            if (rule.spentToday + amounts[i] > rule.maxPerDay)
                revert SpendingLimitExceeded(tokens[i], amounts[i], rule.maxPerDay - rule.spentToday);

            // Check per-total limit
            if (rule.spentTotal + amounts[i] > rule.maxTotal)
                revert SpendingLimitExceeded(tokens[i], amounts[i], rule.maxTotal - rule.spentTotal);

            // Update tracking
            rule.spentToday += amounts[i];
            rule.spentTotal += amounts[i];
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: Strategy Execution Core
    // ─────────────────────────────────────────────────────────────────────────

    function _executeStrategy(
        address strategy,
        uint256 value,
        bytes memory params
    ) internal returns (bool success, bytes memory result) {
        // Step 1: Get ERC20 token requirements from adapter
        (address[] memory tokens, uint256[] memory amounts) =
            IStrategyAdapter(strategy).getTokenRequirements(params);

        // Step 2: Approve adapter to pull ERC20 tokens (never transfer out)
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] != address(0) && amounts[i] > 0) {
                uint256 balance = IERC20(tokens[i]).balanceOf(address(this));
                if (balance < amounts[i]) revert InsufficientBalance(tokens[i], amounts[i]);
                IERC20(tokens[i]).forceApprove(strategy, amounts[i]);
            }
        }

        // Step 3: Execute — for ETH strategies, forward value
        if (value > 0) {
            if (address(this).balance < value) revert InsufficientBalance(address(0), value);
            (success, result) = strategy.call{value: value}(
                abi.encodeWithSelector(IStrategyAdapter.execute.selector, address(this), params)
            );
        } else {
            (success, result) = strategy.call(
                abi.encodeWithSelector(IStrategyAdapter.execute.selector, address(this), params)
            );

            if (success && result.length > 0) {
                (success, result) = abi.decode(result, (bool, bytes));
            }
        }

        // Step 4: Revoke all approvals
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] != address(0)) {
                IERC20(tokens[i]).forceApprove(strategy, 0);
            }
        }

        // Step 5: Discover output tokens from strategy registry
        address[] memory outputTokens = IStrategyRegistry(strategyRegistry)
            .getStrategyOutputTokens(strategy);

        for (uint256 i = 0; i < outputTokens.length; i++) {
            if (outputTokens[i] != address(0)) {
                _trackToken(outputTokens[i]);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Token Tracking
    // ─────────────────────────────────────────────────────────────────────────

    function _trackToken(address token) internal {
        if (token != address(0) && !_isTracked[token]) {
            _heldTokens.push(token);
            _isTracked[token] = true;
        }
    }

    /// @notice Manually add a token to tracking (for tokens sent directly)
    function trackToken(address token) external onlyOwner {
        _trackToken(token);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────────────────

    function getPortfolio() external view returns (
        address[] memory tokens,
        uint256[] memory balances,
        uint256 nativeBalance
    ) {
        tokens = _heldTokens;
        balances = new uint256[](_heldTokens.length);
        for (uint256 i = 0; i < _heldTokens.length; i++) {
            balances[i] = IERC20(_heldTokens[i]).balanceOf(address(this));
        }
        nativeBalance = address(this).balance;
    }

    function getActiveAutomations() external view returns (Automation[] memory) {
        uint256 count;
        for (uint256 i = 0; i < _automationIds.length; i++) {
            if (_automations[_automationIds[i]].status == AutomationStatus.ACTIVE) count++;
        }

        Automation[] memory result = new Automation[](count);
        uint256 idx;
        for (uint256 i = 0; i < _automationIds.length; i++) {
            if (_automations[_automationIds[i]].status == AutomationStatus.ACTIVE) {
                result[idx++] = _automations[_automationIds[i]];
            }
        }
        return result;
    }

    function getAutomation(uint256 id) external view returns (Automation memory) {
        return _automations[id];
    }

    function getExecutableAutomations() external view returns (uint256[] memory ids) {
        uint256 count;
        uint256[] memory candidates = new uint256[](_automationIds.length);

        for (uint256 i = 0; i < _automationIds.length; i++) {
            uint256 id = _automationIds[i];
            Automation storage auto_ = _automations[id];
            if (auto_.status != AutomationStatus.ACTIVE) continue;
            if (auto_.maxExecutions > 0 && auto_.executionCount >= auto_.maxExecutions) continue;

            (bool canExec,) = IStrategyAdapter(auto_.strategy).canExecute(auto_.params);
            if (canExec) {
                candidates[count++] = id;
            }
        }

        ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = candidates[i];
        }
    }

    function getOperator(address operator) external view returns (Operator memory) {
        return _operators[operator];
    }

    function getSpendingRule(address operator, address token) external view returns (SpendingRule memory) {
        return _spendingRules[operator][token];
    }

    function getVaultInfo() external view returns (
        address vaultOwner,
        address registry,
        address hub,
        uint256 automationCount,
        uint256 currentNonce
    ) {
        return (owner, strategyRegistry, executorHub, nextAutomationId, nonce);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address old = owner;
        owner = newOwner;
        emit OwnershipTransferred(old, newOwner);
    }

    function setExecutorHub(address newHub) external onlyOwner {
        if (newHub == address(0)) revert ZeroAddress();
        address old = executorHub;
        executorHub = newHub;
        emit ExecutorHubUpdated(old, newHub);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reward Release (RewardManager only)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Release ETH reward to an executor.
    ///         Only the designated RewardManager can call this.
    ///         This is how keepers get paid for executing automations.
    function releaseReward(address executor, uint256 amount) external nonReentrant {
        if (msg.sender != _rewardManager) revert NotRewardManager();
        if (address(this).balance < amount) revert InsufficientBalance(address(0), amount);

        (bool ok,) = executor.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit RewardReleased(executor, amount);
    }

    /// @notice Get available ETH balance for reward payments
    function getAvailableForRewards() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Set the reward manager (who can call releaseReward)
    function setRewardManager(address newRewardManager) external onlyOwner {
        if (newRewardManager == address(0)) revert ZeroAddress();
        address old = _rewardManager;
        _rewardManager = newRewardManager;
        emit RewardManagerUpdated(old, newRewardManager);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Receive
    // ─────────────────────────────────────────────────────────────────────────

    receive() external payable {
        emit Deposited(address(0), msg.value);
    }
}