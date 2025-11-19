/**
 * Smart Contract Addresses
 *
 * Update these addresses after deploying contracts to each network
 */

export const CONTRACTS = {
  // Polkadot Hub Testnet (Asset Hub)
  polkadotHubTestnet: {
    // Implementation Contracts
    TASK_CORE_IMPL: '0xfb88E573fbEE0c2361a981e88Cf092c6E121B61E',
    TASK_VAULT_IMPL: '0xba3Fa9195a5a4abcc1a7990048D9ed44E1AEc5F9',

    // Core System Contracts
    TASK_FACTORY: '0x627f85E4736Ba61E12D966f7597bdc9Df6314757',
    TASK_LOGIC: '0x4d14b7799b2B43282B65bed2A19f160315b4fD50',
    EXECUTOR_HUB: '0xe316c1dA035bcc05a5c81f041BF0bCb2BE892a58',
    GLOBAL_REGISTRY: '0x4865a14d7c18f8861fE8a7136e4d2197730DC6bb',
    REWARD_MANAGER: '0x6B9Ca49fc3d0Ad892Bec0cf474ac8F8a12C13204',
    ACTION_REGISTRY: '0x6271498c4EAd88AbaCB3db20f3974AfaBfdC8eD6',


    // Mock tokens for testing
    MOCK_USDC: '0xDefA91C83A08eb1745668fEeDB51Ab532D20EE62',
    MOCK_WETH: '0x0000000000000000000000000000000000000000',
    MOCK_ROUTER: '0x0000000000000000000000000000000000000000',
    MOCK_PRICE_FEED: '0x0000000000000000000000000000000000000000',

    // Adapters
    USDC_ETH_BUY_LIMIT_ADAPTER: '0x0000000000000000000000000000000000000000',
    TIME_BASED_TRANSFER_ADAPTER: '0x4c14445b6D92055aEA438c7D12109Ac6986DE3a2',
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
