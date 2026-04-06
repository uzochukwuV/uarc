import { useWriteContract } from 'wagmi';
import { getContractAddress } from '../contracts/addresses';
import ConfidentialTaskFactoryABI from '../contracts/abis/ConfidentialTaskFactory.json';
import { useWallet } from './useWallet';

export function useCreateConfidentialTask() {
  const { chainId } = useWallet();
  const address = getContractAddress('CONFIDENTIAL_TASK_FACTORY', chainId);

  const {
    data: hash,
    isPending,
    writeContract,
    isSuccess,
    error,
  } = useWriteContract();

  const createConfidentialTask = (args: {
    expiresAt: bigint;
    maxExecutions: bigint;
    recurringInterval: bigint;
    rewardPerExecution: bigint;
    seedCommitment: `0x${string}`;
    actions: Array<{
      selector: `0x${string}`;
      protocol: `0x${string}`;
      params: `0x${string}`;
    }>;
    deposits: Array<{
      token: `0x${string}`;
      amount: {
        data: `0x${string}`;
        securityZone: number;
      };
    }>;
    value: bigint;
  }) => {
    writeContract({
      address: address as `0x${string}`,
      abi: ConfidentialTaskFactoryABI.abi,
      functionName: 'createConfidentialTask',
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
    createConfidentialTask,
    hash,
    isPending,
    isSuccess,
    error,
  };
}