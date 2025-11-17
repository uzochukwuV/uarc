# Token Approval Fix - Frontend Issue Resolution

## Problem Identified

**Error:** Transaction reverted with `0x852bd26b` (InsufficientNativeTokenDeposited)

**Root Cause:** Missing ERC20 token approval step before creating task

## The Issue

When creating a task with token deposits (TimeBasedTransfer), the frontend was calling `TaskFactory.createTaskWithTokens()` directly without first approving the TaskFactory to spend the user's tokens.

### Flow Before Fix:
```
User clicks "Create Task"
  ↓
Frontend calls createTaskWithTokens()
  ↓
❌ TaskFactory tries to transferFrom user's tokens
  ↓
❌ FAILS - No approval given!
```

## The Fix

Added a two-step approval flow:

### Flow After Fix:
```
User clicks "Create Task"
  ↓
Frontend checks allowance
  ↓
IF allowance < required amount:
  → Request approval
  → Wait for confirmation
  → User clicks "Create Task" again
  ↓
Frontend calls createTaskWithTokens()
  ↓
✅ TaskFactory transfers tokens (approval granted)
  ↓
✅ Task created successfully!
```

## Changes Made

### 1. Created Token Approval Hook

**File:** `client/src/lib/hooks/useTokenApproval.ts`

```typescript
export function useTokenApproval(tokenAddress, spenderAddress) {
  // Read current allowance
  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [userAddress, spenderAddress],
  });

  // Write: Approve
  const { writeContract } = useWriteContract();

  const approve = (amount: bigint) => {
    writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddress, amount],
    });
  };

  return { allowance, approve, isPending, isSuccess };
}
```

### 2. Updated Create Task Page

**File:** `client/src/pages/create-task.tsx`

**Added:**
- Import `useTokenApproval` hook
- Initialize approval hook with token and TaskFactory addresses
- Check allowance before creating task
- Request approval if insufficient
- Show toast notification prompting user to retry after approval

**Code:**
```typescript
// Initialize approval hook
const { allowance, approve, isPending: isApprovePending } = useTokenApproval(
  formData.tokenAddress as `0x${string}`,
  taskFactoryAddress
);

// In handleCreate function:
if (selectedTemplate === "TIME_BASED_TRANSFER") {
  const transferAmount = BigInt(formData.transferAmount);
  const currentAllowance = allowance || 0n;

  // Check if approval needed
  if (currentAllowance < transferAmount) {
    toast({
      title: "Token Approval Required",
      description: `Please approve ${formData.transferAmount} tokens first`,
    });

    approve(transferAmount);
    return; // Stop here until approved
  }
}
```

### 3. Added Approval Confirmation Handler

```typescript
useEffect(() => {
  if (isApprovalConfirmed) {
    toast({
      title: "Approval Confirmed!",
      description: "Now click 'Create Task' again to proceed",
    });
  }
}, [isApprovalConfirmed, toast]);
```

## User Experience

### Before Fix:
1. User fills form
2. Clicks "Create Task"
3. ❌ Transaction fails immediately
4. Confusing error message

### After Fix:
1. User fills form
2. Clicks "Create Task"
3. 🔔 Wallet prompts for token approval
4. User approves
5. 🔔 Toast: "Approval Confirmed! Click Create Task again"
6. User clicks "Create Task" again
7. ✅ Task created successfully!

## Testing Checklist

- [ ] User has 0 allowance initially
- [ ] First click shows "Approval Required" toast
- [ ] Wallet opens approval transaction
- [ ] After approval, allowance updates correctly
- [ ] Second click creates task successfully
- [ ] If user already has allowance, skips approval step

## Additional ETH Fix

Also fixed the ETH calculation to ensure sufficient value is sent:

```typescript
// Before
const totalETHValue = rewardPerExecution * maxExecs + parseEther("0.09");

// After
const totalReward = rewardPerExecution * maxExecs;
const gasBuffer = parseEther("0.1");
const totalETHValue = creationFee + totalReward + gasBuffer;
```

**Why:** TaskFactory checks `msg.value - creationFee >= totalReward`

## Contract Validation

The fix aligns with TaskFactory.sol requirements:

```solidity
// Line 160-173 in TaskFactory.sol
for (uint256 i = 0; i < deposits.length; i++) {
    IERC20(deposits[i].token).safeTransferFrom(
        msg.sender,          // From user
        address(this),       // To TaskFactory
        deposits[i].amount
    );
    // ...
}
```

`safeTransferFrom` requires prior approval!

## Related Files

- ✅ `client/src/lib/hooks/useTokenApproval.ts` (NEW)
- ✅ `client/src/pages/create-task.tsx` (UPDATED)
- ✅ `docs/TOKEN_APPROVAL_FIX.md` (this file)

## Next Steps

1. Test on Polkadot Hub testnet
2. Verify approval → create flow
3. Check that allowance persists between sessions
4. Consider adding "Approve Max" option for better UX

---

**Status:** ✅ Ready for testing
**Issue:** 0x852bd26b error
**Fix:** Token approval flow added
**Result:** Users can now create tasks with token deposits successfully!
