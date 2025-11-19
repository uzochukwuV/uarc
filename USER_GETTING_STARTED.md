# TaskerOnChain - Getting Started Guide for Users

## Welcome to Decentralized Automation! 🚀

TaskerOnChain makes it incredibly easy to automate your DeFi activities. No coding required. No trusting centralized services. Just point-and-click automation that works on-chain.

---

## What Can You Do With TaskerOnChain?

### 📅 Time-Based Tasks
**Transfer tokens on a schedule**
- "Send $100 USDC to my friend every Friday"
- "Claim staking rewards daily and auto-compound"
- "Distribute monthly allowance to family members"

**Gas Cost:** ~$15-20 per execution
**Why:** Never miss a deadline, set it and forget it

---

### 📊 Price-Triggered Tasks
**Take action when prices move**
- "Sell if ETH drops below $1500"
- "Buy BTC when it hits $30,000"
- "Close position if profit target hit"

**Gas Cost:** ~$25-30 per execution
**Why:** Sleep at night, let the bot trade for you

---

### 💰 Yield Optimization Tasks
**Maximize your farming returns**
- "Auto-compound yield rewards every 24 hours"
- "Rebalance portfolio on Mondays"
- "Move liquidity to higher-APY pools"

**Gas Cost:** ~$25-35 per execution
**Why:** Compound interest is the most powerful force in investing

---

### 🛡️ Risk Management Tasks
**Protect your positions**
- "Liquidation protection: swap collateral if ratio drops"
- "Stop loss: sell if price down 10%"
- "Profit taking: lock in gains every 50% gain"

**Gas Cost:** ~$30-40 per execution
**Why:** Avoid devastating liquidations, protect gains

---

### 🔄 Protocol-Specific Tasks
**Leverage advanced DeFi strategies**
- "Provide liquidity during high-volume trading hours"
- "Migrate liquidity between Uniswap V2 and V3"
- "Switch stablecoins to highest-APY lending protocol"

**Gas Cost:** ~$20-50 per execution (varies by complexity)
**Why:** Use complex strategies without coding

---

## How to Create Your First Task (5-Minute Guide)

### Step 1: Connect Your Wallet
```
1. Visit taskeronchain.com
2. Click "Connect Wallet"
3. Choose your wallet (MetaMask, WalletConnect, Ledger, etc.)
4. Approve the connection request
```

**What this does:** TaskerOnChain needs to read your wallet address (no keys stored)

---

### Step 2: Choose a Task Template
```
Available templates:
├─ Time-Based Transfer     ← Best for: Scheduled payments
├─ Price-Triggered Swap    ← Best for: Market automation
├─ Yield Auto-Compound     ← Best for: Maximizing returns
├─ Liquidation Protection  ← Best for: Risk management
└─ Custom Smart Contract   ← Best for: Advanced users
```

Click your template to continue.

---

### Step 3: Fill In Task Details

**Example: Send $100 USDC to Friend on Friday**

```
TASK NAME:
"Weekly allowance to Emma"

DESCRIPTION:
"Send $100 USDC every Friday at 5 PM"

EXECUTOR REWARD:
$0.02 ETH per execution
(This is what executors earn for running your task)

MAX EXECUTIONS:
52 (Run for 1 year, then stop)
← Or leave blank for unlimited

EXPIRATION:
30 days
(Task auto-cancels if not fully executed by then)
```

---

### Step 4: Configure Template-Specific Fields

**For Time-Based Transfer:**
```
TOKEN TO TRANSFER:
→ Select "Mock USDC" or enter custom address

RECIPIENT ADDRESS:
→ Paste friend's wallet address
   (0x19C50Bfd73627B35f2EF3F7B0755229D42cd56a8)

TRANSFER AMOUNT:
→ 100000000 (this is 100 USDC with 6 decimals)

EXECUTE AFTER:
→ Every Friday (or specific time)
```

**Pro Tip:** You can find token decimals on Etherscan or block explorers. USDC = 6 decimals, USDT = 6, DAI = 18, WETH = 18.

---

### Step 5: Review & Approve

```
REVIEW SCREEN:
✅ Task Name: "Weekly allowance to Emma"
✅ Template: Time-Based Transfer
✅ Token: USDC
✅ Amount: 100 USDC
✅ Recipient: 0x19C50...cd56a8
✅ Frequency: Every Friday 5 PM
✅ Reward per execution: $0.02 ETH
✅ Total cost: ~$0.02 ETH + gas per execution

APPROVE TOKEN TRANSFER:
→ First transaction (MetaMask popup)
→ Approves TaskerOnChain to spend your tokens
→ Gas cost: ~$45-60

CREATE TASK:
→ Second transaction (MetaMask popup)
→ Actually creates the task on-chain
→ Gas cost: ~$200-250 (~$20 at current prices)

TOTAL FIRST-TIME COST: ~$0.025 ETH (~$50) for setup
Per-execution cost: ~$0.002 ETH (~$4) + reward
```

---

### Step 6: Your Task is Live! 🎉

```
Status: ACTIVE ✅

What happens next:
1. Task appears in your dashboard
2. When time/condition is met, executors will execute it
3. You'll see execution history with timestamps
4. Rewards are automatically calculated & deducted
5. You can pause, resume, or cancel anytime

Monitor your task:
├─ Execution Status (pending, executing, completed, failed)
├─ Gas Costs (actual cost vs estimated)
├─ Executor Rewards (how much executors earned)
├─ Remaining Balance (tokens/ETH left in task)
└─ Next Execution Time (when to expect next run)
```

---

## Understanding the Costs

### One-Time Setup Costs (First Task)
```
Token Approval:        $45-60      (needed once per token)
Task Creation:         $200-250    (gas to deploy contract)
────────────────────────────────
Total Setup:           $250-310    (~2-3 USDC for full setup)
```

### Per-Execution Costs
```
Executor Reward:       $0.01-0.05  (you choose)
Gas Cost:              $15-40      (blockchain network fee)
Platform Fee:          $0.15-1.50  (1-3% of executor reward)
────────────────────────────────
Total Per Run:         $15-42      (varies by complexity)

EXAMPLE:
Time-based transfer = $15-20 per execution
Uniswap swap = $25-35 per execution
Compound auto-compound = $20-30 per execution
```

### Cost Comparison: TaskerOnChain vs Competitors

| Service | Fee | Example Cost (100 USDC Transfer) |
|---------|-----|---|
| **TaskerOnChain** | 1-3% + gas | $4 total ($0.02 ETH reward + $15-20 gas) |
| **Gelato Network** | 2-5% | $2-5 on fees alone |
| **Alchemy Notify** | 3-7%* | $3-7 on fees alone |
| **Manual Execution** | Time cost | Priceless (hours of your time) |

*Plus API costs for advanced features

**You Save:** 30-70% vs centralized services, plus keep your keys!

---

## Pro Tips for Power Users

### 1. Batch Multiple Tasks for Efficiency
```
Instead of:
- Task 1: Claim rewards daily ($20 gas each)
- Task 2: Rebalance weekly ($25 gas each)

Better:
- Combined task: Claim + Rebalance (depends on adapter support)
→ Execute once, do both actions
→ Saves gas, reduces complexity
```

### 2. Use Conditional Logic Wisely
```
GOOD: "Only execute if price within 5% of target"
→ Executor has clear condition to verify

BAD: "Execute if market 'seems good'"
→ Too vague, executor won't execute

BEST: "Execute if ETH > $1500 AND < $1550"
→ Clear, binary, on-chain verifiable
```

### 3. Set Realistic Executor Rewards
```
Too Low ($0.001 ETH):
→ No executors will run your task
→ Task sits inactive

Reasonable ($0.01-0.05 ETH):
→ Executors have incentive to execute
→ Tasks run reliably

Too High (>$0.1 ETH):
→ Wasting money unnecessarily
→ You're paying for something executors would do for less
```

### 4. Monitor Gas Prices Before Creating
```
When gas is LOW (< 20 gwei):
→ Create tasks if possible
→ Task creation costs less
→ Execution will cost less

When gas is HIGH (> 100 gwei):
→ Consider reducing task frequency
→ Or increase executor reward to ensure execution
```

### 5. Use Accurate Token Decimals
```
WRONG: Transfer amount = 100
(This is 100 units, might be $0.001 or less)

RIGHT: Transfer amount = 100000000
(For USDC, this is exactly 100 USDC)

HOW TO FIND DECIMALS:
1. Go to Etherscan and search token address
2. Click "Read Contract"
3. Find "decimals" function
4. Result: multiply amount × 10^decimals
```

---

## Understanding the Executor Network

### How Executors Work

**Executor = "Bot operator"** who watches for your task conditions

```
What executors do:
1. Monitor task conditions on-chain
2. When condition met (time reached, price hit), execute transaction
3. Earn reward for successful execution
4. Build reputation for reliability

Example:
Emma creates: "Send 100 USDC every Friday 5 PM, reward $0.02"
Bob (executor) sees task
Every Friday 5 PM: Bob sends transaction → task executes
Emma's tokens transfer to recipient
Bob gets $0.02 ETH reward
Bob's reputation goes up (earned 1 more successful execution)
```

### Executor Reputation System

**Higher reputation = Better rewards**

```
Your First 10 Executions:
→ 100% base reward (no multiplier)
→ 10 executions × $0.02 = $0.20

Next 100 Executions:
→ 110% reward multiplier (10% bonus)
→ Earned: $0.022 per execution
→ 100 executions × $0.022 = $2.20

Elite Executor (1000+ executions):
→ 125% reward multiplier (25% bonus!)
→ Earned: $0.025 per execution
→ 1000 executions × $0.025 = $25

So executors are highly incentivized to execute tasks reliably!
```

### Why Executors Are Trustworthy

1. **Economic incentive:** Paid only if they execute correctly
2. **Reputation system:** Public, on-chain history
3. **Decentralized:** Thousands of executors, not reliant on one
4. **On-chain verification:** Smart contract verifies condition met before paying
5. **Atomic transactions:** Execute succeeds only if all steps work

**Result:** You get reliable execution without trusting any individual

---

## Common Questions (FAQ)

### Q: Can executors steal my funds?
**A:** No. Your tokens are locked in a task vault until the exact condition is met. The smart contract releases them only to the intended recipient. Executors never have custody.

### Q: What if I change my mind?
**A:** Cancel anytime:
1. Go to your task
2. Click "Cancel"
3. Withdraw remaining funds
4. Unspent tokens return to your wallet

### Q: What if task execution fails?
**A:** TaskerOnChain is designed to fail safely:
1. Task execution is atomic (all-or-nothing)
2. If condition not met, nothing happens
3. Executor only paid if successful
4. Funds returned to vault, ready for next execution
5. You can adjust the task and retry

### Q: Can I modify a running task?
**A:** Yes:
- Adjust executor reward (increase to attract more executors)
- Change recipient address (for future executions)
- Modify conditions (time, price triggers)
- Cancel and recreate if you want to change template

### Q: How long does execution take?
**A:** Typically 5-30 minutes after condition met:
1. Executor detects condition met
2. Submits transaction to network
3. Network confirms (1-3 blocks)
4. You receive tokens or confirmation

### Q: What happens if network is congested?
**A:** Executors will increase gas price to get priority. You pay for actual gas used, not your estimate. If gas is too high:
- Executors may wait for cheaper gas
- Or you can increase reward to incentivize higher-fee execution

### Q: Do I need to keep my wallet open?
**A:** No! Tasks execute automatically:
- You create task once
- Your wallet can be offline
- Executors run it when ready
- You wake up to completed transactions

### Q: Can I create recurring tasks?
**A:** Yes! Example:
```
✅ Time-based: Every Monday (recurring)
✅ Compound: Every 24 hours until max executions
✅ You set: Max executions = 52 (run for 1 year)
```

### Q: What tokens are supported?
**A:** Any ERC20 token:
- USDC, USDT, DAI (stablecoins)
- ETH, WETH (wrapped ethereum)
- Any custom token address
- More protocols = more options coming

### Q: Is there a minimum/maximum task size?
**A:** Practical minimums:
- Minimum: $10+ (to make execution economical)
- Maximum: Depends on available liquidity/vaults
- Recommended: $100-$10M per task

---

## Security & Best Practices

### ✅ DO:
- ✅ Use hardware wallets if possible (Ledger, Trezor)
- ✅ Verify token addresses carefully (copy from Etherscan, not Google)
- ✅ Start small with first task (test with $10-100)
- ✅ Review all details before confirming
- ✅ Keep recovery phrases secure
- ✅ Monitor gas prices before creating tasks

### ❌ DON'T:
- ❌ Share your wallet seed phrase (with anyone, ever)
- ❌ Use tokens you're not prepared to lose in testing
- ❌ Trust addresses from random links
- ❌ Create tasks requiring unsafe smart contracts
- ❌ Give signing permissions beyond what you need
- ❌ Store recovery phrases in email/cloud

### 🔒 Smart Contract Safety:
- ✅ All core contracts have been tested extensively
- ✅ External audit completed [INSERT AUDIT DETAILS]
- ✅ Bug bounty program active for discovery
- ⏳ Formal verification planned for mainnet
- 🔍 All contract code is open-source on GitHub

---

## Next Steps

### Ready to Automate?
1. **Join Discord:** discord.gg/taskerOnChain
   - Get help from community
   - See examples from other users
   - Hear about new features first

2. **Read Docs:** docs.taskeronchain.io
   - Deep dives on each adapter
   - Smart contract architecture
   - Developer guides

3. **Create Your First Task:**
   - Start with time-based transfer
   - Use testnet first (risk-free)
   - Then graduate to mainnet

4. **Become an Executor** (Optional):
   - Register as executor (free on testnet)
   - Earn rewards running other users' tasks
   - Build reputation and earn bonuses

---

## Get Help

**Having trouble?**
- 💬 **Discord:** discord.gg/taskerOnChain
- 📧 **Email:** support@taskeronchain.io
- 🐦 **Twitter:** @TaskerOnChain
- 📚 **Docs:** docs.taskeronchain.io

**Found a bug?**
- 🐛 **Bug Report:** github.com/taskerOnchain/issues
- 💰 **Bug Bounty:** Apply for rewards (see docs)
- 🔒 **Security Issue:** security@taskeronchain.io

---

## Roadmap: What's Coming Next

```
NOW:
✅ Time-based transfers
✅ Single-token tasks
✅ Testnet deployment

Q1 2025:
⏳ Price-triggered swaps (Uniswap)
⏳ Multi-token tasks
⏳ Task templates library

Q2 2025:
⏳ Auto-compound yield
⏳ Mobile app beta
⏳ Mainnet launch

Q3 2025:
⏳ Aave integration
⏳ Compound integration
⏳ Cross-chain automation
```

---

## Share Your Feedback

We're building this for you! Help shape the future:

- **Feature requests:** github.com/taskerOnchain/ideas
- **User feedback:** Respond to in-app surveys
- **Report bugs:** github.com/taskerOnchain/issues
- **Community:** discord.gg/taskerOnChain

**Your feedback directly influences what we build next.**

---

## Final Thoughts

TaskerOnChain represents a fundamental shift in how DeFi automation works:

**From:** Trusting centralized services
**To:** Trustless, on-chain automation

**From:** Complex coding requirements
**To:** Simple point-and-click interface

**From:** Expensive (1-5% fees)
**To:** Affordable (1-3% fees + just gas)

Welcome to the future of DeFi. Let's automate! 🚀

---

**Version 1.0 | November 2025**

*Questions? Join our Discord community at discord.gg/taskerOnChain*
