# TaskerOnChain

## Inspiration

The inspiration for TaskerOnChain came from observing the limitations of existing DeFi automation solutions. Current platforms like Gelato and Chainlink Automation require users to write custom code or rely on centralized condition checking. We envisioned a truly decentralized, trustless task automation protocol where:

- **Conditions are embedded directly in action adapters**, eliminating the need for centralized oracles
- **Executors are economically incentivized** through staking and reputation systems
- **Task creators maintain full custody** of their funds until execution
- **Hyper-specific adapters** provide deterministic, auditable execution logic

We were inspired by the idea that DeFi users shouldn't need to monitor their positions 24/7 or trust third parties to execute time-sensitive operations like limit orders, stop losses, or yield harvesting.

## What it does

TaskerOnChain is a decentralized task automation protocol that enables **trustless execution of on-chain operations based on dynamic conditions**. Here's how it works:

### Core Functionality

1. **Task Creation**
   - Users create tasks with specific parameters: expiration, max executions, recurring intervals, and rewards
   - Funds (ETH + ERC20 tokens) are deposited into isolated TaskVault contracts
   - Each task references specific action adapters that contain both execution logic AND condition checking

2. **Executor Network**
   - Executors stake ETH (minimum 0.1 ETH) to participate in the network
   - They monitor tasks and commit to execution using a **commit-reveal scheme** to prevent front-running
   - Reputation system tracks performance (successful/failed executions)
   - Executors earn rewards + gas reimbursement for successful executions

3. **Condition-Embedded Adapters**
   - Unlike traditional systems, **conditions are NOT checked by a centralized oracle**
   - Each adapter implements a `canExecute()` function that checks if its specific conditions are met
   - Example: `UniswapUSDCETHBuyLimitAdapter` checks if ETH price ≤ limit before executing swap
   - Adapters are **hyper-specific** (one adapter per token pair + direction) for maximum reliability

4. **Execution Flow**
   ```
   User → TaskFactory (create task)
         ↓
   TaskCore + TaskVault deployed (EIP-1167 clones)
         ↓
   Executor → commits to task (anti-front-running)
         ↓
   Executor → reveals + executes
         ↓
   TaskLogicV2 → verifies proofs
         ↓
   TaskVault → calls adapter.execute()
         ↓
   Adapter → checks canExecute() internally
         ↓
   If conditions met → swap executes
   If not → execution fails, task remains active
         ↓
   RewardManager → distributes rewards to executor
   ```

5. **Security Features**
   - **Merkle proof verification** for action parameters
   - **Commit-reveal pattern** prevents executor front-running
   - **Gas limit enforcement** prevents DoS attacks
   - **Slashing mechanism** for malicious executors
   - **Non-custodial** - users maintain control via TaskVault

### Use Cases

- **Limit Orders**: Buy/sell tokens when price reaches target
- **Stop Losses**: Automatically exit positions to limit losses
- **Yield Harvesting**: Claim and compound rewards automatically
- **DCA (Dollar Cost Averaging)**: Recurring purchases at intervals
- **Liquidity Management**: Rebalance pools when ratios shift
- **Lending Protocol Automation**: Repay loans before liquidation
- **NFT Sniping**: Execute purchases when floor price drops
- **Governance Voting**: Vote automatically based on proposal content

## How we built it

### Architecture Design

1. **Modular Smart Contract System**
   - **TaskFactory**: Deploys new tasks using EIP-1167 minimal proxy pattern for gas efficiency
   - **TaskCore**: Stores task metadata and manages lifecycle (active → executing → completed)
   - **TaskVault**: Holds user funds in isolation, executes actions through adapters
   - **TaskLogicV2**: Orchestrates execution workflow with Merkle proof verification
   - **ExecutorHub**: Manages executor registration, staking, and commit-reveal
   - **RewardManager**: Calculates and distributes rewards (base + gas reimbursement + reputation bonus)
   - **ActionRegistry**: Maintains approved adapters with gas limits
   - **GlobalRegistry**: Tracks all deployed tasks

2. **Innovative Condition System**
   - **Problem**: Traditional systems use centralized oracles for condition checking
   - **Solution**: Embedded conditions in adapters themselves
   - Each adapter implements `canExecute()` which returns `(bool success, string reason)`
   - Example: `MockUniswapUSDCETHBuyLimitAdapter` checks Chainlink price feed directly
   - Adapters are **hyper-specific**: `UniswapUSDCETHBuyLimit` vs `UniswapUSDCETHSellLimit`
   - Benefits:
     - No centralized oracle dependency
     - Conditions are auditable on-chain
     - Gas-efficient (only called when executing)
     - Deterministic behavior

3. **Return Value Decoding Pattern**
   - **Critical Discovery**: Low-level `.call()` returns two values:
     - `callSuccess` = whether the call itself succeeded (didn't revert)
     - `returnData` = ABI-encoded return values from the function
   - **Bug Fixed**: We were only checking `callSuccess`, ignoring actual adapter results!
   - **Solution**: Decode return data properly:
     ```solidity
     (bool callSuccess, bytes memory returnData) = adapter.call(actionData);
     if (callSuccess && returnData.length > 0) {
         (bool actionSuccess, bytes memory result) = abi.decode(returnData, (bool, bytes));
         return actionSuccess;
     }
     return false;
     ```

4. **Technology Stack**
   - **Solidity 0.8.28**: Smart contracts with latest optimizations
   - **Hardhat**: Development environment, testing, deployment
   - **OpenZeppelin**: Battle-tested contracts (Ownable, ReentrancyGuard, SafeERC20)
   - **EIP-1167**: Minimal proxy pattern for gas-efficient task deployment
   - **Merkle Trees**: Proof verification for action parameters
   - **Chainlink**: Price feeds for condition checking (in adapters)
   - **TypeScript**: Deployment scripts and test suite
   - **Ethers.js v6**: Contract interaction library

5. **Testing Strategy**
   - Unit tests for individual contracts
   - Integration tests for full task lifecycle
   - Mock contracts for external dependencies (Uniswap, Chainlink)
   - Test scenarios:
     - ✅ Task creation with token deposits
     - ✅ Executor commit-reveal flow
     - ✅ Successful execution when conditions met
     - ✅ Failed execution when conditions NOT met
     - ✅ Reward distribution with gas reimbursement
     - ✅ Proper return value decoding

## Challenges we ran into

### 1. **Return Value Decoding Bug** (Most Critical)

**Problem**: Actions were marked as successful even when adapter conditions weren't met.

**Root Cause**:
```solidity
// WRONG - only checks if call didn't revert
(bool success, ) = adapter.call(actionData);
return success; // ❌ Always true if call doesn't revert!
```

**Discovery**: Through detailed trace analysis, we found that `success` only indicates the low-level call succeeded, not whether the adapter's logic succeeded. The actual result was encoded in the ignored return data.

**Solution**: Properly decode the return data:
```solidity
// CORRECT - decode actual adapter response
(bool callSuccess, bytes memory returnData) = adapter.call(actionData);
if (callSuccess && returnData.length > 0) {
    (bool actionSuccess, bytes memory result) = abi.decode(returnData, (bool, bytes));
    return actionSuccess;
}
return false;
```

**Impact**: This bug was in TWO critical locations:
- `TaskVault.executeTokenAction()` - calling adapters
- `TaskLogicV2._executeAction()` - calling vault

Fixing this ensured conditions are actually enforced!

### 2. **Architecture Redesign: Removing ConditionOracle**

**Initial Design**: Separate `ConditionOracle` contract for checking conditions.

**Problems**:
- Centralization risk
- Extra gas costs
- Complex configuration (adding price feeds, etc.)
- Tight coupling between oracle and adapters

**Revelation**: User asked, "Why do we need ConditionOracle if adapters check their own conditions?"

**Solution**: Completely removed ConditionOracle
- Deleted from TaskLogicV2 (import, state variable, setter)
- Removed from TaskFactory constructor
- Removed from ITaskLogic interface
- Updated deployment scripts and tests
- Conditions now entirely embedded in adapters via `canExecute()`

**Benefits**:
- Simpler architecture
- Lower gas costs
- More decentralized
- Each adapter is self-contained

### 3. **Hyper-Specific Adapter Design**

**Challenge**: Should we have one generic `UniswapAdapter` or many specific ones?

**Initial Approach**: Generic adapter that handles all Uniswap operations.

**Problem**:
- Complex condition checking logic
- Harder to audit
- Difficult to reason about behavior
- Risk of bugs due to complexity

**User Insight**: "We can be very specific with adapters since we can have multiple, rather than UniswapAdapter, we can have UniswapUSDCETHLimitOrderBuy Adapter for only buy limit orders on a particular token usdc/eth so that conditions are specific too"

**Solution**: Hyper-specific adapters
- `UniswapUSDCETHBuyLimitAdapter` - only USDC→ETH buy limit orders
- `UniswapUSDCETHSellLimitAdapter` - only ETH→USDC sell limit orders
- `UniswapWBTCUSDCBuyLimitAdapter` - only WBTC→USDC buy limit orders
- Each adapter has:
  - Hardcoded token addresses (immutable, gas-efficient)
  - Specific condition logic for its use case
  - Clear, auditable behavior

**Benefits**:
- Easier to audit (one responsibility per adapter)
- Gas-efficient (hardcoded addresses)
- Deterministic behavior
- User-friendly (clear purpose)

### 4. **Task Metadata Structure Evolution**

**Changes Made**:
- Removed `conditionHash` field (conditions now in adapters)
- Removed `conditionProof` from ExecutionParams
- Removed `ConditionChecked` event
- Simplified execution flow

**Challenge**: Ensuring backward compatibility wasn't needed since this is V2.

### 5. **Gas Optimization**

**Techniques Used**:
- EIP-1167 minimal proxy pattern for TaskCore and TaskVault
- Immutable variables in adapters for token addresses
- Efficient storage packing in structs
- Batch operations where possible

**Results**: Task creation ~973k gas, execution ~441k gas

## Accomplishments that we're proud of

1. **Novel Condition System**: Embedding conditions in adapters themselves, eliminating centralized oracle dependency while maintaining flexibility and security.

2. **Critical Bug Discovery**: Found and fixed the return value decoding bug that would have caused major issues in production. This required deep understanding of Solidity's low-level call semantics.

3. **Clean Architecture**: Achieved complete separation of concerns:
   - TaskFactory = deployment
   - TaskCore = metadata & lifecycle
   - TaskVault = fund custody
   - TaskLogicV2 = execution orchestration
   - ExecutorHub = executor management
   - Adapters = condition checking + action execution

4. **Security-First Design**:
   - Commit-reveal pattern prevents front-running
   - Merkle proof verification for action parameters
   - Non-custodial (users control funds)
   - Slashing for malicious executors
   - Gas limit enforcement

5. **Comprehensive Testing**: Full test coverage for the complete lifecycle from task creation through execution to reward distribution, including edge cases.

6. **Developer Experience**: Created excellent deployment scripts with clear output, comprehensive documentation, and easy-to-understand adapter patterns.

7. **Gas Efficiency**: Minimal proxy pattern saves ~98% deployment costs for tasks.

## What we learned

### Technical Learnings

1. **Solidity Low-Level Calls**: Deep understanding of `.call()` return values and the importance of proper ABI decoding. The distinction between call success and function success is critical.

2. **Architecture Simplicity**: Removing unnecessary components (ConditionOracle) made the system simpler, more secure, and easier to reason about. Don't add complexity until you need it.

3. **Hyper-Specificity**: For critical DeFi operations, hyper-specific contracts are better than generic ones. Easier to audit, test, and trust.

4. **EIP-1167 Proxies**: Minimal proxy pattern is incredibly gas-efficient for deploying multiple instances of the same contract.

5. **Merkle Proofs**: Efficient way to verify data integrity without storing all data on-chain.

6. **Commit-Reveal**: Essential pattern for preventing front-running in competitive execution scenarios.

### Design Learnings

1. **User-Driven Design**: Listening to user feedback ("why do we need ConditionOracle?") led to major architecture improvements.

2. **Embedded Logic**: Putting conditions directly in adapters makes each adapter self-contained and easier to reason about.

3. **Economic Incentives**: Proper reward structure (base reward + gas reimbursement + reputation bonus) ensures executor participation.

4. **Testing Philosophy**: Test the actual flow users will experience, not just individual functions. Integration tests caught bugs unit tests missed.

### Process Learnings

1. **Iterative Development**: Started with condition oracle, evolved to embedded conditions. Don't be afraid to remove code.

2. **Debugging Techniques**: Transaction traces are invaluable for understanding complex interactions. Reading event logs helped identify the return value bug.

3. **Documentation**: Writing clear explanations helps identify architectural issues. If it's hard to explain, it might be poorly designed.

## What's next for TaskerOnChain

### Short Term (Next 3 Months)

1. **Adapter Ecosystem**
   - Build reference adapters:
     - `UniswapV3RangeOrderAdapter` - Uniswap V3 range orders
     - `AaveLiquidationProtectionAdapter` - Auto-repay before liquidation
     - `CompoundYieldHarvesterAdapter` - Claim and compound COMP
     - `LidoStakingAdapter` - Auto-stake ETH when balance reaches threshold
   - Create adapter development kit with templates
   - Adapter marketplace where developers can publish and earn fees

2. **Mainnet Deployment**
   - Audit by reputable firm (OpenZeppelin, Trail of Bits)
   - Deploy to Ethereum mainnet
   - Deploy to L2s (Arbitrum, Optimism, Base)
   - Multi-chain support (Polygon, Avalanche)

3. **User Interface**
   - Web app for task creation (no code required)
   - Executor dashboard for monitoring opportunities
   - Task explorer showing all active tasks
   - Adapter marketplace UI

4. **Executor Network**
   - Decentralized executor registry
   - Reputation-based task assignment
   - MEV protection mechanisms
   - Executor pooling for smaller players

### Medium Term (3-12 Months)

1. **Advanced Features**
   - **Conditional Task Chains**: Task A triggers Task B upon completion
   - **Multi-Action Tasks**: Execute multiple actions atomically
   - **Weighted Conditions**: AND/OR logic for complex conditions
   - **Time-Based Conditions**: Execute only during specific time windows
   - **Oracle Aggregation**: Check multiple price feeds for redundancy

2. **Economic Enhancements**
   - **Dynamic Fee Market**: Task creators bid for faster execution
   - **Executor Pools**: Stake together, share rewards
   - **Insurance Fund**: Protect users against executor failures
   - **Task NFTs**: Tradeable task ownership

3. **Developer Tools**
   - **Adapter SDK**: TypeScript library for building adapters
   - **Testing Framework**: Simulate task execution locally
   - **Monitoring API**: Real-time task status updates
   - **Analytics Dashboard**: Track adapter usage, executor performance

4. **Protocol Governance**
   - **TASK Token**: Governance token for protocol decisions
   - **DAO Structure**: Community-driven development
   - **Parameter Tuning**: Adjust fees, minimums, timeouts
   - **Adapter Approval**: Vote on new adapters

### Long Term (12+ Months)

1. **Cross-Chain Execution**
   - Execute tasks across multiple chains atomically
   - Cross-chain message passing (LayerZero, Axelar)
   - Unified liquidity across chains

2. **AI-Powered Execution**
   - Machine learning for optimal execution timing
   - Gas price prediction
   - MEV opportunity detection
   - Automated strategy suggestions

3. **Institutional Features**
   - **Bulk Operations**: Create 1000s of tasks efficiently
   - **Priority Execution**: Pay premium for guaranteed timing
   - **Custom Adapters**: White-glove adapter development
   - **Compliance Tools**: Reporting for institutions

4. **Ecosystem Integration**
   - Partner with DeFi protocols (Aave, Compound, Uniswap)
   - Become infrastructure layer for automated DeFi
   - Integration with wallet providers (MetaMask, Rabby)
   - Mobile app for task management

### Research Directions

1. **Zero-Knowledge Proofs**: Private task execution
2. **Account Abstraction**: ERC-4337 integration for gasless execution
3. **Intent-Based Architecture**: Express desired outcomes, let executors find best path
4. **Verifiable Computation**: Prove execution correctness off-chain

---

## Vision

TaskerOnChain aims to become the **standard infrastructure for DeFi automation**, enabling a future where:

- Users never miss time-sensitive opportunities
- Complex strategies execute automatically without trust
- Developers build sophisticated financial products on top
- Anyone can earn by becoming an executor
- The entire DeFi ecosystem becomes more efficient and accessible

We're building the **cron for blockchain** - a trustless, decentralized task automation protocol that makes DeFi work for everyone.

---

**Built with ❤️ by the TaskerOnChain team**

*Making DeFi automation trustless, one adapter at a time.*
