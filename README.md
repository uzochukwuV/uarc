# UARC — Universal Automation on Arc

**Onchain automation layer for the Arc blockchain with AI-powered task creation and x402 payment gating.**

Built for the Arc Hackathon. Enables users and AI agents to create automated, condition-based onchain tasks — schedule transfers, trigger cross-chain bridges, and react to price oracles — all from a natural language prompt.


Youtube 

https://youtu.be/MljvJODN9Ao
---

## Features

| Feature | Description |
|---|---|
| **AI Prompt → Task** | Natural language intent → on-chain automation via Mistral AI |
| **x402 Agent API** | HTTP 402 payment-gated endpoints for autonomous AI agents |
| **Time-Based Transfers** | Schedule USDC/EURO transfers at a specific timestamp |
| **CCTP Cross-Chain Bridge** | Time-gated bridges via Circle CCTP protocol |
| **Stork Price Triggers** | Transfer tokens when Stork Oracle price condition is met |
| **EIP-1167 Clones** | Each task gets isolated TaskCore + TaskVault clones |
| **Executor Network** | Open executor network with reputation-based rewards |

---

## Architecture

```
User / AI Agent
      |
      v
+-------------------+     x402 Payment     +------------------+
|  UARC Agent       |<------------------->|  On-Chain ETH    |
|  Server (3000)    |                      |  Transfer        |
+--------+----------+                      +------------------+
         |
         | Mistral AI (intent parsing)
         v
+-------------------+
|   TaskFactory     | --- createTaskWithTokens() -->
+--------+----------+
         | deploys EIP-1167 clones
         +---> TaskCore  (metadata + actions stored on-chain)
         +---> TaskVault (isolated funds per task)
                   |
                   v
         +-----------------------+
         |   Executor Hub        | <-- executeTask(taskId)
         +----------+------------+
                    |
                    v
         +-----------------------+
         |  TaskLogic V2         |
         +----------+------------+
                    |
         +----------v--------------------------------------------+
         |  Action Registry                                       |
         |  +-------------------+  +-------------------+         |
         |  | TimeBasedTransfer |  | CCTPBridgeAdapter |         |
         |  +-------------------+  +-------------------+         |
         |  +------------------------+                           |
         |  | StorkPriceTransfer     |                           |
         |  +------------------------+                           |
         +-------------------------------------------------------+
```

---

## Deployed Contracts — Arc Testnet (Chain ID: 5042002)

| Contract | Address | Description |
|---|---|---|
| **MockUSDC** | `0xB9333915D23B6D6a1520b446Ec08F1e55238C1ea` | Test USD token |
| **MockEURO** | `0x6A5e945dD1Ba5fee7B6556e27046D607570144A3` | Test EUR token |
| **MockTokenMessenger** | `0xF7b0bd6b8F3946433879401f4Ce26c4516c0EfAd` | CCTP bridge simulator |
| **MockStorkOracleUSDC** | `0xf1f9FBCbEe0eB327458d3b22f62e11C0086046bb` | USDC/USD price oracle |
| **MockStorkOracleEURO** | `0xaA431964398fa21e4eFe4c739147ae64791Ed385` | EURO/USD price oracle |
| **ActionRegistry** | `0xD04336F4C67Be09a96d90aD85C18EF9865923837` | Adapter registry |
| **ExecutorHub** | `0xb7AA0AE9E8D06732e84A6a7cEc1bd557676a8C6F` | Executor management |
| **GlobalRegistry** | `0x756a9f9464C7694B0Ff5bB75d16F5B8Ce988fc8d` | Task index |
| **RewardManager** | `0x3490a5A3d98f5D5038FC72C3fC7A6a9D94972633` | Reward distribution |
| **TaskLogicV2** | `0x3412c3DcC729436CfA3db52b92660aAC98F048cF` | Execution orchestration |
| **TaskFactory** | `0x76588f06eC7989408ED02AD82487B06222c5a882` | Creates task clones |
| **TimeBasedTransferAdapter** | `0x1d4198d0167caDCC2bA059a2F8B69A5a69aC3528` | Time-gated ERC20 transfers |
| **CCTPTransferAdapter** | `0x917ba52e4c5f7A142091A56f84C667bCd3A5642D` | Time-gated cross-chain bridge |
| **StorkPriceTransferAdapter** | `0xc956d136C7617b91126461fb1de0A1fBca5E0d56` | Price-conditional transfers |

> After running `npm run deploy:arc`, all new addresses are saved to
> `deployments/deployment-arc-full-<timestamp>.json` and `agent/manifest.json`.

---

## Adapters

### 1. TimeBasedTransferAdapter
Transfers ERC20 tokens (USDC or EURO) after a specific Unix timestamp.

```solidity
struct TransferParams {
    address token;        // MockUSDC or MockEURO
    address recipient;    // Destination address
    uint256 amount;       // Token amount (6 decimals)
    uint256 executeAfter; // Unix timestamp
}
```

**Example:** "Send 100 USDC to 0x1234... 24 hours from now"

### 2. CCTPTransferAdapter
Cross-chain bridge via Circle CCTP, with time-gate condition.

```
Params: (cctpMessenger, token, amount, destinationDomain, mintRecipient, executeAfter)
Domain IDs: 0=Ethereum, 1=Avalanche, 2=OP Mainnet, 3=Arbitrum, 6=Base
```

**Example:** "Bridge 50 USDC to Ethereum in 30 minutes"

### 3. StorkPriceTransferAdapter
Transfers tokens when Stork Oracle price condition is met (Chainlink-compatible interface).

```
Params: (storkOracle, token, amount, targetPrice, isBelow, recipient)
```

**Example:** "Transfer 100 USDC when USDC drops below $0.99"

---

## Quick Start

### Prerequisites
- Node.js 18+
- Arc testnet ETH (get from faucet at https://faucet.arc.network)

### 1. Install Dependencies
```bash
npm install
```

### 2. Compile Contracts
```bash
npm run compile
```

### 3. Run Tests (Local — No Network Required)
```bash
npm test
# Expected: 9/9 tests passing
```

### 4. Deploy to Arc Testnet
```bash
npm run deploy:arc
```
Deploys:
- MockUSDC + MockEURO (test tokens)
- MockTokenMessenger (CCTP simulator)
- MockStorkOracle (price feed)
- All core contracts (TaskFactory, TaskLogicV2, etc.)
- TimeBasedTransferAdapter, CCTPTransferAdapter, StorkPriceTransferAdapter
- Wires everything together

Saves to: `deployments/deployment-arc-full-<timestamp>.json`

### 5. Generate 59+ Transactions
```bash
npm run txs:arc
```
Creates tasks across all adapter types:
- 15 time-based USDC transfers
- 15 time-based EURO transfers
- 10 CCTP cross-chain bridge tasks
- 10 Stork price-based USDC transfers
- 5 Stork price-based EURO transfers

Saves tx log to: `deployments/txs-arc-<timestamp>.json`

### 6. Run Everything in One Command
```bash
npm run deploy:and:run
```

### 7. Start AI Agent Server
```bash
MISTRAL_API_KEY=MZQObVTrMQoqmADbPDgLpTxNwAg07FT7 npm run agent
# Starts at http://localhost:3000
```

---

## AI Agent API

### Create Task from Natural Language

```bash
POST http://localhost:3000/task/create-from-prompt
Content-Type: application/json

{
  "intent": "Transfer 100 USDC to 0x1234... in 1 hour"
}
```

Response:
```json
{
  "success": true,
  "summary": "Transfer 100 USDC 1 hour from now",
  "taskId": "42",
  "txHash": "0xabc...",
  "explorerUrl": "https://testnet.arc.network/tx/0xabc..."
}
```

### x402 Flow for AI Agents

Autonomous agents use this endpoint — payment is required before task creation.

**Step 1 — No payment header: returns 402**
```bash
POST http://localhost:3000/task/create-from-prompt-x402
Content-Type: application/json

{"intent": "Bridge 50 USDC to Ethereum tomorrow"}
```

Response:
```json
{
  "error": "Payment Required",
  "x402": {
    "payTo": "0x535f007D418B4F95f47310c0D26F3b25B6A4DC50",
    "amount": "0.0001",
    "currency": "ETH",
    "network": "Arc Testnet",
    "chainId": 5042002,
    "description": "API fee for AI-powered UARC task creation"
  },
  "instructions": "Send ETH to payTo address, then retry with X-Payment-Tx header"
}
```

**Step 2 — Pay on-chain, retry with proof**
```bash
POST http://localhost:3000/task/create-from-prompt-x402
X-Payment-Tx: 0xYourPaymentTxHash
Content-Type: application/json

{"intent": "Bridge 50 USDC to Ethereum tomorrow"}
```

Response:
```json
{
  "success": true,
  "paymentVerified": "0xYourPaymentTxHash",
  "taskId": "43",
  "txHash": "0xdef..."
}
```

---

## x402 Protocol

HTTP 402 "Payment Required" for on-chain API access control:

```
AI Agent -> POST /endpoint  (no payment)
Server   -> 402 { payTo, amount, currency, chainId }
Agent    -> Sends ETH on-chain to payTo
Agent    -> POST /endpoint { X-Payment-Tx: <txHash> }
Server   -> Verifies tx on-chain -> Processes request -> 200
```

This enables permissionless, trustless API monetization — any AI agent with a wallet can call the API.

---

## Network

| Parameter | Value |
|---|---|
| Network | Arc Testnet |
| Chain ID | 5042002 |
| RPC URL | `https://rpc.drpc.testnet.arc.network` |
| Explorer | `https://testnet.arc.network` |
| Native Token | ETH |
| Deployer | `0x535f007D418B4F95f47310c0D26F3b25B6A4DC50` |

---

## Project Structure

```
uarc/
├── contracts/
│   ├── core/
│   │   ├── TaskFactory.sol       # EIP-1167 clone factory
│   │   ├── TaskCore.sol          # On-chain task metadata + actions
│   │   ├── TaskVault.sol         # Isolated fund vault per task
│   │   ├── TaskLogicV2.sol       # Execution orchestration
│   │   ├── ExecutorHub.sol       # Executor registry + rewards
│   │   └── GlobalRegistry.sol    # Task index
│   ├── adapters/
│   │   ├── TimeBasedTransferAdapter.sol   # Time-gated USDC/EURO transfers
│   │   ├── CCTPTransferAdapter.sol        # Circle CCTP cross-chain bridge
│   │   └── StorkPriceTransferAdapter.sol  # Stork oracle price triggers
│   ├── support/
│   │   ├── ActionRegistry.sol    # Multi-adapter registry (by address)
│   │   └── RewardManager.sol     # Reputation-based executor rewards
│   └── mocks/
│       ├── MockERC20.sol           # Test USDC/EURO tokens
│       ├── MockTokenMessenger.sol  # CCTP simulator for testnet
│       └── MockStorkOracle.sol     # Chainlink-compatible price feed mock
├── scripts/
│   ├── deploy-arc-full.ts     # Full deployment script
│   └── run-59-txs.ts          # Generates 55+ testnet transactions
├── agent/
│   ├── server.ts              # Express REST API
│   ├── x402.ts                # x402 payment verification
│   ├── ai-task-creator.ts     # Mistral AI intent parser
│   └── manifest.json          # Protocol addresses + adapter metadata
├── test/
│   └── ArcAdapters.test.ts    # 9/9 integration tests
└── deployments/               # Deployment records + tx logs
```

---

## Key Design Decisions

### Multi-Adapter Registry (Fixed)
The `ActionRegistry` now supports lookup by adapter address (`getAdapterByAddress`), enabling multiple adapters with the same function selector. Previously, all adapters shared the `execute(address,bytes)` selector which caused the last-registered adapter to overwrite others.

### On-Chain Action Storage
Actions are stored in `TaskCore` during task creation and verified by hash at execution time — no off-chain storage or Merkle proofs needed.

### Isolated Vaults
Each task gets its own `TaskVault` clone. Token balances are fully isolated — no cross-task fund mixing is possible.

### Gas-Free Testnet Rewards
`gasReimbursementMultiplier` is set to 0 on testnet to prevent gas reimbursement from exceeding vault balance. On mainnet, executors can receive full gas reimbursement.

---

## Security

- **ReentrancyGuard** on all execution paths
- **SafeERC20** for non-standard token handling
- **Hash verification** of stored actions before execution
- **Protocol allowlist** in ActionRegistry
- **Early validation** via `validateParams()` during task creation

---

## License

MIT
