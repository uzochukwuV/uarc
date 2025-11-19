import { useAccount, useChainId } from 'wagmi';
import { areContractsDeployed } from '../contracts/addresses';

/**
 * Custom hook for wallet connection state
 */
export function useWallet() {
  const { address, isConnected, isConnecting, isDisconnected } = useAccount();
  const chain = useChainId();

  const chainId = chain;
  // Support Polkadot Hub Testnet (420420422), Mumbai (80001), and Polygon (137)
  const isSupported = chainId === 420420422 || chainId === 80001 || chainId === 137;
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
