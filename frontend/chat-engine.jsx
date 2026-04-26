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
    await runFlow(buildAgentFlow(trimmed));
    setBusy(false);
  }, [input, busy, runFlow]);

  const confirm = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessages(cur => [...cur, { id: nextId(), role: 'user', kind: 'text', content: 'Confirm' }]);
    await runFlow(buildSignFlow());
    setBusy(false);
  }, [busy, runFlow]);

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
  }, []);

  return { messages, input, setInput, send, confirm, sign, reset, busy };
}

Object.assign(window, { useChatEngine, SAMPLE_HISTORY, ACTIVE_AUTOMATIONS });
