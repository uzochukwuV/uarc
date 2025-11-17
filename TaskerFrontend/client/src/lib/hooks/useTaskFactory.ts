import { useReadContract, useWriteContract } from 'wagmi';
import { getContractAddress } from '../contracts/addresses';
import TaskFactoryABI from '../contracts/abis/TaskFactory.json';
import { useWallet } from './useWallet';

/**
 * Hook for interacting with TaskFactory contract
 */
export function useTaskFactory() {
  const { chainId, address: userAddress } = useWallet();
  const address = getContractAddress('TASK_FACTORY', chainId);

  // Read: Get total task count
  const { data: taskCount, isPending: isLoadingCount } = useReadContract({
    address: address as `0x${string}`,
    abi: TaskFactoryABI.abi,
    functionName: 'getTaskCount',
  });

  // Read: Get user's task count
  const { data: userTaskCount } = useReadContract({
    address: address as `0x${string}`,
    abi: TaskFactoryABI.abi,
    functionName: 'getUserTaskCount',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress,
    },
  });

  return {
    address,
    taskCount: taskCount ? Number(taskCount) : 0,
    userTaskCount: userTaskCount ? Number(userTaskCount) : 0,
    isLoading: isLoadingCount,
  };
}

/**
 * Hook for creating tasks
 */
export function useCreateTask() {
  const { chainId } = useWallet();
  const address = getContractAddress('TASK_FACTORY', chainId);

  const {
    data: hash,
    isPending,
    writeContract,
    isSuccess,
    error,
  } = useWriteContract();

  const createTask = (args: {
    // Task parameters
    expiresAt: bigint;
    maxExecutions: bigint;
    recurringInterval: bigint;
    rewardPerExecution: bigint;
    seedCommitment: `0x${string}`;

    // Actions
    actions: Array<{
      selector: `0x${string}`;
      protocol: `0x${string}`;
      params: `0x${string}`;
    }>;

    // Token deposits
    deposits: Array<{
      token: `0x${string}`;
      amount: bigint;
    }>;

    // Native ETH value
    value: bigint;
  }) => {
    writeContract({
      address: address as `0x${string}`,
      abi: TaskFactoryABI.abi,
      functionName: 'createTaskWithTokens',
      args: [
        {
          expiresAt: args.expiresAt,
          maxExecutions: args.maxExecutions,
          recurringInterval: args.recurringInterval,
          rewardPerExecution: args.rewardPerExecution,
          seedCommitment: args.seedCommitment,
        },
        args.actions,
        args.deposits,
      ],
      value: args.value,
    });
  };

  return {
    createTask,
    hash,
    isPending,
    isSuccess,
    error,
   };
}
