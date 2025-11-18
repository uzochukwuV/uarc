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
import { useExecutableTasks, useWallet } from "@/lib/hooks";
import { useExecuteTask } from "@/lib/hooks/useExecutorHub";
import { useWaitForTransactionReceipt } from "wagmi";
import { useToast } from "@/hooks/use-toast";
import { formatEther } from "viem";
import { ethers } from "ethers";

interface Task {
  id: string;
  name: string;
  description: string;
  reward: string;
  executionCount: number;
  maxExecutions: number;
  status: "active" | "completed" | "expired";
  creator: string;
  adapter: string;
}

export default function Marketplace() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("active");

  const { address: userAddress, isConnected } = useWallet();
  const { tasks: taskAddresses = [], isLoading: tasksLoading } = useExecutableTasks();
  const { executeTask, hash: executeHash, isPending: isExecuting, isSuccess: isExecuteSuccess } = useExecuteTask();
  const { isSuccess: isExecutionConfirmed } = useWaitForTransactionReceipt({ hash: executeHash });
  const { toast } = useToast();

  // Mock tasks data - in production, fetch from blockchain
  const mockTasks: Task[] = useMemo(() => [
    {
      id: "1",
      name: "Time-Based USDC Transfer",
      description: "Transfer 100 USDC at a specific time. Simple and perfect for testing!",
      reward: "0.01",
      executionCount: 2,
      maxExecutions: 10,
      status: "active",
      creator: "0x742d35Cc6634C0532925a3b844Bc856d9d8E6fE3",
      adapter: "TimeBasedTransferAdapter"
    },
    {
      id: "2",
      name: "Limit Order - ETH/USDC",
      description: "Buy ETH when price drops below $2000. Automated trading at scale.",
      reward: "0.05",
      executionCount: 0,
      maxExecutions: 5,
      status: "active",
      creator: "0xaBEd4bC16A1cFD123456789abcdef0123456789a",
      adapter: "UniswapV2USDCETHBuyLimitAdapter"
    },
    {
      id: "3",
      name: "Daily USDC Sweep",
      description: "Automatically sweep USDC to cold wallet daily. Enhanced security.",
      reward: "0.02",
      executionCount: 45,
      maxExecutions: 365,
      status: "active",
      creator: "0x1234567890123456789012345678901234567890",
      adapter: "TimeBasedTransferAdapter"
    },
    {
      id: "4",
      name: "Completed Task",
      description: "This task has already reached max executions.",
      reward: "0.03",
      executionCount: 10,
      maxExecutions: 10,
      status: "completed",
      creator: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      adapter: "TimeBasedTransferAdapter"
    },
  ], []);

  // Filter and search tasks
  const filteredTasks = useMemo(() => {
    return mockTasks.filter(task => {
      // Status filter
      if (statusFilter !== "all" && task.status !== statusFilter) {
        return false;
      }

      // Search filter
      if (searchQuery && !task.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !task.description.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [searchQuery, statusFilter]);

  const handleExecuteTask = (taskId: string) => {
    if (!isConnected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to execute tasks",
        variant: "destructive"
      });
      return;
    }

    // TODO: Build proper actionsProof from task data
    const actionsProof = "0x"; // Placeholder

    executeTask(BigInt(taskId), actionsProof as `0x${string}`);

    toast({
      title: "Execution submitted",
      description: "Your execution is being processed...",
    });
  };

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
              <Card key={task.id} className="p-6 hover:border-primary/50 transition-colors">
                <div className="mb-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold">{task.name}</h3>
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
                          Completed
                        </>
                      )}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {task.description}
                  </p>
                </div>

                {/* Task Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6 py-4 border-t border-b border-border">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Reward</p>
                      <p className="font-semibold">{task.reward} ETH</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Executions</p>
                      <p className="font-semibold">{task.executionCount}/{task.maxExecutions}</p>
                    </div>
                  </div>
                </div>

                {/* Creator Info */}
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1">Creator</p>
                  <p className="text-sm font-mono text-xs truncate">
                    {task.creator.substring(0, 6)}...{task.creator.substring(task.creator.length - 4)}
                  </p>
                </div>

                {/* Action Button */}
                <Button
                  onClick={() => handleExecuteTask(task.id)}
                  disabled={task.status !== "active" || isExecuting || !isConnected}
                  className="w-full"
                  data-testid={`button-execute-task-${task.id}`}
                >
                  {task.status === "completed" ? (
                    "Task Completed"
                  ) : isExecuting ? (
                    "Executing..."
                  ) : isExecuteSuccess ? (
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
                <p className="text-muted-foreground mb-4">No tasks match your filters</p>
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
              <p className="text-3xl font-bold">{mockTasks.length}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Active Tasks</p>
              <p className="text-3xl font-bold text-green-600">
                {mockTasks.filter(t => t.status === "active").length}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Total Rewards Available</p>
              <p className="text-3xl font-bold text-primary">
                {(mockTasks.reduce((sum, t) => sum + parseFloat(t.reward), 0)).toFixed(2)} ETH
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
