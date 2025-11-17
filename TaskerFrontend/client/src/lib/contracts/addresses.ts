/**
 * Smart Contract Addresses
 *
 * Update these addresses after deploying contracts to each network
 */

export const CONTRACTS = {
  // Polkadot Hub Testnet (Asset Hub)
  polkadotHubTestnet: {
    // Implementation Contracts
    TASK_CORE_IMPL: '0xB70f2Fd6A2cF4Acad3DeD463a6fF4d83DD6A5ad9',
    TASK_VAULT_IMPL: '0x46D2afDca699F9B44c188A6dE2bc53263a10865D',

    // Core System Contracts
    TASK_FACTORY: '0x36ce3E5904B0C983e034D42B2aC74e95CC243893',
    TASK_LOGIC: '0xDa5f0913Ece98c60f12397Fd9C1BA42C49762D62',
    EXECUTOR_HUB: '0xe477B7Da250753fBD5C1371975f76164A4F3E8DF',
    GLOBAL_REGISTRY: '0x3bF75a448FB34AcB3cAA18ab7b21Fd10627A9A1e',
    REWARD_MANAGER: '0xd48A87474ddAA6340493D8ffdAb5E9De262bbdd8',
    ACTION_REGISTRY: '0xfbfFf91746dB25F2480fcF909C4DDC676E690d8a',

    // Mock tokens for testing
    MOCK_USDC: '0xDefA91C83A08eb1745668fEeDB51Ab532D20EE62',
    MOCK_WETH: '0x0000000000000000000000000000000000000000',
    MOCK_ROUTER: '0x0000000000000000000000000000000000000000',
    MOCK_PRICE_FEED: '0x0000000000000000000000000000000000000000',

    // Adapters
    USDC_ETH_BUY_LIMIT_ADAPTER: '0x0000000000000000000000000000000000000000',
    TIME_BASED_TRANSFER_ADAPTER: '0x5aA38fb73359E06e2581D9951cbd0244EAdae831',
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
  // Polkadot Hub Testnet doesn't have a standard chain ID yet
  // We'll use a custom one or rely on RPC URL
  if (!chainId || chainId === 0) return 'polkadotHubTestnet'; // Default to Polkadot Hub
  if (chainId === 137) return 'polygon';
  if (chainId === 80001) return 'polygonMumbai';

  // Default to Polkadot Hub for unknown chains
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
