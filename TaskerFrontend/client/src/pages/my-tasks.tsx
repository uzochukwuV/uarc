import { useState } from "react";
import { Navigation } from "@/components/navigation";
import { TaskCard } from "@/components/task-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TaskStatus } from "@shared/schema";
import { Plus, Filter } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useUserTasks } from "@/lib/hooks/useUserTasks";
import { useWallet } from "@/lib/hooks";
import { formatEther } from "viem";

export default function MyTasks() {
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();
  const { address: userAddress, isConnected } = useWallet();

  // Fetch real tasks from blockchain
  const { tasks: blockchainTasks, isLoading, refetch } = useUserTasks();

  // Map task status from number to TaskStatus enum
  // 0=ACTIVE, 1=PAUSED, 2=COMPLETED, 3=CANCELLED, 4=EXPIRED
  const statusMap: Record<number, any> = {
    0: TaskStatus.ACTIVE,
    1: TaskStatus.PAUSED,
    2: TaskStatus.COMPLETED,
    3: TaskStatus.CANCELLED,
    4: TaskStatus.COMPLETED, // EXPIRED -> COMPLETED for UI
  };

  // Convert blockchain tasks to UI format
  const tasks = blockchainTasks.map(task => ({
    id: task.id,
    name: `Task #${task.id}`,
    description: `Automated task • Reward: ${formatEther(task.rewardPerExecution)} ETH • Executions: ${Number(task.executionCount)}/${Number(task.maxExecutions)}`,
    type: "TIME_BASED_TRANSFER" as any,
    status: statusMap[task.status] || TaskStatus.ACTIVE,
    executionCount: Number(task.executionCount),
    maxExecutions: Number(task.maxExecutions),
    rewardPerExecution: formatEther(task.rewardPerExecution),
    createdAt: new Date(task.createdAt * 1000).toISOString(),
    creator: task.creator,
    taskCoreAddress: task.taskCoreAddress,
    taskVaultAddress: task.taskVaultAddress,
  }));

  const filterTasks = (status: string) => {
    if (status === "all") return tasks;
    if (status === "active") return tasks.filter((t) => t.status === TaskStatus.ACTIVE);
    if (status === "paused") return tasks.filter((t) => t.status === TaskStatus.PAUSED);
    if (status === "completed")
      return tasks.filter(
        (t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CANCELLED
      );
    return tasks;
  };

  const filteredTasks = filterTasks(activeTab);

  // Task management functions (to be implemented with smart contracts)
  const handleCancel = (taskId: string) => {
    toast({
      title: "Cancel Task",
      description: "This feature will be implemented with TaskCore.cancel()",
    });
  };

  const handlePause = (taskId: string) => {
    toast({
      title: "Pause Task",
      description: "This feature will be implemented with TaskCore.pause()",
    });
  };

  const handleResume = (taskId: string) => {
    toast({
      title: "Resume Task",
      description: "This feature will be implemented with TaskCore.resume()",
    });
  };

  // Show connect wallet message if not connected
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-7xl mx-auto px-6 pt-32 pb-24">
          <div className="text-center py-24">
            <h1 className="text-4xl font-bold tracking-tight mb-4">My Tasks</h1>
            <p className="text-xl text-muted-foreground mb-8">
              Connect your wallet to view your tasks
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="max-w-7xl mx-auto px-6 pt-32 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-4">My Tasks</h1>
            <p className="text-xl text-muted-foreground">
              Manage your automated DeFi tasks
            </p>
          </div>
          <Link href="/create">
            <Button data-testid="button-create-new-task">
              <Plus className="w-4 h-4 mr-2" />
              Create Task
            </Button>
          </Link>
        </div>

        {/* Filters & Tabs */}
        <div className="mb-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between mb-6">
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-all">
                  All Tasks ({tasks.length})
                </TabsTrigger>
                <TabsTrigger value="active" data-testid="tab-active">
                  Active ({tasks.filter((t) => t.status === TaskStatus.ACTIVE).length})
                </TabsTrigger>
                <TabsTrigger value="paused" data-testid="tab-paused">
                  Paused ({tasks.filter((t) => t.status === TaskStatus.PAUSED).length})
                </TabsTrigger>
                <TabsTrigger value="completed" data-testid="tab-completed">
                  Completed (
                  {
                    tasks.filter(
                      (t) => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CANCELLED
                    ).length
                  }
                  )
                </TabsTrigger>
              </TabsList>

              <Button variant="outline" data-testid="button-filter">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>

            <TabsContent value={activeTab}>
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-6 bg-card rounded-lg border border-border">
                      <Skeleton className="h-6 w-3/4 mb-4" />
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-2/3 mb-4" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              ) : filteredTasks.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      showActions
                      onCancel={handleCancel}
                      onPause={handlePause}
                      onResume={handleResume}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-24">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary mb-6">
                    <Plus className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-2xl font-semibold mb-3">No tasks found</h3>
                  <p className="text-muted-foreground mb-8">
                    Get started by creating your first automated task
                  </p>
                  <Link href="/create">
                    <Button data-testid="button-create-first-task">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Task
                    </Button>
                  </Link>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
