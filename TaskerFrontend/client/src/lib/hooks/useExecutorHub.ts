import { useReadContract, useWriteContract } from 'wagmi';
import { getContractAddress } from '../contracts/addresses';
import ExecutorHubABI from '../contracts/abis/ExecutorHub.json';
import { useWallet } from './useWallet';

/**
 * Hook for reading ExecutorHub contract data
 */
export function useExecutorHub() {
  const { address: userAddress, chainId } = useWallet();
  const contractAddress = getContractAddress('EXECUTOR_HUB', chainId);

  // Read: Get executor info
  const { data: executor, isPending: isLoadingExecutor } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: ExecutorHubABI.abi,
    functionName: 'getExecutor',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress,
    },
  });

  // Read: Get executor count
  const { data: executorCount } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: ExecutorHubABI.abi,
    functionName: 'getExecutorCount',
  });

  // Read: Get minimum stake required
  const { data: minStake } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: ExecutorHubABI.abi,
    functionName: 'MIN_STAKE',
  });

  return {
    contractAddress,
    executor,
    executorCount: executorCount ? Number(executorCount) : 0,
    minStake: minStake ? minStake.toString() : '0',
    isRegistered: executor ? (executor as any).isActive : false,
    isLoading: isLoadingExecutor,
  };
}

/**
 * Hook for registering as an executor
 */
export function useRegisterExecutor() {
  const { chainId } = useWallet();
  const contractAddress = getContractAddress('EXECUTOR_HUB', chainId);

  const {
    data: hash,
    isPending,
    writeContract,
    isSuccess,
    error,
  } = useWriteContract();

  const registerExecutor = (stakeAmount: bigint) => {
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: ExecutorHubABI.abi,
      functionName: 'registerExecutor',
      value: stakeAmount,
    });
  };

  return {
    registerExecutor,
    hash,
    isPending,
    isSuccess,
    error,
  };
}

/**
 * Hook for executor task commitment and execution
 */
export function useExecuteTask() {
  const { chainId } = useWallet();
  const contractAddress = getContractAddress('EXECUTOR_HUB', chainId);

  const {
    data: hash,
    isPending,
    writeContract,
    isSuccess,
    error,
  } = useWriteContract();

  const commitToTask = (taskAddress: `0x${string}`, commitHash: `0x${string}`) => {
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: ExecutorHubABI.abi,
      functionName: 'commitToTask',
      args: [taskAddress, commitHash],
    });
  };

  const executeTask = (taskAddress: `0x${string}`, salt: `0x${string}`) => {
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: ExecutorHubABI.abi,
      functionName: 'executeTask',
      args: [taskAddress, salt],
    });
  };

  return {
    commitToTask,
    executeTask,
    hash,
    isPending,
    isSuccess,
    error,
  };
}
