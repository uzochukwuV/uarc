import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTaskSchema, insertExecutorSchema, insertExecutionSchema, TaskStatus, taskSchema, executorSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // ==================== TASK ROUTES ====================

  // Get all tasks or filter by creator/status
  app.get("/api/tasks", async (req, res) => {
    try {
      const { creator, status } = req.query;

      let tasks;
      if (creator) {
        tasks = await storage.getTasksByCreator(creator as string);
      } else if (status) {
        tasks = await storage.getTasksByStatus(status as TaskStatus);
      } else {
        tasks = await storage.getTasks();
      }

      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Get specific task
  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task" });
    }
  });

  // Create new task
  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(validatedData);
      res.status(201).json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  // Update task
  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      // Define partial schema for task updates with proper validation
      const updateTaskSchema = taskSchema.partial().pick({
        status: true,
        rewardPerExecution: true,
        maxExecutions: true,
        expiresAt: true,
      }).extend({
        rewardPerExecution: z.coerce.number().positive().optional(),
        maxExecutions: z.coerce.number().int().nonnegative().optional(),
        expiresAt: z.coerce.number().nullable().optional(),
      });

      const validatedUpdates = updateTaskSchema.parse(req.body);
      const task = await storage.updateTask(req.params.id, validatedUpdates);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Delete/Cancel task
  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const success = await storage.deleteTask(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // ==================== EXECUTOR ROUTES ====================

  // Get all executors
  app.get("/api/executors", async (req, res) => {
    try {
      const executors = await storage.getExecutors();
      res.json(executors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch executors" });
    }
  });

  // Get specific executor
  app.get("/api/executors/:address", async (req, res) => {
    try {
      const executor = await storage.getExecutor(req.params.address);
      if (!executor) {
        return res.status(404).json({ error: "Executor not found" });
      }
      res.json(executor);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch executor" });
    }
  });

  // Register executor
  app.post("/api/executors", async (req, res) => {
    try {
      const validatedData = insertExecutorSchema.parse(req.body);
      const executor = await storage.createExecutor(validatedData);
      res.status(201).json(executor);
    } catch (error) {
      res.status(400).json({ error: "Invalid executor data" });
    }
  });

  // Update executor
  app.patch("/api/executors/:address", async (req, res) => {
    try {
      // Define partial schema for executor updates with proper validation
      const updateExecutorSchema = executorSchema.partial().pick({
        stakedAmount: true,
        isActive: true,
        isSlashed: true,
        reputationScore: true,
      }).extend({
        stakedAmount: z.coerce.number().positive().optional(),
        reputationScore: z.coerce.number().int().min(0).max(10000).optional(),
      });

      const validatedUpdates = updateExecutorSchema.parse(req.body);
      const executor = await storage.updateExecutor(req.params.address, validatedUpdates);
      if (!executor) {
        return res.status(404).json({ error: "Executor not found" });
      }
      res.json(executor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid update data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update executor" });
    }
  });

  // ==================== EXECUTION ROUTES ====================

  // Get all executions or filter by task/executor
  app.get("/api/executions", async (req, res) => {
    try {
      const { taskId, executor } = req.query;

      let executions;
      if (taskId) {
        executions = await storage.getExecutionsByTask(taskId as string);
      } else if (executor) {
        executions = await storage.getExecutionsByExecutor(executor as string);
      } else {
        executions = await storage.getExecutions();
      }

      res.json(executions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch executions" });
    }
  });

  // Create execution
  app.post("/api/executions", async (req, res) => {
    try {
      const validatedData = insertExecutionSchema.parse(req.body);
      const execution = await storage.createExecution(validatedData);

      // Update task execution count
      const task = await storage.getTask(execution.taskId);
      if (task) {
        await storage.updateTask(task.id, {
          executionCount: task.executionCount + 1,
          lastExecutionTime: execution.timestamp,
        });

        // Check if task is completed
        if (task.maxExecutions > 0 && task.executionCount + 1 >= task.maxExecutions) {
          await storage.updateTask(task.id, { status: TaskStatus.COMPLETED });
        }
      }

      // Update executor stats
      const executor = await storage.getExecutor(execution.executor);
      if (executor) {
        const updates: any = {
          totalExecutions: executor.totalExecutions + 1,
          totalEarned: executor.totalEarned + execution.reward,
        };

        if (execution.success) {
          updates.successfulExecutions = executor.successfulExecutions + 1;
        } else {
          updates.failedExecutions = executor.failedExecutions + 1;
        }

        // Update reputation score based on success rate
        const newTotal = executor.totalExecutions + 1;
        const newSuccess = execution.success
          ? executor.successfulExecutions + 1
          : executor.successfulExecutions;
        const successRate = newSuccess / newTotal;
        updates.reputationScore = Math.floor(successRate * 10000);

        await storage.updateExecutor(execution.executor, updates);
      }

      res.status(201).json(execution);
    } catch (error) {
      res.status(400).json({ error: "Invalid execution data" });
    }
  });

  // ==================== ANALYTICS ROUTES ====================

  // Get analytics
  app.get("/api/analytics", async (req, res) => {
    try {
      const analytics = await storage.getAnalytics();
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ==================== LEADERBOARD ROUTES ====================

  // Get leaderboard (executors ranked by reputation/earnings)
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const executors = await storage.getExecutors();
      
      // Sort by reputation score (primary) and total earned (secondary)
      const ranked = executors
        .filter((e) => e.isActive && !e.isSlashed)
        .sort((a, b) => {
          if (b.reputationScore !== a.reputationScore) {
            return b.reputationScore - a.reputationScore;
          }
          return b.totalEarned - a.totalEarned;
        })
        .map((executor, index) => ({
          ...executor,
          rank: index + 1,
        }));

      res.json(ranked);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  });

  // ==================== TEMPLATE ROUTES ====================

  // Get all templates
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = await storage.getTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Get specific template
  app.get("/api/templates/:id", async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
