/**
 * Smart Contract Addresses
 *
 * Update these addresses after deploying contracts to each network
 */

export const CONTRACTS = {
  // Polkadot Hub Testnet (Asset Hub)
  polkadotHubTestnet: {
    // Implementation Contracts
    TASK_CORE_IMPL: '0xFcAbca3d3cFb4db36a26681386a572e41C815de1',
    TASK_VAULT_IMPL: '0x2E8816dfa628a43B4B4E77B6e63cFda351C96447',

    // Core System Contracts
    TASK_FACTORY: '0x5a3F07f4D0d14742F6370234a5d3fe1C175Ff666',
    TASK_LOGIC: '0xb042d307E3a136C5C89cb625b97Df79D4E5077f0',
    EXECUTOR_HUB: '0x3462d113E141C5E9FBCc59e94F4dF73F7A1e9C3b',
    GLOBAL_REGISTRY: '0x3613b315bdba793842fffFc4195Cd6d4F1265560',
    REWARD_MANAGER: '0x470101947345Da863C5BE489FC0Bdb9869E7707E',
    ACTION_REGISTRY: '0xa3B7Ec213Af9C6000Bc35C094955a2a10b19A3d9',

    // Mock tokens for testing
    MOCK_USDC: '0xDefA91C83A08eb1745668fEeDB51Ab532D20EE62',
    MOCK_WETH: '0x0000000000000000000000000000000000000000',
    MOCK_ROUTER: '0x0000000000000000000000000000000000000000',
    MOCK_PRICE_FEED: '0x0000000000000000000000000000000000000000',

    // Adapters
    USDC_ETH_BUY_LIMIT_ADAPTER: '0x0000000000000000000000000000000000000000',
    TIME_BASED_TRANSFER_ADAPTER: '0x629cfCA0e279d895A798262568dBD8DaA7582912',
  },

  // Polygon Mumbai Testnet (Chain ID: 80001)
  polygonMumbai: {
    TASK_FACTORY: '0x0000000000000000000000000000000000000000',
    TASK_LOGIC: '0x0000000000000000000000000000000000000000',
    EXECUTOR_HUB: '0x0000000000000000000000000000000000000000',
    GLOBAL_REGISTRY: '0x0000000000000000000000000000000000000000',
    ACTION_REGISTRY: '0x0000000000000000000000000000000000000000',
    REWARD_MANAGER: '0x0000000000000000000000000000000000000000',

    // Mock tokens for testing
    MOCK_USDC: '0x0000000000000000000000000000000000000000',
    MOCK_WETH: '0x0000000000000000000000000000000000000000',
    MOCK_ROUTER: '0x0000000000000000000000000000000000000000',
    MOCK_PRICE_FEED: '0x0000000000000000000000000000000000000000',

    // Adapter
    USDC_ETH_BUY_LIMIT_ADAPTER: '0x0000000000000000000000000000000000000000',
  },

  // Polygon Mainnet (Chain ID: 137)
  polygon: {
    TASK_FACTORY: '0x0000000000000000000000000000000000000000',
    TASK_LOGIC: '0x0000000000000000000000000000000000000000',
    EXECUTOR_HUB: '0x0000000000000000000000000000000000000000',
    GLOBAL_REGISTRY: '0x0000000000000000000000000000000000000000',
    ACTION_REGISTRY: '0x0000000000000000000000000000000000000000',
    REWARD_MANAGER: '0x0000000000000000000000000000000000000000',

    // Real tokens on Polygon
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Native USDC
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // Wrapped Ether

    // DEX Routers
    QUICKSWAP_ROUTER: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
    UNISWAP_V3_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',

    // Oracles
    ETH_USD_PRICE_FEED: '0xF9680D99D6C9589e2a93a78A04A279e509205945', // Chainlink ETH/USD

    // Adapters (will be deployed)
    USDC_ETH_BUY_LIMIT_ADAPTER: '0x0000000000000000000000000000000000000000',
  },
} as const;

/**
 * Get chain name from chain ID
 */
export function getChainName(chainId?: number): keyof typeof CONTRACTS {
  // Map chain IDs to contract keys
  if (chainId === 420420422) return 'polkadotHubTestnet'; // Polkadot Hub Testnet
  if (chainId === 137) return 'polygon'; // Polygon Mainnet
  if (chainId === 80001) return 'polygonMumbai'; // Polygon Mumbai

  // Default to Polkadot Hub for unknown chains or if no chainId provided
  return 'polkadotHubTestnet';
}

/**
 * Get contract address for current chain
 */
export function getContractAddress(
  name: keyof typeof CONTRACTS.polkadotHubTestnet,
  chainId?: number
): string {
  const chain = getChainName(chainId);
  const address = CONTRACTS[chain][name];

  if (!address || address === '0x0000000000000000000000000000000000000000') {
    console.warn(`Contract ${name} not deployed on ${chain}`);
  }

  return address;
}

/**
 * Check if contracts are deployed on current chain
 */
export function areContractsDeployed(chainId?: number): boolean {
  const chain = getChainName(chainId);
  const taskFactory = CONTRACTS[chain].TASK_FACTORY;

  return taskFactory !== '0x0000000000000000000000000000000000000000';
}
