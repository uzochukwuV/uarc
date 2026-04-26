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
];

const INITIAL_MESSAGES = [
  { id: 'm0', role: 'assistant', kind: 'greeting', content: 'What should I automate today?',
    suggestions: [
      'Stop-loss sell my ETH at $2,000 → USDT',
      'DCA $100 into ARC every Friday',
      'Auto-claim staking rewards weekly',
    ] },
];

const ADAPTER_LABELS = {
  time_based_transfer: 'Scheduled Transfer',
  cctp_bridge: 'Cross-chain Bridge',
  stork_price_transfer: 'Price-triggered Transfer',
};

const DOMAIN_NAMES = { 0: 'Ethereum', 1: 'Avalanche', 2: 'OP Mainnet', 3: 'Arbitrum', 6: 'Base' };

function buildReceiptLines(data) {
  const { adapterType, params } = data;
  const fmt6 = (v) => (Number(v) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });
  const fmtAddr = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';
  const fmtTs = (ts) => ts ? new Date(Number(ts) * 1000).toLocaleString() : '—';

  switch (adapterType) {
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

function buildAgentFlow(text) {
  const l = (text || '').toLowerCase();
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

function useChatEngine() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Stores the parsed preview from /task/preview so confirm() can submit it
  const [pendingIntent, setPendingIntent] = useState(null);
  const idRef = useRef(1);
  const nextId = () => `m${idRef.current++}`;

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

  const send = useCallback(async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || busy) return;
    setInput('');
    setBusy(true);
    setMessages(cur => [...cur, { id: nextId(), role: 'user', kind: 'text', content: trimmed }]);

    try {
      setMessages(cur => [...cur, { id: nextId(), role: 'assistant', kind: 'thinking', content: 'Reading wallet · Parsing intent · Building task' }]);

      const res = await fetch('/task/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: trimmed }),
        signal: AbortSignal.timeout(20000),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      const lines = buildReceiptLines(data);
      const label = ADAPTER_LABELS[data.adapterType] || data.adapterType;

      // Store intent string so confirm() can submit it
      setPendingIntent(trimmed);

      setMessages(cur => [
        ...cur.slice(0, -1), // remove thinking
        { id: nextId(), role: 'assistant', kind: 'text', content: `Got it — ${data.summary}. Here's the task to review before deploying.` },
        { id: nextId(), role: 'assistant', kind: 'receipt', title: `New automation · ${label}`,
          lines,
          footnote: `Adapter: ${data.adapterType} · Arc Testnet` },
        { id: nextId(), role: 'assistant', kind: 'confirm-cta' },
      ]);
    } catch (_err) {
      // API unavailable — fall back to local demo flow
      setMessages(cur => cur.filter(m => m.kind !== 'thinking'));
      await runFlow(buildAgentFlow(trimmed));
    }

    setBusy(false);
  }, [input, busy, runFlow]);

  const confirm = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessages(cur => [...cur, { id: nextId(), role: 'user', kind: 'text', content: 'Confirm' }]);

    if (pendingIntent) {
      // Real API: submit the task on-chain
      try {
        setMessages(cur => [...cur, { id: nextId(), role: 'assistant', kind: 'thinking', content: 'Deploying automation on-chain…' }]);

        const res = await fetch('/task/create-from-prompt', {
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
  }, []);

  return { messages, input, setInput, send, confirm, sign, reset, busy };
}

Object.assign(window, { useChatEngine, SAMPLE_HISTORY, ACTIVE_AUTOMATIONS });
