import { Navigation } from "@/components/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Medal, Award } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Executor } from "@shared/schema";

const rankIcons = {
  1: <Trophy className="w-8 h-8 text-yellow-500" />,
  2: <Medal className="w-8 h-8 text-gray-400" />,
  3: <Medal className="w-8 h-8 text-orange-600" />,
};

type RankedExecutor = Executor & { rank: number };

export default function Leaderboard() {
  const { data: executors = [], isLoading } = useQuery<RankedExecutor[]>({
    queryKey: ["/api/leaderboard"],
  });
  
  const topExecutors = executors.slice(0, 3);
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 pt-32 pb-24">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Executor Leaderboard</h1>
          <p className="text-xl text-muted-foreground">
            Top performers ranked by reputation and earnings
          </p>
        </div>

        {/* Top 3 Podium */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-8 bg-card rounded-lg border border-border">
                <Skeleton className="h-16 w-16 rounded-full mx-auto mb-4" />
                <Skeleton className="h-6 w-32 mx-auto mb-4" />
                <Skeleton className="h-8 w-24 mx-auto mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
              </div>
            ))
          ) : topExecutors.map((executor) => (
            <Card
              key={executor.rank}
              className={`p-8 text-center hover-elevate transition-all ${
                executor.rank === 1 ? "md:scale-105 border-primary" : ""
              }`}
              data-testid={`podium-${executor.rank}`}
            >
              <div className="flex justify-center mb-4">
                {rankIcons[executor.rank as keyof typeof rankIcons]}
              </div>
              
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 mb-4">
                <Avatar className="w-16 h-16">
                  <AvatarFallback className="text-xl font-bold bg-primary/10">
                    {executor.rank}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div className="mb-2">
                <Badge
                  variant="outline"
                  className={
                    executor.rank === 1
                      ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                      : executor.rank === 2
                      ? "bg-gray-400/10 text-gray-400 border-gray-400/20"
                      : "bg-orange-600/10 text-orange-600 border-orange-600/20"
                  }
                >
                  Rank #{executor.rank}
                </Badge>
              </div>

              <p className="font-mono text-sm text-muted-foreground mb-4">
                {executor.address}
              </p>

              <div className="space-y-3 mb-4">
                <div>
                  <p className="text-sm text-muted-foreground uppercase tracking-wide mb-1">
                    Total Earned
                  </p>
                  <p className="text-2xl font-bold text-primary">
                    {executor.totalEarned} ETH
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Reputation
                    </p>
                    <p className="text-lg font-semibold">
                      {((executor.reputationScore / 10000) * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                      Executions
                    </p>
                    <p className="text-lg font-semibold">
                      {executor.successfulExecutions.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Full Leaderboard Table */}
        <Card>
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              All Executors
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Rank
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Executor
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Total Earned
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Reputation
                  </th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Executions
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="py-4 px-6"><Skeleton className="h-6 w-12" /></td>
                      <td className="py-4 px-6"><Skeleton className="h-6 w-32" /></td>
                      <td className="py-4 px-6"><Skeleton className="h-6 w-24" /></td>
                      <td className="py-4 px-6"><Skeleton className="h-6 w-20" /></td>
                      <td className="py-4 px-6"><Skeleton className="h-6 w-16" /></td>
                    </tr>
                  ))
                ) : executors.map((executor) => (
                  <tr
                    key={executor.rank}
                    className={`border-b border-border hover-elevate ${
                      executor.rank <= 3 ? "bg-secondary/30" : ""
                    }`}
                    data-testid={`leaderboard-row-${executor.rank}`}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        {executor.rank <= 3 && (
                          <div>{rankIcons[executor.rank as keyof typeof rankIcons]}</div>
                        )}
                        <span className="font-bold text-lg">#{executor.rank}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-primary/10 text-sm font-semibold">
                            {executor.address.slice(2, 4)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-mono text-sm">{executor.address}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-semibold text-primary">
                        {executor.totalEarned} ETH
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 max-w-[100px]">
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${(executor.reputationScore / 10000) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <span className="text-sm font-medium">
                          {((executor.reputationScore / 10000) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-medium">
                      {executor.successfulExecutions.toLocaleString()}
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
