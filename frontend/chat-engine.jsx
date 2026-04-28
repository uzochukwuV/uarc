// Shared chat engine for UARC variations
const { useState, useEffect, useRef, useCallback } = React;

const SAMPLE_HISTORY = [
  { id: 'h1', title: 'Stop-loss for ETH at $2000', time: 'Today', active: true },
  { id: 'h2', title: 'Weekly DCA into ARC', time: 'Yesterday' },
  { id: 'h3', title: 'Auto-claim staking rewards', time: '2 days ago' },
  { id: 'h4', title: 'Limit buy ARC under $0.42', time: 'Mar 18' },
  { id: 'h5', title: 'Rebalance to 60/40 ETH/USDC', time: 'Mar 14' },
  { id: 'h6', title: 'Bridge USDC Arc → Ethereum', time: 'Mar 09' },
];

const ACTIVE_AUTOMATIONS = [
  { id: 'a1', name: 'ETH stop-loss', status: 'armed', detail: 'Sell 4.2 ETH → USDT when ETH ≤ $2,000', trigger: 'Price ≤ $2,000', last: 'Checked 12s ago', progress: 0.42 },
  { id: 'a2', name: 'Weekly DCA', status: 'running', detail: 'Buy $250 ARC every Friday 09:00 UTC', trigger: 'Next: Fri 09:00', last: 'Ran 3 days ago', progress: 0.71 },
  { id: 'a3', name: 'Stake compound', status: 'paused', detail: 'Auto-compound ARC staking yield', trigger: 'On reward ≥ 5 ARC', last: 'Paused by you', progress: 0 },
  { id: 'a4', name: 'Weekly USDC Transfer', status: 'armed', detail: 'Send 50 USDC to 0x10c4712dB66B56782ACD2739673889A37c5DB604 weekly for 2 weeks', trigger: 'Weekly', last: 'Started seconds ago', progress: 0 },
];

const INITIAL_MESSAGES = [
  { id: 'm0', role: 'assistant', kind: 'greeting', content: 'What should I automate today?',
    suggestions: [
      'Send 50 USDC to 0x123... weekly for 4 weeks',
      'Pay 100 USDT monthly to my friend',
      'Transfer $25 daily for 10 days',
    ] },
];

const ADAPTER_LABELS = {
  time_based_transfer: 'Scheduled Transfer',
  cctp_bridge: 'Cross-chain Bridge',
  stork_price_transfer: 'Price-triggered Transfer',
  recurring_transfer: 'Recurring Payment',
};

const DOMAIN_NAMES = { 0: 'Ethereum', 1: 'Avalanche', 2: 'OP Mainnet', 3: 'Arbitrum', 6: 'Base' };
const INTERVAL_LABELS = { 86400: 'Daily', 604800: 'Weekly', 2592000: 'Monthly' };
const FUNDING_MODES = { 0: 'Vault (Deposit)', 1: 'Pull (Subscription)' };
const UARC_API_BASE = window.UARC_API_BASE || (window.location.port === '5173' ? 'http://127.0.0.1:3000' : '');

// Check if a parameter is missing/invalid
const isMissingAddress = (addr) => !addr || addr === '0x0000000000000000000000000000000000000000' || addr === '0x123...' || !addr.startsWith('0x') || addr.length < 10;

// Identify which required parameters are missing for each adapter type
function getMissingParams(adapterType, params) {
  const missing = [];
  switch (adapterType) {
    case 'recurring_transfer':
    case 'time_based_transfer':
      if (isMissingAddress(params.recipient)) missing.push({ key: 'recipient', label: 'recipient address', question: 'What address should I send to?' });
      if (!params.amountPerExecution && !params.amount) missing.push({ key: 'amount', label: 'amount', question: 'How much should I send per transfer?' });
      break;
    case 'cctp_bridge':
      if (isMissingAddress(params.mintRecipient)) missing.push({ key: 'mintRecipient', label: 'destination address', question: 'What address should receive the tokens on the destination chain?' });
      break;
    case 'stork_price_transfer':
      if (isMissingAddress(params.recipient)) missing.push({ key: 'recipient', label: 'recipient address', question: 'What address should receive the tokens?' });
      if (!params.targetPrice) missing.push({ key: 'targetPrice', label: 'target price', question: 'At what price should this trigger?' });
      break;
  }
  return missing;
}

const TASK_FACTORY_ABI = [
  'function createTaskWithTokens(tuple(uint256 expiresAt,uint256 maxExecutions,uint256 recurringInterval,uint256 rewardPerExecution,bytes32 seedCommitment) taskParams, tuple(bytes4 selector,address protocol,bytes params)[] actions, tuple(address token,uint256 amount)[] deposits) payable returns (uint256 taskId,address taskCore,address taskVault)',
  'event TaskCreated(uint256 indexed taskId,address indexed creator,address indexed taskCore,address taskVault,uint256 rewardPerExecution,uint256 maxExecutions)',
];
const ERC20_APPROVE_ABI = [
  'function approve(address spender,uint256 amount) returns (bool)',
];

function buildReceiptLines(data) {
  const { adapterType, params } = data;
  const fmt6 = (v) => (Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });
  const fmtAddr = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';
  const fmtTs = (ts) => ts ? new Date(Number(ts) * 1000).toLocaleString() : '—';
  const fmtDate = (ts) => ts ? new Date(Number(ts) * 1000).toLocaleDateString() : '—';

  switch (adapterType) {
    case 'recurring_transfer':
      const interval = Number(params.interval || 604800);
      const intervalLabel = INTERVAL_LABELS[interval] || `Every ${Math.round(interval / 86400)} days`;
      const maxExec = Number(params.maxExecutions || 4);
      const perExec = Number(params.amountPerExecution || 0);
      const total = perExec * maxExec;
      const fundingMode = Number(params.fundingMode || 0);
      return [
        { k: 'Type', v: 'Recurring payment', emphasis: true },
        { k: 'Amount', v: `${fmt6(perExec)} per payment` },
        { k: 'Schedule', v: `${intervalLabel} × ${maxExec} payments` },
        { k: 'Total', v: `${fmt6(total)} tokens`, emphasis: true },
        { k: 'Recipient', v: fmtAddr(params.recipient) },
        { k: 'Starts', v: fmtDate(params.startTime) },
        { k: 'Funding', v: FUNDING_MODES[fundingMode], editable: true },
      ];
    case 'time_based_transfer':
      return [
        { k: 'Type', v: 'Scheduled transfer', emphasis: true },
        { k: 'Amount', v: `${fmt6(params.amount)} tokens` },
        { k: 'Recipient', v: fmtAddr(params.recipient) },
        { k: 'Execute after', v: fmtTs(params.executeAfter) },
      ];
    case 'cctp_bridge':
      return [
        { k: 'Type', v: 'Cross-chain bridge', emphasis: true },
        { k: 'Amount', v: `${fmt6(params.amount)} USDC` },
        { k: 'Destination', v: DOMAIN_NAMES[params.destinationDomain] || `Domain ${params.destinationDomain}` },
        { k: 'Recipient', v: fmtAddr(params.mintRecipient) },
        { k: 'Execute after', v: fmtTs(params.executeAfter) },
      ];
    case 'stork_price_transfer':
      return [
        { k: 'Type', v: 'Price-triggered transfer', emphasis: true },
        { k: 'Amount', v: `${fmt6(params.amount)} tokens` },
        { k: 'Trigger', v: `Price ${params.isBelow ? '≤' : '≥'} $${(Number(params.targetPrice) / 1e8).toLocaleString()}` },
        { k: 'Recipient', v: fmtAddr(params.recipient) },
      ];
    default:
      return [{ k: 'Type', v: adapterType, emphasis: true }];
  }
}

// Generate calendar data for recurring payments
function buildCalendarData(params) {
  const startTime = Number(params.startTime || Math.floor(Date.now() / 1000));
  const interval = Number(params.interval || 604800);
  const maxExecutions = Number(params.maxExecutions || 4);

  const dates = [];
  for (let i = 0; i < maxExecutions; i++) {
    const ts = startTime + (i * interval);
    dates.push({
      index: i,
      timestamp: ts,
      date: new Date(ts * 1000),
      isPast: ts * 1000 < Date.now(),
      isNext: i === 0 || (dates.length > 0 && !dates[dates.length - 1].isPast),
    });
  }
  return dates;
}

function buildAgentFlow(text) {
  const l = (text || '').toLowerCase();
  const isRecurring = l.includes('weekly') || l.includes('monthly') || l.includes('daily') || l.includes('every ') || l.includes('subscription');
  if (isRecurring) {
    const amountMatch = l.match(/(?:send|pay|transfer)?\s*(\d+(?:\.\d+)?)\s*(usdc|usdt|euro)?/i);
    const recipientMatch = text.match(/0x[a-fA-F0-9.]+/);
    const weeksMatch = l.match(/(?:for\s+)?(\d+)\s+weeks?/);
    const daysMatch = l.match(/(?:for\s+)?(\d+)\s+days?/);
    const monthsMatch = l.match(/(?:for\s+)?(\d+)\s+months?/);
    const maxExecutions = Number(weeksMatch?.[1] || daysMatch?.[1] || monthsMatch?.[1] || 4);
    const interval = l.includes('daily') ? 86400 : l.includes('monthly') ? 2592000 : 604800;
    const amount = Math.round(Number(amountMatch?.[1] || 50) * 1e6);
    const token = (amountMatch?.[2] || 'USDC').toUpperCase();
    const recipient = recipientMatch?.[0] || '0x123...';
    const summary = `send ${Number(amountMatch?.[1] || 50)} ${token} ${INTERVAL_LABELS[interval].toLowerCase()} for ${maxExecutions} payments`;
    const params = {
      token,
      recipient,
      amountPerExecution: amount,
      startTime: Math.floor(Date.now() / 1000) + 86400,
      interval,
      maxExecutions,
      fundingMode: 0,
    };
    return [
      { delay: 500, msg: { role: 'assistant', kind: 'thinking', content: 'Parsing recurring payment · Building schedule · Estimating deposit' } },
      { delay: 900, replaceLast: true, msg: { role: 'assistant', kind: 'text', content: `Got it — ${summary}. Here's the task to review before deploying.` } },
      { delay: 250, msg: { role: 'assistant', kind: 'recurring-preview', title: 'New automation · Recurring Payment',
        lines: buildReceiptLines({ adapterType: 'recurring_transfer', params }),
        calendarData: buildCalendarData(params),
        footnote: 'Preview mode · Start the agent server for live contract payloads' } },
      { delay: 200, msg: { role: 'assistant', kind: 'confirm-cta' } },
    ];
  }
  const isStop = l.includes('stop') || l.includes('2000') || l.includes('below') || l.includes('usdt') || l.includes('sell') || l.includes('eth');
  if (isStop) return [
    { delay: 500, msg: { role: 'assistant', kind: 'thinking', content: 'Reading wallet · Quoting ETH→USDT route · Verifying oracle' } },
    { delay: 1300, replaceLast: true, msg: { role: 'assistant', kind: 'text', content: "Got it — a price-triggered stop-loss. Here's the receipt to review before signing." } },
    { delay: 250, msg: { role: 'assistant', kind: 'receipt', title: 'New automation · Stop-loss', status: 'pending-review',
      lines: [
        { k: 'Type', v: 'Conditional swap', emphasis: true },
        { k: 'Sell', v: '4.2000 ETH' },
        { k: 'Receive', v: 'USDT' },
        { k: 'Trigger', v: 'ETH ≤ $2,000.00' },
        { k: 'Slippage', v: '0.50%', editable: true },
        { k: 'Route', v: 'Arc DEX · best of 4' },
        { k: 'Network fee', v: '≈ $0.04' },
        { k: 'Expires', v: 'Never', editable: true },
      ],
      footnote: 'Price feed: Pyth · Arc oracle · 5s heartbeat' } },
    { delay: 200, msg: { role: 'assistant', kind: 'chart', title: 'ETH / USD · 24h', price: 2364.18, delta: -1.42, trigger: 2000 } },
    { delay: 200, msg: { role: 'assistant', kind: 'confirm-cta' } },
  ];
  return [
    { delay: 600, msg: { role: 'assistant', kind: 'thinking', content: 'Thinking' } },
    { delay: 1200, replaceLast: true, msg: { role: 'assistant', kind: 'text', content: "I can build that. Tell me the trigger (price, time, balance) and the action you want." } },
  ];
}

function buildSignFlow() {
  return [
    { delay: 300, msg: { role: 'assistant', kind: 'sign', title: 'Sign with your wallet', wallet: '0x9F2…c4A1', message: 'UARC · Authorize conditional swap · nonce 0x4f1b' } },
  ];
}

function buildSignedFlow() {
  return [
    { delay: 200, msg: { role: 'system', kind: 'system-line', content: 'Signature received' } },
    { delay: 600, msg: { role: 'assistant', kind: 'tx-status', title: 'Automation deployed', status: 'armed', hash: '0x7a2b…f019',
      lines: [
        { k: 'Status', v: 'Armed · monitoring price' },
        { k: 'Tx hash', v: '0x7a2b…f019' },
        { k: 'Block', v: '#48,212,704' },
      ],
      next: "I'll watch the ETH/USD oracle and execute the swap the moment price hits ≤ $2,000. Pause or edit it from the right panel anytime." } },
  ];
}

async function submitPreviewWithWallet(preview, wallet) {
  if (!window.ethers) throw new Error('ethers.js did not load. Refresh the page and try again.');
  if (!wallet?.provider || !wallet.address) throw new Error('Connect MetaMask before deploying.');
  if (!wallet.isCorrectNetwork) throw new Error('Switch MetaMask to Base Sepolia before deploying.');
  if (!preview?.payload) throw new Error('Missing task payload. Generate a preview first.');

  const ethers = window.ethers;
  const browserProvider = new ethers.BrowserProvider(wallet.provider);
  const from = wallet.address;
  const payload = preview.payload;
  const erc20 = new ethers.Interface(ERC20_APPROVE_ABI);
  const factory = new ethers.Interface(TASK_FACTORY_ABI);

  for (const deposit of payload.deposits || []) {
    const approveHash = await wallet.provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from,
        to: deposit.token,
        data: erc20.encodeFunctionData('approve', [payload.taskFactoryAddress, deposit.amount]),
      }],
    });
    await browserProvider.waitForTransaction(approveHash);
  }

  const taskTx = {
    from,
    to: payload.taskFactoryAddress,
    data: factory.encodeFunctionData('createTaskWithTokens', [
      payload.taskParams,
      payload.actions || [],
      payload.deposits || [],
    ]),
    value: ethers.toQuantity(ethers.parseEther(payload.value || '0')),
  };

  const gasEstimateHex = await wallet.provider.request({
    method: 'eth_estimateGas',
    params: [taskTx],
  });
  const gasLimit = (BigInt(gasEstimateHex) * 120n) / 100n;

  const taskHash = await wallet.provider.request({
    method: 'eth_sendTransaction',
    params: [{ ...taskTx, gas: ethers.toQuantity(gasLimit) }],
  });

  const receipt = await browserProvider.waitForTransaction(taskHash);
  let taskId = null;
  for (const log of receipt?.logs || []) {
    try {
      const parsed = factory.parseLog(log);
      if (parsed?.name === 'TaskCreated') {
        taskId = parsed.args.taskId.toString();
        break;
      }
    } catch (_err) {}
  }

  return { txHash: taskHash, taskId };
}

function useChatEngine() {
  const wallet = window.useWallet();
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Stores the parsed preview from /task/preview so confirm() can submit it
  const [pendingIntent, setPendingIntent] = useState(null);
  const [pendingPreview, setPendingPreview] = useState(null);
  // Tracks when we're waiting for user to provide missing parameters
  const [awaitingParam, setAwaitingParam] = useState(null); // { preview, missingParams, currentIndex }
  const idRef = useRef(1);
  const nextId = () => `m${idRef.current++}`;

  // Load manifest on mount (needed for token addresses)
  useEffect(() => {
    if (!window.UARC_MANIFEST) {
      fetch(`${UARC_API_BASE}/manifest`)
        .then(r => r.json())
        .then(data => {
          window.UARC_MANIFEST = data;
          console.log('[UARC] Manifest loaded:', Object.keys(data));
        })
        .catch(err => console.warn('[UARC] Failed to load manifest:', err.message));
    }
  }, []);

  const runFlow = useCallback(async (steps) => {
    for (const step of steps) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, step.delay));
      setMessages(cur => {
        const m = { ...step.msg, id: nextId() };
        if (step.replaceLast) return [...cur.slice(0, -1), m];
        return [...cur, m];
      });
    }
  }, []);

  // Helper to show the final preview after all params are collected
  const showPreview = useCallback((data, intentText) => {
    const lines = buildReceiptLines(data);
    const label = ADAPTER_LABELS[data.adapterType] || data.adapterType;
    const isRecurring = data.adapterType === 'recurring_transfer';
    const calendarData = isRecurring ? buildCalendarData(data.params) : null;
    const messageKind = isRecurring ? 'recurring-preview' : 'receipt';

    setPendingIntent(intentText);
    setPendingPreview(data);
    setAwaitingParam(null);

    setMessages(cur => [
      ...cur.slice(0, -1), // remove thinking
      { id: nextId(), role: 'assistant', kind: 'text', content: `Got it — ${data.summary}. Here's the task to review before deploying.` },
      { id: nextId(), role: 'assistant', kind: messageKind, title: `New automation · ${label}`,
        lines,
        calendarData,
        footnote: `Adapter: ${data.adapterType} · Base Sepolia` },
      { id: nextId(), role: 'assistant', kind: 'confirm-cta' },
    ]);
  }, []);

  const send = useCallback(async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || busy) return;
    setInput('');
    setBusy(true);
    setMessages(cur => [...cur, { id: nextId(), role: 'user', kind: 'text', content: trimmed }]);

    // Check if we're collecting a missing parameter
    if (awaitingParam) {
      const { preview, missingParams, currentIndex, originalIntent } = awaitingParam;
      const currentMissing = missingParams[currentIndex];

      // Parse the user's response - look for an address or value
      let value = trimmed;
      // If looking for an address, try to extract it
      if (currentMissing.key === 'recipient' || currentMissing.key === 'mintRecipient') {
        const addrMatch = trimmed.match(/0x[a-fA-F0-9]{40}/);
        if (addrMatch) value = addrMatch[0];
      }

      // Update the preview params with the user's answer
      const updatedParams = { ...preview.params, [currentMissing.key]: value };
      const updatedPreview = { ...preview, params: updatedParams };

      // Check if there are more missing params
      if (currentIndex + 1 < missingParams.length) {
        // Ask for the next parameter
        const nextMissing = missingParams[currentIndex + 1];
        setAwaitingParam({ ...awaitingParam, preview: updatedPreview, currentIndex: currentIndex + 1 });
        setMessages(cur => [...cur, { id: nextId(), role: 'assistant', kind: 'text', content: nextMissing.question }]);
        setBusy(false);
        return;
      }

      // All params collected - rebuild the payload and show preview
      setMessages(cur => [...cur, { id: nextId(), role: 'assistant', kind: 'thinking', content: 'Building task preview...' }]);

      try {
        // Re-call preview with complete params
        const completeIntent = `${originalIntent} to ${updatedParams.recipient || updatedParams.mintRecipient}`;
        const res = await fetch(`${UARC_API_BASE}/task/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intent: completeIntent, userAddress: wallet.address }),
          signal: AbortSignal.timeout(20000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

        // Merge collected params into the response
        data.params = { ...data.params, ...updatedParams };
        showPreview(data, completeIntent);
      } catch (err) {
        // Fallback: use the preview we built up
        showPreview(updatedPreview, originalIntent);
      }
      setBusy(false);
      return;
    }

    // Normal flow: get preview from API
    try {
      setMessages(cur => [...cur, { id: nextId(), role: 'assistant', kind: 'thinking', content: 'Reading wallet · Parsing intent · Building task' }]);

      const res = await fetch(`${UARC_API_BASE}/task/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: trimmed, userAddress: wallet.address }),
        signal: AbortSignal.timeout(20000),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      // Check for missing required parameters
      const missingParams = getMissingParams(data.adapterType, data.params);

      if (missingParams.length > 0) {
        // Store the preview and start asking for missing params
        setAwaitingParam({
          preview: data,
          missingParams,
          currentIndex: 0,
          originalIntent: trimmed,
        });

        // Ask for the first missing parameter
        const firstMissing = missingParams[0];
        setMessages(cur => [
          ...cur.slice(0, -1), // remove thinking
          { id: nextId(), role: 'assistant', kind: 'text', content: `I'll set up that automation. ${firstMissing.question}` },
        ]);
        setBusy(false);
        return;
      }

      // All params present - show preview
      showPreview(data, trimmed);
    } catch (_err) {
      // API unavailable — fall back to local demo flow
      setMessages(cur => cur.filter(m => m.kind !== 'thinking'));
      await runFlow(buildAgentFlow(trimmed));
    }

    setBusy(false);
  }, [input, busy, runFlow, wallet.address, awaitingParam, showPreview]);

  const confirmServer = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessages(cur => [...cur, { id: nextId(), role: 'user', kind: 'text', content: 'Confirm' }]);

    if (pendingIntent) {
      // Real API: submit the task on-chain
      try {
        setMessages(cur => [...cur, { id: nextId(), role: 'assistant', kind: 'thinking', content: 'Deploying automation on-chain…' }]);

        throw new Error('Server-side signing is disabled. Use MetaMask confirm flow.');
        const res = await fetch(`${UARC_API_BASE}/task/create-from-prompt-disabled`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intent: pendingIntent }),
          signal: AbortSignal.timeout(60000),
        });
        const data = await res.json();

        if (data.success) {
          const shortHash = data.txHash
            ? `${data.txHash.slice(0, 10)}…${data.txHash.slice(-4)}`
            : '—';
          setPendingIntent(null);
          setMessages(cur => [
            ...cur.slice(0, -1), // remove thinking
            { id: nextId(), role: 'system', kind: 'system-line', content: 'Transaction confirmed on Arc Testnet' },
            { id: nextId(), role: 'assistant', kind: 'tx-status', title: 'Automation deployed',
              lines: [
                { k: 'Task ID', v: `#${data.taskId}` },
                { k: 'Tx Hash', v: shortHash },
                { k: 'Status', v: 'Armed · monitoring' },
              ],
              next: data.summary || 'Your automation is live and monitoring conditions on Arc Testnet.' },
          ]);
        } else {
          throw new Error(data.error || 'Task creation failed');
        }
      } catch (err) {
        setMessages(cur => [
          ...cur.slice(0, -1),
          { id: nextId(), role: 'assistant', kind: 'text', content: `Failed to deploy: ${err.message}` },
        ]);
      }
    } else {
      // Demo flow
      await runFlow(buildSignFlow());
    }

    setBusy(false);
  }, [busy, runFlow, pendingIntent]);

  const confirm = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessages(cur => [...cur, { id: nextId(), role: 'user', kind: 'text', content: 'Confirm' }]);

    if (pendingPreview?.payload) {
      try {
        if (!wallet.isConnected) {
          await wallet.connectMetaMask();
          throw new Error('Wallet connected. Press Confirm again to deploy.');
        }
        if (!wallet.isCorrectNetwork) {
          await wallet.switchToBaseSepolia();
          throw new Error('Network switched. Press Confirm again to deploy.');
        }

        setMessages(cur => [...cur, { id: nextId(), role: 'assistant', kind: 'thinking', content: 'Waiting for MetaMask approval and task transaction...' }]);

        const data = await submitPreviewWithWallet(pendingPreview, wallet);
        const shortHash = data.txHash ? `${data.txHash.slice(0, 10)}...${data.txHash.slice(-4)}` : '-';
        setPendingIntent(null);
        setPendingPreview(null);
        setMessages(cur => [
          ...cur.slice(0, -1),
          { id: nextId(), role: 'system', kind: 'system-line', content: 'Transaction confirmed on Base Sepolia' },
          { id: nextId(), role: 'assistant', kind: 'tx-status', title: 'Automation deployed',
            lines: [
              { k: 'Task ID', v: data.taskId ? `#${data.taskId}` : 'Created' },
              { k: 'Tx Hash', v: shortHash },
              { k: 'Status', v: 'Armed - monitoring' },
            ],
            next: pendingPreview.summary || 'Your automation is live and monitoring conditions on Base Sepolia.' },
        ]);
      } catch (err) {
        setMessages(cur => [
          ...cur.slice(0, -1),
          { id: nextId(), role: 'assistant', kind: 'text', content: `Failed to deploy: ${err.message}` },
        ]);
      }
    } else {
      await runFlow(buildSignFlow());
    }

    setBusy(false);
  }, [busy, runFlow, pendingPreview, wallet]);

  const sign = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await runFlow(buildSignedFlow());
    setBusy(false);
  }, [busy, runFlow]);

  const reset = useCallback(() => {
    idRef.current = 1;
    setMessages(INITIAL_MESSAGES);
    setInput('');
    setBusy(false);
    setPendingIntent(null);
    setPendingPreview(null);
    setAwaitingParam(null);
  }, []);

  return { messages, input, setInput, send, confirm, sign, reset, busy };
}

Object.assign(window, { useChatEngine, SAMPLE_HISTORY, ACTIVE_AUTOMATIONS });
