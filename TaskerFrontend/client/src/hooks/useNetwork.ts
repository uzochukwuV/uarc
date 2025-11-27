/**
 * Hook for managing network switching and current network info
 */

import { useChainId, useSwitchChain } from "wagmi";
import { polygonAmoy } from "wagmi/chains";
import { getNetworkName } from "@/config/contracts";

export interface NetworkInfo {
  id: number;
  name: string;
  isAmoy: boolean;
  isPolkadot: boolean;
  isMumbai: boolean;
  isMainnet: boolean;
}

export function useNetwork() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const currentNetwork: NetworkInfo = {
    id: chainId,
    name: getNetworkName(chainId),
    isAmoy: chainId === polygonAmoy.id,
    isPolkadot: chainId === 420420422,
    isMumbai: chainId === 80001,
    isMainnet: chainId === 137,
  };

  const switchToAmoy = async () => {
    return new Promise<void>((resolve, reject) => {
      switchChain(
        { chainId: polygonAmoy.id },
        {
          onSuccess: () => resolve(),
          onError: (error) => reject(error),
        }
      );
    });
  };

  const switchToPolkadot = async () => {
    return new Promise<void>((resolve, reject) => {
      switchChain(
        { chainId: 420420422 },
        {
          onSuccess: () => resolve(),
          onError: (error) => reject(error),
        }
      );
    });
  };

  const switchToMumbai = async () => {
    return new Promise<void>((resolve, reject) => {
      switchChain(
        { chainId: 80001 },
        {
          onSuccess: () => resolve(),
          onError: (error) => reject(error),
        }
      );
    });
  };

  return {
    currentNetwork,
    switchToAmoy,
    switchToPolkadot,
    switchToMumbai,
  };
}
