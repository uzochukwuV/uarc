import { HardhatUserConfig, vars } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@parity/hardhat-polkadot';
import "@nomicfoundation/hardhat-verify";
import 'hardhat-tracer'; // 👈 Add trace support (like foundry -vvvv)
import path from 'path';

const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.28',
        settings: {
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
            // Standard Hardhat network without PolkaVM for fast local testing
            // Uses Hardhat's built-in EVM (no external binaries needed)
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
            url: 'https://testnet-passet-hub-eth-rpc.polkadot.io',
            accounts: vars.has('TEST_ACC_PRIVATE_KEY') ? [vars.get('TEST_ACC_PRIVATE_KEY')] : [],
        },
        polygonAmoy : {
            url:  "https://rpc-amoy.polygon.technology",
            accounts: vars.has('TEST_ACC_PRIVATE_KEY') ? [vars.get('TEST_ACC_PRIVATE_KEY')] : [],
            chainId: 80002 ,
           
        }
    }
};

export default config;
