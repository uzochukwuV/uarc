# Quick Reference: Debugging Execution Issues

## Problem: Users can execute tasks unlimited times

### Step 1: Check Smart Contract Behavior
```bash
# Run execution limit tests
npx hardhat test test/ExecutionLimitTest.test.ts

# ✅ If tests pass: Smart contract is correct
# ❌ If tests fail: There's a contract bug
```

**Expected Output:**
- Single execution limit: PASS
- Multiple execution limits: PASS
- Unlimited executions: PASS

---

## Step 2: Verify On-Chain Task Data

### Check Task Creation
```typescript
// In your hardhat console
const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);
const metadata = await taskCore.getMetadata();

console.log({
  maxExecutions: metadata.maxExecutions.toString(),
  executionCount: metadata.executionCount.toString(),
  status: metadata.status,
  // Status: 0=ACTIVE, 1=PAUSED, 2=EXECUTING, 3=COMPLETED
});
```

**What to look for:**
- Is `maxExecutions` set correctly? (Should NOT be 0 for limited tasks)
- Is `executionCount` incrementing? (Should increase after each execution)
- Does status change to 3 (COMPLETED) when limit reached?

### Monitor Debug Events
```typescript
// Listen for ExecutionCheckpoint events
const taskCore = await ethers.getContractAt("TaskCore", taskCoreAddress);

taskCore.on("ExecutionCheckpoint", (taskId, count, max, isExecutable, checkpoint) => {
  console.log({
    taskId: taskId.toString(),
    executionCount: count.toString(),
    maxExecutions: max.toString(),
    isExecutable,
    checkpoint,
  });
});
```

**Events to watch:**
- `executeTask_check` - Logs state before blocking
- `after_increment` - Confirms counter incremented
- `task_completed` - Marks when task hits limit

---

## Step 3: Verify Frontend Task State

### Check What Frontend Is Storing
```typescript
// In marketplace.tsx useEffect
useEffect(() => {
  console.log('[marketplace] Current task state:', {
    taskId: task.taskId.toString(),
    status: task.status,
    maxExecutions: task.maxExecutions.toString(),
    executionCount: task.executionCount.toString(),
    remainingExecutions: task.remainingExecutions,
    isExecutable: task.isExecutable,
  });
}, [task]);
```

**Red Flags:**
- ❌ `maxExecutions: 0` → Task is unlimited (by design)
- ❌ `status: 0` → Task still ACTIVE despite max executions reached
- ❌ `remainingExecutions: -1 or <= 0` → Should disable button
- ❌ `isExecutable: true` → But executionCount >= maxExecutions

---

## Step 4: Check Frontend Button Logic

### Current Code
```typescript
// marketplace.tsx - handleExecuteTask
const handleExecuteTask = (taskId: bigint) => {
  // ... no check if task is completed
  executeTask(taskId);
};

// No disable logic on button
<Button onClick={() => handleExecuteTask(task.taskId)}>
  Execute & Earn
</Button>
```

### Fixed Code
```typescript
const isTaskCompleted =
  task.maxExecutions > 0 &&  // Not unlimited
  task.executionCount >= task.maxExecutions;  // At limit

const isExecutionAllowed =
  task.status === 0 &&  // ACTIVE
  !isTaskCompleted;

const handleExecuteTask = (taskId: bigint) => {
  if (!isExecutionAllowed) {
    toast({
      title: "Cannot execute",
      description: "Task has reached its execution limit",
      variant: "destructive"
    });
    return;
  }
  setExecutingTaskId(taskId);
  executeTask(taskId);
};

<Button
  disabled={!isExecutionAllowed || isExecuting}
  onClick={() => handleExecuteTask(task.taskId)}
>
  {isTaskCompleted ? "Task Completed" : "Execute & Earn"}
</Button>
```

---

## Step 5: Add Metadata Refresh After Execution

### Add RefreshEffect
```typescript
// marketplace.tsx - add this effect
useEffect(() => {
  if (isExecuteSuccess && executingTaskId !== null) {
    console.log('[marketplace] Execution successful, refreshing metadata...');

    // Invalidate and refetch
    refetchMarketplaceTasks();

    // Clear state
    setExecutingTaskId(null);

    toast({
      title: "Execution confirmed",
      description: "Task metadata refreshed",
    });
  }
}, [isExecuteSuccess, executingTaskId]);
```

### Add Error Handler
```typescript
// marketplace.tsx - handle "Not active" error
catch (error: any) {
  const errorMessage = error?.reason || error?.message || "Unknown error";

  if (errorMessage.includes("Not active")) {
    toast({
      title: "Task Completed",
      description: "This task has reached its execution limit. Refreshing...",
      variant: "default"
    });
    // Refetch to show updated state
    refetchMarketplaceTasks();
  } else {
    toast({
      title: "Error",
      description: errorMessage,
      variant: "destructive"
    });
  }

  setExecutingTaskId(null);
}
```

---

## Step 6: Verify Task Creation

### Check What maxExecutions Is Being Sent
```typescript
// In your task creation form
const taskParams = {
  expiresAt: Math.floor(Date.now() / 1000) + 86400,
  maxExecutions: 1,  // ← CRITICAL: Should NOT be 0!
  recurringInterval: 0,
  rewardPerExecution: TASK_REWARD,
  seedCommitment: ethers.ZeroHash,
};

console.log('[task-creation] Sending params:', taskParams);
```

### Add Validation
```typescript
const validateTaskParams = (maxExecutions: number, recurringInterval: number) => {
  if (maxExecutions === 0 && recurringInterval === 0) {
    return "Must set either maxExecutions or recurringInterval";
  }
  if (maxExecutions < 0) {
    return "maxExecutions must be >= 0";
  }
  return null;
};

// In form submission
const error = validateTaskParams(maxExecutions, recurringInterval);
if (error) {
  toast({
    title: "Invalid parameters",
    description: error,
    variant: "destructive"
  });
  return;
}
```

---

## Quick Checklist

### ✅ Verify Smart Contract (First Priority)
- [ ] Run `npx hardhat test test/ExecutionLimitTest.test.ts`
- [ ] Confirm all 3 tests pass
- [ ] If any fail → Debug contract

### ✅ Verify On-Chain Data
- [ ] Check `maxExecutions` value in metadata
- [ ] Check `executionCount` increments after each execution
- [ ] Check `status` changes to COMPLETED (3) when limit reached
- [ ] Listen to debug events

### ✅ Verify Frontend
- [ ] Check task metadata is being fetched correctly
- [ ] Add console logs to verify `maxExecutions` value
- [ ] Verify button disable logic is implemented
- [ ] Test refresh after execution

### ✅ Test End-to-End
1. Create task with `maxExecutions: 1`
2. Check frontend displays remaining executions
3. Execute once → Should succeed
4. Check metadata refreshed → executionCount = 1, status = COMPLETED
5. Click execute again → Button should be disabled (or click should fail)

---

## Common Issues & Fixes

### Issue 1: "Task shows as ACTIVE but won't execute"
**Cause:** Frontend showing cached data
**Fix:** Add `refetchMarketplaceTasks()` after execution

### Issue 2: "Execute button always enabled"
**Cause:** No disable logic in button
**Fix:** Add `disabled={!isExecutionAllowed}` check

### Issue 3: "Execution count doesn't increment"
**Cause:** Frontend not refreshing
**Fix:** Refetch metadata after each execution

### Issue 4: "Can execute 10 times despite maxExecutions: 1"
**Cause:** Task created with wrong maxExecutions value
**Fix:** Verify value sent during task creation (check debug logs)

### Issue 5: "Get 'Not active' error on 2nd execution"
**Cause:** Smart contract working correctly!
**Fix:** This is expected. Refresh UI and show "Task Completed"

---

## Production Monitoring

### Events to Log
```typescript
// Log all execution checkpoint events
taskCore.on("ExecutionCheckpoint", (taskId, count, max, isExec, checkpoint) => {
  logger.info('ExecutionCheckpoint', {
    taskId: taskId.toString(),
    executionCount: count.toString(),
    maxExecutions: max.toString(),
    isExecutable: isExec,
    checkpoint,
    timestamp: new Date().toISOString(),
  });
});

// Log task execution events
taskCore.on("TaskExecuted", (taskId, executor, success) => {
  logger.info('TaskExecuted', {
    taskId: taskId.toString(),
    executor,
    success,
    timestamp: new Date().toISOString(),
  });
});

// Log task status changes
taskCore.on("TaskStatusChanged", (taskId, oldStatus, newStatus) => {
  logger.info('TaskStatusChanged', {
    taskId: taskId.toString(),
    oldStatus,
    newStatus,
    timestamp: new Date().toISOString(),
  });
});
```

### Metrics to Track
- Execution attempts vs successes
- Average executions per task
- Time from creation to completion
- Distribution of maxExecutions values
- Failed execution reasons

---

## Still Having Issues?

### Enable Detailed Logging
```typescript
// Enable logging in TaskLogicV2
console.log('[TaskLogic] executeTask called with:', {
  taskId: params.taskId,
  executor: params.executor,
});

// Monitor each step
console.log('[TaskLogic] Loaded task from registry');
console.log('[TaskLogic] Calling TaskCore.executeTask()...');
console.log('[TaskLogic] Execute returned:', result);
```

### Use Hardhat Debugger
```bash
# Start hardhat with debugging
npx hardhat --verbose test test/ExecutionLimitTest.test.ts

# Or use Hardhat console
npx hardhat console

# Then manually execute and inspect
> const task = await taskCore.getMetadata();
> console.log(task);
```

### Monitor Transaction Traces
```bash
# Deploy with detailed gas tracking
npx hardhat run scripts/deploy-v2.ts --show-trace

# Look for reverts and reason strings
```

