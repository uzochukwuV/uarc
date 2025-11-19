# Wagmi Setup & Debugging Guide

## Current Wagmi Configuration

### Web3Provider Setup
**File**: `client/src/providers/Web3Provider.tsx`

```typescript
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

const config = getDefaultConfig({
  appName: "TaskerOnChain",
  projectId: process.env.VITE_WALLETCONNECT_PROJECT_ID,
  chains: [polkadotHubTestnet, polygonMumbai, polygon],
  transports: {
    [polkadotHubTestnet.id]: http("https://testnet-passet-hub-eth-rpc.polkadot.io"),
    [polygonMumbai.id]: http("https://rpc-mumbai.maticvigil.com"),
    [polygon.id]: http("https://polygon-rpc.com"),
  },
});
```

✅ **Status**: Correctly configured

## What Changed

### 1. Chain ID Recognition
**Problem**: Wagmi didn't recognize chainId 420420422
**Solution**: Added explicit chain configuration
**File**: `client/src/providers/Web3Provider.tsx` (Already correct)

### 2. Chain ID to Contract Address Mapping
**Problem**: `getChainName(420420422)` returned wrong chain
**Solution**: Added explicit mapping
**File**: `client/src/lib/contracts/addresses.ts`
```typescript
export function getChainName(chainId?: number): keyof typeof CONTRACTS {
  if (chainId === 420420422) return 'polkadotHubTestnet';
  if (chainId === 137) return 'polygon';
  if (chainId === 80001) return 'polygonMumbai';
  return 'polkadotHubTestnet';
}
```

### 3. Wallet Support Check
**Problem**: `useWallet()` rejected unsupported chains
**Solution**: Added 420420422 to supported list
**File**: `client/src/lib/hooks/useWallet.ts`
```typescript
const isSupported = chainId === 420420422 || chainId === 80001 || chainId === 137;
```

## Debugging Wagmi Reads

### Step 1: Check Wallet Connection
```javascript
// In browser console
const { chainId, address } = useWallet();
console.log('ChainId:', chainId);        // Should be 420420422
console.log('Address:', address);         // Should be your wallet address
console.log('Connected:', address && chainId); // Should be true
```

### Step 2: Check Contract Address Resolution
```javascript
import { getContractAddress } from '@/lib/contracts/addresses';
import { useWallet } from '@/lib/hooks';

const { chainId } = useWallet();
const registryAddress = getContractAddress('GLOBAL_REGISTRY', chainId);
console.log('Registry Address:', registryAddress);
// Should show: 0x3613b315bdba793842fffFc4195Cd6d4F1265560

// If shows 0x000...000, contracts not deployed on this chain
```

### Step 3: Check Wagmi Read
```javascript
// In your component using useMarketplaceTasks
const { tasks, isLoading, _debug } = useMarketplaceTasks();

console.log('[DEBUG] Marketplace Tasks:', {
  chainId: _debug.chainId,
  registryAddress: _debug.registryAddress,
  readError: _debug.readError,
  isReadError: _debug.isReadError,
  taskInfosReceived: _debug.taskInfosReceived,
  taskInfosLength: _debug.taskInfosLength,
});
```

### Step 4: Check RPC Connectivity
```javascript
// In browser console
const rpcUrl = 'https://testnet-passet-hub-eth-rpc.polkadot.io';

fetch(rpcUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_chainId',
    params: [],
    id: 1,
  }),
})
  .then(r => r.json())
  .then(r => console.log('RPC Response:', r));

// Expected: { jsonrpc: '2.0', result: '0x191a49e6', id: 1 }
// 0x191a49e6 = 420420422 in decimal
```

## Common Issues & Fixes

### Issue 1: Reads Always Undefined

**Symptom**:
```
const { data } = useReadContract({ ... });
console.log(data); // undefined (even after loading finishes)
```

**Diagnosis**:
1. Check if read is enabled
2. Check if contract address is valid
3. Check RPC connectivity

**Fix**:
```typescript
const { data: taskInfos, isPending, isError, error } = useReadContract({
  address: contractAddress as `0x${string}`,
  abi: GlobalRegistryABI.abi,
  functionName: 'getExecutableTasks',
  args: [BigInt(limit), BigInt(offset)],
  query: {
    // THIS IS IMPORTANT - read won't run if address is invalid
    enabled: !!contractAddress && contractAddress !== '0x0000000000000000000000000000000000000000',
  },
});

// Debug
if (isError) {
  console.error('Read error:', error?.message);
}
```

### Issue 2: Contract Not Found

**Symptom**:
```
Error: contract not deployed on this network
```

**Check**:
```javascript
// Is the address in addresses.ts?
import { CONTRACTS } from '@/lib/contracts/addresses';
console.log(CONTRACTS.polkadotHubTestnet.GLOBAL_REGISTRY);
// Should NOT be 0x000...

// Is the contract actually deployed?
// Check: https://assethub-paseo.subscan.io/
// Search: 0x3613b315bdba793842fffFc4195Cd6d4F1265560
```

### Issue 3: ABI Mismatch

**Symptom**:
```
Error: invalid function selector
```

**Check**:
```javascript
// Does ABI have getExecutableTasks?
import GlobalRegistryABI from '@/lib/contracts/abis/GlobalRegistry.json';
const hasFunction = GlobalRegistryABI.abi.some(
  item => item.name === 'getExecutableTasks'
);
console.log('Has getExecutableTasks:', hasFunction);
```

### Issue 4: Wrong Return Type

**Symptom**:
```
taskInfos is undefined but no error thrown
```

**Check**:
```javascript
const { data: taskInfos, isSuccess } = useReadContract({...});

console.log({
  taskInfos,
  isArray: Array.isArray(taskInfos),
  isSuccess,
  type: typeof taskInfos,
});

// Wagmi returns undefined until success
// Check isSuccess before using data
```

## Testing Locally

### Option 1: Manual Browser Console Test
```javascript
// 1. Connect wallet to Polkadot Hub Testnet
// 2. Open browser console
// 3. Paste this:

import { useMarketplaceTasks } from '@/lib/hooks';

const result = useMarketplaceTasks(5, 0);
console.log('Tasks:', result.tasks);
console.log('Debug:', result._debug);
console.log('Is Loading:', result.isLoading);
```

### Option 2: Create Debug Component
```typescript
// components/debug/ContractDebug.tsx
import { useMarketplaceTasks } from '@/lib/hooks';

export function ContractDebug() {
  const result = useMarketplaceTasks();

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      backgroundColor: '#1a1a1a',
      color: '#fff',
      padding: '10px',
      fontSize: '12px',
      fontFamily: 'monospace',
      maxWidth: '500px',
      maxHeight: '200px',
      overflow: 'auto',
      zIndex: 9999
    }}>
      <pre>{JSON.stringify(result._debug, null, 2)}</pre>
    </div>
  );
}

// In your app:
<ContractDebug />
```

### Option 3: Unit Test
```typescript
// test/useMarketplaceTasks.test.ts
import { render, screen, waitFor } from '@testing-library/react';
import { useMarketplaceTasks } from '@/lib/hooks';

function TestComponent() {
  const { tasks, _debug } = useMarketplaceTasks();
  return (
    <div>
      <div data-testid="chain-id">{_debug.chainId}</div>
      <div data-testid="address">{_debug.registryAddress}</div>
      <div data-testid="tasks">{tasks.length}</div>
    </div>
  );
}

test('marketplace tasks loads', async () => {
  render(<TestComponent />);

  await waitFor(() => {
    expect(screen.getByTestId('chain-id')).toHaveTextContent('420420422');
  });

  expect(screen.getByTestId('address')).not.toHaveTextContent('0x000');
  expect(screen.getByTestId('tasks')).not.toHaveTextContent('0');
});
```

## RPC Endpoint Health Check

### Method 1: Direct HTTP Test
```bash
curl -X POST https://testnet-passet-hub-eth-rpc.polkadot.io \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_blockNumber",
    "params": [],
    "id": 1
  }'

# Expected response:
# {"jsonrpc":"2.0","result":"0x1234ab","id":1}
```

### Method 2: Wagmi Provider Test
```typescript
import { createPublicClient, http } from 'viem';

const client = createPublicClient({
  transport: http('https://testnet-passet-hub-eth-rpc.polkadot.io'),
});

const blockNumber = await client.getBlockNumber();
console.log('Block Number:', blockNumber); // Should be > 0
```

## Performance Profiling

### Monitor RPC Calls
```typescript
// In Web3Provider.tsx
const transports: Record<number, ReturnType<typeof http>> = {};
for (const chain of chains) {
  const url = chain.rpcUrls?.default?.http?.[0];
  const transport = http({ url });

  // Wrap to log calls
  transports[chain.id] = {
    ...transport,
    call: async (args) => {
      console.time(`RPC: ${args.method}`);
      const result = await transport.call(args);
      console.timeEnd(`RPC: ${args.method}`);
      return result;
    }
  };
}
```

### Monitor Hook Renders
```typescript
// In useMarketplaceTasks.ts
useEffect(() => {
  console.log('[useMarketplaceTasks] Render count:', renderCount++);
}, [taskInfos, isLoadingTasks]);
```

## Contract ABI Verification

### Check ABI Completeness
```typescript
import GlobalRegistryABI from '@/lib/contracts/abis/GlobalRegistry.json';

const functions = GlobalRegistryABI.abi
  .filter((item: any) => item.type === 'function')
  .map((item: any) => item.name);

console.log('Available Functions:', functions);
// Should include: getExecutableTasks, getTaskInfo, getTasksByCreator, etc.
```

### Verify Function Signature
```typescript
const getExecutableTasksFn = GlobalRegistryABI.abi.find(
  (item: any) => item.name === 'getExecutableTasks'
);

console.log('getExecutableTasks signature:', {
  inputs: getExecutableTasksFn.inputs,   // [limit, offset]
  outputs: getExecutableTasksFn.outputs, // [TaskInfo[]]
  stateMutability: getExecutableTasksFn.stateMutability, // view
});
```

## Next Steps

1. **Immediate**: Run the diagnostic checks above
2. **Short-term**: Add error boundaries around marketplace
3. **Medium-term**: Implement fallback UI for failed reads
4. **Long-term**: Consider caching/indexing for better performance

## Support Resources

- Wagmi Issues: https://github.com/wagmi-dev/wagmi/issues
- Polkadot Hub: https://github.com/polkadot-cloud
- ethers.js: https://docs.ethers.org
- RPC Endpoint: https://testnet-passet-hub-eth-rpc.polkadot.io

## Quick Reference

### Key Chain IDs
```
Polkadot Hub Testnet: 420420422
Polygon Mumbai:       80001
Polygon Mainnet:      137
```

### Key Contract Addresses (Polkadot Hub)
```
GlobalRegistry: 0x3613b315bdba793842fffFc4195Cd6d4F1265560
TaskCore Impl:  0xFcAbca3d3cFb4db36a26681386a572e41C815de1
TaskVault Impl: 0x2E8816dfa628a43B4B4E77B6e63cFda351C96447
TimeBasedAdapter: 0x629cfCA0e279d895A798262568dBD8DaA7582912
```

### Important Files
```
Web3Provider:    client/src/providers/Web3Provider.tsx
Addresses:       client/src/lib/contracts/addresses.ts
Hooks:           client/src/lib/hooks/
Marketplace:     client/src/pages/marketplace.tsx
ABIs:            client/src/lib/contracts/abis/
```
