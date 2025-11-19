import { useReadContract } from 'wagmi';
import { getContractAddress } from '../contracts/addresses';
import { useWallet } from './useWallet';
import { useEffect, useState } from 'react';

/**
 * Debug hook to troubleshoot wagmi reads
 * Logs contract address, ABI, and read results
 */
export function useDebugContractRead(
  contractName: keyof ReturnType<typeof getContractAddress>,
  functionName: string,
  abi: any[],
  args?: any[]
) {
  const { chainId } = useWallet();
  const contractAddress = getContractAddress(contractName, chainId);
  const [debugInfo, setDebugInfo] = useState({
    chainId,
    contractAddress,
    contractName,
    functionName,
    abiExists: !!abi,
    abiLength: abi?.length || 0,
  });

  const { data, error, isPending, isLoading, isSuccess, isError } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi,
    functionName,
    args,
    query: {
      enabled: !!contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000',
    },
  });

  useEffect(() => {
    console.log('[useDebugContractRead]', {
      ...debugInfo,
      data,
      error,
      isPending,
      isLoading,
      isSuccess,
      isError,
      message: `Reading ${contractName}.${functionName}`,
    });

    setDebugInfo((prev) => ({
      ...prev,
      readStatus: isSuccess ? 'success' : isError ? 'error' : isPending ? 'pending' : 'idle',
      dataReceived: !!data,
      errorMessage: error?.message,
    }));
  }, [data, error, isPending, isLoading, isSuccess, isError, debugInfo, contractName, functionName]);

  return {
    data,
    error,
    isPending,
    isLoading,
    isSuccess,
    isError,
    debug: debugInfo,
  };
}

/**
 * Quick test hook to verify GlobalRegistry is readable
 */
export function useTestGlobalRegistryRead() {
  const { chainId } = useWallet();
  const address = getContractAddress('GLOBAL_REGISTRY', chainId);

  const [testResult, setTestResult] = useState<{
    address: string;
    chainId: number;
    status: 'checking' | 'success' | 'error';
    message: string;
    data?: any;
  }>({
    address,
    chainId,
    status: 'checking',
    message: 'Initializing...',
  });

  useEffect(() => {
    async function test() {
      try {
        if (!address || address === '0x0000000000000000000000000000000000000000') {
          setTestResult({
            address,
            chainId,
            status: 'error',
            message: `Contract not deployed on this chain. ChainId: ${chainId}, Address: ${address}`,
          });
          return;
        }

        // Try to fetch totalTasks to verify the contract is readable
        const provider = (window as any).ethereum;
        if (!provider) {
          setTestResult({
            address,
            chainId,
            status: 'error',
            message: 'No ethereum provider found',
          });
          return;
        }

        const ethers = await import('ethers');
        const signer = new ethers.BrowserProvider(provider);

        // Import ABI dynamically
        const abiModule = await import('../contracts/abis/GlobalRegistry.json');
        const globalRegistry = new ethers.Contract(
          address,
          abiModule.abi,
          signer
        );

        // Try to call totalTasks
        const totalTasks = await globalRegistry.totalTasks();

        setTestResult({
          address,
          chainId,
          status: 'success',
          message: `Successfully read from contract. Total tasks: ${totalTasks}`,
          data: { totalTasks: totalTasks.toString() },
        });
      } catch (error: any) {
        setTestResult({
          address,
          chainId,
          status: 'error',
          message: `Error reading contract: ${error?.message || String(error)}`,
        });
      }
    }

    test();
  }, [address, chainId]);

  return testResult;
}
