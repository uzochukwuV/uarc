// Shared message renderers for both UARC variations.
// Both variations consume the same chat-engine and render messages
// using CSS custom properties scoped to each artboard.

const { useEffect: useEffectM, useRef: useRefM, useState } = React;


function MsgUser({ m }) {
  return (
    <div className="ua-row ua-row-user">
      <div className="ua-bubble-user">{m.content}</div>
    </div>
  );
}

function MsgSystem({ m }) {
  return (
    <div className="ua-system">
      <span className="ua-system-line" />
      <span className="ua-system-text">✓ {m.content}</span>
      <span className="ua-system-line" />
    </div>
  );
}

function AgentLabel() {
  return (
    <div className="ua-agent-label">
      <span className="ua-agent-mark">U.</span>
      <span className="ua-agent-name">UARC</span>
    </div>
  );
}

function MsgGreeting({ m, send }) {
  return (
    <div>
      <AgentLabel />
      <div className="ua-greeting">{m.content}</div>
      <div className="ua-suggest-stack">
        {m.suggestions.map((s, i) => (
          <button key={i} className="ua-suggest" onClick={() => send(s)}>
            <span className="ua-suggest-arrow">↗</span>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MsgThinking({ m }) {
  return (
    <div>
      <AgentLabel />
      <div className="ua-thinking">
        <span className="ua-dots">
          <span /><span /><span />
        </span>
        <span>{m.content}</span>
      </div>
    </div>
  );
}

function MsgText({ m }) {
  return (
    <div>
      <AgentLabel />
      <div className="ua-text">{m.content}</div>
    </div>
  );
}

function MsgReceipt({ m }) {
  // Derive header from lines so any intent is represented correctly
  const sellLine = m.lines?.find(l => ['Sell', 'Amount', 'Send'].includes(l.k));
  const triggerLine = m.lines?.find(l => ['Trigger', 'Execute after', 'Destination'].includes(l.k));
  const typeLine = m.lines?.find(l => l.k === 'Type');
  const typeStr = typeLine?.v || '';
  const verb = typeStr.split(' ')[0] || 'Transfer';
  const noun = sellLine?.v || '';
  const condition = triggerLine
    ? `${triggerLine.k === 'Trigger' ? 'when' : triggerLine.k.toLowerCase()} ${triggerLine.v}`
    : '';

  return (
    <div>
      <AgentLabel />
      <div className="ua-receipt">
        <div className="ua-receipt-head">
          <div>
            <div className="ua-receipt-eyebrow">{m.title}</div>
            <div className="ua-receipt-title">
              <em>{verb}</em> {noun}
              {condition && <div className="ua-receipt-sub">{condition}</div>}
            </div>
          </div>
          <span className="ua-status ua-status-warn">
            <span className="ua-dot" /> NEEDS REVIEW
          </span>
        </div>
        <div className="ua-receipt-body">
          {m.lines.map((line, i) => (
            <div key={i} className={`ua-receipt-line ${i === m.lines.length - 1 ? 'is-last' : ''}`}>
              <span className="ua-receipt-k">{line.k}</span>
              <span className={`ua-receipt-v ${line.emphasis ? 'is-emph' : ''}`}>
                {line.v}
                {line.editable && <span className="ua-receipt-edit">EDIT</span>}
              </span>
            </div>
          ))}
        </div>
        <div className="ua-receipt-foot">{m.footnote}</div>
      </div>
    </div>
  );
}

// Mini calendar component for recurring payments
function MiniCalendar({ calendarData }) {
  if (!calendarData || calendarData.length === 0) return null;

  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Show up to 14 scheduled payment dates as a compact grid
  const displayDates = calendarData.slice(0, 14);
  const completedCount = displayDates.filter(d => {
    const ts = d.timestamp || (d.date?.getTime() / 1000);
    return new Date(ts * 1000) < now;
  }).length;
  const pendingCount = displayDates.length - completedCount;

  return (
    <div className="ua-calendar">
      <div className="ua-calendar-head">
        <span className="ua-calendar-title">Payment Schedule</span>
        <span className="ua-calendar-count">{calendarData.length} total</span>
      </div>
      <div className="ua-calendar-grid">
        {displayDates.map((item, i) => {
          const ts = item.timestamp || (item.date?.getTime() / 1000);
          const d = new Date(ts * 1000);
          const isPast = d < now;
          return (
            <div
              key={i}
              className={`ua-calendar-day ${isPast ? 'past' : 'scheduled'}`}
              title={d.toLocaleDateString()}
            >
              <span className="ua-calendar-day-num">{d.getDate()}</span>
              <span className="ua-calendar-day-month">{months[d.getMonth()]}</span>
            </div>
          );
        })}
      </div>
      <div className="ua-calendar-legend">
        <span className="ua-calendar-legend-item">
          <span className="ua-calendar-legend-dot scheduled" /> Scheduled ({pendingCount})
        </span>
        {completedCount > 0 && (
          <span className="ua-calendar-legend-item">
            <span className="ua-calendar-legend-dot pending" /> Completed ({completedCount})
          </span>
        )}
      </div>
    </div>
  );
}

// Enhanced receipt for recurring payments with calendar
function MsgRecurringPreview({ m, onFundingSelect }) {
  const [selectedFunding, setSelectedFunding] = React.useState('vault');
  const amountLine = m.lines?.find(l => l.k === 'Amount');
  const scheduleLine = m.lines?.find(l => l.k === 'Schedule');
  const totalLine = m.lines?.find(l => l.k === 'Total');
  const executionsLine = m.lines?.find(l => l.k === 'Executions');

  const handleFundingSelect = (mode) => {
    setSelectedFunding(mode);
    if (onFundingSelect) onFundingSelect(mode);
  };

  return (
    <div className="p-6">
      <AgentLabel />
      <div className="ua-receipt ua-receipt-recurring">
        <div className="ua-receipt-head">
          <div>
            <span className="ua-recurring-icon">RECURRING PAYMENT</span>
            <div className="ua-receipt-title">
              <em>Send</em> {amountLine?.v || '—'}
              <div className="ua-receipt-sub">{scheduleLine?.v || 'recurring'}</div>
            </div>
          </div>
          <span className="ua-status ua-status-accent">
            <span className="ua-dot" /> CONFIGURE
          </span>
        </div>

        {/* Schedule Summary */}
        <div className="ua-schedule-summary">
          <div className="ua-schedule-item">
            <div className="ua-schedule-value">{amountLine?.v || '—'}</div>
            <div className="ua-schedule-label">Per Payment</div>
          </div>
          <div className="ua-schedule-item">
            <div className="ua-schedule-value">{executionsLine?.v || m.calendarData?.length || '—'}</div>
            <div className="ua-schedule-label">Payments</div>
          </div>
          <div className="ua-schedule-item">
            <div className="ua-schedule-value">{totalLine?.v || '—'}</div>
            <div className="ua-schedule-label">Total</div>
          </div>
        </div>

        {/* Calendar visualization */}
        {m.calendarData && <MiniCalendar calendarData={m.calendarData} />}

        {/* Payment details */}
        <div className="ua-receipt-body">
          {m.lines.filter(l => !['Type', 'Amount', 'Total', 'Executions'].includes(l.k)).map((line, i) => (
            <div key={i} className="ua-receipt-line">
              <span className="ua-receipt-k">{line.k}</span>
              <span className={`ua-receipt-v ${line.emphasis ? 'is-emph' : ''}`}>
                {line.v}
                {line.editable && <span className="ua-receipt-edit">EDIT</span>}
              </span>
            </div>
          ))}
        </div>

        {/* Funding mode toggle */}
        <div className="ua-funding-toggle">
          <div className="ua-funding-label">How would you like to fund this?</div>
          <div className="ua-funding-options">
            <button
              className={`ua-funding-btn ${selectedFunding === 'vault' ? 'selected' : ''}`}
              onClick={() => handleFundingSelect('vault')}
            >
              <div className="ua-funding-btn-icon">💰</div>
              <div className="ua-funding-btn-title">Deposit {totalLine?.v || 'total'} now</div>
              <div className="ua-funding-btn-desc">Lock funds upfront in vault. Guaranteed execution.</div>
            </button>
            <button
              className={`ua-funding-btn ${selectedFunding === 'pull' ? 'selected' : ''}`}
              onClick={() => handleFundingSelect('pull')}
            >
              <div className="ua-funding-btn-icon">🔄</div>
              <div className="ua-funding-btn-title">Authorize pulls</div>
              <div className="ua-funding-btn-desc">Keep funds in wallet. Pulled each execution.</div>
            </button>
          </div>
          <div className="ua-funding-amount">
            <span className="ua-funding-amount-label">
              {selectedFunding === 'vault' ? 'Deposit required' : 'Allowance needed'}
            </span>
            <span className="ua-funding-amount-value">{totalLine?.v || '—'}</span>
          </div>
        </div>

        <div className="ua-cta-row" style={{ marginTop: '16px' }}>
          <button className="ua-btn-primary">
            {selectedFunding === 'vault' ? 'Deposit & Create Task' : 'Approve & Create Task'}
          </button>
          <span className="ua-cta-hint">Press Enter</span>
        </div>

        <div className="ua-receipt-foot">{m.footnote}</div>
      </div>
    </div>
  );
}

function MsgChart({ m }) {
  // Generate a deterministic ETH price line dropping toward trigger
  const points = [];
  let v = 2480;
  for (let i = 0; i < 60; i++) {
    v += Math.sin(i * 0.4) * 16 + Math.cos(i * 0.18) * 11 - 1.8;
    points.push(v);
  }
  // force last to ~price
  const W = 540, H = 150;
  const min = 1980, max = 2520;
  const xs = (i) => (i / (points.length - 1)) * (W - 24) + 12;
  const ys = (val) => H - 18 - ((val - min) / (max - min)) * (H - 36);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xs(i)} ${ys(p)}`).join(' ');
  const triggerY = ys(m.trigger);

  return (
    <div>
      <AgentLabel />
      <div className="ua-chart">
        <div className="ua-chart-head">
          <div>
            <div className="ua-chart-eyebrow">{m.title}</div>
            <div className="ua-chart-price">
              ${m.price.toLocaleString()}
              <span className="ua-chart-delta">{m.delta}%</span>
            </div>
          </div>
          <div className="ua-chart-trigger">
            <span>STOP TRIGGER</span>
            <strong>${m.trigger.toLocaleString()}</strong>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
          <defs>
            <linearGradient id={`grad-${m.id}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--ua-accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--ua-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L ${xs(points.length - 1)} ${H - 18} L ${xs(0)} ${H - 18} Z`} fill={`url(#grad-${m.id})`} />
          <path d={path} fill="none" stroke="var(--ua-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="12" x2={W - 12} y1={triggerY} y2={triggerY} stroke="var(--ua-danger)" strokeWidth="1" strokeDasharray="3 4" opacity="0.85" />
          <text x={W - 14} y={triggerY - 6} fontFamily="JetBrains Mono, monospace" fontSize="9.5" fill="var(--ua-danger)" textAnchor="end" letterSpacing="0.08em">
            STOP · ${m.trigger.toLocaleString()}
          </text>
          <circle cx={xs(points.length - 1)} cy={ys(points[points.length - 1])} r="3.5" fill="var(--ua-accent)" />
          <circle cx={xs(points.length - 1)} cy={ys(points[points.length - 1])} r="9" fill="var(--ua-accent)" opacity="0.18" />
        </svg>
      </div>
    </div>
  );
}

function MsgConfirmCTA({ confirm }) {
  return (
    <div className="ua-cta-row">
      <button className="ua-btn-primary" onClick={confirm}>Confirm & continue →</button>
      <button className="ua-btn-ghost">Edit parameters</button>
      <span className="ua-cta-hint">You'll sign on the next step</span>
    </div>
  );
}

function MsgSign({ m, sign }) {
  const wallet = window.useWallet();
  const walletHint = wallet.isConnected
    ? `${wallet.walletType === 'metamask' ? 'MetaMask' : 'Wallet'} · ${wallet.isCorrectNetwork ? 'Base Sepolia' : 'Wrong network'}`
    : 'Wallet required';

  const handleSign = () => {
    if (!wallet.isConnected) {
      wallet.connectMetaMask();
      return;
    }

    if (!wallet.isCorrectNetwork) {
      wallet.switchToBaseSepolia();
      return;
    }

    sign();
  };

  return (
    <div>
      <AgentLabel />
      <div className="ua-sign">
        <div className="ua-sign-eyebrow">STEP 2 OF 2 · WALLET SIGNATURE</div>
        <div className="ua-sign-title">{m.title}</div>
        {!wallet.isConnected && <window.WalletPromptCard />}
        <div className="ua-sign-wallet">
          <span className="ua-sign-avatar" />
          <div>
            <div className="ua-sign-addr">{wallet.shortAddress || m.wallet}</div>
            <div className="ua-sign-hint">{walletHint}</div>
          </div>
        </div>
        <div className="ua-sign-msg">{m.message}</div>
        <div className="ua-sign-actions">
          <button className="ua-btn-primary" onClick={handleSign}>
            {!wallet.isConnected ? 'Connect wallet' : wallet.isCorrectNetwork ? 'Sign in wallet' : 'Switch network'}
          </button>
          <button className="ua-btn-ghost">Reject</button>
        </div>
      </div>
    </div>
  );
}

function MsgTxStatus({ m }) {
  return (
    <div>
      <AgentLabel />
      <div className="ua-tx">
        <div className="ua-tx-head">
          <div>
            <div className="ua-tx-eyebrow">{m.title.toUpperCase()}</div>
            <div className="ua-tx-title">
              <em>Live</em> · monitoring oracle
            </div>
          </div>
          <span className="ua-status ua-status-good">
            <span className="ua-dot" /> ARMED
          </span>
        </div>
        <div className="ua-tx-body">
          {m.lines.map((line, i) => (
            <div key={i} className="ua-tx-line">
              <span className="ua-tx-k">{line.k}</span>
              <span className="ua-tx-v">{line.v}</span>
            </div>
          ))}
        </div>
        <div className="ua-tx-next">{m.next}</div>
      </div>
    </div>
  );
}

function Message({ m, engine }) {
  if (m.role === 'user') return <MsgUser m={m} />;
  if (m.role === 'system') return <MsgSystem m={m} />;
  switch (m.kind) {
    case 'greeting': return <MsgGreeting m={m} send={engine.send} />;
    case 'thinking': return <MsgThinking m={m} />;
    case 'text': return <MsgText m={m} />;
    case 'receipt': return <MsgReceipt m={m} />;
    case 'recurring-preview': return <MsgRecurringPreview m={m} />;
    case 'chart': return <MsgChart m={m} />;
    case 'confirm-cta': return <MsgConfirmCTA confirm={engine.confirm} />;
    case 'sign': return <MsgSign m={m} sign={engine.sign} />;
    case 'tx-status': return <MsgTxStatus m={m} />;
    default: return <MsgText m={m} />;
  }
}

// ---------- Shared layout ----------
function SidebarWalletStatus() {
  const wallet = window.useWallet();

  if (!wallet.isConnected) {
    return (
      <div className="ua-side-wallet ua-side-wallet-connect">
        <window.WalletConnectButton variant="compact" />
      </div>
    );
  }

  return (
    <>
      <span className="ua-side-avatar" />
      <div className="ua-side-wallet">
        <div className="ua-side-addr">{wallet.shortAddress}</div>
        <div className="ua-side-net">
          <span className={`ua-dot ${wallet.isCorrectNetwork ? 'ua-dot-good' : 'ua-dot-warn'}`} />
          {wallet.isCorrectNetwork ? 'Base Sepolia' : 'Wrong network'}
        </div>
      </div>
    </>
  );
}

function HistoryPane({ mode, onToggleMode, variant }) {
  // Note: User tasks loading is disabled until contract ABIs are available
  // const wallet = window.useWallet();
  // const [userTasks, setUserTasks] = useState([]);
  // const [loadingTasks, setLoadingTasks] = useState(false);

  // useEffectM(() => {
  //   if (wallet?.address) {
  //     setLoadingTasks(true);
  //     loadUserTasks(wallet).then(setUserTasks).finally(() => setLoadingTasks(false));
  //   }
  // }, [wallet?.address]);

  return (
    <aside className="ua-side ua-side-left">
      <div className="ua-brand">
        <div className="ua-brand-mark">
          {variant === 'editorial' ? (
            <span className="ua-brand-glyph-editorial">U.</span>
          ) : (
            <span className="ua-brand-glyph-terminal">[U]</span>
          )}
        </div>
        <span className="ua-brand-name">UARC</span>
        <button className="ua-theme-btn" onClick={onToggleMode} aria-label="Toggle theme">
          {mode === 'dark' ? '☾' : '☀'}
        </button>
      </div>

      <div className="ua-side-body">
        <button className="ua-new-btn">
          <span>New automation</span>
          <span className="ua-kbd">⌘N</span>
        </button>

        <div className="ua-side-label">HISTORY</div>
        <div className="ua-hist">
          {window.SAMPLE_HISTORY.map(h => (
            <button key={h.id} className={`ua-hist-item ${h.active ? 'is-active' : ''}`}>
              <span className="ua-hist-title">{h.title}</span>
              <span className="ua-hist-time">{h.time}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ua-side-foot">
        <SidebarWalletStatus />
      </div>
    </aside>
  );
}

// Fetch user's active automations from the agent API
const UARC_API = window.UARC_API_BASE || (window.location.port === '5173' ? 'http://127.0.0.1:3000' : '');

async function fetchUserTasks(address) {
  if (!address) return [];
  try {
    const res = await fetch(`${UARC_API}/tasks?address=${address}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tasks || [];
  } catch (err) {
    console.log('Failed to fetch tasks:', err.message);
    return [];
  }
}

async function fetchWalletBalances(address, provider) {
  if (!address || !provider) return { eth: '0', usdc: '0', usdt: '0' };
  try {
    const ethers = window.ethers;
    const browserProvider = new ethers.BrowserProvider(provider);

    // ETH balance
    const ethBalance = await browserProvider.getBalance(address);
    const ethFormatted = ethers.formatEther(ethBalance);

    // Token balances (using manifest addresses)
    const manifest = window.UARC_MANIFEST || {};
    const usdcAddr = manifest.tokens?.MockUSDC?.address || manifest.tokens?.MockUSDC;
    const usdtAddr = manifest.tokens?.MockUSDT?.address || manifest.tokens?.MockUSDT;

    const erc20Abi = ['function balanceOf(address) view returns (uint256)'];
    let usdcBalance = '0', usdtBalance = '0';

    if (usdcAddr) {
      const usdc = new ethers.Contract(usdcAddr, erc20Abi, browserProvider);
      const bal = await usdc.balanceOf(address);
      usdcBalance = ethers.formatUnits(bal, 6);
    }
    if (usdtAddr) {
      const usdt = new ethers.Contract(usdtAddr, erc20Abi, browserProvider);
      const bal = await usdt.balanceOf(address);
      usdtBalance = ethers.formatUnits(bal, 6);
    }

    return { eth: ethFormatted, usdc: usdcBalance, usdt: usdtBalance };
  } catch (err) {
    console.log('Failed to fetch balances:', err.message);
    return { eth: '0', usdc: '0', usdt: '0' };
  }
}

function ActivePane() {
  const wallet = window.useWallet();
  const [tasks, setTasks] = useState([]);
  const [balances, setBalances] = useState({ eth: '0', usdc: '0', usdt: '0' });
  const [loading, setLoading] = useState(false);

  // Load tasks when wallet connects
  useEffectM(() => {
    if (wallet.address && wallet.isCorrectNetwork) {
      setLoading(true);
      fetchUserTasks(wallet.address)
        .then(setTasks)
        .finally(() => setLoading(false));
    } else {
      setTasks([]);
    }
  }, [wallet.address, wallet.isCorrectNetwork]);

  // Load balances when wallet connects
  useEffectM(() => {
    if (wallet.address && wallet.provider) {
      fetchWalletBalances(wallet.address, wallet.provider).then(setBalances);
    }
  }, [wallet.address, wallet.provider]);

  const formatBalance = (val, decimals = 2) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '0';
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
  };

  // Map task status to display status
  const getTaskStatus = (task) => {
    if (task.executed >= task.maxExecutions) return 'completed';
    if (task.paused) return 'paused';
    return 'armed';
  };

  const getTaskProgress = (task) => {
    if (!task.maxExecutions) return 0;
    return task.executed / task.maxExecutions;
  };

  const formatInterval = (seconds) => {
    if (seconds >= 2592000) return 'Monthly';
    if (seconds >= 604800) return 'Weekly';
    if (seconds >= 86400) return 'Daily';
    return `Every ${Math.round(seconds / 3600)}h`;
  };

  return (
    <aside className="ua-side ua-side-right">
      <div className="ua-active-head">
        <div>
          <div className="ua-side-label">ACTIVE</div>
          <div className="ua-active-count">
            {loading ? 'Loading...' : `${tasks.length} automation${tasks.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <button className="ua-active-all" onClick={() => wallet.address && fetchUserTasks(wallet.address).then(setTasks)}>
          Refresh
        </button>
      </div>

      <div className="ua-wallet-card">
        <div className="ua-wallet-eyebrow">
          {wallet.isConnected ? 'WALLET BALANCE' : 'CONNECT WALLET'}
        </div>
        {wallet.isConnected ? (
          <>
            <div className="ua-wallet-amount">
              {formatBalance(balances.usdc, 2)}<span className="ua-wallet-cents"> USDC</span>
            </div>
            <div className="ua-wallet-row">
              <span>{formatBalance(balances.eth, 4)} ETH</span>
              <span>{formatBalance(balances.usdt, 2)} USDT</span>
            </div>
          </>
        ) : (
          <div className="ua-wallet-connect-hint">
            <window.WalletConnectButton variant="compact" />
          </div>
        )}
      </div>

      <div className="ua-auto-list">
        {!wallet.isConnected && (
          <div className="ua-auto-empty">
            Connect wallet to view your automations
          </div>
        )}
        {wallet.isConnected && tasks.length === 0 && !loading && (
          <div className="ua-auto-empty">
            No active automations yet. Create one using the chat!
          </div>
        )}
        {tasks.map(task => {
          const status = getTaskStatus(task);
          const progress = getTaskProgress(task);
          return (
            <div key={task.taskId} className="ua-auto-card">
              <div className="ua-auto-head">
                <span className="ua-auto-name">Task #{task.taskId}</span>
                <span className={`ua-status ua-status-${status === 'completed' ? 'good' : status === 'armed' ? 'accent' : 'mute'}`}>
                  <span className="ua-dot" /> {status.toUpperCase()}
                </span>
              </div>
              <div className="ua-auto-detail">
                {task.adapterType === 'recurring_transfer'
                  ? `Send ${formatBalance(task.amountPerExecution / 1e6)} tokens ${formatInterval(task.interval).toLowerCase()}`
                  : task.summary || 'Automation task'}
              </div>
              <div className="ua-auto-meta">
                <span>{task.executed}/{task.maxExecutions} executed</span>
                <span>
                  {task.nextExecution
                    ? `Next: ${new Date(task.nextExecution * 1000).toLocaleDateString()}`
                    : 'Waiting...'}
                </span>
              </div>
              {progress > 0 && (
                <div className="ua-auto-bar">
                  <div style={{ width: `${progress * 100}%` }} className={`ua-auto-bar-fill ua-bar-${status}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function ChatPane({ engine, variant }) {
  const wallet = window.useWallet();
  const scrollRef = useRefM(null);
  const [balances, setBalances] = useState({ eth: '0', usdc: '0', usdt: '0' });

  useEffectM(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [engine.messages.length]);

  // Load wallet balances
  useEffectM(() => {
    if (wallet.address && wallet.provider) {
      fetchWalletBalances(wallet.address, wallet.provider).then(setBalances);
    }
  }, [wallet.address, wallet.provider]);

  const showHero = engine.messages.length <= 1;

  // Generate session title from first user message
  const getSessionTitle = () => {
    const firstUser = engine.messages.find(m => m.kind === 'user');
    if (firstUser) {
      const text = firstUser.text || '';
      return text.length > 35 ? text.slice(0, 35) + '...' : text;
    }
    return 'New Automation';
  };

  const formatBal = (val, decimals = 2) => {
    const num = parseFloat(val);
    if (isNaN(num) || num === 0) return '0';
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
  };

  return (
    <main className="ua-chat">
      <div className="ua-topbar">
        <div className="ua-topbar-title">
          <span className="ua-topbar-name">{getSessionTitle()}</span>
          <span className="ua-topbar-meta">{engine.messages.length <= 1 ? 'NEW' : 'DRAFT'} · Base Sepolia</span>
        </div>
        <div className="ua-topbar-bal">
          {wallet.isConnected ? (
            <>
              <span className="ua-bal-pill"><b>ETH</b> {formatBal(balances.eth, 4)}</span>
              <span className="ua-bal-pill"><b>USDC</b> {formatBal(balances.usdc, 2)}</span>
              <span className="ua-bal-pill"><b>USDT</b> {formatBal(balances.usdt, 2)}</span>
            </>
          ) : null}
          <window.WalletConnectButton variant="compact" />
        </div>
      </div>

      <div ref={scrollRef} className="ua-scroll">
        {showHero && variant === 'editorial' && (
          <div className="ua-hero ua-hero-editorial">
            <div className="ua-hero-eyebrow">UARC · ONCHAIN AGENT FOR ARC</div>
            <h1 className="ua-hero-title">
              Tell me what to <em>automate.</em>
            </h1>
            <p className="ua-hero-sub">
              Set rules in plain English. UARC writes the onchain task, shows you a
              receipt, and executes the moment your conditions hit.
            </p>
          </div>
        )}
        {showHero && variant === 'terminal' && (
          <div className="ua-hero ua-hero-terminal">
            <div className="ua-hero-eyebrow">UARC // ARC AGENT v0.4.1</div>
            <h1 className="ua-hero-title">
              <span className="ua-hero-prompt">$</span> describe an automation_
            </h1>
            <pre className="ua-hero-pre">
              {`# examples
> sell 4.2 ETH → USDT when ETH ≤ $2000
> dca $100 ARC every fri 09:00 utc
> claim staking rewards when ≥ 5 ARC`}
            </pre>
          </div>
        )}

        <div className="ua-msgs">
          {engine.messages.map(m => (
            <Message key={m.id} m={m} engine={engine} />
          ))}
          {engine.busy && engine.messages[engine.messages.length - 1]?.kind !== 'thinking' && (
            <div><AgentLabel /><div className="ua-thinking"><span className="ua-dots"><span /><span /><span /></span><span>Working</span></div></div>
          )}
        </div>
      </div>

      <Composer engine={engine} />
    </main>
  );
}

function Composer({ engine }) {
  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      engine.send();
    }
  };
  return (
    <div className="ua-composer-wrap">
      <form className="ua-composer" onSubmit={(e) => { e.preventDefault(); engine.send(); }}>
        <textarea
          className="ua-input"
          rows={2}
          placeholder="Describe an automation… e.g. Sell my ETH at $2,000 to USDT"
          value={engine.input}
          onChange={(e) => engine.setInput(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="ua-composer-foot">
          <div className="ua-chip-row">
            <button type="button" className="ua-chip">＋ Attach</button>
            <button type="button" className="ua-chip">📈 Chart</button>
            <button type="button" className="ua-chip">0x Address</button>
          </div>
          <div className="ua-send-row">
            <span className="ua-send-hint">↵ to send · ⇧↵ newline</span>
            <button type="submit" className="ua-send-btn" disabled={!engine.input.trim() || engine.busy}>
              Send →
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function UarcShell({ variant, mode, onToggleMode }) {
  const engine = window.useChatEngine();
  return (
    <div className={`ua-shell ua-${variant} ua-${mode}`}>
      <HistoryPane mode={mode} onToggleMode={onToggleMode} variant={variant} />
      <ChatPane engine={engine} variant={variant} />
      <ActivePane />
    </div>
  );
}

Object.assign(window, { UarcShell });
