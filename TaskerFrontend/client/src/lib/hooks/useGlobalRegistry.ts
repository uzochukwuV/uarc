import { useReadContract } from 'wagmi';
import { getContractAddress } from '../contracts/addresses';
import GlobalRegistryABI from '../contracts/abis/GlobalRegistry.json';
import { useWallet } from './useWallet';

/**
 * Hook for querying tasks from GlobalRegistry
 */
export function useGlobalRegistry() {
  const { chainId } = useWallet();
  const contractAddress = getContractAddress('GLOBAL_REGISTRY', chainId);

  // Read: Get total task count
  const { data: totalTasks, isPending: isLoadingCount } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: GlobalRegistryABI.abi,
    functionName: 'getTotalTasks',
  });

  return {
    contractAddress,
    totalTasks: totalTasks ? Number(totalTasks) : 0,
    isLoading: isLoadingCount,
  };
}

/**
 * Hook for querying tasks by status
 */
export function useTasksByStatus(status?: number) {
  const { chainId } = useWallet();
  const contractAddress = getContractAddress('GLOBAL_REGISTRY', chainId);

  const { data: tasks, isPending: isLoading } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: GlobalRegistryABI.abi,
    functionName: 'getTasksByStatus',
    args: status !== undefined ? [status] : undefined,
    query: {
      enabled: status !== undefined,
    },
  });

  return {
    tasks: tasks as `0x${string}`[] | undefined,
    isLoading,
  };
}

/**
 * Hook for querying tasks by creator
 */
export function useTasksByCreator(creator?: `0x${string}`) {
  const { chainId } = useWallet();
  const contractAddress = getContractAddress('GLOBAL_REGISTRY', chainId);

  const { data: tasks, isPending: isLoading } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: GlobalRegistryABI.abi,
    functionName: 'getTasksByCreator',
    args: creator ? [creator] : undefined,
    query: {
      enabled: !!creator,
    },
  });

  return {
    tasks: tasks as `0x${string}`[] | undefined,
    isLoading,
  };
}

/**
 * Hook for querying user's own tasks
 */
export function useMyTasks() {
  const { address: userAddress } = useWallet();

  return useTasksByCreator(userAddress as `0x${string}`);
}

/**
 * Hook for querying executable tasks (Active status)
 */
export function useExecutableTasks() {
  // Status 1 = Active
  return useTasksByStatus(1);
}

/**
 * Hook for querying a single task's details
 */
export function useTaskDetails(taskAddress?: `0x${string}`) {
  const { chainId } = useWallet();
  const contractAddress = getContractAddress('GLOBAL_REGISTRY', chainId);

  const { data: taskInfo, isPending: isLoading } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: GlobalRegistryABI.abi,
    functionName: 'getTaskInfo',
    args: taskAddress ? [taskAddress] : undefined,
    query: {
      enabled: !!taskAddress,
    },
  });

  return {
    taskInfo,
    isLoading,
  };
}
