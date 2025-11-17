import {
  type Task,
  type InsertTask,
  type Executor,
  type InsertExecutor,
  type Execution,
  type InsertExecution,
  type TaskTemplate,
  type Analytics,
  TaskStatus,
  TaskTemplateType,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Task operations
  getTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  getTasksByCreator(creator: string): Promise<Task[]>;
  getTasksByStatus(status: TaskStatus): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined>;
  deleteTask(id: string): Promise<boolean>;

  // Executor operations
  getExecutors(): Promise<Executor[]>;
  getExecutor(address: string): Promise<Executor | undefined>;
  createExecutor(executor: InsertExecutor): Promise<Executor>;
  updateExecutor(address: string, updates: Partial<Executor>): Promise<Executor | undefined>;

  // Execution operations
  getExecutions(): Promise<Execution[]>;
  getExecution(id: string): Promise<Execution | undefined>;
  getExecutionsByTask(taskId: string): Promise<Execution[]>;
  getExecutionsByExecutor(executor: string): Promise<Execution[]>;
  createExecution(execution: InsertExecution): Promise<Execution>;

  // Template operations
  getTemplates(): Promise<TaskTemplate[]>;
  getTemplate(id: string): Promise<TaskTemplate | undefined>;

  // Analytics operations
  getAnalytics(): Promise<Analytics>;
}

export class MemStorage implements IStorage {
  private tasks: Map<string, Task>;
  private executors: Map<string, Executor>;
  private executions: Map<string, Execution>;
  private templates: Map<string, TaskTemplate>;

  constructor() {
    this.tasks = new Map();
    this.executors = new Map();
    this.executions = new Map();
    this.templates = new Map();

    // Initialize with default templates
    this.initializeTemplates();
    
    // Initialize with mock data
    this.initializeMockData();
  }

  private initializeTemplates() {
    const templates: TaskTemplate[] = [
      {
        id: "1",
        type: TaskTemplateType.LIMIT_ORDER,
        name: "Limit Order",
        description: "Buy or sell tokens when price reaches a specific target",
        icon: "limit-order-icon",
        category: "Trading",
        estimatedGas: 150000,
        defaultParams: {
          tokenIn: "USDC",
          tokenOut: "ETH",
          minAmountOut: 0,
        },
      },
      {
        id: "2",
        type: TaskTemplateType.DCA,
        name: "Dollar Cost Average",
        description: "Automatically buy tokens at regular intervals to average your entry price",
        icon: "dca-icon",
        category: "Trading",
        estimatedGas: 120000,
        defaultParams: {
          tokenIn: "USDC",
          tokenOut: "BTC",
          interval: 604800, // 1 week in seconds
        },
      },
      {
        id: "3",
        type: TaskTemplateType.AUTO_COMPOUND,
        name: "Auto Compound",
        description: "Automatically reinvest yield farming rewards to maximize returns",
        icon: "auto-compound-icon",
        category: "DeFi",
        estimatedGas: 180000,
        defaultParams: {
          protocol: "AAVE",
          interval: 86400, // 1 day in seconds
        },
      },
    ];

    templates.forEach((template) => this.templates.set(template.id, template));
  }

  private initializeMockData() {
    // Mock tasks
    const mockTasks: InsertTask[] = [
      {
        type: TaskTemplateType.LIMIT_ORDER,
        status: TaskStatus.ACTIVE,
        creator: "0x742d35eC059f1fddF7b8B4e93C8B3B4e",
        name: "Buy ETH at $2500",
        description: "Automatically buy 1 ETH when price drops to $2500",
        rewardPerExecution: 0.01,
        maxExecutions: 1,
        executionCount: 0,
        createdAt: Date.now() - 86400000 * 2,
        expiresAt: Date.now() + 86400000 * 28,
        lastExecutionTime: null,
        params: {
          tokenIn: "USDC",
          tokenOut: "ETH",
          targetPrice: 2500,
        },
      },
      {
        type: TaskTemplateType.DCA,
        status: TaskStatus.ACTIVE,
        creator: "0x742d35eC059f1fddF7b8B4e93C8B3B4e",
        name: "Weekly DCA into BTC",
        description: "Buy $100 of BTC every Monday at 9 AM",
        rewardPerExecution: 0.005,
        maxExecutions: 52,
        executionCount: 8,
        createdAt: Date.now() - 86400000 * 60,
        expiresAt: Date.now() + 86400000 * 300,
        lastExecutionTime: Date.now() - 86400000 * 7,
        params: {
          amount: 100,
          interval: 604800,
        },
      },
    ];

    mockTasks.forEach((task) => this.createTask(task));

    // Mock executors
    const mockExecutors: InsertExecutor[] = [
      {
        address: "0x8F57e45c",
        stakedAmount: 1.5,
        registeredAt: Date.now() - 86400000 * 180,
        reputationScore: 9800,
        isActive: true,
        isSlashed: false,
      },
      {
        address: "0xC11613E6",
        stakedAmount: 1.2,
        registeredAt: Date.now() - 86400000 * 150,
        reputationScore: 9500,
        isActive: true,
        isSlashed: false,
      },
    ];

    mockExecutors.forEach((executor) => this.createExecutor(executor));
  }

  // Task operations
  async getTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  async getTask(id: string): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async getTasksByCreator(creator: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter((task) => task.creator === creator);
  }

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter((task) => task.status === status);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = randomUUID();
    const task: Task = {
      ...insertTask,
      id,
      executionCount: 0,
      lastExecutionTime: null,
    };
    this.tasks.set(id, task);
    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | undefined> {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updatedTask = { ...task, ...updates };
    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    return this.tasks.delete(id);
  }

  // Executor operations
  async getExecutors(): Promise<Executor[]> {
    return Array.from(this.executors.values());
  }

  async getExecutor(address: string): Promise<Executor | undefined> {
    return this.executors.get(address);
  }

  async createExecutor(insertExecutor: InsertExecutor): Promise<Executor> {
    const executor: Executor = {
      ...insertExecutor,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalEarned: 0,
    };
    this.executors.set(executor.address, executor);
    return executor;
  }

  async updateExecutor(
    address: string,
    updates: Partial<Executor>
  ): Promise<Executor | undefined> {
    const executor = this.executors.get(address);
    if (!executor) return undefined;

    const updatedExecutor = { ...executor, ...updates };
    this.executors.set(address, updatedExecutor);
    return updatedExecutor;
  }

  // Execution operations
  async getExecutions(): Promise<Execution[]> {
    return Array.from(this.executions.values());
  }

  async getExecution(id: string): Promise<Execution | undefined> {
    return this.executions.get(id);
  }

  async getExecutionsByTask(taskId: string): Promise<Execution[]> {
    return Array.from(this.executions.values()).filter((exec) => exec.taskId === taskId);
  }

  async getExecutionsByExecutor(executor: string): Promise<Execution[]> {
    return Array.from(this.executions.values()).filter((exec) => exec.executor === executor);
  }

  async createExecution(insertExecution: InsertExecution): Promise<Execution> {
    const id = randomUUID();
    const execution: Execution = { ...insertExecution, id };
    this.executions.set(id, execution);
    return execution;
  }

  // Template operations
  async getTemplates(): Promise<TaskTemplate[]> {
    return Array.from(this.templates.values());
  }

  async getTemplate(id: string): Promise<TaskTemplate | undefined> {
    return this.templates.get(id);
  }

  // Analytics operations
  async getAnalytics(): Promise<Analytics> {
    const tasks = await this.getTasks();
    const executors = await this.getExecutors();
    const executions = await this.getExecutions();

    const activeTasks = tasks.filter((t) => t.status === TaskStatus.ACTIVE).length;
    const totalValueLocked = tasks.reduce((sum, task) => {
      const remaining = task.maxExecutions > 0
        ? (task.maxExecutions - task.executionCount) * task.rewardPerExecution
        : task.rewardPerExecution;
      return sum + remaining;
    }, 0);

    const totalRewardsDistributed = executions.reduce(
      (sum, exec) => sum + exec.reward,
      0
    );

    // Generate time series data for last 7 days
    const executionsOverTime = Array.from({ length: 7 }, (_, i) => {
      const date = Date.now() - (6 - i) * 86400000;
      const count = executions.filter(
        (exec) =>
          exec.timestamp >= date &&
          exec.timestamp < date + 86400000
      ).length;
      return { timestamp: date, count };
    });

    // Task type distribution
    const taskTypeDistribution = Array.from(
      new Set(tasks.map((t) => t.type))
    ).map((type) => ({
      type,
      count: tasks.filter((t) => t.type === type).length,
    }));

    return {
      totalValueLocked,
      totalTasks: tasks.length,
      activeTasks,
      totalExecutors: executors.length,
      totalExecutions: executions.length,
      totalRewardsDistributed,
      executionsOverTime,
      taskTypeDistribution,
    };
  }
}

export const storage = new MemStorage();
