import { useReadContract } from 'wagmi';
import { useEffect, useState } from 'react';
import { getContractAddress } from '../contracts/addresses';
import GlobalRegistryABI from '../contracts/abis/GlobalRegistry.json';
import TaskCoreABI from '../contracts/abis/TaskCore.json';
import { useWallet } from './useWallet';
import { useDebugContractRead } from './useDebugContractRead';

/**
 * Complete task data with both GlobalRegistry info and TaskCore metadata
 */
export interface TaskWithMetadata {
  taskId: bigint;
  taskCore: `0x${string}`;
  taskVault: `0x${string}`;
  creator: `0x${string}`;
  createdAt: bigint;
  expiresAt: bigint;
  status: number; // 0=ACTIVE, 1=PAUSED, 2=EXECUTING, 3=COMPLETED, 4=CANCELLED, 5=EXPIRED
  // From TaskCore metadata
  maxExecutions: bigint;
  executionCount: bigint;
  lastExecutionTime: bigint;
  recurringInterval: bigint;
  rewardPerExecution: bigint;
  actionsHash: `0x${string}`;
  seedCommitment: `0x${string}`;
  // Computed fields
  isExecutable?: boolean;
  remainingExecutions?: number;
  progressPercent?: number;
}

/**
 * Hook to fetch executable tasks with full metadata
 * Combines GlobalRegistry.getExecutableTasks() + TaskCore.getMetadata()
 */
export function useExecutableTasksWithMetadata(limit: number = 10, offset: number = 0) {
  const { chainId } = useWallet();
  const registryAddress = getContractAddress('GLOBAL_REGISTRY', chainId) as `0x${string}`;
  const [tasksWithMetadata, setTasksWithMetadata] = useState<TaskWithMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Step 1: Get executable task infos from GlobalRegistry
  const { data: taskInfos, isPending: isLoadingTasks } = useReadContract({
    address: registryAddress,
    abi: GlobalRegistryABI.abi,
    functionName: 'getExecutableTasks',
    args: [BigInt(limit), BigInt(offset)],
  });

  // Step 2: Fetch metadata for each task
  useEffect(() => {
    async function fetchMetadata() {
      if (!taskInfos || !Array.isArray(taskInfos) || taskInfos.length === 0) {
        setTasksWithMetadata([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const provider = (window as any).ethereum;
        if (!provider) {
          throw new Error('No ethereum provider found');
        }

        const ethers = await import('ethers');

        const metadataPromises = (taskInfos as any[]).map(async (taskInfo) => {
          try {
            const taskCore = new ethers.Contract(
              taskInfo.taskCore,
              TaskCoreABI.abi,
              new ethers.BrowserProvider(provider)
            );

            const metadata = await taskCore.getMetadata();

            return {
              taskId: taskInfo.taskId,
              taskCore: taskInfo.taskCore,
              taskVault: taskInfo.taskVault,
              creator: taskInfo.creator,
              createdAt: taskInfo.createdAt,
              expiresAt: taskInfo.expiresAt,
              status: taskInfo.status,
              maxExecutions: metadata.maxExecutions,
              executionCount: metadata.executionCount,
              lastExecutionTime: metadata.lastExecutionTime,
              recurringInterval: metadata.recurringInterval,
              rewardPerExecution: metadata.rewardPerExecution,
              actionsHash: metadata.actionsHash,
              seedCommitment: metadata.seedCommitment,
              isExecutable: metadata.status === 0, // ACTIVE status
              remainingExecutions: metadata.maxExecutions > 0
                ? Number(metadata.maxExecutions - metadata.executionCount)
                : -1,
              progressPercent: metadata.maxExecutions > 0
                ? (Number(metadata.executionCount) / Number(metadata.maxExecutions)) * 100
                : 0,
            } as TaskWithMetadata;
          } catch (error) {
            console.error(`Error fetching metadata for task ${taskInfo.taskId}:`, error);
            return null;
          }
        });

        const results = await Promise.all(metadataPromises);
        setTasksWithMetadata(results.filter((t) => t !== null) as TaskWithMetadata[]);
      } catch (error) {
        console.error('Error fetching task metadata:', error);
        setTasksWithMetadata([]);
      } finally {
        setIsLoading(false);
      }
    }

    if (!isLoadingTasks) {
      fetchMetadata();
    }
  }, [taskInfos, isLoadingTasks]);

  return {
    tasks: tasksWithMetadata,
    isLoading: isLoading || isLoadingTasks,
  };
}

/**
 * Hook to fetch a single task's complete metadata
 * Combines GlobalRegistry info + TaskCore metadata
 */
export function useTaskWithMetadata(taskId?: bigint) {
  const { chainId } = useWallet();
  const registryAddress = getContractAddress('GLOBAL_REGISTRY', chainId) as `0x${string}`;
  const [completeTask, setCompleteTask] = useState<TaskWithMetadata | undefined>();
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Step 1: Get task info from GlobalRegistry
  const { data: taskInfo, isPending: isLoadingInfo } = useReadContract({
    address: registryAddress,
    abi: GlobalRegistryABI.abi,
    functionName: 'getTaskInfo',
    args: taskId !== undefined ? [taskId] : undefined,
    query: {
      enabled: taskId !== undefined,
    },
  });

  // Step 2: Get metadata from TaskCore
  useEffect(() => {
    async function fetchMetadata() {
      if (!taskInfo || !(taskInfo as any).taskCore) {
        setCompleteTask(undefined);
        setIsLoadingMetadata(false);
        return;
      }

      setIsLoadingMetadata(true);
      try {
        const provider = (window as any).ethereum;
        if (!provider) {
          throw new Error('No ethereum provider found');
        }

        const ethers = await import('ethers');
        const taskCore = new ethers.Contract(
          (taskInfo as any).taskCore,
          TaskCoreABI.abi,
          new ethers.BrowserProvider(provider)
        );

        const metadata = await taskCore.getMetadata();

        setCompleteTask({
          taskId: (taskInfo as any).taskId,
          taskCore: (taskInfo as any).taskCore,
          taskVault: (taskInfo as any).taskVault,
          creator: (taskInfo as any).creator,
          createdAt: (taskInfo as any).createdAt,
          expiresAt: (taskInfo as any).expiresAt,
          status: (taskInfo as any).status,
          maxExecutions: metadata.maxExecutions,
          executionCount: metadata.executionCount,
          lastExecutionTime: metadata.lastExecutionTime,
          recurringInterval: metadata.recurringInterval,
          rewardPerExecution: metadata.rewardPerExecution,
          actionsHash: metadata.actionsHash,
          seedCommitment: metadata.seedCommitment,
          isExecutable: metadata.status === 0, // ACTIVE status
          remainingExecutions: metadata.maxExecutions > 0
            ? Number(metadata.maxExecutions - metadata.executionCount)
            : -1,
          progressPercent: metadata.maxExecutions > 0
            ? (Number(metadata.executionCount) / Number(metadata.maxExecutions)) * 100
            : 0,
        });
      } catch (error) {
        console.error('Error fetching task metadata:', error);
        setCompleteTask(undefined);
      } finally {
        setIsLoadingMetadata(false);
      }
    }

    if (!isLoadingInfo) {
      fetchMetadata();
    }
  }, [taskInfo, isLoadingInfo]);

  return {
    task: completeTask,
    isLoading: isLoadingInfo || isLoadingMetadata,
  };
}

/**
 * Hook to fetch user's tasks with full metadata
 */
export function useUserTasksWithMetadata(userAddress?: `0x${string}`) {
  const { chainId } = useWallet();
  const registryAddress = getContractAddress('GLOBAL_REGISTRY', chainId) as `0x${string}`;
  const [tasksWithMetadata, setTasksWithMetadata] = useState<TaskWithMetadata[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Step 1: Get task IDs from GlobalRegistry
  const { data: taskIds, isPending: isLoadingIds } = useReadContract({
    address: registryAddress,
    abi: GlobalRegistryABI.abi,
    functionName: 'getTasksByCreator',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress,
    },
  });

  // Step 2: Get task info and metadata for each ID
  useEffect(() => {
    async function fetchTasks() {
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        setTasksWithMetadata([]);
        setIsLoadingMetadata(false);
        return;
      }

      setIsLoadingMetadata(true);
      try {
        const provider = (window as any).ethereum;
        if (!provider) {
          throw new Error('No ethereum provider found');
        }

        const ethers = await import('ethers');
        const globalRegistry = new ethers.Contract(
          registryAddress,
          GlobalRegistryABI.abi,
          new ethers.BrowserProvider(provider)
        );

        const taskPromises = (taskIds as bigint[]).map(async (taskId) => {
          try {
            // Get task info from GlobalRegistry
            const taskInfo = await globalRegistry.getTaskInfo(taskId);

            // Get metadata from TaskCore
            const taskCore = new ethers.Contract(
              taskInfo.taskCore,
              TaskCoreABI.abi,
              new ethers.BrowserProvider(provider)
            );
            const metadata = await taskCore.getMetadata();

            return {
              taskId: taskInfo.taskId,
              taskCore: taskInfo.taskCore,
              taskVault: taskInfo.taskVault,
              creator: taskInfo.creator,
              createdAt: taskInfo.createdAt,
              expiresAt: taskInfo.expiresAt,
              status: taskInfo.status,
              maxExecutions: metadata.maxExecutions,
              executionCount: metadata.executionCount,
              lastExecutionTime: metadata.lastExecutionTime,
              recurringInterval: metadata.recurringInterval,
              rewardPerExecution: metadata.rewardPerExecution,
              actionsHash: metadata.actionsHash,
              seedCommitment: metadata.seedCommitment,
              isExecutable: metadata.status === 0,
              remainingExecutions: metadata.maxExecutions > 0
                ? Number(metadata.maxExecutions - metadata.executionCount)
                : -1,
              progressPercent: metadata.maxExecutions > 0
                ? (Number(metadata.executionCount) / Number(metadata.maxExecutions)) * 100
                : 0,
            } as TaskWithMetadata;
          } catch (error) {
            console.error(`Error fetching task ${taskId}:`, error);
            return null;
          }
        });

        const results = await Promise.all(taskPromises);
        setTasksWithMetadata(results.filter((t) => t !== null) as TaskWithMetadata[]);
      } catch (error) {
        console.error('Error fetching user tasks:', error);
        setTasksWithMetadata([]);
      } finally {
        setIsLoadingMetadata(false);
      }
    }

    if (!isLoadingIds) {
      fetchTasks();
    }
  }, [taskIds, isLoadingIds, registryAddress]);

  return {
    taskIds: taskIds as bigint[] | undefined,
    tasks: tasksWithMetadata,
    isLoading: isLoadingIds || isLoadingMetadata,
  };
}

/**
 * Hook to fetch tasks with full metadata for the marketplace
 * Uses getExecutableTasks with pagination and fetches full metadata
 */
export function useMarketplaceTasks(limit: number = 20, offset: number = 0) {
  const { chainId } = useWallet();
  const registryAddress = getContractAddress('GLOBAL_REGISTRY', chainId) as `0x${string}`;
  const [tasksWithMetadata, setTasksWithMetadata] = useState<TaskWithMetadata[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Fetch executable tasks with pagination
  const { data: taskInfos, isPending: isLoadingTasks, error: readError, isError } = useReadContract({
    address: registryAddress,
    abi: GlobalRegistryABI.abi,
    functionName: 'getExecutableTasks',
    args: [BigInt(limit), BigInt(offset)],
    query: {
      enabled: !!registryAddress && registryAddress !== '0x0000000000000000000000000000000000000000',
    },
  });

  // Debug logging
  useEffect(() => {
    const debugLog = {
      timestamp: new Date().toISOString(),
      chainId,
      registryAddress,
      isLoadingTasks,
      isError,
      errorMessage: readError?.message || 'No error',
      taskInfosReceived: !!taskInfos,
      taskInfosLength: (taskInfos as any[])?.length || 0,
      taskInfos: taskInfos ? `${(taskInfos as any[])?.length || 0} tasks` : 'null',
    };

    console.log('[useMarketplaceTasks] Contract read:', debugLog);

    if (isError) {
      console.error('[useMarketplaceTasks] ERROR:', readError);
    }
  }, [chainId, registryAddress, isLoadingTasks, isError, readError, taskInfos]);

  // Fetch metadata for each task
  useEffect(() => {
    console.log(taskInfos)
    async function fetchMetadata() {
      if (!taskInfos || !Array.isArray(taskInfos) || taskInfos.length === 0) {
        setTasksWithMetadata([]);
        setIsLoadingMetadata(false);
        return;
      }

      setIsLoadingMetadata(true);
      try {
        const provider = (window as any).ethereum;
        if (!provider) {
          throw new Error('No ethereum provider found');
        }

        const ethers = await import('ethers');

        const metadataPromises = (taskInfos as any[]).map(async (taskInfo) => {
          try {
            const taskCore = new ethers.Contract(
              taskInfo.taskCore,
              TaskCoreABI.abi,
              new ethers.BrowserProvider(provider)
            );

            const metadata = await taskCore.getMetadata();

            return {
              taskId: taskInfo.taskId,
              taskCore: taskInfo.taskCore,
              taskVault: taskInfo.taskVault,
              creator: taskInfo.creator,
              createdAt: taskInfo.createdAt,
              expiresAt: taskInfo.expiresAt,
              status: taskInfo.status,
              maxExecutions: metadata.maxExecutions,
              executionCount: metadata.executionCount,
              lastExecutionTime: metadata.lastExecutionTime,
              recurringInterval: metadata.recurringInterval,
              rewardPerExecution: metadata.rewardPerExecution,
              actionsHash: metadata.actionsHash,
              seedCommitment: metadata.seedCommitment,
              isExecutable: metadata.status === 0,
              remainingExecutions: metadata.maxExecutions > 0
                ? Number(metadata.maxExecutions - metadata.executionCount)
                : -1,
              progressPercent: metadata.maxExecutions > 0
                ? (Number(metadata.executionCount) / Number(metadata.maxExecutions)) * 100
                : 0,
            } as TaskWithMetadata;
          } catch (error) {
            console.error(`Error fetching metadata for task ${taskInfo.taskId}:`, error);
            return null;
          }
        });

        const results = await Promise.all(metadataPromises);
        setTasksWithMetadata(results.filter((t) => t !== null) as TaskWithMetadata[]);
      } catch (error) {
        console.error('Error fetching marketplace tasks:', error);
        setTasksWithMetadata([]);
      } finally {
        setIsLoadingMetadata(false);
      }
    }

    if (!isLoadingTasks) {
      fetchMetadata();
    }
  }, [taskInfos, isLoadingTasks]);

  return {
    tasks: tasksWithMetadata,
    isLoading: isLoadingMetadata || isLoadingTasks,
    taskCount: tasksWithMetadata.length,
    // Debug info for troubleshooting
    _debug: {
      chainId,
      registryAddress,
      readError: readError?.message,
      isReadError: isError,
      taskInfosReceived: !!taskInfos,
      taskInfosLength: (taskInfos as any[])?.length || 0,
    },
  };
}
