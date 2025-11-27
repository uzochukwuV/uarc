# Adding Polygon Amoy Support to Frontend

## Current Setup Analysis

Your `Web3Provider.tsx` already supports:
- ✅ Polkadot Hub Testnet (custom chain)
- ✅ Polygon Mumbai (testnet)
- ✅ Polygon Mainnet

But you need to **add Polygon Amoy** (the NEW testnet where you deployed contracts).

---

## Changes Needed

### Step 1: Import Polygon Amoy Chain

The `polygonAmoy` chain is already available in wagmi. Update the imports:

```typescript
import { polygon, polygonMumbai, polygonAmoy } from "wagmi/chains";
```

### Step 2: Add Polygon Amoy to Chains Array

Update line 30:

**Before:**
```typescript
const chains = [polkadotHubTestnet, polygonMumbai, polygon];
```

**After:**
```typescript
const chains = [polkadotHubTestnet, polygonAmoy, polygonMumbai, polygon];
```

### Step 3: Configure RPC Transport for Polygon Amoy

Add this line after line 49:

```typescript
transports[polygonAmoy.id] = http("https://rpc-amoy.polygon.technology");
```

---

## Complete Updated File

Here's the full updated `Web3Provider.tsx`:

```typescript
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
import { polygon, polygonMumbai, polygonAmoy } from "wagmi/chains";

const polkadotHubTestnet: Chain = {
  id: 420420422,
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

// ✅ ORDER MATTERS: Put your primary network first
const chains = [polkadotHubTestnet, polygonAmoy, polygonMumbai, polygon];

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "YOUR_PROJECT_ID";
if (!projectId || projectId === "YOUR_PROJECT_ID") {
  console.warn(
    "VITE_WALLETCONNECT_PROJECT_ID is not set. WalletConnect based wallets may not work."
  );
}

// Build transports mapping for getDefaultConfig
const transports: Record<number, ReturnType<typeof http>> = {};

// Set up RPC URLs for each chain
transports[420420422] = http("https://testnet-passet-hub-eth-rpc.polkadot.io");
transports[polygonAmoy.id] = http("https://rpc-amoy.polygon.technology");
transports[polygonMumbai.id] = http();
transports[polygon.id] = http();

const config = getDefaultConfig({
  appName: "TaskerOnChain",
  projectId,
  chains,
  transports,
  autoConnect: true,
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
```

---

## Network Switching Configuration

Once users can select Polygon Amoy, you need to make sure your app works when switching. Here's how to handle network switching:

### Create a `useNetwork.ts` Hook

```typescript
// src/hooks/useNetwork.ts
import { useChainId, useSwitchChain } from "wagmi";
import { polygonAmoy } from "wagmi/chains";

export function useNetwork() {
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const currentNetwork = {
    id: chainId,
    name: getNetworkName(chainId),
    isAmoy: chainId === polygonAmoy.id,
    isPolkadot: chainId === 420420422,
  };

  const switchToAmoy = () => {
    switchChain({ chainId: polygonAmoy.id });
  };

  return { currentNetwork, switchToAmoy };
}

function getNetworkName(chainId: number): string {
  const networks: Record<number, string> = {
    420420422: "Polkadot Hub",
    80002: "Polygon Amoy",
    80001: "Polygon Mumbai",
    137: "Polygon Mainnet",
  };
  return networks[chainId] || "Unknown Network";
}
```

### Use in Components

```typescript
// src/components/NetworkSwitcher.tsx
import { useNetwork } from "@/hooks/useNetwork";

export function NetworkSwitcher() {
  const { currentNetwork, switchToAmoy } = useNetwork();

  return (
    <div className="network-info">
      <p>Current Network: <strong>{currentNetwork.name}</strong></p>

      {!currentNetwork.isAmoy && (
        <button onClick={switchToAmoy} className="btn-primary">
          Switch to Polygon Amoy
        </button>
      )}
    </div>
  );
}
```

---

## Contract Addresses Configuration

Create a config file for managing contract addresses per network:

```typescript
// src/config/contracts.ts
export const CONTRACTS = {
  420420422: {
    // Polkadot Hub Testnet
    taskFactory: "0x...",
    executorHub: "0x...",
    globalRegistry: "0x...",
    rewardManager: "0x...",
    actionRegistry: "0x...",
    taskLogic: "0x...",
  },
  80002: {
    // Polygon Amoy (YOUR NEW DEPLOYMENT!)
    taskFactory: "0x2984DA62a1124f2C3D631bb5bfEa9343a1279BBb",
    executorHub: "0x35B6A83233b7fEaEfe8E408F217b62fCE154AcD7",
    globalRegistry: "0x37e8DccDed6E1e783b79Ad168c5B4E5f3aD0851A",
    rewardManager: "0xa5Ca14E836634adB60edd0888ce79C54AFD574f7",
    actionRegistry: "0xb228d40cb2f4C72c4930e136aD276C25F4871148",
    taskLogic: "0x19E7d58017aCBeDdAD37963e7352D6E8c08385fC",
    timeBasedAdapter: "0x885484C9Ae591c472bd0e29C11C82D9b3B644F68",
  },
  80001: {
    // Polygon Mumbai
    taskFactory: "0x...",
    executorHub: "0x...",
    // ... add your Mumbai deployment addresses
  },
};

export function getContractAddress(chainId: number, contract: keyof typeof CONTRACTS[keyof typeof CONTRACTS]): string {
  const addresses = CONTRACTS[chainId as keyof typeof CONTRACTS];
  if (!addresses) {
    throw new Error(`Contracts not configured for chain ${chainId}`);
  }
  return addresses[contract as keyof typeof addresses];
}
```

### Use in Components

```typescript
// src/hooks/useContracts.ts
import { useChainId } from "wagmi";
import { getContractAddress } from "@/config/contracts";

export function useContracts() {
  const chainId = useChainId();

  return {
    taskFactory: getContractAddress(chainId, "taskFactory"),
    executorHub: getContractAddress(chainId, "executorHub"),
    globalRegistry: getContractAddress(chainId, "globalRegistry"),
    rewardManager: getContractAddress(chainId, "rewardManager"),
    actionRegistry: getContractAddress(chainId, "actionRegistry"),
    taskLogic: getContractAddress(chainId, "taskLogic"),
  };
}
```

---

## Network Validation

Add validation to ensure users are on a supported network:

```typescript
// src/hooks/useValidateNetwork.ts
import { useChainId } from "wagmi";
import { useEffect, useState } from "react";

const SUPPORTED_CHAINS = [420420422, 80002, 80001, 137];

export function useValidateNetwork() {
  const chainId = useChainId();
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(SUPPORTED_CHAINS.includes(chainId));
  }, [chainId]);

  return {
    isSupported,
    chainId,
    supportedChains: SUPPORTED_CHAINS,
  };
}
```

### Use in App

```typescript
// src/App.tsx
import { useValidateNetwork } from "@/hooks/useValidateNetwork";

export function App() {
  const { isSupported, chainId } = useValidateNetwork();

  if (!isSupported) {
    return (
      <div className="error-banner">
        <p>⚠️ Network not supported. Chain ID: {chainId}</p>
        <p>Please switch to Polygon Amoy, Mumbai, or Mainnet.</p>
      </div>
    );
  }

  return (
    // Your app content
  );
}
```

---

## Testing Network Switching

After making changes, test:

1. **Start with Polygon Amoy default**
   - Check that Amoy is the default when you first connect

2. **Switch to other networks**
   - Click network switcher
   - Verify contracts update correctly

3. **Create a task on each network**
   - Task creation should use correct addresses
   - Verify transactions go to correct chain

---

## Deployment Checklist

- [ ] Update `Web3Provider.tsx` with `polygonAmoy` import
- [ ] Add `polygonAmoy` to chains array
- [ ] Add RPC transport for Polygon Amoy
- [ ] Add contract addresses to `contracts.ts`
- [ ] Create `useNetwork` hook
- [ ] Create `useContracts` hook
- [ ] Create `useValidateNetwork` hook
- [ ] Add `NetworkSwitcher` component
- [ ] Test network switching works smoothly
- [ ] Verify contract calls use correct addresses per network

---

## Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `Web3Provider.tsx` | Add `polygonAmoy` chain | Enable wallet to recognize Amoy |
| `contracts.ts` | Add Amoy contract addresses | Use correct addresses per network |
| `useNetwork.ts` | New hook | Track current network |
| `useContracts.ts` | New hook | Get addresses for current network |
| `useValidateNetwork.ts` | New hook | Prevent wrong network execution |
| `NetworkSwitcher.tsx` | New component | Let users switch networks |

Once these changes are made, your frontend will:
✅ Support Polygon Amoy as a primary network
✅ Switch cleanly between networks
✅ Use correct contract addresses per network
✅ Validate network before operations
