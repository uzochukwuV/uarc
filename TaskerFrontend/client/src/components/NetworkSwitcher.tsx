/**
 * Network Switcher Component
 * Displays current network and allows switching between supported networks
 */

import { useNetwork } from "@/hooks/useNetwork";
import { getNetworkName } from "@/config/contracts";
import { useState } from "react";

export function NetworkSwitcher() {
  const { currentNetwork, switchToAmoy, switchToPolkadot, switchToMumbai } =
    useNetwork();
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNetworkSwitch = async (
    switchFn: () => Promise<void>,
    networkName: string
  ) => {
    setIsSwitching(true);
    setError(null);

    try {
      await switchFn();
      console.log(`Switched to ${networkName}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Failed to switch to ${networkName}`;
      setError(message);
      console.error(`Failed to switch to ${networkName}:`, err);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="network-switcher">
      <div className="network-info">
        <div className="network-status">
          <span className="status-label">Network:</span>
          <span className="network-name">{currentNetwork.name}</span>
          <span className="chain-id">(Chain: {currentNetwork.id})</span>
        </div>

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
      </div>

      <div className="network-buttons">
        <button
          onClick={() => handleNetworkSwitch(switchToAmoy, "Polygon Amoy")}
          disabled={isSwitching || currentNetwork.isAmoy}
          className={`btn-network ${currentNetwork.isAmoy ? "active" : ""}`}
          title="Switch to Polygon Amoy Testnet (Primary)"
        >
          {isSwitching && currentNetwork.isAmoy ? (
            <span className="spinner" />
          ) : null}
          Polygon Amoy
          {currentNetwork.isAmoy && <span className="badge">Current</span>}
        </button>

        <button
          onClick={() => handleNetworkSwitch(switchToPolkadot, "Polkadot Hub")}
          disabled={isSwitching || currentNetwork.isPolkadot}
          className={`btn-network ${currentNetwork.isPolkadot ? "active" : ""}`}
          title="Switch to Polkadot Hub Testnet"
        >
          {isSwitching && currentNetwork.isPolkadot ? (
            <span className="spinner" />
          ) : null}
          Polkadot Hub
          {currentNetwork.isPolkadot && <span className="badge">Current</span>}
        </button>

        <button
          onClick={() => handleNetworkSwitch(switchToMumbai, "Polygon Mumbai")}
          disabled={isSwitching || currentNetwork.isMumbai}
          className={`btn-network ${currentNetwork.isMumbai ? "active" : ""}`}
          title="Switch to Polygon Mumbai Testnet"
        >
          {isSwitching && currentNetwork.isMumbai ? (
            <span className="spinner" />
          ) : null}
          Polygon Mumbai
          {currentNetwork.isMumbai && <span className="badge">Current</span>}
        </button>
      </div>

      <style>{`
        .network-switcher {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          background: #f5f5f5;
          border-radius: 8px;
          border: 1px solid #ddd;
        }

        .network-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .network-status {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          font-size: 14px;
        }

        .status-label {
          font-weight: 600;
          color: #333;
        }

        .network-name {
          font-weight: 700;
          color: #2563eb;
        }

        .chain-id {
          color: #666;
          font-size: 12px;
        }

        .error-message {
          padding: 0.75rem;
          background: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          color: #c00;
          font-size: 13px;
        }

        .error-message p {
          margin: 0;
        }

        .network-buttons {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.5rem;
        }

        .btn-network {
          padding: 0.75rem 1rem;
          border: 2px solid #ddd;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.2s;
          position: relative;
        }

        .btn-network:hover:not(:disabled) {
          border-color: #2563eb;
          background: #f0f9ff;
          color: #2563eb;
        }

        .btn-network.active {
          border-color: #2563eb;
          background: #2563eb;
          color: white;
        }

        .btn-network:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-network .badge {
          font-size: 10px;
          background: rgba(255, 255, 255, 0.3);
          padding: 2px 6px;
          border-radius: 3px;
          margin-left: auto;
        }

        .btn-network.active .badge {
          background: rgba(255, 255, 255, 0.5);
        }

        .spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid #ddd;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
