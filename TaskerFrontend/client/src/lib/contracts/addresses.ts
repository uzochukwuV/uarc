/**
 * Smart Contract Addresses
 *
 * Update these addresses after deploying contracts to each network
 */

export const CONTRACTS = {
  // Polkadot Hub Testnet (Asset Hub)
  polkadotHubTestnet: {
    // Implementation Contracts
    TASK_CORE_IMPL: '0xa3Eb8927227E1e5079afB46709553f8CcDb7d0aC',
    TASK_VAULT_IMPL: '0x5A3996e2c3B25B1bE91C9770d07C67adA67E442C',

    // Core System Contracts
    TASK_FACTORY: '0x2166493d8E5b6BB0c610688C39Cef2804488aC51',
    TASK_LOGIC: '0xfB6055b83ACd887026957f126774Ce3bfCDB15fd',
    EXECUTOR_HUB: '0x0a872C6c000CE924C85eCe380a796f1Dc717c8a9',
    GLOBAL_REGISTRY: '0xd5D87c6F041A55719784E7A7f44E28a0DE37236C',
    REWARD_MANAGER: '0x0791f78fF27D7f43CAd36307912d6AebCe26c028',
    ACTION_REGISTRY: '0xa045405f282b34671e388518bdAA36289722B661',


    // Mock tokens for testing
    MOCK_USDC: '0xDefA91C83A08eb1745668fEeDB51Ab532D20EE62',
    MOCK_WETH: '0x0000000000000000000000000000000000000000',
    MOCK_ROUTER: '0x0000000000000000000000000000000000000000',
    MOCK_PRICE_FEED: '0x0000000000000000000000000000000000000000',

    // Adapters
    USDC_ETH_BUY_LIMIT_ADAPTER: '0x0000000000000000000000000000000000000000',
    TIME_BASED_TRANSFER_ADAPTER: '0x3ac487588cF9E6De6060C16eaF467beEBF432CAd',
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
