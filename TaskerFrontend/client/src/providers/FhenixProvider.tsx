import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { FhenixClient } from "fhenixjs";
import { useWallet } from "@/lib/hooks";
import { BrowserProvider } from "ethers";

interface FhenixContextType {
  client: FhenixClient | null;
  isInitialized: boolean;
  encryptUint32: (value: number) => Promise<any>;
  encryptUint128: (value: bigint) => Promise<any>;
}

const FhenixContext = createContext<FhenixContextType>({
  client: null,
  isInitialized: false,
  encryptUint32: async () => { throw new Error("Fhenix not initialized"); },
  encryptUint128: async () => { throw new Error("Fhenix not initialized"); },
});

export const useFhenix = () => useContext(FhenixContext);

export function FhenixProvider({ children }: { children: ReactNode }) {
  const { isConnected } = useWallet();
  const [client, setClient] = useState<FhenixClient | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initFhenix = async () => {
      if (isConnected && window.ethereum) {
        try {
          const provider = new BrowserProvider(window.ethereum as any);
          const fhenixClient = new FhenixClient({ provider });
          setClient(fhenixClient);
          setIsInitialized(true);
        } catch (error) {
          console.error("Failed to initialize Fhenix Client:", error);
        }
      }
    };

    initFhenix();
  }, [isConnected]);

  const encryptUint32 = async (value: number) => {
    if (!client) throw new Error("Fhenix Client not ready");
    return await client.encrypt_uint32(value);
  };

  const encryptUint128 = async (value: bigint) => {
    if (!client) throw new Error("Fhenix Client not ready");
    return await client.encrypt_uint128(value);
  };

  return (
    <FhenixContext.Provider value={{ client, isInitialized, encryptUint32, encryptUint128 }}>
      {children}
    </FhenixContext.Provider>
  );
}
