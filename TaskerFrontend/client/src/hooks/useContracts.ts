/**
 * Hook for getting contract addresses for the current network
 */

import { useChainId } from "wagmi";
import { getContractAddress, hasContractsDeployed } from "@/config/contracts";

export interface ContractAddresses {
  taskFactory: string;
  executorHub: string;
  globalRegistry: string;
  rewardManager: string;
  actionRegistry: string;
  taskLogic: string;
  timeBasedAdapter: string;
}

export interface UseContractsReturn {
  contracts: ContractAddresses;
  isDeployed: boolean;
  chainId: number;
}

/**
 * Get contract addresses for the current network
 * @throws Error if contracts not configured for current chain
 */
export function useContracts(): UseContractsReturn {
  const chainId = useChainId();
  const isDeployed = hasContractsDeployed(chainId);

  try {
    const contracts: ContractAddresses = {
      taskFactory: getContractAddress(chainId, "taskFactory"),
      executorHub: getContractAddress(chainId, "executorHub"),
      globalRegistry: getContractAddress(chainId, "globalRegistry"),
      rewardManager: getContractAddress(chainId, "rewardManager"),
      actionRegistry: getContractAddress(chainId, "actionRegistry"),
      taskLogic: getContractAddress(chainId, "taskLogic"),
      timeBasedAdapter: getContractAddress(chainId, "timeBasedAdapter"),
    };

    return {
      contracts,
      isDeployed,
      chainId,
    };
  } catch (error) {
    // Return empty addresses if not configured
    return {
      contracts: {
        taskFactory: "",
        executorHub: "",
        globalRegistry: "",
        rewardManager: "",
        actionRegistry: "",
        taskLogic: "",
        timeBasedAdapter: "",
      },
      isDeployed: false,
      chainId,
    };
  }
}

/**
 * Get a specific contract address
 */
export function useContractAddress(
  contractName: "taskFactory" | "executorHub" | "globalRegistry" | "rewardManager" | "actionRegistry" | "taskLogic" | "timeBasedAdapter"
): string {
  const { contracts } = useContracts();
  return contracts[contractName];
}
