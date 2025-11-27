/**
 * Hook for validating if current network is supported
 */

import { useChainId } from "wagmi";
import { useEffect, useState } from "react";
import { hasContractsDeployed } from "@/config/contracts";

// All supported networks
export const SUPPORTED_CHAINS = [
  80002, // Polygon Amoy (primary)
  420420422, // Polkadot Hub Testnet
  80001, // Polygon Mumbai
  137, // Polygon Mainnet
];

export interface NetworkValidationResult {
  isSupported: boolean;
  hasContracts: boolean;
  chainId: number;
  supportedChains: number[];
  reason?: string; // Human-readable error message
}

/**
 * Validate if current network is supported
 * Returns both network support and contract deployment status
 */
export function useValidateNetwork(): NetworkValidationResult {
  const chainId = useChainId();
  const [result, setResult] = useState<NetworkValidationResult>({
    isSupported: false,
    hasContracts: false,
    chainId,
    supportedChains: SUPPORTED_CHAINS,
  });

  useEffect(() => {
    const isSupported = SUPPORTED_CHAINS.includes(chainId);
    const hasContracts = isSupported && hasContractsDeployed(chainId);

    let reason: string | undefined;

    if (!isSupported) {
      reason = `Network ${chainId} is not supported. Please switch to a supported network.`;
    } else if (!hasContracts) {
      reason = `TaskerOnChain contracts are not deployed on this network yet.`;
    }

    setResult({
      isSupported,
      hasContracts,
      chainId,
      supportedChains: SUPPORTED_CHAINS,
      reason,
    });
  }, [chainId]);

  return result;
}

/**
 * Get human-readable network name from chain ID
 */
export function getNetworkNameFromChain(chainId: number): string {
  const names: Record<number, string> = {
    80002: "Polygon Amoy",
    420420422: "Polkadot Hub Testnet",
    80001: "Polygon Mumbai",
    137: "Polygon Mainnet",
  };

  return names[chainId] || `Unknown Network (${chainId})`;
}
