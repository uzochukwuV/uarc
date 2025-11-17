# My Tasks Page - Blockchain Integration

## Overview

Replaced mock API calls with real blockchain data fetching for the "My Tasks" page.

## Changes Made

### 1. Created `useUserTasks` Hook

**File:** `client/src/lib/hooks/useUserTasks.ts`

**Purpose:** Fetch all tasks created by the connected user from the blockchain

**How it works:**
1. Gets user's task IDs from `TaskFactory.getUserTasks()`
2. For each task ID, fetches:
   - Task addresses from `TaskFactory.getTaskAddresses()`
   - Task metadata from `GlobalRegistry.getTaskInfo()`
3. Parses and formats data for UI consumption

**Interface:**
```typescript
export interface BlockchainTask {
  id: string;
  taskCoreAddress: string;
  taskVaultAddress: string;
  creator: string;
  createdAt: number;
  expiresAt: bigint;
  maxExecutions: bigint;
  executionCount: bigint;
  rewardPerExecution: bigint;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXPIRED';
}
```

**Usage:**
```typescript
const { tasks, isLoading, refetch } = useUserTasks();
```

### 2. Updated `my-tasks.tsx` Page

**File:** `client/src/pages/my-tasks.tsx`

**Changes:**
- ✅ Removed `useQuery` API calls
- ✅ Removed `useMutation` for task updates
- ✅ Added `useUserTasks()` hook
- ✅ Added `useWallet()` for user address
- ✅ Convert blockchain tasks to UI format
- ✅ Added wallet connection check
- ✅ Placeholder handlers for pause/cancel/resume

**Before:**
```typescript
// Mock data from API
const { data: tasks = [], isLoading } = useQuery<Task[]>({
  queryKey: [`/api/tasks?creator=${userAddress}`],
});
```

**After:**
```typescript
// Real data from blockchain
const { tasks: blockchainTasks, isLoading } = useUserTasks();

// Convert to UI format
const tasks = blockchainTasks.map(task => ({
  id: task.id,
  name: `Task #${task.id}`,
  description: `...${formatEther(task.rewardPerExecution)} ETH...`,
  status: task.status,
  executionCount: Number(task.executionCount),
  maxExecutions: Number(task.maxExecutions),
  // ... more fields
}));
```

### 3. Added Wallet Connection Guard

```typescript
if (!isConnected) {
  return (
    <div className="text-center py-24">
      <h1>My Tasks</h1>
      <p>Connect your wallet to view your tasks</p>
    </div>
  );
}
```

### 4. Task Status Mapping

The hook automatically determines task status:

```typescript
let status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXPIRED' = 'ACTIVE';

if (taskInfo.executionCount >= taskInfo.maxExecutions) {
  status = 'COMPLETED';
} else if (taskInfo.expiresAt > 0 && BigInt(Date.now() / 1000) > taskInfo.expiresAt) {
  status = 'EXPIRED';
}
```

## Required Smart Contract Functions

The integration relies on these contract functions:

### TaskFactory
```solidity
function getUserTasks(address user) external view returns (uint256[] memory);
function getTaskAddresses(uint256 taskId) external view returns (address taskCore, address taskVault);
```

### GlobalRegistry
```solidity
function getTaskInfo(uint256 taskId) external view returns (TaskInfo memory);
```

**Note:** If these functions don't exist in your contracts, you'll need to add them or modify the hook to use alternative methods.

## Data Flow

```
User Opens "My Tasks" Page
  ↓
useUserTasks() Hook Activated
  ↓
Call TaskFactory.getUserTasks(userAddress)
  ↓
Receive Task IDs: [0, 1, 2, ...]
  ↓
For Each Task ID:
  ├→ Call TaskFactory.getTaskAddresses(taskId)
  │  → Get taskCore & taskVault addresses
  └→ Call GlobalRegistry.getTaskInfo(taskId)
     → Get creator, executions, reward, etc.
  ↓
Combine & Format Data
  ↓
Display in UI
```

## UI Features

### Task Filtering
- **All Tasks**: Shows all user tasks
- **Active**: `status === 'ACTIVE'`
- **Paused**: `status === 'PAUSED'` (coming soon)
- **Completed**: `status === 'COMPLETED' || 'EXPIRED'`

### Task Actions
Currently placeholders (to be implemented):
- Cancel Task → Will call `TaskCore.cancel()`
- Pause Task → Will call `TaskCore.pause()`
- Resume Task → Will call `TaskCore.resume()`

## Testing Checklist

- [ ] Connect wallet
- [ ] View empty state (no tasks created)
- [ ] Create a task via Create Task page
- [ ] Return to My Tasks - see new task appear
- [ ] Verify task data is correct:
  - [ ] Task ID
  - [ ] Reward amount
  - [ ] Execution count
  - [ ] Status
- [ ] Test filtering (All/Active/Completed tabs)
- [ ] Disconnect wallet - see connect message

## Future Enhancements

### 1. Real-Time Updates
```typescript
// Poll for new tasks every 10 seconds
const { tasks, refetch } = useUserTasks();

useEffect(() => {
  const interval = setInterval(refetch, 10000);
  return () => clearInterval(interval);
}, [refetch]);
```

### 2. Task Details Modal
- Click task → Show full details
- View task parameters
- See execution history
- View vault balances

### 3. Task Management Actions
Implement pause/cancel/resume:
```typescript
const taskCore = await ethers.getContractAt("TaskCore", task.taskCoreAddress);
await taskCore.pause(); // or cancel(), resume()
```

### 4. Advanced Filtering
- Filter by type (TimeBasedTransfer, LimitOrder, etc.)
- Sort by creation date, reward, status
- Search by task ID

## Known Limitations

1. **No getUserTasks() function**: If your TaskFactory doesn't have this, you'll need to:
   - Add it to the contract, OR
   - Query events: `filter TaskCreated by creator address`

2. **Performance**: Fetching many tasks can be slow
   - Consider pagination
   - Implement caching
   - Use TheGraph for indexing

3. **Status Detection**: Currently client-side
   - Consider adding `getTaskStatus()` to TaskCore
   - Would be more accurate

## Related Files

- ✅ `client/src/lib/hooks/useUserTasks.ts` (NEW)
- ✅ `client/src/lib/hooks/index.ts` (UPDATED - exports)
- ✅ `client/src/pages/my-tasks.tsx` (UPDATED - blockchain data)
- ✅ `docs/MY_TASKS_BLOCKCHAIN_INTEGRATION.md` (this file)

## Next Steps

1. Test with real wallet and tasks
2. Verify TaskFactory has `getUserTasks()` function
3. Verify GlobalRegistry has `getTaskInfo()` function
4. If missing, implement event-based fetching
5. Add task management actions (pause/cancel/resume)

---

**Status:** ✅ Ready for testing
**Dependencies:** TaskFactory, GlobalRegistry smart contracts
**Impact:** Users can now see their real tasks from the blockchain!
