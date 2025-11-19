import { useReadContract } from 'wagmi';
import { getContractAddress } from '../contracts/addresses';
import GlobalRegistryABI from '../contracts/abis/GlobalRegistry.json';
import { useWallet } from './useWallet';
import { useEffect, useState } from 'react';

export interface BlockchainTask {
  id: string;
  taskCoreAddress: string;
  taskVaultAddress: string;
  creator: string;
  createdAt: number;
  expiresAt: bigint;
  maxExecutions: bigint;
  executionCount: bigint;
  rewardPerExecution: bigint;
  status: number; // 0=ACTIVE, 1=PAUSED, 2=COMPLETED, 3=CANCELLED, 4=EXPIRED
}

/**
 * Hook to fetch user's tasks from blockchain
 * Uses GlobalRegistry.getTasksByCreator() to get user's task IDs
 */
export function useUserTasks() {
  const { chainId, address: userAddress } = useWallet();
  const globalRegistryAddress = getContractAddress('GLOBAL_REGISTRY', chainId);

  const [tasks, setTasks] = useState<BlockchainTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Debug logging
  console.log('[useUserTasks] Hook initialized:', {
    userAddress,
    chainId,
    globalRegistryAddress,
    enabled: !!userAddress && !!globalRegistryAddress,
  });

  // Get all task IDs created by the user from GlobalRegistry
  const { data: userTaskIds, refetch: refetchTaskIds, isLoading: isLoadingIds, error } = useReadContract({
    address: globalRegistryAddress as `0x${string}`,
    abi: GlobalRegistryABI.abi,
    functionName: 'getTasksByCreator',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!globalRegistryAddress,
    },
  });

  // Debug the contract call result
  console.log('[useUserTasks] Contract call result:', {
    userTaskIds,
    isLoadingIds,
    error,
    argsUsed: userAddress ? [userAddress] : undefined,
  });

  // Fetch task details for each task ID
  useEffect(() => {
    console.log(userTaskIds)
    async function fetchTasks() {
      if (!userTaskIds || !Array.isArray(userTaskIds) || userTaskIds.length === 0) {
        setTasks([]);
        // setIsLoading(false);
        // return;
      }

      if (!globalRegistryAddress) {
        console.error('GlobalRegistry address not found');
        setTasks([]);
        // setIsLoading(false);
        // return;
      }

      setIsLoading(true);

      try {
        const taskPromises = (userTaskIds as bigint[]).map(async (taskId) => {
          try {
            // Use wagmi's readContract to fetch task info
            // We'll use the provider directly here for simplicity
            const provider = (window as any).ethereum;
            if (!provider) {
              throw new Error('No ethereum provider found');
            }

            // Create contract interface
            const contract = new (await import('ethers')).ethers.Contract(
              globalRegistryAddress,
              GlobalRegistryABI.abi,
              new (await import('ethers')).ethers.BrowserProvider(provider)
            );

            // Fetch task info
            const taskInfo = await contract.getTaskInfo(taskId);
            console.log(taskInfo)
            // Fetch task addresses
            const [taskCoreAddress, taskVaultAddress] = await contract.getTaskAddresses(taskId);

            return {
              id: taskId.toString(),
              taskCoreAddress,
              taskVaultAddress,
              creator: taskInfo.creator,
              createdAt: Number(taskInfo.createdAt),
              expiresAt: taskInfo.expiresAt,
              maxExecutions: taskInfo.maxExecutions,
              executionCount: taskInfo.executionCount,
              rewardPerExecution: taskInfo.rewardPerExecution,
              status: Number(taskInfo.status),
            } as BlockchainTask;
          } catch (error) {
            console.error(`Error fetching task ${taskId}:`, error);
            return null;
          }
        });

        const fetchedTasks = (await Promise.all(taskPromises)).filter((task): task is BlockchainTask => task !== null);
        setTasks(fetchedTasks);
      } catch (error) {
        console.error('Error fetching tasks:', error);
        setTasks([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTasks();
  }, [userTaskIds, globalRegistryAddress]);

  return {
    tasks,
    isLoading: isLoading || isLoadingIds,
    refetch: refetchTaskIds,
  };
}

/**
 * Hook to fetch tasks by status
 */
export function useTasksByStatus(status?: number) {
  const { chainId } = useWallet();
  const address = getContractAddress('GLOBAL_REGISTRY', chainId);

  const { data: taskIds, isPending: isLoading } = useReadContract({
    address: address as `0x${string}`,
    abi: GlobalRegistryABI.abi,
    functionName: 'getTasksByStatus',
    args: status !== undefined ? [status] : undefined,
    query: {
      enabled: status !== undefined && !!address,
    },
  });

  return {
    taskIds: taskIds as bigint[] | undefined,
    isLoading,
  };
}
