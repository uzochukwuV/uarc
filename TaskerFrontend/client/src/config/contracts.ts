/**
 * Contract addresses for TaskerOnChain V2 across different networks
 * Update these after deploying to a new network
 */

export const CONTRACTS = {
  // Polygon Amoy Testnet (80002) - PRIMARY
  80002: {
    taskFactory: "0x2984DA62a1124f2C3D631bb5bfEa9343a1279BBb",
    executorHub: "0x35B6A83233b7fEaEfe8E408F217b62fCE154AcD7",
    globalRegistry: "0x37e8DccDed6E1e783b79Ad168c5B4E5f3aD0851A",
    rewardManager: "0xa5Ca14E836634adB60edd0888ce79C54AFD574f7",
    actionRegistry: "0xb228d40cb2f4C72c4930e136aD276C25F4871148",
    taskLogic: "0x19E7d58017aCBeDdAD37963e7352D6E8c08385fC",
    timeBasedAdapter: "0x885484C9Ae591c472bd0e29C11C82D9b3B644F68",
  },

  // Polkadot Hub Testnet (420420422)
  420420422: {
    taskFactory: "0x...", // TODO: Add Polkadot Hub deployment addresses
    executorHub: "0x...",
    globalRegistry: "0x...",
    rewardManager: "0x...",
    actionRegistry: "0x...",
    taskLogic: "0x...",
    timeBasedAdapter: "0x...",
  },

  // Polygon Mumbai Testnet (80001)
  80001: {
    taskFactory: "0x...", // TODO: Add Mumbai deployment addresses
    executorHub: "0x...",
    globalRegistry: "0x...",
    rewardManager: "0x...",
    actionRegistry: "0x...",
    taskLogic: "0x...",
    timeBasedAdapter: "0x...",
  },

  // Polygon Mainnet (137)
  137: {
    taskFactory: "0x...", // TODO: Add Mainnet deployment addresses
    executorHub: "0x...",
    globalRegistry: "0x...",
    rewardManager: "0x...",
    actionRegistry: "0x...",
    taskLogic: "0x...",
    timeBasedAdapter: "0x...",
  },
} as const;

export type ChainId = keyof typeof CONTRACTS;
export type ContractName = keyof (typeof CONTRACTS)[ChainId];

/**
 * Get contract address for a specific network and contract
 * @throws Error if chain or contract not configured
 */
export function getContractAddress(
  chainId: number,
  contract: ContractName
): string {
  const chain = chainId as ChainId;

  if (!(chain in CONTRACTS)) {
    throw new Error(`Contracts not configured for chain ${chainId}`);
  }

  const address = CONTRACTS[chain][contract];

  if (!address || address.includes("0x...")) {
    throw new Error(
      `Contract ${contract} not configured for chain ${chainId}`
    );
  }

  return address;
}

/**
 * Check if a chain has contracts deployed
 */
export function hasContractsDeployed(chainId: number): boolean {
  const chain = chainId as ChainId;
  if (!(chain in CONTRACTS)) return false;

  const contracts = CONTRACTS[chain];
  return Object.values(contracts).every((addr) => !addr.includes("0x..."));
}

/**
 * Get all available chains with deployed contracts
 */
export function getDeployedChains(): number[] {
  return Object.keys(CONTRACTS)
    .map(Number)
    .filter((chainId) => hasContractsDeployed(chainId));
}

/**
 * Get network name from chain ID
 */
export function getNetworkName(chainId: number): string {
  const networks: Record<number, string> = {
    80002: "Polygon Amoy",
    420420422: "Polkadot Hub Testnet",
    80001: "Polygon Mumbai",
    137: "Polygon Mainnet",
  };

  return networks[chainId] || `Unknown Network (${chainId})`;
}
