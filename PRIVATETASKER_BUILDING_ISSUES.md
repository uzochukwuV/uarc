# PrivateTasker: Progressive Build Plan & GitHub Issues

This document maps the PrivateTasker extension to TaskerOnChain into a sequence of executable GitHub issues, organized by wave and aligned to Fhenix evaluation checkpoints.

**Key Principle:** PrivateTasker extends TaskerOnChain (doesn't fork it). Users can choose public OR private automation per task. Same executor network, same adapters, same vault infrastructure. Privacy is opt-in.

---

## 📋 Wave 1 (Ideation): Encrypted Task State POC

**Timeline:** March 21-28, 2026  
**Goal:** Prove encrypted task parameters can be stored, retrieved, and decrypted on-chain  
**Evaluation:** March 28-30 (Demo + architecture review)  
**Grant:** $3,000

---

### Issue #1: Environment & Tooling Setup

**Title:** `[Wave 1] Set up Fhenix SDK and local encrypted compute environment`

**Description:**
Establish development environment for FHE smart contract development **alongside existing TaskerOnChain setup**:
- Install Fhenix SDK (CoFHE library and Hardhat plugin) into existing project
- Verify Hardhat integration works with existing TaskerOnChain config (no breaking changes)
- Confirm `euint256` type imports compile correctly
- Validate local FHE computation (no testnet dependency for iteration)
- **Key:** Existing TaskerOnChain tests must still pass

**Definition of Done:**
- [ ] `package.json` updated with `@cofhe/sdk` and `@cofhe/react` dependencies
- [ ] Hardhat plugin registered in `hardhat.config.ts`
- [ ] Test file compiles: `npx hardhat test contracts/core/PrivateTaskCore.test.ts` (empty)
- [ ] Documentation: `DEV_SETUP.md` with Fhenix-specific steps
- [ ] Team can run `npm run test` successfully

**Effort:** 2-4 hours  
**Owner:** Lead Dev  
**Acceptance Criteria:** All team members can compile + run empty PrivateTaskCore test

---

### Issue #2: PrivateTaskCore Contract - Basic Structure

**Title:** `[Wave 1] Create PrivateTaskCore with encrypted reward storage`

**Description:**
Implement new encrypted task contract (sits alongside existing TaskCore):

```solidity
// NEW contract (PrivateTaskCore.sol)
struct PrivateTaskMetadata {
  euint256 rewardPerExecution;        // Encrypted reward
  uint256 expiresAt;                  // Public expiration
  uint256 maxExecutions;              // Public execution limit
  uint256 executionCount;             // Public counter
}

// Extends ITaskCore where possible
// NEW methods for encryption/decryption
```

**Architecture:**
- NEW contract `PrivateTaskCore.sol` (does NOT modify existing `TaskCore.sol`)
- Implements `ITaskCore` interface (for compatibility with existing TaskLogic)
- Adds separate `IPrivateTaskCore` for encryption-specific methods
- Maintains full backward compatibility: public TaskCore still works unchanged

**Definition of Done:**
- [ ] Contract compiles with Fhenix SDK imports
- [ ] Constructor initializes with encrypted reward blob
- [ ] State variables verified: reward is `euint256`, max execution is `uint256`
- [ ] Getter methods exist (encrypted vs public)
- [ ] Unit tests pass: `test/PrivateTaskCore.test.ts`

**Effort:** 4-6 hours  
**Owner:** Lead Dev  
**Acceptance Criteria:** Contract compiles, unit tests pass, encrypted storage works

---

### Issue #3: Encrypted State Retrieval & Decryption Logic

**Title:** `[Wave 1] Implement permit-based reward decryption`

**Description:**
Build the permission layer that allows controlled decryption:

```solidity
// Permit system
struct DecryptionPermit {
  uint256 taskId;
  address recipient;              // Who can decrypt
  bool canView;                   // View encrypted data
  bool canDecrypt;                // Actually decrypt
  uint64 expiresAt;               // Permit expiration
}

// Functions to implement
- grantDecryptionPermit(taskId, executor, expiresAt)
- requestDecryptionProof(taskId) → requires valid permit
- decryptReward(encryptedReward, proof) → euint256 → uint256
```

**Key Design Decisions:**
- Permit is off-chain signed (executor provides signature)
- Decryption happens in contract (FHE library handles decrypt)
- Proof of decryption logged (non-repudiation)

**Definition of Done:**
- [ ] `DecryptionPermit` struct defined and validated
- [ ] `grantDecryptionPermit()` emits event with permit details
- [ ] Executor can provide valid permit signature
- [ ] `decryptReward()` correctly converts `euint256` → `uint256`
- [ ] Tests pass: permit grant, signature validation, decryption

**Effort:** 6-8 hours  
**Owner:** Crypto Dev (elliptic curve signing)  
**Acceptance Criteria:** Proof-of-concept executor can decrypt owned task rewards

---

### Issue #4: Extend TaskFactory to Support Both Task Types

**Title:** `[Wave 1] Extend TaskFactory with PrivateTask creation path (no breaking changes)`

**Description:**
Expand factory to deploy both TaskCore (public) and PrivateTaskCore (private) dynamically:

```solidity
// EXISTING function (unchanged)
function createTask(
  TaskParams calldata params,
  ActionParams[] calldata actions
) external payable returns (uint256 taskId, address taskCore, address taskVault)

// NEW function (added, doesn't touch existing code)
function createPrivateTask(
  TaskParams calldata params,
  euint256 encryptedReward,
  ActionParams[] calldata actions
) external payable returns (uint256 taskId, address taskCore, address taskVault)

// Behavior:
- createTask() deploys TaskCore clone (current behavior, unchanged)
- createPrivateTask() deploys PrivateTaskCore clone (new path)
- Both paths use same executor registry, same vault pattern
- Public + private tasks can coexist in same factory
```

**Factory Changes:**
- Add PrivateTaskCore implementation address
- Add createPrivateTask() function
- Reuse existing validation + deployment logic
- No modifications to createTask() logic

**Definition of Done:**
- [ ] `createPrivateTask()` function added to TaskFactory
- [ ] Deploys PrivateTaskCore proxy correctly
- [ ] Existing `createTask()` still works (no regression)
- [ ] Event emitted: `PrivateTaskCreated(taskId, creator, taskCore)`
- [ ] Integration tests: both public + private tasks can coexist

**Effort:** 3-4 hours  
**Owner:** Lead Dev  
**Acceptance Criteria:** Create 3 public tasks + 3 private tasks in same transaction, all succeed

---

### Issue #5: Testnet Deployment & POC Demo Script

**Title:** `[Wave 1] Deploy PrivateTaskCore to Fhenix Sepolia testnet`

**Description:**
Get the POC live and demonstrate encrypted state:

```typescript
// demo-private-task.ts
1. Deploy PrivateTaskCore reference implementation
2. Create 3 sample private tasks with encrypted rewards:
   - 0.5 ETH (encrypted)
   - 2.0 ETH (encrypted)
   - 10.0 ETH (encrypted)
3. Retrieve encrypted state (see it's not human-readable)
4. Grant decryption permit to executor
5. Decrypt one reward (prove it matches)
6. Log gas usage for all operations
```

**Definition of Done:**
- [ ] Contracts deployed to Sepolia (tx hash recorded)
- [ ] Demo script creates 3+ private tasks
- [ ] Verification: encrypted reward ≠ plaintext
- [ ] Decryption permit issued and validated
- [ ] Decrypted value matches original
- [ ] Gas report: total cost for create + decrypt
- [ ] Screenshots/video in PR description

**Effort:** 3-4 hours  
**Owner:** Ops/QA  
**Acceptance Criteria:** Testnet transactions verified, demo shows encrypted → decrypted flow

---

### Issue #6: Wave 1 Evaluation Package

**Title:** `[Wave 1] Prepare evaluation docs: architecture, testnet proof, next steps`

**Description:**
Assemble package for Fhenix team review on March 28-30:

**Documents to include:**
1. **Architecture Diagram** (`wave1-architecture.md`)
   - Shows PrivateTaskCore in TaskerOnChain ecosystem
   - Data flow: create → encrypt → store → permit → decrypt

2. **Testnet Evidence** (`wave1-testnet-results.md`)
   - Deployed contract addresses
   - 3+ sample private task IDs
   - Gas breakdown: deployment, creation, decryption
   - Decryption permit flow screenshots

3. **code Review Checklist** (`wave1-code-review.md`)
   - Security review of permit system
   - FHE library usage correctness
   - Gas efficiency notes

4. **Wave 2 Proposal** (`wave1-wave2-plan.md`)
   - PrivateActionAdapter design (encrypted action params)
   - Multi-executor scenario
   - Expected challenges + mitigation

**Definition of Done:**
- [ ] All 4 docs drafted, reviewed internally
- [ ] Testnet contracts/transactions linked
- [ ] No open questions about Wave 1 implementation
- [ ] Wave 2 plan approved by team leads
- [ ] Presentation slides (3-5 slides for live eval)

**Effort:** 4 hours  
**Owner:** Tech Lead + Dev  
**Acceptance Criteria:** Evaluation package ready by March 28, 2:00 PM

---

## 📋 Wave 2 (Build): Encrypted Action Parameters & Adapters

**Timeline:** March 30 - April 6, 2026  
**Goal:** Implement encrypted action parameters where strategies hide (MEV protection layer)  
**Evaluation:** April 6-8 (Architecture + live testnet demo)  
**Grant:** $5,000

---

### Issue #7: PrivateActionAdapter Interface Design

**Title:** `[Wave 2] Design PrivateActionAdapter interface (extends public IActionAdapter)`

**Description:**
Define how action adapters optionally handle encrypted condition logic:

```solidity
interface IPrivateActionAdapter is IActionAdapter {
  // NEW: condition check on encrypted data
  function canExecuteEncrypted(
    euint256 encryptedParams,
    bytes calldata proof
  ) external view returns (bool canExecute);

  // NEW: get token requirements from encrypted params
  function getTokenRequirementsEncrypted(euint256 encryptedParams)
    external view returns (address[] memory tokens, uint256[] memory amounts);

  // INHERITED from IActionAdapter (unchanged)
  function execute(address vault, bytes calldata params)
    external returns (bool success, bytes memory result);
  function canExecute(bytes calldata params)
    external view returns (bool canExecute, string memory reason);
}
```

**Key Design:**
- Adapters support **both** public path (old) + encrypted path (new)
- Existing public adapters (swap, liquidation) still work unchanged
- NEW adapters can optionally implement IPrivateActionAdapter
- canExecuteEncrypted() returns bool only (no condition details leaked)
- Proof ties execution to encrypted params (prevents param swapping)

**Definition of Done:**
- [ ] Interface defined in `IPrivateActionAdapter.sol`
- [ ] Extends `IActionAdapter` (no breaking changes)
- [ ] Function signatures match Fhenix SDK best practices
- [ ] Detailed NatSpec for each method
- [ ] Design review passed by core team

**Effort:** 2-3 hours  
**Owner:** Protocol Architect  
**Acceptance Criteria:** LGTM from team, ready for adapter implementation

---

### Issue #8: PrivateSwapAdapter (Encrypted DCA/Limit Order)

**Title:** `[Wave 2] Implement PrivateSwapAdapter for encrypted swap conditions`

**Description:**
Create first encrypted adapter: DCA with hidden amounts/prices.

```solidity
// Private swap parameters (encrypted)
struct PrivateSwapParams {
  euint256 amountIn;              // Encrypted input amount
  euint256 minAmountOut;          // Encrypted minimum output
  euint256 maxPriceUSD;           // Encrypted price ceiling
  address tokenIn;                // Public (for routing)
  address tokenOut;               // Public (for routing)
}

// Implementation:
- canExecuteEncrypted() → checks if current price < maxPriceUSD (encrypted comparison)
- execute() → pulls encrypted amount, validates against min output
- getTokenRequirementsEncrypted() → returns masked token requirements
```

**Real-World Example:**
```
User wants: "Buy 5 ETH when price dips to $1,800, up to $1,850"
Public: adapter name, token pair = visible
Private: amounts (5) and prices (1800, 1850) = encrypted
Result: MEV hunter doesn't know to front-run, even though task is public
```

**Definition of Done:**
- [ ] `PrivateSwapAdapter.sol` implements `IPrivateActionAdapter`
- [ ] Unit tests: encrypted comparison logic, token requirements
- [ ] Integration test: end-to-end private swap in PrivateTask
- [ ] Gas report: vs public adapter overhead
- [ ] Testnet deployment + sample execution

**Effort:** 6-8 hours  
**Owner:** Adapter Dev  
**Acceptance Criteria:** Private swap executes with hidden params on testnet

---

### Issue #9: PrivateLiquidationAdapter (Sealed Bid Execution)

**Title:** `[Wave 2] Implement PrivateLiquidationAdapter for confidential auctions`

**Description:**
Second encrypted adapter: liquidation auctions with hidden bid amounts.

```solidity
// Private liquidation parameters (encrypted)
struct PrivateLiquidationParams {
  euint256 bidAmount;            // Encrypted bid amount
  euint256 minCollateralRatio;   // Encrypted acceptable ratio
  address protocol;              // Public (which lending protocol)
  address account;               // Public (who gets liquidated)
}

// Implementation:
- canExecuteEncrypted() → checks if account health < minRatio (encrypted)
- execute() → submits encrypted bid to auction contract
- Multiple liquidators can bid → best (highest) encrypted bid wins
```

**Real-World Example:**
```
Liquidation auction:
- 100 ETH collateral being auctioned
- Public: what's being sold
- Private: liquidator bids (confidential amounts) → highest wins
- Result: fair-price discovery, no bidding coordination
```

**Definition of Done:**
- [ ] `PrivateLiquidationAdapter.sol` implements `IPrivateActionAdapter`
- [ ] Tests: multi-executor scenario, bid comparison logic
- [ ] Testnet deployment to mock lending protocol
- [ ] Demonstrate: 3+ liquidators bid on same collateral, highest wins

**Effort:** 6-8 hours  
**Owner:** Adapter Dev  
**Acceptance Criteria:** Auction with encrypted bids, winner correctly selected

---

### Issue #10: PrivateTaskLogic Integration (New Execution Path)

**Title:** `[Wave 2] Add executePrivateTask() to TaskLogic (no changes to executeTask)`

**Description:**
Extend execution orchestrator with private task handling (public execution path untouched):

```solidity
// EXISTING (unchanged)
function executeTask(ExecutionParams calldata params)
  external returns (ExecutionResult memory) { ... }

// NEW function (for private tasks only)
function executePrivateTask(
  ExecutionParams calldata params,
  euint256 encryptedActionParams,
  bytes calldata decryptionProof
) external returns (ExecutionResult memory) {
  // 1. Validate executor has permit to decrypt
  // 2. Call adapter.canExecuteEncrypted(encryptedActionParams, proof)
  // 3. If true, execute adapter.execute() with decrypted params
  // 4. Verify output matches expectations
  // 5. Distribute reward (from PrivateTaskCore)
  // 6. Emit execution result (status only, not amounts)
}
```

**Architecture:**
- NEW function, doesn't modify existing executeTask()
- Public tasks use executeTask() (unchanged loop)
- Private tasks use executePrivateTask() (new encrypted loop)
- Same TaskLogic contract handles both

**Definition of Done:**
- [ ] `executePrivateTask()` function added to TaskLogicV2
- [ ] Validates executor permit before decryption
- [ ] Falls back to public `executeTask()` if task is public type
- [ ] Tests: full private execution flow (create → execute → complete)
- [ ] Tests: public tasks still work unchanged (regression test)
- [ ] Gas breakeven: encrypted execution within 2x public cost

**Effort:** 4-6 hours  
**Owner:** Lead Dev  
**Acceptance Criteria:** Private tasks execute end-to-end, action params never exposed

---

### Issue #11: Wave 2 Testnet Campaign

**Title:** `[Wave 2] Run testnet campaign: 10+ private tasks, multiple adapters`

**Description:**
Prove system works at scale with real execution diversity:

```
Deployment:
- PrivateSwapAdapter, PrivateLiquidationAdapter live
- 10+ private swap tasks created
- 5+ private liquidation tasks created
- Multiple executors competing

Execution:
- Execute 5+ private swaps (test different params)
- Execute 3+ private liquidations (simulate auction)
- Measure throughput, gas, failure modes
- Verify MEV protection: no frontrun attempts detected
```

**Success Metrics:**
- All 15+ private tasks created successfully
- 8+ executed without errors
- No param leakage observed (monitoring testnet)
- Average execution cost: <2x public equivalent
- Time-to-execution: comparable to public tasks

**Definition of Done:**
- [ ] Testnet campaign executed, documented
- [ ] Transaction hashes for all creates + executions
- [ ] Gas breakdown report
- [ ] MEV analysis: searching infrastructure didn't front-run private tasks (vs public baseline)
- [ ] No critical bugs or regressions

**Effort:** 4-6 hours (execution + monitoring)  
**Owner:** QA + Analyst  
**Acceptance Criteria:** 80%+ execution success rate, no MEV leakage detected

---

### Issue #12: Wave 2 Evaluation Package

**Title:** `[Wave 2] Prepare evaluation docs: architecture review, testnet results, roadmap`

**Description:**
Second evaluation checkpoint materials:

**Documents:**
1. **Architecture Update** (`wave2-architecture.md`)
   - PrivateActionAdapter design + decision rationale
   - Encrypted param flow through adapters
   - Multi-executor coordination (who can decrypt what)

2. **Testnet Campaign Results** (`wave2-testnet-results.md`)
   - Task creation/execution statistics
   - Gas breakdown: private vs public
   - MEV protection proof (analysis of whether frontrunners could have acted)
   - Sample task IDs + data

3. **Security Considerations** (`wave2-security.md`)
   - Fhenix library audit status
   - Potential attack vectors (permit replay, param tampering)
   - Mitigations in place

4. **Wave 3+ Roadmap** (`wave2-wave3-plan.md`)
   - Executor permission batching (multiple tasks per permit)
   - Gas optimization strategies
   - Mainnet preparation checklist

**Definition of Done:**
- [ ] Docs drafted and internally reviewed
- [ ] Testnet evidence compiled
- [ ] Security discussion scheduled with Fhenix team
- [ ] Presentation (5-7 slides) for April 6-8 eval

**Effort:** 3 hours  
**Owner:** Tech Lead  
**Acceptance Criteria:** Evaluation package ready by April 6, 2:00 PM

---

## 📋 Wave 3 (Marathon): Executor Permissions & Batching

**Timeline:** April 8 - May 8, 2026 (30-day sprint)  
**Goal:** Multi-executor coordination with batched encrypted execution  
**Evaluation:** May 8-11 (Performance benchmarks)  
**Grant:** $12,000

---

### Issue #13: PrivateExecutorHub Permission System

**Title:** `[Wave 3-A] Extend ExecutorHub with privacy permits (no changes to existing executor registration)`

**Description:**
Add permission layer for executor decryption rights (reuses existing ExecutorHub):

```solidity
// EXISTING ExecutorHub (unchanged)
function registerExecutor() external payable { ... }
function unregisterExecutor() external { ... }
mapping(address => Executor) public executors;

// NEW in ExecutorHub
struct ExecutionPermit {
  uint256 taskId;
  address executor;
  bytes32 encryptionKeyCommit;   // Commitment to key used
  uint64 expiresAt;
  uint64 maxExecutions;           // Permit limit (prevent overuse)
  bytes creatorSignature;         // Task creator's authorization
}

// NEW functions (for private tasks)
function issuePermit(taskId, executor, duration) → callable by task creator
function revokePermit(taskId, executor) → caller: creator || executor
function validatePermit(permit) → check signature + expiration
function getActivePermits(executor) → list of tasks executor can decrypt
```

**Architecture:**
- ExecutorHub extended (doesn't fork)
- Public executors (existing) remain unchanged
- NEW: executors can request permits for private tasks
- Permits are off-chain-signed (task creator authorizes)

**Definition of Done:**
- [ ] Permit system added to ExecutorHub (extends, doesn't replace)
- [ ] Permit signature validation works (ECDSA)
- [ ] Tests: issue, validate, revoke, expire permits
- [ ] Tests: public executors unaffected (existing functions still work)
- [ ] Gas: <100k per permit issued
- [ ] Documentation: when to use permits vs public execution

**Effort:** 6-8 hours  
**Owner:** Crypto Dev  
**Acceptance Criteria:** Executor can only act on tasks with valid permits

---

### Issue #14: Batched Encrypted Task Execution

**Title:** `[Wave 3-B] Implement batch execution for multiple private tasks per block`

**Description:**
Allow single transaction to execute multiple private tasks (gas efficiency):

```solidity
function executeBatchPrivateTasks(
  BatchExecutionParams[] calldata executions
) external returns (BatchExecutionResult[] memory results)

// Each execution:
struct BatchExecutionParams {
  uint256 taskId;
  euint256 encryptedActionParams;
  bytes decryptionProof;
  bytes executorPermit;
}

// Results aggregated:
struct BatchExecutionResult {
  uint256 taskId;
  bool success;
  uint256 gasUsed;
  uint256 rewardPaid;
}
```

**Benefits:**
- **Gas savings:** Amortize permit validation + decryption overhead
- **MEV efficiency:** One searcher/executor can do 10+ tasks at once
- **Throughput:** Match batch auction patterns (Flashbots style)

**Definition of Done:**
- [ ] `executeBatchPrivateTasks()` in PrivateTaskLogic
- [ ] Tests: batch up to 10 tasks, all succeed
- [ ] Partial failure handling: execute all, report success/fail per task
- [ ] Gas optimization: shared decryption context (reuse curves if possible)
- [ ] Gas report: 10-task batch vs 10 individual executions

**Effort:** 6-10 hours  
**Owner:** Lead Dev + Gas Optimizer  
**Acceptance Criteria:** Batching achieves 40%+ gas savings vs individual execution

---

### Issue #15: Multi-Protocol Adapter Coverage

**Title:** `[Wave 3-C] Implement PrivateDCAAdapter and PrivateYieldAdapter`

**Description:**
Two more encrypted adapters for common use cases:

**PrivateDCAAdapter** (Dollar-Cost Averaging):
```solidity
// Encrypted params
struct PrivateDCAParams {
  euint256 amountPerPeriod;       // Weekly DCA amount (hidden)
  euint256 minPriceUSD;            // Won't buy above (hidden)
  uint256 periodSeconds;           // Weekly = 7 days (public)
  address token;                   // Buy what (public)
}
```

**PrivateYieldAdapter** (Yield farming with hidden APY thresholds):
```solidity
struct PrivateYieldParams {
  euint256 depositAmount;          // Hidden stake amount
  euint256 minAPY;                 // Only if APY > threshold (hidden)
  address protocol;                // Which yield source (public)
  address yieldToken;              // Earn what (public)
}
```

**Definition of Done:**
- [ ] Both adapters implement `IPrivateActionAdapter`
- [ ] Unit tests + integration tests
- [ ] Testnet deployment
- [ ] Sample tasks created + executed for each
- [ ] Document adapter-specific conditions (what gets encrypted vs public)

**Effort:** 8-10 hours  
**Owner:** Adapter Devs (2 people)  
**Acceptance Criteria:** 4 adapters live (swap, liquidation, DCA, yield), all tested

---

### Issue #16: Performance Benchmarking & Gas Optimization

**Title:** `[Wave 3-D] Benchmark vs public execution, optimize gas bottlenecks`

**Description:**
Comprehensive performance analysis:

```
Metrics to measure:
- Private task creation cost vs public (+% overhead)
- Single private execution cost vs public (+% overhead)  
- Batch execution cost per task (10, 50, 100 task batches)
- Permit validation overhead
- Decryption operation cost (euint256 operations)
- Memory usage (stack depth)

Targets:
- Single execution: <2x public cost
- Batch 10: <1.5x public cost  
- Batch 100: <1.2x public cost
- Deploy all, operate competitively with public tasks
```

**Optimization approaches:**
- Cache decryption results where safe
- Batch-specific curves (amortize ECDSA)
- Memory-efficient FHE operation circuits
- Precompile analysis

**Definition of Done:**
- [ ] Benchmark report: private vs public across all operations
- [ ] Gas bottleneck identification (datasheet)
- [ ] 3-5 optimization pull requests submitted + merged
- [ ] Before/after gas comparison
- [ ] Mainnet simulation (goerli fork) with realistic load

**Effort:** 8-12 hours  
**Owner:** Gas Optimization Specialist  
**Acceptance Criteria:** All targets met (2x private, 1.2x batch)

---

### Issue #17: Institutional Compliance Framework

**Title:** `[Wave 3-E] Design and document compliance flows for treasury/audit`

**Description:**
Enable institutional users (payroll, treasury, compliance audits):

**Compliance Features to Document:**
1. **Audit Permit System** — auditor can decrypt historical tasks
   ```solidity
   function issueAuditPermit(address auditor, bytes calldata scope)
     external onlyCreator
   // Auditor can view execution proof + decrypted params (off-chain UI)
   ```

2. **Transaction Immutability Proof** — prove task executed as designed
   - Commitment to encrypted params
   - Proof-of-execution on encrypted data
   - Final auditable transaction hash

3. **Compliance Documentation** (`COMPLIANCE_GUIDE.md`)
   - How treasury teams use PrivateTasker
   - Regulatory alignment (GDPR, SOX)
   - Audit trail generation

4. **Sample Use Case: Payroll Disbursement**
   ```
   Example: Company pays contractors monthly programmatically
   - Employee addresses (public)
   - Payment amounts (encrypted) → private task
   - Execution date (public) → task expires after
   - Audit: CFO can decrypt to prove payments made
   - Compliance: No leaked payroll info in mempool
   ```

**Definition of Done:**
- [ ] Audit permit system designed + implemented
- [ ] Compliance guide drafted (treasury operations, audit flow)
- [ ] Sample payroll task created + executed on testnet
- [ ] Audit UI prototype (show encrypted → decrypted for auditor)
- [ ] Reviewed by compliance/legal advisor

**Effort:** 6-8 hours (design + documentation)  
**Owner:** Product + Compliance  
**Acceptance Criteria:** Institutional use case documented, auditable on testnet

---

### Issue #18: Wave 3 Evaluation Package

**Title:** `[Wave 3] Prepare evaluation docs: performance benchmarks, roadmap to mainnet`

**Description:**
Third checkpoint + mainnet readiness discussion:

**Documents:**
1. **Performance Report** (`wave3-benchmarks.md`)
   - Detailed gas analysis vs public execution
   - Batch efficiency metrics
   - Comparison to centralized solutions

2. **Compliance & Audit Framework** (`wave3-compliance.md`)
   - Institutional use cases enabled
   - Audit trail design
   - Regulatory considerations

3. **Security Audit Prep** (`wave3-audit-prep.md`)
   - Code coverage metrics
   - Test results
   - Known limitations + mitigations
   - Recommended audit firms

4. **Mainnet Readiness Checklist** (`wave3-mainnet-plan.md`)
   - ✓ Code (frozen, audit-ready)
   - ✓ Security (no known critical issues)
   - ✓ Performance (meets targets)
   - ⏰ Integration tests (real DEX integrations)
   - ⏰ Governance (permission model finalized)
   - ⏰ Incident response (rollback / pause procedures)

**Definition of Done:**
- [ ] All docs complete + reviewed
- [ ] Mainnet target date proposed (June or July 2026)
- [ ] Audit firm RFP sent (internal review against top firms)
- [ ] Presentation (7-10 slides) for May 8-11 eval

**Effort:** 4 hours  
**Owner:** Tech Lead  
**Acceptance Criteria:** Mainnet path clear, audit in motion by May 11

---

## 📋 Wave 4 (Refinement): Gas Optimization & Mainnet Prep

**Timeline:** May 11-20, 2026  
**Goal:** Audit-ready code, production infrastructure, final optimization  
**Evaluation:** May 20-23 (Production readiness review)  
**Grant:** $14,000

---

### Issue #19: Smart Contract Security Audit Preparation

**Title:** `[Wave 4-A] Prepare codebase for third-party security audit`

**Description:**
Get contracts audit-ready:

**Deliverables:**
- [ ] Full code documentation (NatSpec on every function)
- [ ] Design document explaining threat model
- [ ] Known limitations list
- [ ] Fuzz testing results (Echidna / worst-case scenarios)
- [ ] Formal verification attempt on critical functions (permit validation, decryption)

**Definition of Done:**
- Contract code frozen (no new features after this)
- 95%+ test coverage
- All Slither findings addressed
- Audit firm selected + kick-off scheduled
- RFP response from auditor(s) received

**Effort:** 6-8 hours  
**Owner:** Lead Dev + QA  
**Acceptance Criteria:** Audit contract signed, kickoff scheduled for week of May 20

---

### Issue #20: Production Deployment Infrastructure

**Title:** `[Wave 4-B] Set up mainnet deployment infrastructure (testnet + staging)`

**Description:**
Prepare CI/CD and deployment pipelines:

**Setup:**
- [ ] Testnet deployments (Sepolia, Arbitrum Sepolia, Base Sepolia)
- [ ] Staging contracts (Goerli fork with real-like state)
- [ ] Mainnet bytecode generation (compiler reproducibility)
- [ ] Multi-sig wallet for protocol upgrades
- [ ] Monitoring: (contract interactions, abnormal patterns)

**Definition of Done:**
- [ ] Testnet contracts deployed, verified on block explorers
- [ ] Staging environment mirrors mainnet settings
- [ ] Deployment scripts tested end-to-end
- [ ] Incident response runbook drafted
- [ ] Monitoring dashboards live (DeFi Llama / Dune)

**Effort:** 6-8 hours  
**Owner:** DevOps + Lead Dev  
**Acceptance Criteria:** Mainnet deployment ready, zero human intervention needed beyond signing

---

### Issue #21: Integration Testing with Real DEX Protocols

**Title:** `[Wave 4-C] Test adapters against live-fork DEX protocols`

**Description:**
Validate private task execution against production DEX contracts:

**Scope:**
- Uniswap V3 swap adapter (on Goerli fork)
- Curve DeFi swap adapter
- Aave liquidation adapter
- Yearn vault yield adapter

**Testing:**
- [ ] Create private tasks against each protocol on goerli fork
- [ ] Execute swaps, liquidations, harvests
- [ ] Verify output matches expected amounts
- [ ] No errors from protocol-side (reverts, out-of-gas, etc.)
- [ ] Gas estimates accurate

**Definition of Done:**
- [ ] 20+ integration tests pass
- [ ] All major DEX protocols covered
- [ ] Gas estimates within 5% of actual
- [ ] Documented protocol quirks/limitations

**Effort:** 8-10 hours  
**Owner:** Adapter Devs + QA  
**Acceptance Criteria:** All adapters work against live-fork protocols, ready for mainnet

---

### Issue #22: Advanced Gas Optimization Pass

**Title:** `[Wave 4-D] Final gas optimization sprint`

**Description:**
Squeeze remaining gas from encrypted operations:

**Targets:**
- Single private execution: 1.5-1.8x public (from 2x)
- Batch 10: 1.2x per task (hold or improve)
- Permit validation: <50k gas

**Techniques:**
- Assembly-level FHE operations (if available)
- Calldata optimization
- Storage layout tuning
- EVM bytecode optimization via optimization flag tuning

**Definition of Done:**
- [ ] Before/after gas comparison
- [ ] At least one optimization PR, merged
- [ ] New gas benchmarks vs Wave 3 baseline
- [ ] Tradeoff analysis (maintainability vs gas)

**Effort:** 8-12 hours  
**Owner:** Gas Specialist  
**Acceptance Criteria:** Hit 1.5-1.8x single execution target

---

### Issue #23: Incident Response & Rollback Procedures

**Title:** `[Wave 4-E] Design and document incident response, rollback, pause mechanisms`

**Description:**
Production-ready operational procedures:

**Procedures to Document:**
1. **Pause Mechanism** — emergency stop if exploit detected
   ```solidity
   function pausePrivateTasks() external onlyOwner // Can pause, executor can still withdraw
   ```

2. **Fund Recovery** — if critical bug found
   ```solidity
   function emergencyWithdraw(uint256 taskId) external // Creator withdraws locked funds
   ```

3. **Rollback Strategy** — if deployed code has issue
   - Proxy pattern allows logic upgrade
   - Upgrade path: new contract → migration → point proxy to new logic

4. **Monitoring** — what to alert on
   - Unusual executor activity
   - Abnormal gas usage
   - Failed decryption attempts
   - Approval revocations

**Definition of Done:**
- [ ] Incident response runbook documented
- [ ] Rollback procedures tested on testnet
- [ ] Pause mechanism works end-to-end
- [ ] Emergency fund recovery tested
- [ ] Monitoring dashboards configured

**Effort:** 4-6 hours  
**Owner:** DevOps + Lead Dev  
**Acceptance Criteria:** All procedures tested, team trained

---

### Issue #24: Wave 4 Evaluation Package

**Title:** `[Wave 4] Prepare evaluation docs: audit status, mainnet readiness, incident procedures`

**Description:**
Production readiness checkpoint:

**Documents:**
1. **Audit Status** (`wave4-audit-status.md`)
   - Audit firm selected, timeline
   - Key findings summary (if audit in progress)
   - Remediation status

2. **Deployment Infrastructure Report** (`wave4-deployment.md`)
   - Testnet contracts, bytecode hashes
   - Staging environment setup
   - Deployment automation tests

3. **Integration Test Results** (`wave4-integration-tests.md`)
   - DEX protocol coverage
   - Live-fork testing results
   - Gas estimates vs actual

4. **Incident Response & Rollback** (`wave4-operations.md`)
   - Runbook summary
   - Tested procedures
   - Monitoring dashboard screenshots

5. **Final Gas Report** (`wave4-gas-optimization.md`)
   - Optimization history (Wave 3 → Wave 4)
   - Comparison to targets
   - Mainnet cost estimation

**Definition of Done:**
- [ ] All docs complete
- [ ] Audit in progress or scheduled
- [ ] Mainnet deployment date confirmed (target: early June)
- [ ] Presentation (8-10 slides) for May 20-23 eval

**Effort:** 3-4 hours  
**Owner:** Tech Lead  
**Acceptance Criteria:** Mainnet deployment path finalized, all stakeholders aligned

---

## 📋 Wave 5 (Finale): Mainnet Deployment & Ecosystem Launch

**Timeline:** May 23 - June 1, 2026  
**Goal:** Deploy to mainnet, launch ecosystem integrations, showcase value  
**Evaluation:** June 1-5 (Final demo + ecosystem intro)  
**Grant:** $14,000 + $2,000 bonus (if meets performance benchmarks)

---

### Issue #25: Mainnet Deployment & Launch

**Title:** `[Wave 5-A] Deploy PrivateTasker to mainnet (Ethereum + Arbitrum + Base)`

**Description:**
Ship the product:

**Deployment Steps:**
1. [ ] Final audit sign-off (security approval)
2. [ ] Ethereum mainnet deployment (PrivateTaskCore, PrivateTaskFactory, PrivateTaskLogic)
3. [ ] Arbitrum mainnet deployment (same contracts)
4. [ ] Base mainnet deployment (same contracts)
5. [ ] Verify on block explorers (source code, ABI)
6. [ ] Enable via governance vote (if applicable)
7. [ ] Public announcement (blog post, Twitter, Telegram)

**Deployment Parameters:**
- Initial pause (allow configuration)
- Executor whitelisting (beta phase)
- Task reward min/max limits (risk management)
- Adapter whitelisting (only proven adapters at launch)

**Definition of Done:**
- [ ] All contracts deployed to mainnet
- [ ] Verified on Etherscan, Arbiscan, BaseScan
- [ ] Governance (if applicable) passed
- [ ] Monitoring live (no alerts)
- [ ] Public announcement posted

**Effort:** 3-4 hours (execution) + monitoring  
**Owner:** DevOps + Lead Dev  
**Acceptance Criteria:** 3 mainnets live, verified, healthy

---

### Issue #26: First 10 Private Tasks on Mainnet (Public Tasks Unaffected)

**Title:** `[Wave 5-B] Launch first 10 PRIVATE tasks; public tasks continue normally`

**Description:**
Go live with real users and real value:

**Strategy:**
1. **Wave 1: Curated Tasks** (Days 1-3)
   - Team + partners run 5 private tasks
   - Real swaps/yields (not mock)
   - Monitor closely for issues

2. **Wave 2: Community Onboarding** (Days 4-7)
   - Public tutorial + UI walkthrough
   - 5+ community members create private tasks
   - Support channel active for questions

3. **Campaign Metrics:**
   - [ ] 10+ tasks created
   - [ ] 8+ successfully executed
   - [ ] Total value through protocol: $50K+ (TBD)
   - [ ] Zero security incidents
   - [ ] Average MEV savings: X% vs public execution

**Definition of Done:**
- [ ] 10+ private tasks created on mainnet
- [ ] 8+ executed successfully
- [ ] Execution success rate ≥ 80%
- [ ] No critical issues found
- [ ] User feedback collected

**Effort:** 6-8 hours (user support, monitoring)  
**Owner:** Product + Community  
**Acceptance Criteria:** 10 tasks live, 80%+ success rate, community engaged

---

### Issue #27: PrivateTasker SDK & Developer Documentation

**Title:** `[Wave 5-C] Release TypeScript SDK and complete developer docs`

**Description:**
Enable third-party developers to build on PrivateTasker:

**SDK Includes:**
```typescript
// @privatetasker/sdk

export class PrivateTasker {
  connect(provider, signer)
  
  createPrivateTask({
    reward: euint256,
    expiresAt: number,
    actions: PrivateAction[]
  })
  
  grantExecutorPermit(taskId, executor, duration)
  
  executePrivateTask(taskId, encryptedParams, permit)
}

// React integration (optional)
import { usePrivateTask, useEncrypt, useDecrypt } from '@privatetasker/react'
```

**Documentation:**
- [ ] Getting started guide (5 min to first task)
- [ ] API reference (all SDK methods)
- [ ] Adapter development guide (build custom adapters)
- [ ] Security considerations (best practices)
- [ ] Examples (DCA bot, liquidation monitor, etc.)

**Definition of Done:**
- [ ] SDK published to npm (@privatetasker/sdk)
- [ ] Docs deployed (docs.privatetasker.io)
- [ ] 3+ example projects included
- [ ] Download count: 50+ in Week 1

**Effort:** 6-8 hours  
**Owner:** Dev Relations + Dev  
**Acceptance Criteria:** SDK live, docs complete, 50+ npm installs

---

### Issue #28: Ecosystem Partnership & Integrations

**Title:** `[Wave 5-D] Secure integrations with 3+ protocols and showcase at events`

**Description:**
Show institutional + builder adoption:

**Partnership Targets:**
1. **DEX Protocol** (Uniswap, Curve, etc.)
   - Integration announcement
   - Co-branding opportunity
   - Revenue share (optional)

2. **Yield Protocol** (Yearn, Lido, etc.)
   - Private yield farming tasks
   - Joint blog post

3. **Infrastructure Partner** (Relayer, RPC provider, etc.)
   - Enable PrivateTasker users
   - Co-marketing

**Showcase Events:**
- [ ] Fhenix ecosystem event (June)
- [ ] Web3 builder conference (optional)
- [ ] Demo at NY Tech Week (if timing aligns)

**Definition of Done:**
- [ ] 3+ partnerships announced
- [ ] Joint press releases sent
- [ ] Logos on website
- [ ] Presentation at 1+ major event
- [ ] Community awareness: 100+ Twitter impressions

**Effort:** 8-10 hours (outreach, coordination)  
**Owner:** BD + Marketing  
**Acceptance Criteria:** 3 partnerships, 1+ event demo

---

### Issue #29: Final Metrics & Wave 5 Evaluation

**Title:** `[Wave 5-E] Compile final metrics, security analysis, and buildathon submission`

**Description:**
Conclusion package for Fhenix evaluation:

**Final Metrics:**
1. **Technical**
   - Code size: smart contracts LOC
   - Security: audit results and fixes
   - Performance: gas benchmarks achieved
   - Testing: coverage, test count

2. **Usage**
   - Private tasks created: N
   - Success execution rate: X%
   - Total value locked (TVL): $Y
   - Active players: Z

3. **Business**
   - Number of protocol integrations: 3+
   - Developer SDK downloads: 50+
   - Community members: 50+ (Discord/Telegram)
   - Media coverage: M mentions

4. **MEV Impact**
   - Average MEV savings per task: X basis points
   - Total user MEV protected: $Y (if estimable)
   - Comparison to public execution

**Submission Package:**
- [ ] Executive summary (1 page)
- [ ] Technical report (metrics, architecture, security)
- [ ] User testimonials (3+ community stories)
- [ ] Video demo (5-10 min)
- [ ] Pathway forward (what's next post-buildathon)

**Definition of Done:**
- [ ] All metrics compiled + verified
- [ ] Submission package complete + reviewed
- [ ] Video demo produced + uploaded
- [ ] Presentation (10-12 slides) for June 1-5 final eval
- [ ] High-quality screenshots for media

**Effort:** 4-6 hours (compilation + packaging)  
**Owner:** Tech Lead + Marketing  
**Acceptance Criteria:** Submission complete, polished, ready for showcase

---

### Issue #30: Post-Buildathon Roadmap & Incubator Application

**Title:** `[Wave 5-F] Plan Phase 2 and apply to Fhenix Incubator`

**Description:**
Position PrivateTasker for long-term success:

**Phase 2 Roadmap (June-August 2026):**
- [ ] Advanced features (cross-chain execution, protocol composability)
- [ ] Analytics dashboard (user metrics, MEV savings tracking)
- [ ] Enterprise support program (dedicated SLAs)
- [ ] Additional chains (Polygon, Optimism, etc.)

**Fhenix Incubator Application:**
- Demonstrate traction (10+ tasks, 80%+ success)
- Show partnership momentum (3+ integrations)
- Propose growth plan (users, protocols, TVL)
- Request support (mentorship, resources, marketing)

**Definition of Done:**
- [ ] Phase 2 roadmap drafted
- [ ] Incubator application submitted
- [ ] Feedback incorporated
- [ ] Transition plan (buildathon → ongoing project) documented

**Effort:** 3-4 hours  
**Owner:** Founder + Tech Lead  
**Acceptance Criteria:** Incubator application submitted by June 5

---

## 📋 Summary: Issue Tracking by Wave

| **Wave** | **Issues** | **Focus** | **Eval Date** | **Grant** |
|---|---|---|---|---|
| **Wave 1** | #1-6 | Encrypted state POC | Mar 28-30 | $3K |
| **Wave 2** | #7-12 | Adapters + action encryption | Apr 6-8 | $5K |
| **Wave 3** | #13-18 | Permissions, batching, compliance | May 8-11 | $12K |
| **Wave 4** | #19-24 | Audit, infrastructure, mainnet prep | May 20-23 | $14K |
| **Wave 5** | #25-30 | Deployment, partnerships, showcase | Jun 1-5 | $14K + $2K |
| **TOTAL** | 30 issues | 5-wave buildathon | — | **$60K** |

---

## Quick Reference: Issue Dependencies

```
Phase 1 (Setup)
├─ #1: Tooling setup
├─ #2: PrivateTaskCore structure
└─ #3: Decryption logic → Ready for #4, #5

Phase 2 (Integration)
├─ #4: Extend TaskFactory
├─ #5: Testnet deployment
└─ #6: Evaluation package → Ready for Wave 2

Phase 3 (Scaling)
├─ #7: PrivateActionAdapter interface
├─ #8-9: Swap + Liquidation adapters
├─ #10: TaskLogic integration
├─ #11: Testnet campaign
└─ #12: Evaluation → Ready for Wave 3

Phase 4 (Hardening)
├─ #13-17: Permissions, batching, compliance
├─ #18: Evaluation → Ready for Wave 4

Phase 5 (Production)
├─ #19-24: Audit, infrastructure, optimization
└─ #25-30: Mainnet, partnerships, showcase
```

---

## Milestone Summary

**All issues are scoped for completion within their wave.** Each issue:
- Has clear acceptance criteria
- Includes effort estimate (hours)
- Identifies owning team member
- Links to dependent tasks

**Progress Tracking:**
- Update issue weekly with status
- Merge PRs continuously (don't batch)
- Escalate blockers immediately
- Celebrate wins with team + community
