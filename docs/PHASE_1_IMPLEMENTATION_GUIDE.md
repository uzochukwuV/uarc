# Phase 1 Implementation Guide: Testnet Exclusive Window

## Quick Start

This guide details how to implement the **testnet-only exclusive window** without CAPTCHA or complex gates. Keep it simple, ship fast, learn from real users.

## What We're Building

### Simple Exclusive Window Model

```
Task Created
    ↓
[30 minute exclusive window - Platform executors only]
    ↓
Window expires
    ↓
[Public execution - Anyone can execute]
    ↓
Task completes or expires
```

**That's it.** No CAPTCHA, no reputation gates, no staking. Just fair access for first 30 minutes.

## Smart Contract Changes

### Step 1: Add ExecutionRules to Task Struct

**File:** `contracts/core/TaskCore.sol`

```solidity
// Add to TaskCore.sol
struct ExecutionRules {
    uint256 exclusiveWindowDuration;  // 0 = no exclusive window (default 1800 = 30 min)
}

struct Task {
    // ... existing fields
    uint256 createdAt;                // Block timestamp when created
    ExecutionRules executionRules;    // When to allow public execution
}
```

### Step 2: Update TaskLogicV2 to Check Exclusive Window

**File:** `contracts/core/TaskLogicV2.sol`

Add execution permission check:

```solidity
// Add to TaskLogicV2

// Platform executor whitelist (can execute during exclusive window)
mapping(address => bool) public isPlatformExecutor;

// Events
event ExecutorRegistered(address indexed executor);
event ExecutionDenied(uint256 indexed taskId, address indexed executor, string reason);

// Register platform executor (owner only, testnet)
function registerPlatformExecutor(address executor) external onlyOwner {
    isPlatformExecutor[executor] = true;
    emit ExecutorRegistered(executor);
}

// Unregister platform executor
function unregisterPlatformExecutor(address executor) external onlyOwner {
    isPlatformExecutor[executor] = false;
}

// Check if user can execute task
function canExecuteTask(uint256 taskId, address executor)
    external
    view
    returns (bool allowed, string memory reason)
{
    Task memory task = tasks[taskId];

    // Check if in exclusive window
    uint256 timeElapsed = block.timestamp - task.createdAt;
    bool inExclusiveWindow = timeElapsed < task.executionRules.exclusiveWindowDuration;

    if (inExclusiveWindow) {
        // During exclusive window: only platform executors
        if (!isPlatformExecutor[executor]) {
            return (false, "Task in exclusive window - available soon");
        }
    }

    // After window: anyone can execute
    return (true, "Execution allowed");
}

// Update _executeAction to check permissions
function _executeAction(address taskVault, Action memory action)
    internal
    returns (bool)
{
    // Get task to check execution rules
    Task memory task = tasks[taskId]; // taskId comes from caller context

    // NEW: Check execution permissions
    (bool canExecute, string memory reason) = canExecuteTask(taskId, msg.sender);
    if (!canExecute) {
        emit ExecutionDenied(taskId, msg.sender, reason);
        return false;
    }

    // ... rest of existing execution logic
    // Use getTokenRequirements() from refactored adapter (Phase 0)
    // Execute adapter, distribute rewards, etc.
}
```

### Step 3: Update TaskFactory Task Creation

**File:** `contracts/core/TaskFactory.sol`

```solidity
function createTaskWithTokens(
    TaskParams calldata params,
    Action[] calldata actions,
    TokenDeposit[] calldata deposits,
    uint256 exclusiveWindowDuration  // NEW parameter (e.g., 1800 for 30 min)
) external payable returns (uint256 taskId) {

    // ... existing validation

    // Create task
    TaskCore taskCore = TaskCore(taskCoreAddress);
    taskCore.initialize(
        msg.sender,
        params.expiresAt,
        params.maxExecutions,
        params.recurringInterval,
        params.rewardPerExecution
    );

    // NEW: Set execution rules
    taskCore.setExecutionRules(
        exclusiveWindowDuration,
        block.timestamp  // createdAt timestamp
    );

    // ... rest of existing logic
}
```

### Step 4: Update Frontend to Show Exclusive Window Status

**File:** `TaskerFrontend/client/src/lib/hooks/useExecutionStatus.ts` (NEW)

```typescript
import { useReadContract } from 'wagmi';
import { TaskLogicV2ABI } from '@lib/contracts/abis/TaskLogicV2.json';

interface ExecutionStatus {
    canExecute: boolean;
    reason: string;
    timeRemaining: number;  // seconds until public window
    isExclusiveWindow: boolean;
    isPlatformUser: boolean;
}

export function useExecutionStatus(taskId: string): ExecutionStatus {
    const { address } = useAccount();

    const { data: statusData } = useReadContract({
        address: taskLogicAddress,
        abi: TaskLogicV2ABI,
        functionName: 'canExecuteTask',
        args: [taskId, address],
    });

    const [canExecute, reason] = statusData || [false, ""];
    const task = useTaskInfo(taskId);

    const timeElapsed = Math.floor(Date.now() / 1000) - task.createdAt;
    const windowDuration = task.executionRules.exclusiveWindowDuration;
    const timeRemaining = Math.max(0, windowDuration - timeElapsed);
    const isExclusiveWindow = timeRemaining > 0;

    return {
        canExecute,
        reason,
        timeRemaining,
        isExclusiveWindow,
        isPlatformUser: isPlatformExecutor[address] || false,
    };
}
```

### Step 5: Update Frontend UI to Show Window Status

**File:** `TaskerFrontend/client/src/pages/execute-task.tsx` (UPDATE)

```typescript
import { useExecutionStatus } from '@lib/hooks/useExecutionStatus';

export function ExecuteTaskPage() {
    const { taskId } = useParams();
    const { canExecute, reason, timeRemaining, isExclusiveWindow } = useExecutionStatus(taskId);

    return (
        <div>
            {/* Show exclusive window status */}
            {isExclusiveWindow && (
                <Alert variant="info">
                    <Clock className="h-4 w-4" />
                    <AlertTitle>Exclusive Window Active</AlertTitle>
                    <AlertDescription>
                        Platform users have priority for the next {formatTime(timeRemaining)}.
                        {!canExecute && (
                            <div className="mt-2">
                                📱 Register as a platform executor to execute during this window.
                                <Link href="/executor/register">Register Now</Link>
                            </div>
                        )}
                    </AlertDescription>
                </Alert>
            )}

            {/* Show if can execute */}
            {!canExecute && !isExclusiveWindow && (
                <Alert variant="success">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Public Execution Available</AlertTitle>
                    <AlertDescription>
                        Window closed. Anyone can execute now!
                    </AlertDescription>
                </Alert>
            )}

            {/* Execute button */}
            <Button
                onClick={() => executeTask(taskId)}
                disabled={!canExecute}
            >
                {canExecute ? "Execute Task" : reason}
            </Button>
        </div>
    );
}
```

## Database/Frontend Changes

### Platform Executor Registration

**File:** `TaskerFrontend/shared/schema.ts`

```typescript
// Add to schema
export const platformExecutorSchema = z.object({
    address: z.string().refine(val => /^0x[a-fA-F0-9]{40}$/.test(val)),
    registeredAt: z.date(),
    isActive: z.boolean().default(true),
    totalExecutions: z.number().default(0),
    successfulExecutions: z.number().default(0),
});

export type PlatformExecutor = z.infer<typeof platformExecutorSchema>;
```

**File:** `TaskerFrontend/server/routes.ts`

```typescript
// Simple in-memory list for testnet (replace with DB later)
const platformExecutors = new Set<string>();

// Register as platform executor
app.post('/api/executor/register', async (req, res) => {
    const { address, signature } = req.body;

    // Verify signature (user signs message: "Register as platform executor")
    const recoveredAddress = ethers.verifyMessage(
        "Register as platform executor",
        signature
    );

    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
        return res.status(401).json({ error: "Invalid signature" });
    }

    platformExecutors.add(address.toLowerCase());

    // Also register on-chain (contract call)
    const tx = await taskLogic.registerPlatformExecutor(address);
    await tx.wait();

    res.json({
        success: true,
        message: "Registered as platform executor"
    });
});

// Get platform executor status
app.get('/api/executor/:address/status', (req, res) => {
    const { address } = req.params;
    const isPlatform = platformExecutors.has(address.toLowerCase());

    res.json({
        address,
        isPlatformExecutor: isPlatform,
        registeredAt: new Date(), // From DB
        totalExecutions: 0,        // From DB
    });
});
```

## Deployment Checklist

- [ ] Add ExecutionRules struct to TaskCore
- [ ] Add createdAt timestamp to Task
- [ ] Add canExecuteTask() view function to TaskLogicV2
- [ ] Add isPlatformExecutor mapping to TaskLogicV2
- [ ] Add platform executor registration functions
- [ ] Update _executeAction to check permissions
- [ ] Update TaskFactory createTaskWithTokens signature
- [ ] Add exclusive window parameter (default 1800 = 30 min)
- [ ] Deploy contracts to testnet
- [ ] Add useExecutionStatus hook to frontend
- [ ] Update execute task page UI
- [ ] Add /api/executor/register endpoint
- [ ] Add /api/executor/:address/status endpoint
- [ ] Create platform executor registration page
- [ ] Test full flow: create task → exclusive window → public window

## Testing Strategy

### Test Case 1: Exclusive Window Enforcement
```typescript
it("Should only allow platform executors during exclusive window", async () => {
    // 1. Create task with 30-min exclusive window
    const taskId = await createTask({ exclusiveWindow: 1800 });

    // 2. Non-platform executor tries to execute
    const [canExecute, reason] = await taskLogic.canExecuteTask(taskId, regularUser.address);
    expect(canExecute).to.be.false;
    expect(reason).to.include("exclusive window");

    // 3. Platform executor can execute
    const [canExecutePlatform, _] = await taskLogic.canExecuteTask(taskId, platformUser.address);
    expect(canExecutePlatform).to.be.true;
});
```

### Test Case 2: Public Window Opening
```typescript
it("Should allow anyone to execute after exclusive window expires", async () => {
    // 1. Create task
    const taskId = await createTask({ exclusiveWindow: 100 }); // 100 seconds

    // 2. Skip time
    await ethers.provider.send("evm_increaseTime", [150]); // 150 seconds

    // 3. Non-platform executor can now execute
    const [canExecute, reason] = await taskLogic.canExecuteTask(taskId, regularUser.address);
    expect(canExecute).to.be.true;
});
```

### Test Case 3: Frontend Status Display
```typescript
it("Should show correct status in frontend", async () => {
    // 1. Create task
    const taskId = await createTask({ exclusiveWindow: 1800 });

    // 2. Query status
    const status = await useExecutionStatus(taskId);
    expect(status.isExclusiveWindow).to.be.true;
    expect(status.timeRemaining).to.be.approximately(1800, 5);

    // 3. For non-platform user
    if (!isPlatformExecutor(user)) {
        expect(status.canExecute).to.be.false;
        expect(status.reason).to.include("exclusive window");
    }
});
```

## Rollout Plan

### Week 1: Testnet Alpha
- Deploy to testnet
- Manual test all cases
- Internal users register as platform executors
- Gather feedback

### Week 2: Community Testnet
- Public testnet launch
- Discord/Twitter announcement
- Link to /executor/register page
- Monitor execution patterns

### Week 3: Refinement
- Fix any bugs
- Adjust exclusive window duration based on feedback
- Prepare Phase 2 (reputation tracking)

## Monitoring & Metrics

Track these metrics to inform future phases:

```typescript
// Events to monitor
- TaskCreated (count, avg reward, execution window settings)
- ExecutionStarted (count, during/after window split)
- ExecutionDenied (count, reason breakdown)
- ExecutorRegistered (daily count, total registered)
- ExecutionSuccess (count, avg gas, avg rewards)
- ExecutionFailed (count, reasons)
```

## Known Limitations (Phase 1)

- ❌ No reputation system (all users equal)
- ❌ No CAPTCHA (trusting small testnet community)
- ❌ No rate limiting (assumes good actors)
- ❌ No gas optimization (simple validation)
- ✅ Exclusive window (fair for users)
- ✅ Decentralized fallback (no stuck tasks)
- ✅ Simple to implement (ship fast)

## Next Phase

Once you have:
- 50+ platform executors
- 100+ completed tasks
- Real usage patterns

Then move to **Phase 2: Reputation System** (see EXECUTION_MODEL.md)

---

**Remember:** This is testnet. Keep it simple, ship fast, learn from real users. Add complexity only when needed.
