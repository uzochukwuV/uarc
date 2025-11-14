import { HardhatUserConfig, vars } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@parity/hardhat-polkadot';
import "@nomicfoundation/hardhat-verify";
import path from 'path';

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.28',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
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
              runs: 200,
            },
        },
    },
    networks: {
        hardhat: {
            // Standard Hardhat network without PolkaVM for fast local testing
            // Uses Hardhat's built-in EVM (no external binaries needed)
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
            polkavm: true,
            url: 'https://testnet-passet-hub-eth-rpc.polkadot.io',
            accounts: vars.has('TEST_ACC_PRIVATE_KEY') ? [vars.get('TEST_ACC_PRIVATE_KEY')] : [],
        },
    }
};

export default config;
