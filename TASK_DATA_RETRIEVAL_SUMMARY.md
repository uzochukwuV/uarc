# Task Data Retrieval & Marketplace Implementation Summary

## Overview
Completed comprehensive analysis and optimization of smart contract task data retrieval, with full frontend implementation for marketplace display and task execution.

## Problem Identified

### Issue: Undefined Execution Details
When fetching tasks from blockchain, execution metrics were returning `undefined`:
```javascript
{
  createdAt: 1763487540,
  creator: "0x8AaEe2071A400cC60927e46D53f751e521ef4D35",
  executionCount: undefined,  // ❌ MISSING
  expiresAt: 1763573928n,
  id: "0",
  maxExecutions: undefined,   // ❌ MISSING
  rewardPerExecution: undefined, // ❌ MISSING
  status: 0,
  taskCoreAddress: "0x21CfdB9634bE09be5A4d7bcA5e2CAB007d2B9A56",
  taskVaultAddress: "0x7df37F46D755710D8FfCa0Ec9C4F6552F77b7fB1"
}
```

### Root Cause
**Architectural Design**: Task data is deliberately split across two contracts:

| Component | Storage | Data |
|-----------|---------|------|
| **GlobalRegistry** | Index/Registry | taskId, taskCore, taskVault, creator, createdAt, expiresAt, status |
| **TaskCore** | State Container | maxExecutions, executionCount, rewardPerExecution, lastExecutionTime, etc. |

This is **intentional** for:
- Efficient indexing (GlobalRegistry doesn't store execution data)
- Gas optimization (don't load unused data)
- Lazy loading pattern (fetch metadata only when needed)

## Solution Architecture

### Two-Step Retrieval Pattern

```
Step 1: Get Basic Task Info
────────────────────────────
GlobalRegistry.getExecutableTasks(limit, offset)
    ↓
Returns: TaskInfo[] with basic metadata

Step 2: Fetch Full Metadata
──────────────────────────────
For each task → TaskCore.getMetadata()
    ↓
Returns: Complete TaskMetadata with execution details

Step 3: Merge Data
──────────────────
Combined TaskWithMetadata object ready for display
```

### Data Flow Diagram

```
Frontend (useMarketplaceTasks)
  │
  ├─→ useReadContract (wagmi)
  │   └─→ GlobalRegistry.getExecutableTasks()
  │       └─→ Returns: [{ taskId, taskCore, status, ... }]
  │
  ├─→ useEffect (fetch metadata)
  │   └─→ Promise.all([
  │       TaskCore_1.getMetadata(),
  │       TaskCore_2.getMetadata(),
  │       TaskCore_N.getMetadata()
  │     ])
  │     └─→ Returns: [{ maxExecutions, executionCount, ... }]
  │
  └─→ Merge & Display
      └─→ Complete TaskWithMetadata[] for rendering
```

## Implementation Details

### 1. New Data Type
**File**: `client/src/lib/hooks/useTasksWithMetadata.ts`

```typescript
interface TaskWithMetadata {
  // From GlobalRegistry
  taskId: bigint;
  taskCore: `0x${string}`;
  taskVault: `0x${string}`;
  creator: `0x${string}`;
  createdAt: bigint;
  expiresAt: bigint;
  status: number; // 0=ACTIVE, 1=PAUSED, 2=EXECUTING, 3=COMPLETED, 4=CANCELLED

  // From TaskCore.getMetadata()
  maxExecutions: bigint;
  executionCount: bigint;
  lastExecutionTime: bigint;
  recurringInterval: bigint;
  rewardPerExecution: bigint;
  actionsHash: `0x${string}`;
  seedCommitment: `0x${string}`;

  // Computed
  isExecutable?: boolean;
  remainingExecutions?: number;
  progressPercent?: number;
}
```

### 2. Four New Hooks

#### `useMarketplaceTasks(limit, offset)`
Fetches all executable tasks for marketplace display with full metadata.
- Pagination support
- Parallel metadata fetching
- Debug logging included
- Returns: `{ tasks, isLoading, taskCount, _debug }`

#### `useTaskWithMetadata(taskId)`
Fetches a single task's complete data by ID.
- Returns: `{ task, isLoading }`

#### `useUserTasksWithMetadata(userAddress)`
Fetches all tasks created by a user with full metadata.
- Returns: `{ tasks, taskIds, isLoading }`

#### `useExecutableTasksWithMetadata(limit, offset)`
Fetches executable tasks with pagination and full metadata.
- Returns: `{ tasks, isLoading }`

### 3. Wagmi Configuration Fixes

**Issue 1**: Chain ID 420420422 (Polkadot Hub Testnet) not recognized

**Fix**: Updated `useWallet.ts`
```typescript
const isSupported = chainId === 420420422 || chainId === 80001 || chainId === 137;
```

**Issue 2**: Chain ID to contract address mapping broken

**Fix**: Updated `addresses.ts`
```typescript
export function getChainName(chainId?: number): keyof typeof CONTRACTS {
  if (chainId === 420420422) return 'polkadotHubTestnet';
  if (chainId === 137) return 'polygon';
  if (chainId === 80001) return 'polygonMumbai';
  return 'polkadotHubTestnet';
}
```

### 4. Marketplace Component Updates

**File**: `client/src/pages/marketplace.tsx`

**Before**:
```typescript
// Mock data
const mockTasks = [
  { id: "1", name: "...", reward: "0.01", executionCount: 2, ... },
  { id: "2", name: "...", reward: "0.05", executionCount: 0, ... },
];
```

**After**:
```typescript
// Real blockchain data
const { tasks: marketplaceTasks } = useMarketplaceTasks(20, 0);

const displayTasks = useMemo(() => {
  return marketplaceTasks.map((task) => ({
    taskId: task.taskId,
    executionCount: Number(task.executionCount),
    maxExecutions: Number(task.maxExecutions),
    rewardPerExecution: task.rewardPerExecution,
    progressPercent: task.progressPercent,
    remainingExecutions: task.remainingExecutions,
  }));
}, [marketplaceTasks]);
```

### 5. Debug Utilities

**File**: `client/src/lib/hooks/useDebugContractRead.ts`

Created two debug hooks:
- `useDebugContractRead()` - Generic debug wrapper for contract reads
- `useTestGlobalRegistryRead()` - Specific test for GlobalRegistry connectivity

**Usage**:
```typescript
const debug = useMarketplaceTasks();
console.log(debug._debug); // See chainId, addresses, errors
```

## Files Modified/Created

### Created
1. ✅ `client/src/lib/hooks/useTasksWithMetadata.ts` (447 lines)
   - 4 hooks for complete task data retrieval
   - Parallel metadata fetching
   - Debug logging

2. ✅ `client/src/lib/hooks/useDebugContractRead.ts` (102 lines)
   - Debug utilities for wagmi troubleshooting

3. ✅ `SMART_CONTRACT_DATA_RETRIEVAL.md` (Detailed analysis)
4. ✅ `TASK_DATA_RETRIEVAL_SUMMARY.md` (This file)

### Updated
1. ✅ `client/src/pages/marketplace.tsx`
   - Replaced mock data with real blockchain tasks
   - Updated card display for actual execution metrics
   - Real reward calculations from blockchain
   - Progress bars with actual percentages

2. ✅ `client/src/lib/hooks/useWallet.ts`
   - Added support for chainId 420420422

3. ✅ `client/src/lib/contracts/addresses.ts`
   - Fixed chain ID to contract address mapping

4. ✅ `client/src/lib/hooks/index.ts`
   - Exported all new hooks

## Testing Checklist

### Wagmi Configuration
- [ ] Verify wallet shows correct network (Polkadot Hub Testnet)
- [ ] Check `useWallet().chainId` returns 420420422
- [ ] Verify contract addresses resolve correctly
- [ ] Check browser console for debug logs from `useMarketplaceTasks`

### Contract Reads
- [ ] `GlobalRegistry.getExecutableTasks()` returns task info
- [ ] Each `TaskCore.getMetadata()` call succeeds
- [ ] Parallel fetching completes without errors
- [ ] Debug info shows all required fields present

### Frontend Display
- [ ] Marketplace loads without errors
- [ ] Task cards display real execution counts
- [ ] Progress bars calculate correctly
- [ ] Reward amounts formatted properly
- [ ] Filter/search works with real data

### Error Handling
- [ ] Missing contract address handled gracefully
- [ ] RPC errors logged with helpful messages
- [ ] Network switch triggers reload
- [ ] Fallback to loading state on errors

## Performance Considerations

### Current Approach: N+1 Calls
```
1 call to GlobalRegistry.getExecutableTasks()
+ N calls to TaskCore.getMetadata() for each task
────────────────────────────────────
= N+1 total RPC calls
```

**Impact**: 20 tasks = 21 RPC calls

### Optimization Options

#### Option 1: Multicall Aggregator (Recommended)
- Create contract that batches metadata reads
- Single call returns all metadata
- Reduces to 2 RPC calls

#### Option 2: Caching Layer
- Cache metadata for X minutes
- Reduce repeated fetches
- Trade freshness for performance

#### Option 3: Subgraph/Indexer
- Off-chain indexing service
- Instant queries with latest data
- Best for production

## Key Learnings

1. **Smart Contract Separation**: GlobalRegistry and TaskCore serve different purposes
   - GlobalRegistry: Discovery & indexing
   - TaskCore: State management

2. **Gas Optimization**: Splitting data reduces storage costs
   - GlobalRegistry only stores what's needed for queries
   - TaskCore contains full execution state

3. **Lazy Loading Pattern**: Don't fetch metadata upfront
   - Only load when needed
   - Parallel fetching for multiple tasks
   - Significant gas savings

4. **Wagmi + Ethers Hybrid**: useReadContract for simple reads, direct ethers.js for complex logic
   - useReadContract: Easy, cached, good for simple calls
   - ethers.js: Full control, needed for fetching multiple contracts

## Next Steps

### Immediate
1. Test wagmi reads on actual testnet
2. Verify contract addresses are correctly deployed
3. Check browser console for debug messages
4. Test marketplace rendering with real data

### Short Term
1. Implement proper action proof generation for task execution
2. Add error boundaries and fallback UI
3. Implement task filtering with real data
4. Add pagination for large task lists

### Medium Term
1. Implement multicall aggregator for better performance
2. Add caching layer for metadata
3. Create task detail view component
4. Implement executor dashboard

### Long Term
1. Consider subgraph/indexer for scalability
2. Add real-time updates with websockets
3. Implement task analytics dashboard
4. Add advanced filtering and search

## Debugging Guide

### Issue: Reads returning undefined

**Check 1: Contract Address**
```javascript
console.log(useMarketplaceTasks()._debug.registryAddress);
// Should show actual address, not 0x000...
```

**Check 2: Chain ID**
```javascript
console.log(useMarketplaceTasks()._debug.chainId);
// Should show 420420422 for Polkadot Hub Testnet
```

**Check 3: Read Errors**
```javascript
console.log(useMarketplaceTasks()._debug.readError);
// Check for RPC errors
```

**Check 4: Browser Console**
```javascript
// Look for debug logs from useMarketplaceTasks
// [useMarketplaceTasks] Contract read debug: { ... }
```

### Issue: Metadata fetch failing

Check ethers.js provider:
```javascript
const provider = window.ethereum;
console.log(provider); // Should exist and be connected
```

## Contract Addresses (Polkadot Hub Testnet)

```
GLOBAL_REGISTRY: 0x3613b315bdba793842fffFc4195Cd6d4F1265560
TASK_CORE_IMPL: 0xFcAbca3d3cFb4db36a26681386a572e41C815de1
TASK_VAULT_IMPL: 0x2E8816dfa628a43B4B4E77B6e63cFda351C96447
TIME_BASED_TRANSFER_ADAPTER: 0x629cfCA0e279d895A798262568dBD8DaA7582912
```

## Resources

- [GlobalRegistry.sol Analysis](./SMART_CONTRACT_DATA_RETRIEVAL.md)
- [Wagmi Docs](https://wagmi.sh)
- [ethers.js Docs](https://docs.ethers.org)
- [Polkadot Hub Testnet RPC](https://testnet-passet-hub-eth-rpc.polkadot.io)
