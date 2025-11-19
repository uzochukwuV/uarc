import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Task, TaskStatus } from "@shared/schema";
import { Clock, TrendingUp, Repeat, Zap, GemIcon } from "lucide-react";
import { Link } from "wouter";

interface TaskCardProps {
  task: Task;
  showActions?: boolean;
  onCancel?: (taskId: string) => void;
  onPause?: (taskId: string) => void;
  onResume?: (taskId: string) => void;
  onExecute?: (taskId: string) => void;
}

const statusColors = {
  [TaskStatus.ACTIVE]: "bg-green-500/10 text-green-500 border-green-500/20",
  [TaskStatus.PAUSED]: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  [TaskStatus.COMPLETED]: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  [TaskStatus.CANCELLED]: "bg-red-500/10 text-red-500 border-red-500/20",
  [TaskStatus.EXECUTING]: "bg-primary/10 text-primary border-primary/20",
};

const typeIcons = {
  LIMIT_ORDER: TrendingUp,
  DCA: Repeat,
  AUTO_COMPOUND: Zap,
};

export function TaskCard({ task, showActions = false, onCancel, onPause, onResume, onExecute }: TaskCardProps) {
  const TypeIcon = typeIcons[task.type];
  const progress = task.maxExecutions > 0
    ? (task.executionCount / task.maxExecutions) * 100
    : 0;

  // Get executable status from smart contract
  // isExecutable is determined by TaskCore.isExecutable() which checks:
  // 1. Task is ACTIVE
  // 2. Not expired
  // 3. Execution count < maxExecutions
  // 4. Time-based conditions met (if recurring)
  const isExecutable = (task as any).isExecutable === true;

  // Get remaining executions
  const remainingExecutions = task.maxExecutions > 0
    ? task.maxExecutions - task.executionCount
    : -1;

  // Get status message based on smart contract executable status
  const getStatusMessage = () => {
    if (task.status === TaskStatus.COMPLETED) return "Task Completed";
    if (task.status === TaskStatus.PAUSED) return "Task Paused";
    if (task.status === TaskStatus.CANCELLED) return "Task Cancelled";
    if (task.status === TaskStatus.EXECUTING) return "Task Executing";

    // Task is ACTIVE, check if executable
    if (!isExecutable) {
      const now = Math.floor(Date.now() / 1000);

      // Check expiration
      if (task.expiresAt && typeof task.expiresAt === 'number' && now > task.expiresAt) {
        return "Task Expired";
      }

      // Check execution limit
      if (task.maxExecutions > 0 && task.executionCount >= task.maxExecutions) {
        return "Execution Limit Reached";
      }

      // Check time-based conditions (recurring tasks)
      const recurringInterval = (task as any).recurringInterval;
      const lastExecutionTime = (task as any).lastExecutionTime;
      if (recurringInterval && recurringInterval > 0 && lastExecutionTime && lastExecutionTime > 0) {
        const nextExecutionTime = lastExecutionTime + recurringInterval;
        if (now < nextExecutionTime) {
          const secondsUntilReady = nextExecutionTime - now;
          return `Ready in ${secondsUntilReady}s`;
        }
      }

      return "Not Executable";
    }

    // Task is executable
    if (remainingExecutions > 0) {
      return `Ready to Execute (${remainingExecutions} left)`;
    }

    return "Ready to Execute";
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };



  return (
    <Card className="p-6 hover-elevate transition-all group" data-testid={`task-card-${task.id}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <GemIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{task.name}</h3>
            <p className="text-sm text-muted-foreground">{task.type.replace(/_/g, " ")}</p>
          </div>
        </div>
        <Badge className={statusColors[task.status]} data-testid={`status-${task.id}`}>
          {task.status}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
        {task.description}
      </p>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Reward
          </p>
          <p className="text-lg font-semibold text-foreground">
            {task.rewardPerExecution} ETH
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Executions
          </p>
          <p className="text-lg font-semibold text-foreground">
            {task.executionCount}
            {task.maxExecutions > 0 && ` / ${task.maxExecutions}`}
          </p>
        </div>
      </div>

      {task.maxExecutions > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Status indicator */}
      <div className="mb-4 p-3 rounded-lg bg-secondary/50">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Status:</span>
          <span className="text-sm font-semibold text-foreground">{getStatusMessage()}</span>
        </div>
        {task.maxExecutions > 0 && remainingExecutions >= 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            Remaining: {remainingExecutions} execution{remainingExecutions !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>Created {formatDate(task.createdAt)}</span>
        </div>
        {task.expiresAt && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Expires {formatDate(task.expiresAt)}</span>
          </div>
        )}
      </div>

      {showActions && (
        <div className="space-y-3 pt-4 border-t border-border">
          {/* Execute button - only show if task is executable */}
          {isExecutable && onExecute && (
            <Button
              className="w-full"
              onClick={() => onExecute(task.id)}
              data-testid={`button-execute-${task.id}`}
            >
              Execute & Earn {task.rewardPerExecution} ETH
            </Button>
          )}

          {/* Disabled execute button - show reason why execution is disabled */}
          {!isExecutable && (
            <Button
              disabled
              className="w-full"
              data-testid={`button-execute-disabled-${task.id}`}
              title={
                task.status === TaskStatus.PAUSED
                  ? "Task is paused"
                  : task.status === TaskStatus.CANCELLED
                  ? "Task is cancelled"
                  : task.status === TaskStatus.COMPLETED
                  ? "Task is completed"
                  : "Task is not executable"
              }
            >
              {task.status === TaskStatus.COMPLETED
                ? "Task Completed"
                : `Cannot Execute (${task.status})`}
            </Button>
          )}

          <div className="flex items-center gap-2">
            <Link href={`/tasks/${task.id}`} className="flex-1">
              <Button variant="outline" className="w-full" data-testid={`button-view-${task.id}`}>
                View Details
              </Button>
            </Link>

            {task.status === TaskStatus.ACTIVE && onPause && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPause(task.id)}
                data-testid={`button-pause-${task.id}`}
              >
                Pause
              </Button>
            )}

            {task.status === TaskStatus.PAUSED && onResume && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResume(task.id)}
                data-testid={`button-resume-${task.id}`}
              >
                Resume
              </Button>
            )}

            {(task.status === TaskStatus.ACTIVE || task.status === TaskStatus.PAUSED) && onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(task.id)}
                data-testid={`button-cancel-${task.id}`}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
