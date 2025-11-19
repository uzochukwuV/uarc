// Wallet hooks
export { useWallet } from './useWallet';

// Contract hooks
export {
  useTaskFactory,
  useCreateTask,
} from './useTaskFactory';

export {
  useExecutorHub,
  useRegisterExecutor,
  useExecuteTask,
} from './useExecutorHub';

export {
  useGlobalRegistry,
  useTasksByStatus,
  useTasksByCreator,
  useMyTasks,
  useExecutableTasks,
  useTaskDetails,
} from './useGlobalRegistry';

export { useUserTasks } from './useUserTasks';
export { useTokenApproval, useCheckApproval } from './useTokenApproval';

export {
  useExecutableTasksWithMetadata,
  useTaskWithMetadata,
  useUserTasksWithMetadata,
  useMarketplaceTasks,
  type TaskWithMetadata,
} from './useTasksWithMetadata';
