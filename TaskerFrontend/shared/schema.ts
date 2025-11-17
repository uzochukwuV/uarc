import { z } from "zod";

// Task Status Enum
export enum TaskStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  EXECUTING = "EXECUTING",
}

// Task Template Types
export enum TaskTemplateType {
  LIMIT_ORDER = "LIMIT_ORDER",
  DCA = "DCA",
  AUTO_COMPOUND = "AUTO_COMPOUND",
}

// Task Schema
export const taskSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(TaskTemplateType),
  status: z.nativeEnum(TaskStatus),
  creator: z.string(), // wallet address
  name: z.string(),
  description: z.string(),
  rewardPerExecution: z.number(),
  maxExecutions: z.number(),
  executionCount: z.number(),
  createdAt: z.number(), // timestamp
  expiresAt: z.number().nullable(),
  lastExecutionTime: z.number().nullable(),
  // Task specific params (stored as JSON)
  params: z.record(z.any()),
});

export const insertTaskSchema = taskSchema.omit({
  id: true,
}).extend({
  rewardPerExecution: z.coerce.number().positive(),
  maxExecutions: z.coerce.number().int().nonnegative(),
  executionCount: z.coerce.number().int().nonnegative().default(0),
  createdAt: z.coerce.number().default(() => Date.now()),
  expiresAt: z.coerce.number().nullable().optional().default(null),
  lastExecutionTime: z.coerce.number().nullable().optional().default(null),
});

export type Task = z.infer<typeof taskSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// Executor Schema
export const executorSchema = z.object({
  address: z.string(),
  stakedAmount: z.number(),
  registeredAt: z.number(),
  totalExecutions: z.number(),
  successfulExecutions: z.number(),
  failedExecutions: z.number(),
  reputationScore: z.number(), // 0-10000
  totalEarned: z.number(),
  isActive: z.boolean(),
  isSlashed: z.boolean(),
});

export const insertExecutorSchema = executorSchema.omit({
  totalExecutions: true,
  successfulExecutions: true,
  failedExecutions: true,
  totalEarned: true,
}).extend({
  stakedAmount: z.coerce.number().positive(),
  registeredAt: z.coerce.number().default(() => Date.now()),
  reputationScore: z.coerce.number().int().min(0).max(10000).default(5000),
});

export type Executor = z.infer<typeof executorSchema>;
export type InsertExecutor = z.infer<typeof insertExecutorSchema>;

// Execution Schema
export const executionSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  executor: z.string(),
  timestamp: z.number(),
  reward: z.number(),
  gasUsed: z.number(),
  success: z.boolean(),
  transactionHash: z.string().nullable(),
});

export const insertExecutionSchema = executionSchema.omit({ id: true }).extend({
  timestamp: z.coerce.number().default(() => Date.now()),
  reward: z.coerce.number().positive(),
  gasUsed: z.coerce.number().nonnegative(),
});

export type Execution = z.infer<typeof executionSchema>;
export type InsertExecution = z.infer<typeof insertExecutionSchema>;

// Task Template Schema
export const taskTemplateSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(TaskTemplateType),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  category: z.string(),
  estimatedGas: z.number(),
  // Default parameters for this template
  defaultParams: z.record(z.any()),
});

export type TaskTemplate = z.infer<typeof taskTemplateSchema>;

// Analytics Schema
export const analyticsSchema = z.object({
  totalValueLocked: z.number(),
  totalTasks: z.number(),
  activeTasks: z.number(),
  totalExecutors: z.number(),
  totalExecutions: z.number(),
  totalRewardsDistributed: z.number(),
  // Time series data for charts
  executionsOverTime: z.array(
    z.object({
      timestamp: z.number(),
      count: z.number(),
    })
  ),
  taskTypeDistribution: z.array(
    z.object({
      type: z.string(),
      count: z.number(),
    })
  ),
});

export type Analytics = z.infer<typeof analyticsSchema>;
