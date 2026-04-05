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
        polkavmLocal: {
            polkavm: true,
            url: 'http://127.0.0.1:8545',
            nodeConfig: {
                nodeBinaryPath: path.join(__dirname, 'binaries', 'substrate-node'),
                rpcPort: 8000,
                dev: true,
            },
            adapterConfig: {
                adapterBinaryPath: path.join(__dirname, 'binaries', 'eth-rpc'),
                dev: true,
            },
        },
        localNode: {
            polkavm: true,
            url: `http://127.0.0.1:8545`,
        },
        polkadotHubTestnet: {
            // polkavm: true,
            url: 'https://eth-rpc-testnet.polkadot.io',
            accounts: vars.has('TEST_ACC_PRIVATE_KEY') ? [vars.get('TEST_ACC_PRIVATE_KEY')] : [],
        },
        polygonAmoy : {
            url:  "https://rpc-amoy.polygon.technology",
            accounts: vars.has('TEST_ACC_PRIVATE_KEY') ? [vars.get('TEST_ACC_PRIVATE_KEY')] : [],
            chainId: 80002 ,
           
        },
        polygon : {
            url:  "https://polygon.drpc.org",
            accounts: vars.has('TEST_PRIVATE_KEY') ? [vars.get('TEST_PRIVATE_KEY')] : []
        },
        // BNB Chain mainnet — for MetaYieldVault + TaskerOnChain production deployment
        // Set private key: npx hardhat vars set DEPLOYER_PRIVATE_KEY
        // Set RPC (optional, falls back to public): npx hardhat vars set BSC_RPC_URL
        bnb: {
            url: vars.has('BSC_RPC_URL') ? vars.get('BSC_RPC_URL') : 'https://bsc-dataseed4.bnbchain.org',
            accounts: vars.has('DEPLOYER_PRIVATE_KEY') ? [vars.get('DEPLOYER_PRIVATE_KEY')] : [],
            chainId: 56,
            timeout: 120_000,
            gasPrice: 1_000_000_000, // 1 gwei — minimum accepted on BSC (saves ~66% gas cost)
        },
    },
    etherscan: {
        apiKey: {
            bsc: "3IQTM6FU96R1JRBMBEBD3I67SUFP2YV3I1",
        },
    },
};

export default config;
