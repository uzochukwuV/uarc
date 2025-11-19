# Smart Contract Data Retrieval Architecture Analysis

## Problem Statement

The marketplace was showing `undefined` values for execution details when fetching task data from `GlobalRegistry.getTaskInfo()`:
- `executionCount: undefined`
- `maxExecutions: undefined`
- `rewardPerExecution: undefined`

## Root Cause Analysis

### Smart Contract Architecture

The system uses a **distributed storage pattern** where task data is split across two contracts:

#### 1. **GlobalRegistry** (Index/Registry Contract)
- **Location**: `contracts/core/GlobalRegistry.sol`
- **Purpose**: Centralized registry for task discovery and indexing
- **Stores**: `TaskInfo` struct with only basic metadata
  ```solidity
  struct TaskInfo {
    uint256 taskId;
    address taskCore;           // ← Points to actual task data
    address taskVault;
    address creator;
    uint256 createdAt;
    uint256 expiresAt;
    TaskStatus status;          // ← Only status, not execution details
  }
  ```
- **Key Functions**:
  - `getTaskInfo(taskId)` - Returns `TaskInfo` with basic data only
  - `getExecutableTasks(limit, offset)` - Returns paginated executable tasks
  - `getTasksByCreator(creator)` - Returns task IDs for creator
  - `searchTasks(...)` - Multi-criteria search

#### 2. **TaskCore** (Task State Container)
- **Location**: `contracts/core/TaskCore.sol`
- **Purpose**: Holds complete task metadata and manages lifecycle
- **Stores**: `TaskMetadata` struct with execution details
  ```solidity
  struct TaskMetadata {
    uint256 id;
    address creator;
    uint96 createdAt;
    uint256 expiresAt;
    uint256 maxExecutions;           // ← HERE
    uint256 executionCount;          // ← HERE
    uint256 lastExecutionTime;
    uint256 recurringInterval;
    uint256 rewardPerExecution;      // ← HERE
    TaskStatus status;
    bytes32 actionsHash;
    bytes32 seedCommitment;
  }
  ```
- **Key Function**:
  - `getMetadata()` - Returns complete `TaskMetadata`
  - `isExecutable()` - Checks if task can be executed
  - `completeExecution(bool success)` - Updates execution count

## Solution: Two-Step Data Retrieval Pattern

### Step 1: Fetch Task from GlobalRegistry
```typescript
const taskInfo = await globalRegistry.getTaskInfo(taskId);
// Returns: taskId, taskCore, taskVault, creator, createdAt, expiresAt, status
```

### Step 2: Fetch Metadata from TaskCore
```typescript
const metadata = await taskCore.getMetadata();
// Returns: maxExecutions, executionCount, rewardPerExecution, etc.
```

### Complete Data Structure
```typescript
interface TaskWithMetadata {
  // From GlobalRegistry
  taskId: bigint;
  taskCore: `0x${string}`;
  taskVault: `0x${string}`;
  creator: `0x${string}`;
  createdAt: bigint;
  expiresAt: bigint;
  status: number;

  // From TaskCore.getMetadata()
  maxExecutions: bigint;
  executionCount: bigint;
  lastExecutionTime: bigint;
  recurringInterval: bigint;
  rewardPerExecution: bigint;
  actionsHash: `0x${string}`;
  seedCommitment: `0x${string}`;

  // Computed fields
  isExecutable?: boolean;
  remainingExecutions?: number;
  progressPercent?: number;
}
```

## Implementation

### New Hooks Created

#### 1. `useMarketplaceTasks(limit, offset)`
Fetches all executable tasks for marketplace display with full metadata.

```typescript
export function useMarketplaceTasks(limit: number = 20, offset: number = 0) {
  // Step 1: Get tasks from GlobalRegistry
  const { data: taskInfos } = useReadContract({
    functionName: 'getExecutableTasks',
    args: [BigInt(limit), BigInt(offset)],
  });

  // Step 2: For each task, fetch metadata from TaskCore
  useEffect(() => {
    const tasks = await Promise.all(
      taskInfos.map(async (taskInfo) => {
        const metadata = await taskCore.getMetadata();
        return { ...taskInfo, ...metadata };
      })
    );
    setTasks(tasks);
  }, [taskInfos]);
}
```

#### 2. `useTaskWithMetadata(taskId)`
Fetches a single task's complete data by ID.

#### 3. `useUserTasksWithMetadata(userAddress)`
Fetches all tasks created by a user with full metadata.

#### 4. `useExecutableTasksWithMetadata(limit, offset)`
Fetches executable tasks with pagination and full metadata.

### Wagmi Configuration Issues Fixed

**Issue 1: Chain ID not recognized**
- Problem: Polkadot Hub Testnet (420420422) was not in the supported chains list
- Fix: Updated `useWallet()` to support chainId 420420422
- File: `client/src/lib/hooks/useWallet.ts`

**Issue 2: Chain ID to contract address mapping**
- Problem: `getChainName()` didn't properly map chainId 420420422
- Fix: Added explicit mapping for polkadotHubTestnet
- File: `client/src/lib/contracts/addresses.ts`

## Frontend Updates

### Marketplace Component (`marketplace.tsx`)
- Now uses `useMarketplaceTasks()` hook instead of mock data
- Displays real execution counts and progress
- Shows real reward amounts from blockchain
- Calculates remaining executions and progress percentage

### Contract Interaction Flow

```
User → Marketplace
  ↓
useMarketplaceTasks()
  ↓
  ├─ GlobalRegistry.getExecutableTasks(limit, offset)
  │  └─ Returns: taskId, taskCore, taskVault, creator, createdAt, expiresAt, status
  │
  ├─ For each task → TaskCore.getMetadata()
  │  └─ Returns: maxExecutions, executionCount, rewardPerExecution, etc.
  │
  └─ Merge both responses
     └─ Complete TaskWithMetadata object
```

## Key Learnings

1. **Architecture Pattern**: GlobalRegistry acts as an index for discovery, while TaskCore holds the actual state
2. **Lazy Loading**: Execution details are only fetched when needed (not loaded upfront to save gas)
3. **Efficient Querying**: Can get task IDs quickly from GlobalRegistry, then fetch metadata in parallel for multiple tasks
4. **Status Distribution**: Task status is kept in both places:
   - GlobalRegistry: For indexing and searching
   - TaskCore: For actual state management

## Performance Considerations

- **N+1 Problem**: Fetching tasks requires N+1 contract calls (1 for list + N for metadata)
- **Solution**: Parallel fetch with `Promise.all()` for metadata
- **Optimization**: Consider caching metadata or implementing a multi-call aggregator for large task lists

## Testing Checklist

- [ ] Verify `useWallet()` returns correct chainId on Polkadot Hub Testnet
- [ ] Verify contract addresses are properly set for all networks
- [ ] Test marketplace loads without errors
- [ ] Verify execution counts display correctly
- [ ] Test task filtering works with real data
- [ ] Test progress bars calculate correctly

## Files Modified

1. `client/src/lib/hooks/useTasksWithMetadata.ts` (NEW)
   - 4 new hooks for fetching complete task data

2. `client/src/lib/hooks/useWallet.ts` (UPDATED)
   - Added support for chainId 420420422

3. `client/src/lib/contracts/addresses.ts` (UPDATED)
   - Fixed `getChainName()` mapping

4. `client/src/pages/marketplace.tsx` (UPDATED)
   - Replaced mock data with real blockchain data
   - Updated task display to use actual execution metrics

5. `client/src/lib/hooks/useDebugContractRead.ts` (NEW)
   - Debug hooks for troubleshooting wagmi reads

6. `client/src/lib/hooks/index.ts` (UPDATED)
   - Exported new hooks

## Next Steps

1. Test wagmi reads on actual network
2. Implement task execution with proper action proofs
3. Add error handling for failed metadata reads
4. Consider implementing multi-call aggregator for better performance
5. Add caching layer for frequently accessed tasks
