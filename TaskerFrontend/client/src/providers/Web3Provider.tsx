import React from "react";
import "@rainbow-me/rainbowkit/styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { http } from "viem";
import {
  getDefaultConfig,
  RainbowKitProvider,
  Chain,
} from "@rainbow-me/rainbowkit";
import { polygon, polygonMumbai } from "wagmi/chains";

const polkadotHubTestnet: Chain = {
  id: 420420422, // non-standard — replace with real EVM chainId if available
  name: "Polkadot Hub Testnet",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-passet-hub-eth-rpc.polkadot.io"] },
  },
  blockExplorers: {
    default: {
      name: "Polkadot Hub Explorer",
      url: "https://assethub-paseo.subscan.io/",
    },
  },
  testnet: true,
};

const chains = [polkadotHubTestnet, polygonMumbai, polygon];

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID";
if (!projectId || projectId === "YOUR_PROJECT_ID") {
  // optional runtime warning
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_WALLETCONNECT_PROJECT_ID is not set. WalletConnect based wallets may not work."
  );
}

// Build transports mapping for getDefaultConfig.
// For each chain provide a http transport using the first RPC url available.
const transports: Record<number, ReturnType<typeof http>> = {};
for (const chain of chains) {
  const url = chain.rpcUrls?.default?.http?.[0];
  if (url) transports[chain.id] = http({ url });
  else {
    // Fallback to a generic public http() if chain.rpcUrls missing (not recommended)
    transports[chain.id] = http();
  }
}

// getDefaultConfig will wire up wagmi + rainbowkit + default wallets for you.
const config = getDefaultConfig({
  appName: "TaskerOnChain",
  projectId,
  chains,
  transports,
  // You can pass wagmi createConfig options here as well, e.g. autoConnect:
  autoConnect: true,
  // Optionally add a custom wallet list:
  // wallets: [ /* custom wallet connectors (rainbowWallet, injectedWallet, ...) */ ],
});

const queryClient = new QueryClient();

interface Web3ProviderProps {
  children: React.ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider modalSize="compact">{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
