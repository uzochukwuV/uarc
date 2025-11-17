import { Navigation } from "@/components/navigation";
import { StatCard } from "@/components/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Layers, Users, Zap, TrendingUp, Repeat, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Analytics, Execution } from "@shared/schema";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["hsl(48, 100%, 50%)", "hsl(24, 95%, 58%)", "hsl(210, 70%, 58%)"];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Analytics() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
  });
  
  const { data: executions = [], isLoading: executionsLoading } = useQuery<Execution[]>({
    queryKey: ["/api/executions"],
  });

  const isLoading = analyticsLoading || executionsLoading;

  const recentExecutions = executions.slice(0, 5);
  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 pt-32 pb-24">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Analytics</h1>
          <p className="text-xl text-muted-foreground">
            Platform performance and insights
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-6 bg-card rounded-lg border border-border">
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))
          ) : analytics ? (
            <>
              <StatCard
                title="Total Value Locked"
                value={`${analytics.totalValueLocked.toFixed(2)} ETH`}
                icon={DollarSign}
              />
              <StatCard
                title="Total Tasks"
                value={analytics.totalTasks.toString()}
                icon={Layers}
              />
              <StatCard
                title="Active Executors"
                value={analytics.totalExecutors.toString()}
                icon={Users}
              />
              <StatCard
                title="Total Executions"
                value={analytics.totalExecutions.toString()}
                icon={Zap}
              />
            </>
          ) : null}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {/* Executions Over Time */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Executions Over Time
            </h3>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics?.executionsOverTime.map((item, i) => ({
                date: DAYS[i] || `Day ${i + 1}`,
                executions: item.count,
              })) || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="executions"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
            )}
          </Card>

          {/* Task Type Distribution */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Repeat className="w-5 h-5 text-primary" />
              Task Type Distribution
            </h3>
            {isLoading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
            <div className="grid grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={analytics?.taskTypeDistribution.map(item => ({
                      type: item.type.replace(/_/g, ' '),
                      count: item.count,
                    })) || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="count"
                  >
                    {(analytics?.taskTypeDistribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              
              <div className="flex flex-col justify-center space-y-4">
                {(analytics?.taskTypeDistribution || []).map((item, index) => {
                  const total = analytics?.totalTasks || 1;
                  const percentage = ((item.count / total) * 100).toFixed(0);
                  return (
                  <div key={item.type}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index] }}
                        />
                        <span className="text-sm font-medium">{item.type.replace(/_/g, ' ')}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {percentage}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {item.count.toLocaleString()} tasks
                    </p>
                  </div>
                  );
                })}
              </div>
            </div>
            )}
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Recent Executions
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Task
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Executor
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Time
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Reward
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="py-4 px-6"><Skeleton className="h-4 w-32" /></td>
                      <td className="py-4 px-6"><Skeleton className="h-4 w-24" /></td>
                      <td className="py-4 px-6"><Skeleton className="h-4 w-16" /></td>
                      <td className="py-4 px-6"><Skeleton className="h-4 w-20" /></td>
                      <td className="py-4 px-6"><Skeleton className="h-6 w-16" /></td>
                    </tr>
                  ))
                ) : recentExecutions.map((execution) => (
                  <tr
                    key={execution.id}
                    className="border-b border-border hover-elevate"
                    data-testid={`execution-row-${execution.id}`}
                  >
                    <td className="py-4 px-6 font-medium">{execution.taskId}</td>
                    <td className="py-4 px-6">
                      <span className="font-mono text-sm text-muted-foreground">
                        {execution.executor}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-muted-foreground">
                      {formatTime(execution.timestamp)}
                    </td>
                    <td className="py-4 px-6 font-medium">{execution.reward} ETH</td>
                    <td className="py-4 px-6">
                      <Badge
                        className={
                          execution.success
                            ? "bg-green-500/10 text-green-500 border-green-500/20"
                            : "bg-red-500/10 text-red-500 border-red-500/20"
                        }
                      >
                        {execution.success ? "success" : "failed"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
