import { useWriteContract, useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { useWallet } from './useWallet';

/**
 * Hook for approving ERC20 token spending
 */
export function useTokenApproval(tokenAddress?: `0x${string}`, spenderAddress?: `0x${string}`) {
  const { address: userAddress } = useWallet();

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: userAddress && spenderAddress ? [userAddress, spenderAddress] : undefined,
    query: {
      enabled: !!userAddress && !!tokenAddress && !!spenderAddress,
    },
  });

  // Write: Approve
  const {
    data: hash,
    isPending,
    writeContract,
    isSuccess,
    error,
  } = useWriteContract();

  const approve = (amount: bigint) => {
    if (!tokenAddress || !spenderAddress) {
      console.error('Token address or spender address not provided');
      return;
    }

    writeContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddress, amount],
    });
  };

  return {
    allowance: allowance as bigint | undefined,
    approve,
    refetchAllowance,
    hash,
    isPending,
    isSuccess,
    error,
  };
}

/**
 * Hook for checking if token approval is needed
 */
export function useCheckApproval(
  tokenAddress?: `0x${string}`,
  spenderAddress?: `0x${string}`,
  requiredAmount?: bigint
) {
  const { address: userAddress } = useWallet();

  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: userAddress && spenderAddress ? [userAddress, spenderAddress] : undefined,
    query: {
      enabled: !!userAddress && !!tokenAddress && !!spenderAddress,
    },
  });

  const needsApproval = requiredAmount && allowance
    ? (allowance as bigint) < requiredAmount
    : true;

  return {
    allowance: allowance as bigint | undefined,
    needsApproval,
  };
}
