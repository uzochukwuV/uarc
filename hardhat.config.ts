import { HardhatUserConfig, vars } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@parity/hardhat-polkadot';
import "@nomicfoundation/hardhat-verify";
import 'hardhat-tracer'; // 👈 Add trace support (like foundry -vvvv)
import path from 'path';

// BSC mainnet fork config
// Set BSC_FORK_URL env var to enable forking:
//   BSC_FORK_URL=https://rpc.ankr.com/bsc/<key> npx hardhat test test/BscForkAdapters.test.ts
const BSC_FORK_URL = process.env.BSC_FORK_URL || '';
const BSC_FORK_BLOCK = process.env.BSC_FORK_BLOCK ? parseInt(process.env.BSC_FORK_BLOCK) : undefined;

// Base mainnet fork config
const BASE_FORK_URL = process.env.BASE_FORK_URL || '';
const BASE_FORK_BLOCK = process.env.BASE_FORK_BLOCK ? parseInt(process.env.BASE_FORK_BLOCK) : undefined;

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.28',
        settings: {
            evmVersion: 'cancun',
            optimizer: {
                enabled: true,
                runs: 1, // Lower runs = smaller deployment size (trade-off: higher gas costs)
            }
        },
    },
    resolc: {
        compilerSource: 'npm',
        settings: {
            optimizer: {
              enabled: true,
              parameters: 'z',
              fallbackOz: true,
              runs: 100,
            },
        },
    },
    networks: {
        hardhat: {
            // When BSC_FORK_URL or BASE_FORK_URL is set, forks mainnet for integration testing
            ...(BSC_FORK_URL ? {
                forking: {
                    url: BSC_FORK_URL,
                    ...(BSC_FORK_BLOCK ? { blockNumber: BSC_FORK_BLOCK } : {}),
                },
                chainId: 56,
            } : BASE_FORK_URL ? {
                forking: {
                    url: BASE_FORK_URL,
                    ...(BASE_FORK_BLOCK ? { blockNumber: BASE_FORK_BLOCK } : {}),
                },
                chainId: 8453,
            } : {}),
        },
        baseFork: {
            url: 'http://127.0.0.1:8545',
            timeout: 600_000,
        },
        // Connects to a running 'npx hardhat node --fork <BSC_RPC>' instance
        // Hardhat fork nodes always report chainId 31337 internally — do not override
        // timeout=600s: needed for MetaYieldVault deposit which chains many RPC calls
        bscFork: {
            url: 'http://127.0.0.1:8545',
            timeout: 600_000,
        },
        etherum : {
            url: "https://virtual.mainnet.eu.rpc.tenderly.co/82c86106-662e-4d7f-a974-c311987358ff",
            accounts: vars.has('TEST_ACC_PRIVATE_KEY') ? [vars.get('TEST_ACC_PRIVATE_KEY')] : [],
            chainId: 8
        },
        arcTestnet: {
            url: 'https://rpc.testnet.arc.network',
            chainId: 5042002,
            accounts: vars.has('TEST_ACC_PRIVATE_KEY') ? [vars.get('TEST_ACC_PRIVATE_KEY')] : ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'],
        },
    },
    etherscan: {
        apiKey: {
            bsc: "3IQTM6FU96R1JRBMBEBD3I67SUFP2YV3I1",
        },
    },
};

export default config;
