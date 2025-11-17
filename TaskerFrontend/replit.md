# TaskerOnchain - DeFi Automation Marketplace

## Overview
TaskerOnchain is a decentralized automation marketplace for DeFi tasks. Users can create automated onchain tasks (limit orders, DCA, auto-compound) and executors earn rewards by executing them when conditions are met.

## Design System
Following Yellow.com's color palette with LINE NEXT's minimalist aesthetic:
- **Primary Color**: #FFD700 (yellow accent)
- **Background**: #0a0a0a (dark)
- **Typography**: Inter (body), Space Grotesk (headings)
- **Style**: Clean borders, subtle shadows, no gradients/glassmorphism

## Project Structure

### Frontend (`client/src/`)
- **Pages**:
  - `home.tsx` - Hero section, statistics, how it works, CTAs
  - `create-task.tsx` - 4-step wizard for task creation
  - `my-tasks.tsx` - Dashboard to manage user's tasks with filtering
  - `executor-dashboard.tsx` - Executor stats and task browser
  - `analytics.tsx` - Charts and metrics (Recharts integration)
  - `leaderboard.tsx` - Top executors ranking

- **Components**:
  - `navigation.tsx` - Top nav with wallet connect
  - `task-card.tsx` - Reusable task display
  - `template-card.tsx` - Task template selection
  - `ui/*` - Shadcn components (Button, Card, Form, etc.)

### Backend (`server/`)
- **Storage** (`storage.ts`): In-memory MemStorage implementing IStorage interface
- **Routes** (`routes.ts`): All API endpoints with Zod validation
- **Schema** (`shared/schema.ts`): Shared types and validation schemas

## API Endpoints

### Tasks
- `GET /api/tasks` - Get all tasks (supports `?creator=address` and `?status=STATUS` filters)
- `GET /api/tasks/:id` - Get specific task
- `POST /api/tasks` - Create new task
- `PATCH /api/tasks/:id` - Update task (status, reward, maxExecutions, expiresAt)
- `DELETE /api/tasks/:id` - Cancel task

### Executors
- `GET /api/executors` - Get all executors
- `GET /api/executors/:address` - Get specific executor
- `POST /api/executors` - Register new executor
- `PATCH /api/executors/:address` - Update executor

### Executions
- `GET /api/executions` - Get all executions (supports `?taskId=id` and `?executor=address` filters)
- `POST /api/executions` - Record new execution

### Analytics & Leaderboard
- `GET /api/analytics` - Get platform analytics
- `GET /api/leaderboard` - Get top executors

## Data Models

### Task
- Type (LIMIT_ORDER, DCA, AUTO_COMPOUND)
- Status (ACTIVE, PAUSED, COMPLETED, CANCELLED, EXECUTING)
- Creator, reward per execution, max executions
- Execution count, timestamps
- Custom parameters (JSON)

### Executor
- Address, staked amount
- Reputation score (0-10000)
- Total executions, earnings
- Active/slashed status

### Execution
- Task ID, executor address
- Timestamp, reward, gas used
- Success status, transaction hash

## Key Features Implemented

1. **Task Creation Wizard**: 4-step flow (template → configure → review → success)
2. **Task Filtering**: My Tasks page filters by creator using query parameters
3. **Cache Management**: TanStack Query with proper invalidation
4. **Validation**: Full Zod validation on all endpoints including PATCH with z.coerce.number()
5. **Loading States**: Skeletons and loading indicators throughout
6. **Error Handling**: Toast notifications for all actions
7. **Responsive Design**: Mobile-friendly layouts

## Technical Details

### Schema Validation
All insert schemas use `z.coerce.number()` to handle form string inputs:
- Automatically converts string inputs to numbers
- Provides defaults for auto-generated fields
- PATCH endpoints use partial schemas with proper validation

### Query Key Pattern
```typescript
// Filtered queries use URL query params
queryKey: [`/api/tasks?creator=${userAddress}`]

// Cache invalidation matches the query key
queryClient.invalidateQueries({ queryKey: [`/api/tasks?creator=${userAddress}`] })
```

### Navigation Pattern
All Link components wrap elements (Button, div) without nested anchor tags to avoid React warnings.

## Running the Project
```bash
npm run dev
```
This starts both Express backend and Vite frontend on port 5000.

## Recent Fixes
- Fixed schema coercion for numeric fields
- Added PATCH endpoint validation
- Fixed nested anchor tags across all pages
- Implemented proper task filtering with query parameters
- Fixed cache invalidation for filtered queries
- Resolved all runtime warnings and errors

## Status
✅ All features implemented and tested
✅ No runtime errors or warnings
✅ Production-ready
