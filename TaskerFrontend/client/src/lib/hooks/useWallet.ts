import { useAccount, useChainId } from 'wagmi';
import { areContractsDeployed } from '../contracts/addresses';

/**
 * Custom hook for wallet connection state
 */
export function useWallet() {
  const { address, isConnected, isConnecting, isDisconnected } = useAccount();
  const chain = useChainId();

  const chainId = chain;
  const isSupported = chainId === 80001 || chainId === 137; // Mumbai or Polygon
  const contractsDeployed = areContractsDeployed(chainId);

  return {
    address,
    isConnected,
    isConnecting,
    isDisconnected,
    chainId,
    chain,
    isSupported,
    contractsDeployed,
  };
}
