# TaskerOnChain Frontend Implementation Guide

> **Complete guide to building the TaskerOnChain user interface**

**Last Updated:** January 2025
**Target Stack:** Next.js 14 + TypeScript + ethers.js v6 + TailwindCSS
**Estimated Timeline:** 8-12 weeks for MVP

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [User Flows](#user-flows)
5. [Core Features](#core-features)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Component Library](#component-library)
8. [Smart Contract Integration](#smart-contract-integration)
9. [State Management](#state-management)
10. [UI/UX Guidelines](#uiux-guidelines)
11. [Mobile App (Executor)](#mobile-app-executor)
12. [Deployment](#deployment)

---

## Overview

### Three Applications to Build

```
┌─────────────────────────────────────────────────────────────┐
│                     TaskerOnChain Frontend                  │
└─────────────────────────────────────────────────────────────┘
                              │
                 ┌────────────┼────────────┐
                 │            │            │
         ┌───────▼──────┐ ┌──▼──────┐ ┌──▼──────────┐
         │ Task Creator │ │Executor │ │   Adapter   │
         │   Web App    │ │ Mobile  │ │  Registry   │
         │              │ │   App   │ │  (Web App)  │
         └──────────────┘ └─────────┘ └─────────────┘
```

### MVP Scope (First 8 Weeks)

**Must Have:**
1. ✅ Task Creator Web App (desktop)
2. ✅ Executor Dashboard (web, mobile later)
3. ✅ Basic analytics/monitoring

**Nice to Have (Phase 2):**
4. ⚠️ Executor Mobile App (React Native)
5. ⚠️ Adapter Registry UI
6. ⚠️ Advanced analytics

---

## Tech Stack

### Web Applications

```json
{
  "framework": "Next.js 14 (App Router)",
  "language": "TypeScript",
  "styling": "TailwindCSS + shadcn/ui",
  "blockchain": "ethers.js v6 or viem",
  "wallet": "RainbowKit or ConnectKit",
  "state": "Zustand + TanStack Query",
  "forms": "React Hook Form + Zod",
  "charts": "Recharts or Chart.js",
  "notifications": "react-hot-toast",
  "tables": "TanStack Table",
  "deployment": "Vercel"
}
```

### Mobile App (Executor)

```json
{
  "framework": "React Native (Expo)",
  "language": "TypeScript",
  "wallet": "WalletConnect v2",
  "navigation": "React Navigation",
  "state": "Zustand + TanStack Query",
  "ui": "NativeWind (Tailwind for RN)",
  "notifications": "Expo Notifications",
  "deployment": "EAS Build"
}
```

### Why This Stack?

✅ **Next.js 14:** Best React framework, great DX, easy deployment
✅ **TypeScript:** Type safety for smart contract interactions
✅ **TailwindCSS:** Rapid UI development, consistent design
✅ **ethers.js v6:** Most popular, great docs, TypeScript support
✅ **Zustand:** Simpler than Redux, perfect for crypto apps
✅ **TanStack Query:** Perfect for blockchain data fetching
✅ **RainbowKit:** Beautiful wallet connection UX

---

## Architecture

### Project Structure

```
taskerOnChain-frontend/
├── apps/
│   ├── web/                    # Task Creator Web App (Next.js)
│   │   ├── src/
│   │   │   ├── app/            # Next.js 14 App Router
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── tasks/
│   │   │   │   │   ├── create/
│   │   │   │   │   └── analytics/
│   │   │   │   ├── api/        # API routes (if needed)
│   │   │   │   └── layout.tsx
│   │   │   ├── components/     # Shared components
│   │   │   │   ├── ui/         # shadcn/ui components
│   │   │   │   ├── task/       # Task-specific components
│   │   │   │   ├── wallet/     # Wallet connection
│   │   │   │   └── layout/     # Layout components
│   │   │   ├── lib/            # Utilities
│   │   │   │   ├── contracts/  # Contract ABIs & addresses
│   │   │   │   ├── hooks/      # Custom React hooks
│   │   │   │   ├── utils/      # Helper functions
│   │   │   │   └── constants/  # Constants
│   │   │   └── store/          # Zustand stores
│   │   └── public/
│   │
│   ├── executor/               # Executor Dashboard (Next.js)
│   │   └── (similar structure)
│   │
│   └── mobile/                 # Executor Mobile App (React Native)
│       ├── src/
│       │   ├── screens/
│       │   ├── components/
│       │   ├── navigation/
│       │   └── lib/
│       └── app.json
│
├── packages/                   # Shared code
│   ├── contracts/              # Contract ABIs, types, addresses
│   │   ├── abis/
│   │   ├── addresses/
│   │   └── types/              # TypeChain generated types
│   │
│   ├── ui/                     # Shared UI components
│   │   └── components/
│   │
│   └── utils/                  # Shared utilities
│       ├── formatters/
│       ├── validators/
│       └── constants/
│
├── package.json
└── turbo.json                  # Turborepo config (monorepo)
```

### Tech Decisions

**Monorepo (Turborepo):**
- Share contract ABIs across apps
- Reuse components
- Consistent tooling

**Alternative (Simpler):**
- Single Next.js app with different routes
- `/create` - Task creator
- `/execute` - Executor dashboard
- `/adapters` - Adapter registry

For MVP, **single Next.js app is recommended** (faster development).

---

## User Flows

### Flow 1: Task Creator Journey

```
┌─────────────┐
│ Connect     │
│ Wallet      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Choose Task │ ← "DCA", "Limit Order", "Auto-Compound"
│ Template    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Configure   │ ← Amount, frequency, conditions
│ Parameters  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Approve     │ ← ERC20 approval (if needed)
│ Tokens      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Create Task │ ← Transaction: createTaskWithTokens()
│             │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Task Live   │ ← View status, executions, analytics
│ Dashboard   │
└─────────────┘
```

### Flow 2: Executor Journey

```
┌─────────────┐
│ Connect     │
│ Wallet      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Register as │ ← Stake ETH (registerExecutor)
│ Executor    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Browse      │ ← Filter: profitable, pending, my executions
│ Tasks       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Select Task │ ← See: reward, gas cost, profit estimate
│ to Execute  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Commit      │ ← requestExecution() - prevent front-running
│ (TX 1)      │
└──────┬──────┘
       │
       ▼ (Wait 1 block)
┌─────────────┐
│ Execute     │ ← executeTask() - earn reward
│ (TX 2)      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Earnings    │ ← Dashboard: total earned, reputation, stats
│ Dashboard   │
└─────────────┘
```

### Flow 3: Adapter Developer Journey

```
┌─────────────┐
│ Build       │ ← Solidity: implement IActionAdapter
│ Adapter     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Deploy      │ ← Deploy contract to network
│ Contract    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Register    │ ← actionRegistry.registerAdapter()
│ in Registry │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Submit to   │ ← Web form: name, description, params
│ Marketplace │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Earn Fees   │ ← 0.1% of task volume using adapter
│             │
└─────────────┘
```

---

## Core Features

### 1. Task Creator App

#### 1.1 Dashboard (Home Page)

**Components:**
```tsx
// app/(dashboard)/page.tsx
<Dashboard>
  <WalletConnect />
  <TaskStats
    totalTasks={10}
    activeTasks={3}
    completedTasks={7}
    totalSpent={1.5} // ETH
  />
  <TaskList
    tasks={userTasks}
    onViewDetails={(taskId) => router.push(`/tasks/${taskId}`)}
  />
  <QuickActions>
    <CreateTaskButton />
    <DepositFundsButton />
  </QuickActions>
</Dashboard>
```

**Data to Fetch:**
- User's tasks (from GlobalRegistry events)
- Task statuses (active, completed, cancelled)
- Execution history
- Balance in vaults

**APIs:**
```typescript
// hooks/useTasks.ts
export function useTasks(userAddress: string) {
  return useQuery({
    queryKey: ['tasks', userAddress],
    queryFn: async () => {
      // Fetch TaskCreated events from GlobalRegistry
      const tasks = await globalRegistry.queryFilter(
        globalRegistry.filters.TaskCreated(null, userAddress)
      );
      // Enrich with metadata from TaskCore
      return Promise.all(tasks.map(enrichTaskData));
    },
    refetchInterval: 10000, // Poll every 10s
  });
}
```

#### 1.2 Create Task Flow

**Step 1: Choose Template**

```tsx
// app/create/page.tsx
<TemplateSelector>
  <Template
    name="Dollar Cost Average"
    icon={<CoinsIcon />}
    description="Buy crypto on a schedule"
    popular={true}
  />
  <Template
    name="Limit Order"
    icon={<TrendingDownIcon />}
    description="Buy/sell when price hits target"
  />
  <Template
    name="Auto-Compound"
    icon={<RefreshIcon />}
    description="Reinvest staking rewards"
  />
  <Template
    name="Portfolio Rebalance"
    icon={<PieChartIcon />}
    description="Maintain target allocation"
  />
</TemplateSelector>
```

**Step 2: Configure Parameters**

```tsx
// app/create/[template]/page.tsx
<TaskConfigForm template="limit-order">
  {/* Protocol Selection */}
  <ProtocolSelect
    label="DEX"
    options={['Uniswap V2', 'Uniswap V3', 'SushiSwap']}
    selected="Uniswap V2"
  />

  {/* Token Pair */}
  <TokenPairInput
    tokenIn={USDC}
    tokenOut={WETH}
    amountIn={1000}
    amountInUSD={1000}
  />

  {/* Condition (Price Limit) */}
  <PriceCondition
    label="Execute when ETH price is"
    operator="<="
    price={2500}
    currentPrice={3000}
  />

  {/* Slippage */}
  <SlippageInput
    value={0.5}
    label="Max Slippage"
  />

  {/* Advanced */}
  <AdvancedSettings>
    <Input label="Max Executions" value={1} />
    <Input label="Expires In" value="30 days" />
    <Input label="Reward per Execution" value={0.01} suffix="ETH" />
  </AdvancedSettings>

  {/* Preview */}
  <TaskPreview
    summary="Buy ETH with 1000 USDC when price ≤ $2,500"
    estimatedGas="0.015 ETH"
    totalCost="1000 USDC + 0.025 ETH"
  />

  <CreateButton onClick={handleCreate} />
</TaskConfigForm>
```

**Step 3: Approve & Create**

```tsx
// hooks/useCreateTask.ts
export function useCreateTask() {
  const [step, setStep] = useState<'idle' | 'approving' | 'creating' | 'success'>('idle');

  const createTask = async (params: TaskParams) => {
    try {
      // Step 1: Approve USDC if needed
      setStep('approving');
      const allowance = await usdcContract.allowance(userAddress, taskFactoryAddress);
      if (allowance < params.tokenAmount) {
        const approveTx = await usdcContract.approve(taskFactoryAddress, params.tokenAmount);
        await approveTx.wait();
      }

      // Step 2: Create task
      setStep('creating');
      const tx = await taskFactory.createTaskWithTokens(
        {
          expiresAt: params.expiresAt,
          maxExecutions: params.maxExecutions,
          recurringInterval: 0,
          rewardPerExecution: params.reward,
          seedCommitment: ethers.ZeroHash,
        },
        params.actions,
        params.deposits,
        { value: params.reward } // ETH for executor reward
      );

      const receipt = await tx.wait();
      const taskId = parseTaskCreatedEvent(receipt);

      setStep('success');
      return taskId;

    } catch (error) {
      setStep('idle');
      throw error;
    }
  };

  return { createTask, step };
}
```

#### 1.3 Task Details Page

```tsx
// app/tasks/[taskId]/page.tsx
<TaskDetailsPage taskId={taskId}>
  {/* Header */}
  <TaskHeader
    title="USDC → ETH Limit Order"
    status="Active"
    taskId={taskId}
  />

  {/* Key Metrics */}
  <MetricsGrid>
    <Metric label="Executions" value="0 / 1" />
    <Metric label="Reward Pool" value="0.01 ETH" />
    <Metric label="Expires" value="29 days" />
    <Metric label="Created" value="2 hours ago" />
  </MetricsGrid>

  {/* Condition Status */}
  <ConditionCard>
    <ConditionLabel>Waiting for ETH ≤ $2,500</ConditionLabel>
    <CurrentStatus>
      <PriceDisplay current={3000} target={2500} />
      <Progress value={0} max={100} />
    </CurrentStatus>
  </ConditionCard>

  {/* Action Details */}
  <ActionCard>
    <ActionStep number={1}>
      Swap 1000 USDC → WETH on Uniswap V2
    </ActionStep>
    <Params>
      <Param label="Min Output" value="0.39 WETH" />
      <Param label="Slippage" value="0.5%" />
      <Param label="Recipient" value={shortenAddress(user)} />
    </Params>
  </ActionCard>

  {/* Execution History */}
  <ExecutionHistory taskId={taskId} />

  {/* Actions */}
  <ActionButtons>
    <CancelButton onClick={handleCancel} />
    <DepositButton onClick={handleDeposit} />
  </ActionButtons>
</TaskDetailsPage>
```

#### 1.4 Analytics Dashboard

```tsx
// app/analytics/page.tsx
<Analytics>
  {/* Overview */}
  <StatsOverview>
    <Stat label="Total Tasks" value={25} change="+12%" />
    <Stat label="Success Rate" value="94%" change="+2%" />
    <Stat label="Total Spent" value="5.2 ETH" change="+0.8 ETH" />
    <Stat label="Avg Execution Time" value="15 min" change="-5 min" />
  </StatsOverview>

  {/* Charts */}
  <ChartGrid>
    <TasksOverTimeChart data={tasksData} />
    <TaskTypeDistribution data={typeData} />
    <ExecutorPerformance data={executorData} />
  </ChartGrid>

  {/* Task Breakdown */}
  <TaskTable
    columns={['Type', 'Created', 'Executions', 'Success Rate', 'Cost']}
    data={taskBreakdown}
  />
</Analytics>
```

---

### 2. Executor App

#### 2.1 Executor Dashboard

```tsx
// app/(executor)/dashboard/page.tsx
<ExecutorDashboard>
  {/* Earnings Summary */}
  <EarningsSummary>
    <BigStat label="Total Earned" value="1.25 ETH" valueUSD="$3,125" />
    <Stat label="Tasks Executed" value={42} />
    <Stat label="Success Rate" value="98%" />
    <Stat label="Reputation" value="Gold" level={3} />
  </EarningsSummary>

  {/* Today's Activity */}
  <TodayCard>
    <Stat label="Earned Today" value="0.08 ETH" />
    <Stat label="Tasks Executed" value={3} />
    <Stat label="Est. Tomorrow" value="0.12 ETH" />
  </TodayCard>

  {/* Available Tasks */}
  <AvailableTasksWidget>
    <TaskRow
      taskId={123}
      type="Limit Order"
      reward="0.01 ETH"
      gasEstimate="0.003 ETH"
      profit="0.007 ETH"
      profitability="high"
    />
  </AvailableTasksWidget>

  {/* Reputation Progress */}
  <ReputationCard
    currentLevel="Gold"
    nextLevel="Platinum"
    progress={65}
    benefits={['2x rewards on trending tasks', 'Priority execution']}
  />
</ExecutorDashboard>
```

#### 2.2 Browse Tasks

```tsx
// app/(executor)/tasks/page.tsx
<TaskBrowser>
  {/* Filters */}
  <FilterBar>
    <FilterChip label="All" active />
    <FilterChip label="High Profit" />
    <FilterChip label="Low Gas" />
    <FilterChip label="Ready to Execute" />
    <FilterChip label="My Commitments" />
  </FilterBar>

  {/* Sort */}
  <SortDropdown
    options={['Highest Reward', 'Best Profit Margin', 'Newest', 'Expiring Soon']}
    selected="Best Profit Margin"
  />

  {/* Task Grid */}
  <TaskGrid>
    {tasks.map(task => (
      <ExecutableTaskCard
        key={task.id}
        taskId={task.id}
        type={task.type}
        reward={task.reward}
        gas={task.estimatedGas}
        profit={task.profit}
        expiresIn={task.expiresIn}
        condition={task.condition}
        conditionMet={task.canExecute}
        onCommit={() => handleCommit(task.id)}
        onExecute={() => handleExecute(task.id)}
      />
    ))}
  </TaskGrid>
</TaskBrowser>
```

**ExecutableTaskCard Component:**

```tsx
// components/executor/ExecutableTaskCard.tsx
export function ExecutableTaskCard({
  taskId,
  type,
  reward,
  gas,
  profit,
  conditionMet,
  onCommit,
  onExecute,
}: ExecutableTaskCardProps) {
  const profitColor = profit > 0 ? 'text-green-500' : 'text-red-500';
  const profitability = calculateProfitability(profit, gas);

  return (
    <Card className="p-4 hover:shadow-lg transition">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <Badge variant={conditionMet ? 'success' : 'warning'}>
            {conditionMet ? 'Ready' : 'Waiting'}
          </Badge>
          <h3 className="font-semibold mt-1">{type}</h3>
          <p className="text-sm text-gray-500">Task #{taskId}</p>
        </div>
        <ProfitabilityBadge level={profitability} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Metric
          label="Reward"
          value={formatEther(reward)}
          suffix="ETH"
          icon={<CoinsIcon />}
        />
        <Metric
          label="Gas"
          value={formatEther(gas)}
          suffix="ETH"
          icon={<GasIcon />}
        />
        <Metric
          label="Profit"
          value={formatEther(profit)}
          suffix="ETH"
          className={profitColor}
          icon={<TrendingUpIcon />}
        />
      </div>

      {/* Condition */}
      <ConditionBadge condition={condition} met={conditionMet} />

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        {!committed && (
          <Button
            variant="outline"
            onClick={onCommit}
            disabled={!conditionMet}
          >
            Commit
          </Button>
        )}
        {committed && (
          <Button
            variant="primary"
            onClick={onExecute}
            disabled={!canExecute}
          >
            Execute & Earn
          </Button>
        )}
        <Button variant="ghost" size="icon">
          <InfoIcon />
        </Button>
      </div>
    </Card>
  );
}
```

#### 2.3 Execute Task Flow

```tsx
// hooks/useExecuteTask.ts
export function useExecuteTask() {
  const [step, setStep] = useState<'idle' | 'committing' | 'waiting' | 'executing' | 'success'>('idle');
  const [commitment, setCommitment] = useState<string | null>(null);

  const commit = async (taskId: number) => {
    setStep('committing');

    // Generate random nonce
    const nonce = ethers.randomBytes(32);
    const commitmentHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [nonce])
    );

    // Submit commitment
    const tx = await executorHub.requestExecution(taskId, commitmentHash);
    await tx.wait();

    // Store nonce locally (don't lose it!)
    localStorage.setItem(`commitment_${taskId}`, ethers.hexlify(nonce));
    setCommitment(commitmentHash);
    setStep('waiting');

    return { commitmentHash, nonce };
  };

  const execute = async (taskId: number, actionsProof: string) => {
    setStep('executing');

    // Retrieve stored nonce
    const nonce = localStorage.getItem(`commitment_${taskId}`);
    if (!nonce) throw new Error('Commitment nonce not found');

    // Execute task
    const tx = await executorHub.executeTask(taskId, nonce, actionsProof);
    const receipt = await tx.wait();

    // Parse reward from events
    const reward = parseRewardFromReceipt(receipt);

    setStep('success');
    return reward;
  };

  return { commit, execute, step, commitment };
}
```

#### 2.4 Earnings Analytics

```tsx
// app/(executor)/earnings/page.tsx
<EarningsPage>
  {/* Summary */}
  <EarningsSummary>
    <BigNumber
      label="Lifetime Earnings"
      value="12.5 ETH"
      valueUSD="$31,250"
    />
    <MetricsRow>
      <Metric label="This Month" value="1.2 ETH" />
      <Metric label="This Week" value="0.3 ETH" />
      <Metric label="Today" value="0.08 ETH" />
    </MetricsRow>
  </EarningsSummary>

  {/* Chart */}
  <EarningsChart
    data={earningsHistory}
    timeRange="30d"
  />

  {/* Breakdown */}
  <EarningsBreakdown>
    <BreakdownItem
      category="Task Rewards"
      amount="10.2 ETH"
      percentage={82}
    />
    <BreakdownItem
      category="Reputation Bonus"
      amount="1.8 ETH"
      percentage={14}
    />
    <BreakdownItem
      category="Referrals"
      amount="0.5 ETH"
      percentage={4}
    />
  </EarningsBreakdown>

  {/* Recent Executions */}
  <RecentExecutionsTable
    columns={['Task', 'Time', 'Reward', 'Gas Cost', 'Profit']}
    data={recentExecutions}
  />
</EarningsPage>
```

---

### 3. Shared Components

#### 3.1 Wallet Connection

```tsx
// components/wallet/WalletConnect.tsx
'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export function WalletConnect() {
  return (
    <ConnectButton
      accountStatus="address"
      chainStatus="icon"
      showBalance={true}
    />
  );
}
```

**Setup RainbowKit:**

```tsx
// app/providers.tsx
'use client';

import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultWallets, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { configureChains, createConfig, WagmiConfig } from 'wagmi';
import { polygon, polygonMumbai } from 'wagmi/chains';
import { publicProvider } from 'wagmi/providers/public';

const { chains, publicClient } = configureChains(
  [polygon, polygonMumbai],
  [publicProvider()]
);

const { connectors } = getDefaultWallets({
  appName: 'TaskerOnChain',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains,
});

const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient,
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider chains={chains}>
        {children}
      </RainbowKitProvider>
    </WagmiConfig>
  );
}
```

#### 3.2 Contract Hooks

```tsx
// hooks/useTaskFactory.ts
import { useContract, useSigner } from 'wagmi';
import TaskFactoryABI from '@/contracts/abis/TaskFactory.json';
import { TASK_FACTORY_ADDRESS } from '@/contracts/addresses';

export function useTaskFactory() {
  const { data: signer } = useSigner();

  const contract = useContract({
    address: TASK_FACTORY_ADDRESS,
    abi: TaskFactoryABI,
    signerOrProvider: signer,
  });

  return contract;
}

// Usage:
const taskFactory = useTaskFactory();
await taskFactory.createTaskWithTokens(/* ... */);
```

#### 3.3 Task Status Component

```tsx
// components/task/TaskStatus.tsx
export function TaskStatus({ status }: { status: TaskStatusEnum }) {
  const variants = {
    ACTIVE: { color: 'green', label: 'Active', icon: <PlayIcon /> },
    PAUSED: { color: 'yellow', label: 'Paused', icon: <PauseIcon /> },
    COMPLETED: { color: 'blue', label: 'Completed', icon: <CheckIcon /> },
    CANCELLED: { color: 'gray', label: 'Cancelled', icon: <XIcon /> },
    EXPIRED: { color: 'red', label: 'Expired', icon: <ClockIcon /> },
  };

  const { color, label, icon } = variants[status];

  return (
    <Badge variant={color} className="flex items-center gap-1">
      {icon}
      {label}
    </Badge>
  );
}
```

---

## Smart Contract Integration

### TypeChain Setup

**Generate TypeScript types from ABIs:**

```bash
# Install TypeChain
npm install --save-dev typechain @typechain/ethers-v6

# Generate types
npx typechain --target ethers-v6 --out-dir src/contracts/types './contracts/abis/*.json'
```

**Usage:**

```typescript
// Before (untyped)
const tx = await taskFactory.createTaskWithTokens(params);

// After (typed)
import { TaskFactory } from '@/contracts/types';
const taskFactory = useContract<TaskFactory>(TASK_FACTORY_ADDRESS, TaskFactoryABI);

// Now TypeScript knows all methods and types!
const tx = await taskFactory.createTaskWithTokens(
  taskParams,      // TaskParams struct (typed)
  actions,         // ActionParams[] (typed)
  deposits,        // TokenDeposit[] (typed)
  { value: reward } // Overrides (typed)
);
```

### Contract ABIs & Addresses

```typescript
// contracts/addresses.ts
export const CONTRACTS = {
  polygon: {
    TASK_FACTORY: '0x...',
    TASK_LOGIC: '0x...',
    EXECUTOR_HUB: '0x...',
    GLOBAL_REGISTRY: '0x...',
    ACTION_REGISTRY: '0x...',
    REWARD_MANAGER: '0x...',
  },
  polygonMumbai: {
    TASK_FACTORY: '0x...',
    // ...
  },
};

export function getContractAddress(name: keyof typeof CONTRACTS.polygon, chainId: number) {
  const chain = chainId === 137 ? 'polygon' : 'polygonMumbai';
  return CONTRACTS[chain][name];
}
```

### Event Listening

```typescript
// hooks/useTaskEvents.ts
export function useTaskEvents(userAddress: string) {
  return useQuery({
    queryKey: ['taskEvents', userAddress],
    queryFn: async () => {
      const globalRegistry = getContract(GLOBAL_REGISTRY_ADDRESS, GlobalRegistryABI);

      // Get all tasks created by user
      const createdEvents = await globalRegistry.queryFilter(
        globalRegistry.filters.TaskCreated(null, userAddress),
        -10000 // Last 10k blocks
      );

      // Get execution events for user's tasks
      const taskIds = createdEvents.map(e => e.args.taskId);
      const executionEvents = await Promise.all(
        taskIds.map(id =>
          executorHub.queryFilter(
            executorHub.filters.TaskExecuted(id)
          )
        )
      );

      return {
        created: createdEvents,
        executions: executionEvents.flat(),
      };
    },
    refetchInterval: 15000, // Poll every 15s
  });
}
```

### Transaction Handling

```tsx
// hooks/useTransaction.ts
export function useTransaction() {
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);

  const sendTransaction = async (
    txPromise: Promise<ContractTransaction>,
    options?: {
      onSuccess?: (receipt: ContractReceipt) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    try {
      setStatus('pending');

      const tx = await txPromise;
      setTxHash(tx.hash);

      toast.loading('Transaction submitted...', { id: tx.hash });

      const receipt = await tx.wait();

      setStatus('success');
      toast.success('Transaction confirmed!', { id: tx.hash });

      options?.onSuccess?.(receipt);
      return receipt;

    } catch (error) {
      setStatus('error');
      toast.error('Transaction failed', { id: txHash || 'tx' });
      options?.onError?.(error as Error);
      throw error;
    }
  };

  return { sendTransaction, status, txHash };
}

// Usage:
const { sendTransaction, status } = useTransaction();

const handleCreate = async () => {
  await sendTransaction(
    taskFactory.createTaskWithTokens(params),
    {
      onSuccess: (receipt) => {
        const taskId = parseTaskId(receipt);
        router.push(`/tasks/${taskId}`);
      },
    }
  );
};
```

---

## State Management

### Zustand Stores

**User Store:**

```typescript
// store/userStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  address: string | null;
  isExecutor: boolean;
  reputation: number;
  totalEarnings: bigint;
  setAddress: (address: string | null) => void;
  setExecutorData: (data: ExecutorData) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      address: null,
      isExecutor: false,
      reputation: 0,
      totalEarnings: 0n,

      setAddress: (address) => set({ address }),

      setExecutorData: (data) =>
        set({
          isExecutor: true,
          reputation: data.reputation,
          totalEarnings: data.totalEarnings,
        }),
    }),
    {
      name: 'user-storage',
    }
  )
);
```

**Task Store:**

```typescript
// store/taskStore.ts
interface TaskState {
  tasks: Task[];
  selectedTaskId: number | null;
  addTask: (task: Task) => void;
  updateTask: (taskId: number, updates: Partial<Task>) => void;
  selectTask: (taskId: number) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  selectedTaskId: null,

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, ...updates } : t
      ),
    })),

  selectTask: (taskId) => set({ selectedTaskId: taskId }),
}));
```

---

## UI/UX Guidelines

### Design Principles

1. **Clarity Over Cleverness**
   - Show exactly what will happen (tokens spent, gas cost, reward)
   - No surprises in transactions

2. **Speed Over Features**
   - Minimize clicks to common actions
   - Pre-fill sensible defaults

3. **Trust Through Transparency**
   - Show contract addresses (with Etherscan links)
   - Display on-chain verification
   - Real-time status updates

### Key UX Patterns

#### Pattern 1: Transaction Preview

**Before every transaction, show:**

```tsx
<TransactionPreview>
  <PreviewRow label="You Send" value="1000 USDC" />
  <PreviewRow label="Executor Reward" value="0.01 ETH" />
  <PreviewRow label="Platform Fee" value="0.001 ETH" />
  <Divider />
  <PreviewRow label="Total Cost" value="1000 USDC + 0.011 ETH" bold />
  <PreviewRow label="Estimated Gas" value="~0.015 ETH" muted />
</TransactionPreview>
```

#### Pattern 2: Loading States

**Transaction Steps:**

```tsx
<TransactionSteps>
  <Step status="complete" label="Approve USDC" />
  <Step status="loading" label="Creating task..." />
  <Step status="pending" label="Wait for confirmation" />
</TransactionSteps>
```

#### Pattern 3: Error Handling

**User-Friendly Errors:**

```tsx
// Don't:
toast.error('Error: execution reverted');

// Do:
if (error.message.includes('InsufficientStake')) {
  toast.error('You need to stake more ETH to execute tasks', {
    action: {
      label: 'Stake Now',
      onClick: () => router.push('/executor/stake'),
    },
  });
}
```

### Mobile Responsiveness

**All pages must be mobile-first:**

```tsx
// Desktop: 3 columns
// Tablet: 2 columns
// Mobile: 1 column

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {tasks.map(task => <TaskCard key={task.id} task={task} />)}
</div>
```

---

## Mobile App (Executor)

### React Native Setup

```bash
# Initialize Expo app
npx create-expo-app tasker-executor --template

# Install dependencies
npm install @walletconnect/web3-provider ethers@6 zustand @tanstack/react-query
npm install nativewind tailwindcss
```

### Core Screens

#### 1. Dashboard Screen

```tsx
// screens/DashboardScreen.tsx
export function DashboardScreen() {
  const { totalEarnings, todayEarnings } = useExecutorStats();

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-gradient-to-r from-blue-500 to-purple-600 p-6">
        <Text className="text-white text-3xl font-bold">
          {formatEther(totalEarnings)} ETH
        </Text>
        <Text className="text-white/80">Total Earned</Text>
      </View>

      {/* Today's Earnings */}
      <View className="bg-white m-4 p-4 rounded-lg shadow">
        <Text className="text-gray-600">Today</Text>
        <Text className="text-2xl font-semibold">
          {formatEther(todayEarnings)} ETH
        </Text>
        <Text className="text-green-500">+12% vs yesterday</Text>
      </View>

      {/* Quick Actions */}
      <View className="flex-row gap-2 px-4">
        <Button label="Execute Tasks" onPress={() => navigate('Tasks')} />
        <Button label="My Stats" onPress={() => navigate('Stats')} />
      </View>

      {/* Available Tasks */}
      <TaskList />
    </ScrollView>
  );
}
```

#### 2. Task Browser Screen

```tsx
// screens/TasksScreen.tsx
export function TasksScreen() {
  const { data: tasks } = useAvailableTasks();

  return (
    <FlatList
      data={tasks}
      renderItem={({ item }) => (
        <TaskCard
          task={item}
          onPress={() => navigate('TaskDetails', { taskId: item.id })}
        />
      )}
      ListHeaderComponent={
        <View className="p-4">
          <FilterChips />
        </View>
      }
    />
  );
}
```

#### 3. Execute Task Screen

```tsx
// screens/ExecuteTaskScreen.tsx
export function ExecuteTaskScreen({ route }) {
  const { taskId } = route.params;
  const { task, canExecute } = useTask(taskId);
  const { execute, status } = useExecuteTask();

  return (
    <View className="flex-1 p-4">
      {/* Task Details */}
      <TaskDetailCard task={task} />

      {/* Profit Calculation */}
      <ProfitCard
        reward={task.reward}
        gas={task.estimatedGas}
        profit={task.profit}
      />

      {/* Execute Button */}
      <Button
        label={status === 'pending' ? 'Executing...' : 'Execute & Earn'}
        onPress={() => execute(taskId)}
        disabled={!canExecute || status === 'pending'}
        className="mt-auto"
      />
    </View>
  );
}
```

### Push Notifications

**Setup Expo Notifications:**

```tsx
// hooks/useNotifications.ts
import * as Notifications from 'expo-notifications';

export function useTaskNotifications() {
  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications();

    // Listen for new executable tasks
    const subscription = listenToNewTasks((task) => {
      Notifications.scheduleNotificationAsync({
        content: {
          title: '💰 New Task Available!',
          body: `Earn ${formatEther(task.reward)} ETH`,
          data: { taskId: task.id },
        },
        trigger: null, // Show immediately
      });
    });

    return () => subscription.unsubscribe();
  }, []);
}
```

---

## Implementation Roadmap

### Week 1-2: Setup & Core Infrastructure

**Tasks:**
- [ ] Initialize Next.js 14 project with TypeScript
- [ ] Setup TailwindCSS + shadcn/ui
- [ ] Configure RainbowKit wallet connection
- [ ] Setup TypeChain for contract types
- [ ] Create contract hooks (useTaskFactory, useExecutorHub)
- [ ] Setup Zustand stores
- [ ] Create basic layout (header, sidebar, footer)

**Deliverable:** Working wallet connection + contract integration

### Week 3-4: Task Creator App (MVP)

**Tasks:**
- [ ] Dashboard page (list user's tasks)
- [ ] Create task flow (template selection)
- [ ] DCA task form
- [ ] Limit order task form
- [ ] Transaction preview & approval flow
- [ ] Task details page
- [ ] Cancel task functionality

**Deliverable:** Users can create DCA and limit order tasks

### Week 5-6: Executor Dashboard

**Tasks:**
- [ ] Executor registration flow
- [ ] Browse available tasks page
- [ ] Task filtering & sorting
- [ ] Execute task flow (commit + execute)
- [ ] Earnings dashboard
- [ ] Execution history

**Deliverable:** Executors can register, browse, and execute tasks

### Week 7-8: Analytics & Polish

**Tasks:**
- [ ] Task creator analytics (charts, stats)
- [ ] Executor analytics (earnings over time)
- [ ] Reputation system UI
- [ ] Notifications (toast messages)
- [ ] Error handling & edge cases
- [ ] Mobile responsive design
- [ ] Loading states & skeleton screens

**Deliverable:** Production-ready web app

### Week 9-10: Testing & Optimization

**Tasks:**
- [ ] E2E testing (Playwright or Cypress)
- [ ] Performance optimization (code splitting, lazy loading)
- [ ] SEO optimization
- [ ] Analytics integration (PostHog or Mixpanel)
- [ ] Bug fixes
- [ ] Documentation

**Deliverable:** Tested, optimized, documented app

### Week 11-12: Deployment & Launch

**Tasks:**
- [ ] Deploy to Vercel
- [ ] Setup custom domain
- [ ] Configure CI/CD
- [ ] Monitoring (Sentry for errors)
- [ ] Beta testing with 10 users
- [ ] Iterate based on feedback

**Deliverable:** Live production app

---

## Deployment

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

**Environment Variables:**

```bash
# .env.local
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_ALCHEMY_API_KEY=your_alchemy_key
NEXT_PUBLIC_CHAIN_ID=137 # Polygon mainnet
NEXT_PUBLIC_TASK_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_EXECUTOR_HUB_ADDRESS=0x...
```

### Custom Domain

```bash
# Add custom domain in Vercel dashboard
# taskeronchain.com → Vercel project

# Setup DNS:
# A Record: @ → 76.76.21.21
# CNAME: www → cname.vercel-dns.com
```

### Performance Optimizations

**Next.js Config:**

```js
// next.config.js
module.exports = {
  // Enable SWC minification
  swcMinify: true,

  // Image optimization
  images: {
    domains: ['assets.taskeronchain.com'],
  },

  // Bundle analysis
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};
```

---

## Analytics & Monitoring

### PostHog Integration

```tsx
// app/providers.tsx
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

if (typeof window !== 'undefined') {
  posthog.init('YOUR_POSTHOG_KEY', {
    api_host: 'https://app.posthog.com',
  });
}

export function Providers({ children }) {
  return (
    <PostHogProvider client={posthog}>
      {children}
    </PostHogProvider>
  );
}

// Track events:
posthog.capture('task_created', { taskType: 'limit_order' });
posthog.capture('task_executed', { reward: '0.01', profit: '0.007' });
```

### Error Monitoring (Sentry)

```tsx
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  tracesSampleRate: 1.0,
});
```

---

## Appendix

### A. Recommended Libraries

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "ethers": "^6.8.0",
    "@rainbow-me/rainbowkit": "^2.0.0",
    "wagmi": "^2.0.0",
    "zustand": "^4.4.0",
    "@tanstack/react-query": "^5.0.0",
    "react-hook-form": "^7.48.0",
    "zod": "^3.22.0",
    "tailwindcss": "^3.3.0",
    "recharts": "^2.10.0",
    "react-hot-toast": "^2.4.1",
    "date-fns": "^2.30.0",
    "clsx": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "typescript": "^5.2.0",
    "@typechain/ethers-v6": "^0.5.0",
    "typechain": "^8.3.0",
    "prettier": "^3.0.0",
    "eslint": "^8.51.0"
  }
}
```

### B. Folder Structure Template

```
src/
├── app/
│   ├── (creator)/
│   │   ├── dashboard/
│   │   ├── create/
│   │   ├── tasks/[id]/
│   │   └── analytics/
│   ├── (executor)/
│   │   ├── dashboard/
│   │   ├── tasks/
│   │   └── earnings/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/              # shadcn components
│   ├── task/
│   ├── executor/
│   ├── wallet/
│   └── layout/
├── lib/
│   ├── contracts/
│   ├── hooks/
│   ├── utils/
│   └── constants/
└── store/
```

### C. Design Resources

**UI Kits:**
- shadcn/ui: https://ui.shadcn.com
- Tailwind UI: https://tailwindui.com
- Untitled UI: https://www.untitledui.com

**Inspiration:**
- Uniswap: https://app.uniswap.org
- Aave: https://app.aave.com
- Gelato: https://app.gelato.network

---

## Next Steps

1. **Setup project:**
   ```bash
   npx create-next-app@latest tasker-frontend --typescript --tailwind --app
   ```

2. **Install dependencies:**
   ```bash
   npm install ethers@6 @rainbow-me/rainbowkit wagmi zustand @tanstack/react-query
   ```

3. **Follow Week 1-2 roadmap** (wallet connection + contracts)

4. **Build iteratively** - Start with simplest flow (create DCA task)

5. **Get early feedback** - Deploy preview, share with users

---

**Questions?** Join Discord or open a GitHub issue.

**Let's build a beautiful, functional DeFi automation UI! 🚀**
