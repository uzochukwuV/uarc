// Wallet Connector — MetaMask + Particle Network Universal Accounts
// Supports both traditional wallets and embedded wallets via EIP-7702

const {
  useState: useWalletState,
  useEffect: useWalletEffect,
  useCallback: useWalletCallback,
  createContext: createWalletContext,
  useContext: useWalletContext,
} = React;

// Base Sepolia configuration
const BASE_SEPOLIA = {
  chainId: '0x14a34', // 84532 in hex
  chainName: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};

// Wallet context for global state
const WalletContext = createWalletContext(null);

function useWallet() {
  const ctx = useWalletContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

function WalletProvider({ children }) {
  const [address, setAddress] = useWalletState(null);
  const [chainId, setChainId] = useWalletState(null);
  const [provider, setProvider] = useWalletState(null);
  const [walletType, setWalletType] = useWalletState(null); // 'metamask' | 'particle' | null
  const [connecting, setConnecting] = useWalletState(false);
  const [error, setError] = useWalletState(null);

  // Check if already connected on mount
  useWalletEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            setAddress(accounts[0]);
            const chain = await window.ethereum.request({ method: 'eth_chainId' });
            setChainId(chain);
            setProvider(window.ethereum);
            setWalletType('metamask');
          }
        } catch (e) {
          console.log('No existing wallet connection');
        }
      }
    };
    checkConnection();
  }, []);

  // Listen for account/chain changes
  useWalletEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setAddress(null);
        setWalletType(null);
      } else {
        setAddress(accounts[0]);
      }
    };

    const handleChainChanged = (chain) => {
      setChainId(chain);
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  // Connect to MetaMask
  const connectMetaMask = useWalletCallback(async () => {
    if (!window.ethereum) {
      setError('MetaMask not installed. Please install MetaMask or use Particle wallet.');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAddress(accounts[0]);
      setProvider(window.ethereum);
      setWalletType('metamask');

      const chain = await window.ethereum.request({ method: 'eth_chainId' });
      setChainId(chain);

      // Switch to Base Sepolia if not already on it
      if (chain !== BASE_SEPOLIA.chainId) {
        await switchToBaseSepolia();
      }
    } catch (e) {
      setError(e.message || 'Failed to connect MetaMask');
    } finally {
      setConnecting(false);
    }
  }, []);

  // Switch to Base Sepolia network
  const switchToBaseSepolia = useWalletCallback(async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_SEPOLIA.chainId }],
      });
      setChainId(BASE_SEPOLIA.chainId);
    } catch (switchError) {
      // Chain not added, try to add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [BASE_SEPOLIA],
          });
          setChainId(BASE_SEPOLIA.chainId);
        } catch (addError) {
          setError('Failed to add Base Sepolia network');
        }
      } else {
        setError('Failed to switch network');
      }
    }
  }, []);

  // Disconnect wallet
  const disconnect = useWalletCallback(() => {
    setAddress(null);
    setChainId(null);
    setProvider(null);
    setWalletType(null);
    setError(null);
  }, []);

  // Check if on correct network
  const isCorrectNetwork = chainId === BASE_SEPOLIA.chainId;

  // Format address for display
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null;

  const value = {
    address,
    shortAddress,
    chainId,
    provider,
    walletType,
    connecting,
    error,
    isConnected: !!address,
    isCorrectNetwork,
    connectMetaMask,
    switchToBaseSepolia,
    disconnect,
  };

  return React.createElement(WalletContext.Provider, { value }, children);
}

// Wallet connection UI component
function WalletConnectButton({ variant = 'default' }) {
  const {
    isConnected,
    shortAddress,
    walletType,
    isCorrectNetwork,
    connecting,
    error,
    connectMetaMask,
    switchToBaseSepolia,
    disconnect,
  } = useWallet();

  const [showDropdown, setShowDropdown] = useWalletState(false);

  if (connecting) {
    return React.createElement('button', {
      className: `ua-wallet-btn ${variant === 'compact' ? 'ua-wallet-compact' : ''}`,
      disabled: true,
    }, React.createElement('span', { className: 'ua-wallet-spinner' }), 'Connecting...');
  }

  if (isConnected) {
    return React.createElement('div', { className: 'ua-wallet-connected' },
      // Network indicator
      !isCorrectNetwork && React.createElement('button', {
        className: 'ua-wallet-network-btn ua-wallet-wrong-network',
        onClick: switchToBaseSepolia,
        title: 'Click to switch to Base Sepolia',
      }, 'Wrong Network'),

      // Address button
      React.createElement('button', {
        className: `ua-wallet-btn ua-wallet-address ${variant === 'compact' ? 'ua-wallet-compact' : ''}`,
        onClick: () => setShowDropdown(!showDropdown),
      },
        React.createElement('span', { className: 'ua-wallet-avatar' }),
        React.createElement('span', { className: 'ua-wallet-addr' }, shortAddress),
        React.createElement('span', { className: 'ua-wallet-type' }, walletType === 'metamask' ? 'MM' : 'PA')
      ),

      // Dropdown menu
      showDropdown && React.createElement('div', { className: 'ua-wallet-dropdown' },
        React.createElement('button', {
          className: 'ua-wallet-dropdown-item',
          onClick: () => { navigator.clipboard.writeText(address); setShowDropdown(false); },
        }, 'Copy Address'),
        React.createElement('button', {
          className: 'ua-wallet-dropdown-item',
          onClick: () => window.open(`https://sepolia.basescan.org/address/${address}`, '_blank'),
        }, 'View on Explorer'),
        React.createElement('button', {
          className: 'ua-wallet-dropdown-item ua-wallet-disconnect',
          onClick: () => { disconnect(); setShowDropdown(false); },
        }, 'Disconnect')
      )
    );
  }

  // Not connected - show connect options
  return React.createElement('div', { className: 'ua-wallet-options' },
    error && React.createElement('div', { className: 'ua-wallet-error' }, error),
    React.createElement('button', {
      className: `ua-wallet-btn ua-wallet-metamask ${variant === 'compact' ? 'ua-wallet-compact' : ''}`,
      onClick: connectMetaMask,
    },
      React.createElement('span', { className: 'ua-wallet-icon' }, '\uD83E\uDD8A'),
      'Connect Wallet'
    )
  );
}

// Full-screen wallet connection modal for onboarding
function WalletConnectModal({ isOpen, onClose }) {
  const { connectMetaMask, connecting, error } = useWallet();

  if (!isOpen) return null;

  return React.createElement('div', { className: 'ua-modal-overlay', onClick: onClose },
    React.createElement('div', {
      className: 'ua-modal ua-wallet-modal',
      onClick: (e) => e.stopPropagation(),
    },
      React.createElement('div', { className: 'ua-modal-header' },
        React.createElement('h2', { className: 'ua-modal-title' }, 'Connect Your Wallet'),
        React.createElement('button', { className: 'ua-modal-close', onClick: onClose }, '\u00D7')
      ),

      React.createElement('div', { className: 'ua-modal-body' },
        React.createElement('p', { className: 'ua-modal-desc' },
          'Connect your wallet to create and manage automated tasks on Base Sepolia.'
        ),

        error && React.createElement('div', { className: 'ua-wallet-error' }, error),

        React.createElement('div', { className: 'ua-wallet-options-modal' },
          // MetaMask option
          React.createElement('button', {
            className: 'ua-wallet-option-card',
            onClick: connectMetaMask,
            disabled: connecting,
          },
            React.createElement('div', { className: 'ua-wallet-option-icon' }, '\uD83E\uDD8A'),
            React.createElement('div', { className: 'ua-wallet-option-info' },
              React.createElement('div', { className: 'ua-wallet-option-title' }, 'MetaMask / Browser Wallet'),
              React.createElement('div', { className: 'ua-wallet-option-desc' },
                'Use your existing wallet. Best for Vault funding mode.'
              )
            ),
            React.createElement('span', { className: 'ua-wallet-option-arrow' }, '\u2192')
          ),

          // Particle Network option (coming soon)
          React.createElement('button', {
            className: 'ua-wallet-option-card ua-wallet-option-disabled',
            disabled: true,
          },
            React.createElement('div', { className: 'ua-wallet-option-icon' }, '\u2728'),
            React.createElement('div', { className: 'ua-wallet-option-info' },
              React.createElement('div', { className: 'ua-wallet-option-title' }, 'Particle Connect'),
              React.createElement('div', { className: 'ua-wallet-option-desc' },
                'Create embedded wallet with social login. Coming soon!'
              )
            ),
            React.createElement('span', { className: 'ua-wallet-option-badge' }, 'Soon')
          )
        ),

        React.createElement('div', { className: 'ua-wallet-network-info' },
          React.createElement('span', { className: 'ua-wallet-network-dot' }),
          'Base Sepolia Testnet'
        )
      )
    )
  );
}

// Inline wallet prompt for chat
function WalletPromptCard({ onConnect }) {
  const { isConnected, connectMetaMask, connecting } = useWallet();

  if (isConnected) return null;

  return React.createElement('div', { className: 'ua-wallet-prompt' },
    React.createElement('div', { className: 'ua-wallet-prompt-icon' }, '\uD83D\uDD12'),
    React.createElement('div', { className: 'ua-wallet-prompt-content' },
      React.createElement('div', { className: 'ua-wallet-prompt-title' }, 'Connect wallet to continue'),
      React.createElement('div', { className: 'ua-wallet-prompt-desc' },
        'A wallet is required to create and fund automated tasks.'
      )
    ),
    React.createElement('button', {
      className: 'ua-btn-primary ua-wallet-prompt-btn',
      onClick: connectMetaMask,
      disabled: connecting,
    }, connecting ? 'Connecting...' : 'Connect Wallet')
  );
}

// Export for global use
Object.assign(window, {
  WalletProvider,
  useWallet,
  WalletConnectButton,
  WalletConnectModal,
  WalletPromptCard,
  WalletContext,
  BASE_SEPOLIA,
});
