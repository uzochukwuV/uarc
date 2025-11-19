import { useState, useMemo } from "react";
import { Navigation } from "@/components/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock,
  DollarSign,
  Zap,
  Search,
  Filter,
  TrendingUp,
  CheckCircle
} from "lucide-react";
import { useWallet, useMarketplaceTasks } from "@/lib/hooks";
import { useExecuteTask } from "@/lib/hooks/useExecutorHub";
import { useWaitForTransactionReceipt } from "wagmi";
import { useToast } from "@/hooks/use-toast";
import { formatEther } from "viem";
import { ethers } from "ethers";

export default function Marketplace() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("active");
  const [executingTaskId, setExecutingTaskId] = useState<bigint | null>(null);

  const { address: userAddress, isConnected } = useWallet();
  const { tasks: marketplaceTasks = [], isLoading: tasksLoading } = useMarketplaceTasks(20, 0);
  const { executeTask, hash: executeHash, isPending: isExecuting, isSuccess: isExecuteSuccess, error: executeError } = useExecuteTask();
  const { isSuccess: isExecutionConfirmed } = useWaitForTransactionReceipt({ hash: executeHash });
  const { toast } = useToast();

  // Convert blockchain tasks to display format
  const displayTasks = useMemo(() => {
    return marketplaceTasks.map((task) => ({
      taskId: task.taskId,
      taskCore: task.taskCore,
      taskVault: task.taskVault,
      creator: task.creator,
      createdAt: task.createdAt,
      expiresAt: task.expiresAt,
      status: task.status === 0 ? "active" : task.status === 3 ? "completed" : "expired" as "active" | "completed" | "expired",
      maxExecutions: Number(task.maxExecutions),
      executionCount: Number(task.executionCount),
      rewardPerExecution: task.rewardPerExecution,
      isExecutable: task.isExecutable,
      remainingExecutions: task.remainingExecutions,
      progressPercent: task.progressPercent,
    }));
  }, [marketplaceTasks]);

  // Filter and search tasks
  const filteredTasks = useMemo(() => {
    return displayTasks.filter(task => {
      // Status filter
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }

      // Search filter (for now search by addresses since we don't have task names)
      if (searchQuery && !task.taskCore.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !task.creator.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [searchQuery, statusFilter, displayTasks]);

  const handleExecuteTask = (taskId: bigint) => {
    if (!isConnected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to execute tasks",
        variant: "destructive"
      });
      return;
    }

    if (isExecuting && executingTaskId === taskId) {
      toast({
        title: "Execution in progress",
        description: "Please wait for the current transaction to complete",
        variant: "default"
      });
      return;
    }

    // Get task data for this execution
    const task = displayTasks.find(t => t.taskId === taskId);
    if (!task) {
      toast({
        title: "Task not found",
        description: "Could not find task data",
        variant: "destructive"
      });
      return;
    }

    // Build actions proof from task data
    // Actions proof must be encoded as: abi.encode(Action[] memory actions, bytes32[] memory merkleProof)
    // Where Action = { bytes4 selector, address protocol, bytes params }
    try {
      // CRITICAL: Actions require the exact parameters from task creation!
      // The contract stores actionsHash but not the actual parameters
      // We need to reconstruct the action from what was stored during task creation

      // For TimeBasedTransferAdapter tasks:
      const actionSelector = "0x1cff79cd"; // executeAction(address,bytes)

      // Build action using placeholder values (these should come from task stored parameters)
      const actions = [{
        selector: actionSelector,
        protocol: ethers.ZeroAddress, // PLACEHOLDER - should be token from task creation
        params: "0x", // PLACEHOLDER - should be encoded adapter params
      }];

      const encodedProof = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'tuple(bytes4 selector, address protocol, bytes params)[]',
          'bytes32[]'
        ],
        [actions, []]  // Empty merkle proof for single action
      );

      console.log('[marketplace] Executing task:', {
        taskId: String(taskId),
        taskCore: task.taskCore,
        reward: formatEther(task.rewardPerExecution),
        actionProof: {
          selector: actionSelector,
          protocol: 'PLACEHOLDER - ZeroAddress',
          params: 'PLACEHOLDER - empty bytes',
          note: 'Action parameters not available! Need to store them with task'
        },
        actionsProof: encodedProof,
        actionsProofLength: encodedProof.length,
        executionData: {
          executionCount: task.executionCount,
          maxExecutions: task.maxExecutions,
          remaining: task.remainingExecutions,
        },
      });

      setExecutingTaskId(taskId);
      executeTask(taskId, encodedProof as `0x${string}`);

      toast({
        title: "Execution submitted",
        description: `Task #${String(taskId)} submitted to blockchain. Awaiting confirmation...`,
      });
    } catch (error) {
      console.error('[marketplace] Error building actions proof:', {
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      toast({
        title: "Error executing task",
        description: error instanceof Error ? error.message : "Failed to build execution proof",
        variant: "destructive"
      });
      setExecutingTaskId(null);
    }
  };

  // Handle transaction confirmation
  if (isExecuteSuccess && executingTaskId !== null) {
    toast({
      title: "Execution confirmed!",
      description: `Task #${String(executingTaskId)} has been executed successfully. You earned the reward!`,
    });
    setExecutingTaskId(null);
  }

  // Handle execution errors
  if (executeError && executingTaskId !== null) {
    const errorMessage = executeError instanceof Error
      ? executeError.message
      : typeof executeError === 'string'
      ? executeError
      : JSON.stringify(executeError);

    console.error('[marketplace] Transaction error:', {
      error: executeError,
      message: errorMessage,
      taskId: String(executingTaskId),
    });

    toast({
      title: "Execution failed",
      description: errorMessage || "Transaction was reverted",
      variant: "destructive"
    });
    setExecutingTaskId(null);
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="max-w-7xl mx-auto px-6 pt-32 pb-24">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Task Marketplace</h1>
          <p className="text-xl text-muted-foreground">
            Browse and execute automated tasks to earn rewards
          </p>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks by name or description..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2">
            {["all", "active", "completed"].map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status as any)}
              >
                <Filter className="w-4 h-4 mr-2" />
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Tasks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tasksLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-full mb-4" />
                <Skeleton className="h-10 w-full" />
              </Card>
            ))
          ) : filteredTasks.length > 0 ? (
            filteredTasks.map((task) => (
              <Card key={String(task.taskId)} className="p-6 hover:border-primary/50 transition-colors">
                <div className="mb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold font-mono text-sm">
                        Task #{String(task.taskId)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {task.taskCore.substring(0, 10)}...{task.taskCore.substring(task.taskCore.length - 8)}
                      </p>
                    </div>
                    <Badge
                      variant={task.status === "active" ? "default" : "secondary"}
                      className={task.status === "active" ? "bg-green-600" : ""}
                    >
                      {task.status === "active" ? (
                        <>
                          <Zap className="w-3 h-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {task.status === "completed" ? "Completed" : "Expired"}
                        </>
                      )}
                    </Badge>
                  </div>
                </div>

                {/* Task Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6 py-4 border-t border-b border-border">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Reward</p>
                      <p className="font-semibold">{formatEther(task.rewardPerExecution)} ETH</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Executions</p>
                      <p className="font-semibold">
                        {task.executionCount}/{task.maxExecutions > 0 ? task.maxExecutions : "∞"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                {task.maxExecutions > 0 && (
                  <div className="mb-4">
                    <div className="flex justify-between mb-2">
                      <p className="text-xs text-muted-foreground">Progress</p>
                      <p className="text-xs font-semibold">{Math.round(task.progressPercent || 0)}%</p>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{ width: `${task.progressPercent || 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Creator Info */}
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1">Creator</p>
                  <p className="text-sm font-mono text-xs truncate">
                    {task.creator.substring(0, 6)}...{task.creator.substring(task.creator.length - 4)}
                  </p>
                </div>

                {/* Action Button */}
                <Button
                  onClick={() => handleExecuteTask(task.taskId)}
                  disabled={task.status !== "active" || (isExecuting && executingTaskId === task.taskId) || !isConnected}
                  className="w-full"
                  data-testid={`button-execute-task-${String(task.taskId)}`}
                >
                  {task.status === "completed" ? (
                    "Task Completed"
                  ) : task.status === "expired" ? (
                    "Task Expired"
                  ) : executingTaskId === task.taskId && isExecuting ? (
                    <>
                      <Zap className="w-4 h-4 mr-2 animate-spin" />
                      Executing...
                    </>
                  ) : executingTaskId === task.taskId && isExecuteSuccess ? (
                    "✓ Executed"
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Execute & Earn
                    </>
                  )}
                </Button>
              </Card>
            ))
          ) : (
            <div className="col-span-full">
              <Card className="p-12 text-center">
                <p className="text-muted-foreground mb-4">
                  {tasksLoading ? "Loading tasks..." : "No tasks match your filters"}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Clear Filters
                </Button>
              </Card>
            </div>
          )}
        </div>

        {/* Stats Footer */}
        <Card className="mt-12 p-6 bg-primary/5 border-primary/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Total Tasks</p>
              <p className="text-3xl font-bold">{displayTasks.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Active Tasks</p>
              <p className="text-3xl font-bold text-green-600">
                {displayTasks.filter(t => t.status === "active").length}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Total Rewards Available</p>
              <p className="text-3xl font-bold text-primary">
                {displayTasks.length > 0
                  ? formatEther(
                      displayTasks.reduce((sum, t) => sum + t.rewardPerExecution * BigInt(t.remainingExecutions || 1), BigInt(0))
                    )
                  : "0"
                } ETH
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
