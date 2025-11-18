import { useState } from "react";
import { Navigation } from "@/components/navigation";
import { StatCard } from "@/components/stat-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, DollarSign, CheckCircle, TrendingUp, Search, Zap } from "lucide-react";
import { Link } from "wouter";
import { useExecutorHub, useExecutableTasks, useWallet } from "@/lib/hooks";
import { useRegisterExecutor } from "@/lib/hooks/useExecutorHub";
import { useWaitForTransactionReceipt } from "wagmi";
import { useToast } from "@/hooks/use-toast";
import { formatEther } from "viem";

export default function ExecutorDashboard() {
  const [searchQuery, setSearchQuery] = useState("");

  // Get user address from wallet connection
  const { address: userAddress, isConnected } = useWallet();

  // Get executor data from blockchain
  const { executor, isRegistered, isLoading: executorLoading } = useExecutorHub();

  // Get executable tasks (active tasks)
  const { tasks: taskAddresses = [], isLoading: tasksLoading } = useExecutableTasks();

  // Registration hook
  const { registerExecutor, hash: registerHash, isPending: isRegistering, isSuccess: isRegisterSuccess } = useRegisterExecutor();
  const { isSuccess: isRegistrationConfirmed } = useWaitForTransactionReceipt({ hash: registerHash });
  const { toast } = useToast();

  const isLoading = executorLoading || tasksLoading;

  // Calculate reputation percentage from executor data
  const reputationPercentage = executor && isRegistered
    ? (Number((executor as any).reputationScore) / 10000) * 100
    : 0;

  // Parse executor data
  const executorData = executor && isRegistered ? {
    reputationScore: Number((executor as any).reputationScore),
    totalEarned: parseFloat(formatEther((executor as any).totalEarned || 0n)),
    successfulExecutions: Number((executor as any).successfulExecutions),
    stakedAmount: parseFloat(formatEther((executor as any).stakedAmount || 0n)),
  } : null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 pt-32 pb-24">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Executor Dashboard</h1>
          <p className="text-xl text-muted-foreground">
            Execute tasks and earn rewards
          </p>
        </div>

        {!isRegistered ? (
          <Card className="p-12 text-center border-2 border-primary/20">
            <div className="max-w-2xl mx-auto">
              <div className="mb-6 flex justify-center">
                <Zap className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-4">Start Earning Now</h2>
              <p className="text-muted-foreground mb-2">
                Become an Executor and earn rewards for executing automated tasks
              </p>
              <p className="text-sm text-green-600 font-semibold mb-8">
                ✨ Free registration • No stake required • Start earning immediately
              </p>
              <Button
                size="lg"
                onClick={() => {
                  registerExecutor(0n); // 0 stake on testnet
                  toast({
                    title: "Registration submitted",
                    description: "You'll be able to execute tasks once confirmed",
                  });
                }}
                disabled={isRegistering || isRegisterSuccess}
                data-testid="button-register-executor"
              >
                {isRegistering ? "Registering..." : isRegisterSuccess ? "Registered!" : "Register as Executor - Free"}
              </Button>
              {isRegisterSuccess && (
                <p className="text-sm text-green-600 font-semibold mt-4">
                  ✅ Registration confirmed! Start executing tasks from the marketplace.
                </p>
              )}
            </div>
          </Card>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              {isLoading || !executorData ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-6 bg-card rounded-lg border border-border">
                    <Skeleton className="h-4 w-24 mb-4" />
                    <Skeleton className="h-8 w-32 mb-2" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))
              ) : (
                <>
                  <StatCard
                    title="Reputation Score"
                    value={`${reputationPercentage.toFixed(0)}%`}
                    icon={Award}
                    description={`${executorData.reputationScore.toLocaleString()} / 10,000`}
                  />
                  <StatCard
                    title="Total Earned"
                    value={`${executorData.totalEarned.toFixed(3)} ETH`}
                    icon={DollarSign}
                    description="All-time earnings"
                  />
                  <StatCard
                    title="Successful Executions"
                    value={executorData.successfulExecutions.toString()}
                    icon={CheckCircle}
                    description="Total completed"
                  />
                  <StatCard
                    title="Staked Amount"
                    value={`${executorData.stakedAmount.toFixed(3)} ETH`}
                    icon={TrendingUp}
                    description="Currently staked"
                  />
                </>
              )}
            </div>

            {/* Reputation Progress */}
            {executorData && (
              <Card className="p-6 mb-12">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg mb-1">Reputation Progress</h3>
                    <p className="text-sm text-muted-foreground">
                      Your reputation affects reward multipliers
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">
                      {reputationPercentage.toFixed(1)}%
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {executorData.reputationScore.toLocaleString()} points
                    </p>
                  </div>
                </div>
                <Progress value={reputationPercentage} className="h-3" />
                <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
                  <span>0</span>
                  <span>10,000</span>
                </div>
              </Card>
            )}

            {/* Available Tasks */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold">Available Tasks</h2>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tasks..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-tasks"
                  />
                </div>
              </div>

              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          Task
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          Type
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          Reward
                        </th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          Executions
                        </th>
                        <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasksLoading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i} className="border-b border-border">
                            <td className="py-4 px-6"><Skeleton className="h-4 w-48" /></td>
                            <td className="py-4 px-6"><Skeleton className="h-6 w-24" /></td>
                            <td className="py-4 px-6"><Skeleton className="h-4 w-20" /></td>
                            <td className="py-4 px-6"><Skeleton className="h-4 w-16" /></td>
                            <td className="py-4 px-6"><Skeleton className="h-9 w-24 ml-auto" /></td>
                          </tr>
                        ))
                      ) : taskAddresses && taskAddresses.length > 0 ? (
                        taskAddresses.map((taskAddress) => (
                          <tr
                            key={taskAddress}
                            className="border-b border-border hover-elevate"
                            data-testid={`task-row-${taskAddress}`}
                          >
                            <td className="py-4 px-6">
                              <div>
                                <p className="font-medium text-sm font-mono">
                                  {taskAddress.slice(0, 10)}...{taskAddress.slice(-8)}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Task Contract
                                </p>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <Badge variant="outline">
                                Active
                              </Badge>
                            </td>
                            <td className="py-4 px-6 font-medium">
                              -- ETH
                            </td>
                            <td className="py-4 px-6 text-muted-foreground">
                              --
                            </td>
                            <td className="py-4 px-6 text-right">
                              <Button size="sm" data-testid={`button-execute-${taskAddress}`}>
                                Execute
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-8 px-6 text-center text-muted-foreground">
                            No executable tasks available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
