# PrivateTasker: FHE Extension to TaskerOnChain

## Executive Summary

**PrivateTasker** is an opt-in FHE privacy layer for TaskerOnChain, deployed on Fhenix. Users can choose to keep tasks **public** (current system) or **private** (encrypted parameters) — same protocol, same executor network, same adapters.

The core innovation: **A user creates a PrivateTask instead of a public Task, and task parameters (pricing, amounts, execution logic) remain encrypted on-chain until execution permission is granted** — solving the $500M MEV problem while maintaining operational transparency.

Rather than fork the protocol, PrivateTasker adds a focused FHE layer at the decision point: *where strategies leak to front-runners before execution*. No migration. No new token. Just better privacy for users who need it.

---

## The Problem: Strategy Leakage in Current TaskerOnChain

### Status Quo (Public Task — Current Default)
```
User creates PUBLIC task:
  → Stop loss: $18,500 USD [VISIBLE]
  → DCA amount: 2 ETH every hour [VISIBLE]  
  → Position size: 50 ETH [VISIBLE]
  → Max slippage: 0.3% [VISIBLE]

MEV searcher sees parameters in mempool
  ↓
Frontruns execution, pushes price against user
  ↓
User gets worse fill, pays extra MEV tax

### New Option (Private Task — PrivateTasker)
```
User creates PRIVATE task (encrypted):
  → Stop loss: [ENCRYPTED] 
  → DCA amount: [ENCRYPTED]
  → Position size: [ENCRYPTED]
  → Max slippage: [ENCRYPTED]

MEV searcher sees encrypted blob in mempool (useless)
  ↓
Task executes at fair price (no frontrun opportunity)
  ↓
User saves MEV tax, strategy stays secret
```

### The Math
- **$500M annual MEV losses in DeFi** (Flashbots data)
- **15-40% of auction value** extracted from trades
- **75% of those losses** hit trades under $20K (retail automation)
- **Current TaskerOnChain users**: Can now opt into privacy with PrivateTasker

---

## The Solution: Optional Encrypted Task Parameters + Fhenix

### PrivateTasker Opt-In Flow
```
1. User chooses: PUBLIC task (current) or PRIVATE task (new)
   Same TaskFactory, same interface
   
2. If PRIVATE task:
   maxPrice: euint256 (encrypted)
   amountIn: euint256 (encrypted)
   slippage: euint256 (encrypted)
   
3. Encrypted params stored on-chain
   → Visible: task ID, creator, reward
   → Hidden: execution logic, strategy details
   
4. Same executor network handles both types
   → For private tasks: executor gets permit → decrypts
   → For public tasks: executor executes normally
   
5. Adapter executes on decrypted params (for private)
   → Real swap happens with true pricing
   → No frontrun opportunity
   
6. Task completes
   → Status updates (execution count, reward paid)
   → Encrypted params remain sealed in history
   
Users with public tasks: ✓ Nothing changes  
Users with private tasks: ✓ Full MEV protection
```

---

## Architecture: FHE Integration Points

### Primary Layer: PrivateTaskCore
**Extends existing TaskCore with encrypted metadata**

```solidity
// Current (public)
struct TaskMetadata {
  uint256 rewardPerExecution;    // Anyone can see
  uint256 expiresAt;              // Anyone can see
  uint256 maxExecutions;          // Anyone can see
}

// PrivateTasker (encrypted)
struct PrivateTaskMetadata {
  euint256 rewardPerExecution;    // Confidential
  uint256 expiresAt;              // Public (execution window needed)
  uint256 maxExecutions;          // Public (lifecycle logic)
}
```

**Why this matters:**
- Hiding reward amounts prevents competitive intelligence leakage
- Prevents protocol builders from copying strategies
- Institutional-grade confidentiality (auditors don't see payout structure)

---

### Secondary Layer: PrivateActionAdapter
**Encrypts action parameters where strategies actually hide**

```solidity
// Current (public adapter)
canExecute(bytes calldata params) → bool
  // Params decoded publicly: everyone sees stop price

// PrivateTasker (confidential adapter)
canExecuteEncrypted(euint256 encryptedParams) → bool
  // Computation on encrypted data
  // Only identity allowed: the granted executor
  // Returns: bool (executable) without revealing why
```

**Token Requirements Encrypted:**
- Swap parameters (amount, min output, slippage)
- Stop-loss triggers
- DCA thresholds
- Rebalancing logic

**Result:**
- Sealed-bid execution: price doesn't move before execution
- No frontrun ability: MEV extractor can't see the trigger
- Clean integration: existing DeFi adapters remain unchanged

---

### Tertiary Layer: PrivateExecutorHub Permissions
**Non-repudiable grants for executor decryption rights**

```solidity
// Executor receives permit for specific task
// Permit ties (taskId, executorAddress) → can decrypt
// Prevents unauthorized decryption or delegation

struct ExecutionPermit {
  uint256 taskId;
  address executor;
  bytes32 decryptionKey;          // euint256 decryption path
  uint64 validUntil;              // Permit expiration
  bytes signature;                // Executor authorization
}
```

**Defense against:**
- Other executors copying strategy
- Griefing via strategy disclosure
- Unauthorized executor delegation

---

## Use Cases Enabled

### 1. **Confidential DeFi Execution** ✅
Users run automated strategies without exposing:
- Stop-loss levels (can't be arbitraged)
- Average cost basis (protects institutional traders)
- Rebalancing thresholds (no frontrun opportunity)

**Example:** Hedge fund runs DCA protocol with private entry prices.

### 2. **Private Liquidation Protection** ✅
Liquidation bots bid on collateral through sealed auctions:
- Bid amounts stay encrypted until execution
- Fair-price discovery without bidder information leakage
- No "flash liquidations" of single strategy

### 3. **Strategy Privacy for Builders** ✅
Protocol teams test new AMM/DEX pricing without exposing:
- Execution volumes
- Price discovery logic
- Parameter tuning during active operation

**Example:** New oracle design iterates without MEV hunters adapting.

### 4. **Compliant Task Execution** ✅
Institutional treasury operations require privacy:
- Payroll disbursement amounts unknown until executed
- Compliance audits see execution proof, not strategy
- Regulatory-friendly onchain automation

---

## Technical Scope: What We Actually Build

### ✅ In Scope (Buildathon)

**Wave 1 (Ideation):** Proof of encrypted state + decryption
- PrivateTaskCore: new contract, same registry
- Permit-based decryption logic
- TaskFactory extended to deploy both TaskCore + PrivateTaskCore

**Wave 2 (Build):** Encrypted action parameters
- PrivateActionAdapter interface (extends IActionAdapter)
- Encryption/decryption at adapter level
- Fhenix `euint` operations in adapters
- Public adapters still work; private adapters are new choice

**Wave 3 (Marathon):** Full confidential execution
- PrivateExecutorHub permission system (extends IExecutorHub)
- Multi-task encrypted batching (works for private tasks)
- Live testnet demo with real MEV savings (private tasks only; public tasks unaffected)

**Wave 4-5 (Refinement):** Production readiness
- Gas optimization for encrypted ops
- Permit system at scale
- Mainnet preparation

### 🛑 Out of Scope (For Good Reasons)

**Why we don't encrypt task status:**
- Execution logic needs to check `isActive`, `isCompleted`, etc.
- Status is genuinely public (part of contract interface)
- Adds no MEV protection (status doesn't leak strategy)

**Why we don't fully encrypt adapters:**
- DEX interaction is still public (on DEX side)
- Swap params become visible at execution anyway
- Encrypted params only useful until transaction broadcast
- Focus on the actual leak point: parameter discovery

**Why we don't anonymize executors:**
- Reputation system needs public executor identity
- Quality signal (success rate) is competitive advantage
- Executor anonymity adds complexity without value

---

## Why Extend TaskerOnChain? (Why Not Fork or Build New?)

### Existing TaskerOnChain Strengths We Leverage
1. **Adapter pattern** — each protocol gets custom condition logic
   - FHE naturally extends to "compute on encrypted adapter params"
   - No need to rewrite adapters; just add encrypted variants
   
2. **Modular action system** — actions are composable
   - Easy to add encrypted actions alongside public ones
   - Users pick: public action or private action
   
3. **Isolated task vaults** — one task = one vault
   - Confidentiality scoped to task boundary (clean isolation)
   - Public and private tasks use same vault infrastructure
   
4. **Executor network** — already established
   - Public executors can also execute private tasks
   - No new reputation system; just extend existing one
   
5. **Testnet-ready** — free executor registration
   - Perfect for iterative FHE development (no staking overhead)

### Why This Is Better Than a Fork
- **No fragmentation:** Users stay on one protocol, choose privacy per-task
- **No new token:** No financial incentive to migrate; it's just better UX
- **No retraining:** Executors, adapters, users all understand the system
- **Lower cost:** Extend existing system, don't duplicate it
- **Real choice:** Public tasks continue working; private is opt-in

### ROI on FHE Investment
- **Extension cost:** Low (add PrivateTaskCore, PrivateActionAdapter)
- **User value:** High (direct MEV protection, $500M problem, optional)
- **Competitive moat:** First encrypted executor for DeFi automation
- **Institutional appeal:** Same audit trail, just encrypted strategy details

---

## Competitive Positioning

| **Aspect** | **Public Automation** | **PrivateTasker (Opt-In)** | **Alternative** |
|---|---|---|---|
| **Strategy Privacy** | None (transparent) | Full ✅ | MEV-protection services (centralized) |
| **Execution Transparency** | All params visible | Sealed params ✅ | Privacy mixers (breaks automation) |
| **Institutional Compliance** | Open strategies | Audit-ready ✅ | Manual treasury workflows |
| **Integration Depth** | Works with public adapters | Works with encrypted adapters ✅ | Application-layer obfuscation (fragile) |
| **MEV Protection** | At DEX (limited) | At parameter stage ✅ | Relayers (trust assumption) |
| **Switching Friction** | — | None (same protocol) ✅ | Must fork protocol or migrate |
| **Community Fragmentation** | Single protocol | Single protocol ✅ | Splits users across systems |

---

## Timeline Alignment: Fhenix Buildathon Waves

| **Wave** | **Timeline** | **Deliverable** | **Grant** |
|---|---|---|---|
| **Wave 1** | Mar 21-28 (Ideation) | PrivateTaskCore + permit logic demo | $3K |
| **Eval** | Mar 28-30 | Fhenix team review, feedback | — |
| **Wave 2** | Mar 30-Apr 6 | PrivateActionAdapter integration | $5K |
| **Eval** | Apr 6-8 | Architecture review + live testnet | — |
| **Wave 3** | Apr 8-May 8 (Marathon) | Executor permissions, multi-task batching | $12K |
| **Eval** | May 8-11 | Performance benchmarks | — |
| **Wave 4** | May 11-20 | Gas optimization, permit scaling | $14K |
| **Eval** | May 20-23 | Production readiness review | — |
| **Wave 5** | May 23-Jun 1 | Mainnet prep, incident response | $14K + $2K bonus |
| **Eval** | Jun 1-5 | Final showcase, ecosystem integration | — |

**Total Grant Potential:** $60K (per wave alignment)

---

## Success Metrics

### Technical
- [ ] Encrypted task params stored/retrieved confidentially (Wave 1)
- [ ] Fhenix `euint256` operations reduced gas cost by 50%+ vs naive impl (Wave 2)
- [ ] Executor permits issued/validated with <1M gas overhead (Wave 3)
- [ ] Batched task execution (10+ private tasks in one block) (Wave 4)
- [ ] Mainnet compatibility layer ready (Wave 5)

### User-Facing
- [ ] Prove MEV savings on live private tasks ($X reduction vs public)
- [ ] 10+ private tasks created and executed on testnet
- [ ] Institutional audit approval (solidity contract review)
- [ ] Documented compliance framework (treasury use case)

### Ecosystem
- [ ] Integration with 3+ private adapters (swap, liquidation, DCA)
- [ ] Fhenix community showcase demo
- [ ] Open-source PrivateTasker SDK (TypeScript client)
- [ ] Partnership pathway with protocol builder (if performance proves out)

---

## Resource Requirements

### Smart Contracts
- **PrivateTaskCore** (~300 lines) — encrypt/decrypt task state
- **PrivateActionAdapter** (~200 lines) — confidential condition checking
- **PrivateExecutorHub** (~250 lines) — permit system
- **PrivateTaskFactory** (~150 lines) — creation wrapper

### Tooling
- **Fhenix SDK** — euint types, encrypt/decrypt flows
- **Cofhe Hardhat plugin** — local testing, no testnet dependency
- **Privara SDK** — optional (advanced payment flow integration)

### Testing
- **Unit tests** (PrivateTaskLogic, permit validation)
- **Integration tests** (full encrypted workflow)
- **Gas benchmarks** (vs public tasks)
- **Mainnet simulation** (goerli/sepolia fork)

---

## Next Steps

1. **Wave 1 Kickoff:** Build PrivateTaskCore POC, validate Fhenix integration
2. **Architect Review:** Get Fhenix team feedback on encrypted adapter design
3. **SDK Setup:** Confirm Cofhe library compatibility with existing TypeScript stack
4. **Permit System:** Design executor authorization framework
5. **Iterate:** Weekly builds, Monday architecture reviews with team

---

## References

**Fhenix Documentation:** https://docs.fhenix.io  
**Cofhe SDK:** https://github.com/FhenixProtocol/cofhe  
**TaskerOnChain Repo:** `/contracts/core/TaskCore.sol`, `TaskFactory.sol`  
**MEV Research:** Flashbots MEV-Inspect, MEV Monitor  
**Buildathon:** https://t.me/+rA9gI3AsW8c3YzIx

---

## FAQ

**Q: Will this break existing public tasks?**  
A: No. Public tasks use the current TaskCore, public adapters, public execution path. PrivateTasker is opt-in. If you don't use it, nothing changes.

**Q: Can I migrate a public task to private?**  
A: Not directly. You'd create a new private task. But the executor network is shared — same executors handle both.

**Q: Why not just add encryption to existing TaskCore?**  
A: Because public tasks don't need encrypted state (defeats transparency goal). Better to have two contract variants: TaskCore (public) + PrivateTaskCore (encrypted). Users pick which one fits their use case.

**Q: Won't encrypted execution still leak params at swap execution?**  
A: Yes, but at execution time (1 block window), not at parameter discovery time (unbounded frontrun window). This is acceptable — we're solving the leaked strategy problem, not hiding live transactions.

**Q: Can validators/searchers just decrypt everything?**  
A: No. Decryption requires the executor's private key (held off-chain). Searchers see only the encrypted blob + execution permit signature, not the decryption key.

**Q: Why not use zk-proofs instead of FHE?**  
A: ZK proves computation without revealing inputs, but requires knowing the computation ahead of time. FHE allows smart contracts to *decide* what to do based on encrypted inputs — necessary for adaptive strategies.

**Q: Does this work on other chains?**  
A: Yes, but Fhenix integration makes it easy. The SDK is testnet-ready (Sepolia, Arbitrum Sepolia, Base Sepolia), so PrivateTasker can live there first. After buildathon, we can extend to other encrypted compute platforms.

**Q: How is this different from just using a centralized relayer?**  
A: Decentralized. Executors are permissionless + reputation-scored. No trusted intermediary can extract MEV, see strategies, or go down. Public and private tasks share the same executor network.

**Q: What about the project's sustainability?**  
A: TaskerOnChain users who opt into privacy (PrivateTasker) may pay a small encryption overhead or licensing fee. Existing public task users pay nothing. This incentivizes adoption while maintaining backward compatibility.
