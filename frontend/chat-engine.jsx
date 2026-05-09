// Shared chat engine for UARC variations
const { useState, useEffect, useRef, useCallback } = React;

const UARC_API_BASE = window.UARC_API_BASE || (window.location.port === '5173' ? 'http://127.0.0.1:3000' : '');


const INITIAL_MESSAGES = [
  { id: 'm0', role: 'assistant', kind: 'greeting', content: "Hey! I'm UARC, your blockchain automation assistant. I can help you set up automated transfers, recurring payments, price alerts, and more. What would you like to do?",
    suggestions: [
      'Send 50 USDC to 0x123... weekly for 4 weeks',
      'Pay 100 USDT monthly to my friend',
      'What can you help me with?',
    ] },
];

const TASK_FACTORY_ABI = [
  'function createTaskWithTokens(tuple(uint256 expiresAt,uint256 maxExecutions,uint256 recurringInterval,uint256 rewardPerExecution,bytes32 seedCommitment) taskParams, tuple(bytes4 selector,address protocol,bytes params)[] actions, tuple(address token,uint256 amount)[] deposits) payable returns (uint256 taskId,address taskCore,address taskVault)',
  'event TaskCreated(uint256 indexed taskId,address indexed creator,address indexed taskCore,address taskVault,uint256 rewardPerExecution,uint256 maxExecutions)',
];
const ERC20_APPROVE_ABI = [
  'function approve(address spender,uint256 amount) returns (bool)',
];

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
  // Stores the backend-built preview so confirm() can submit it
  const [pendingPreview, setPendingPreview] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Session ID for chat history persistence
  const [sessionId, setSessionId] = useState(() => {
    // Try to restore session from localStorage
    const stored = localStorage.getItem('uarc_session_id');
    return stored || `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  });
  const idRef = useRef(1);
  const nextId = () => `m${idRef.current++}`;

  // Persist session ID
  useEffect(() => {
    localStorage.setItem('uarc_session_id', sessionId);
  }, [sessionId]);

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

  const normalizeServerMessage = useCallback((message) => ({
    ...message,
    id: nextId(),
    calendarData: message.calendarData?.map(item => ({
      ...item,
      date: item.date ? new Date(item.date) : new Date(item.isoDate || item.timestamp * 1000),
    })),
  }), []);

  const renderServerMessages = useCallback((serverMessages) => {
    const rendered = (serverMessages || []).map(normalizeServerMessage);
    if (!rendered.length) return;
    setMessages(cur => [
      ...cur.filter(m => m.kind !== 'thinking'),
      ...rendered,
    ]);
  }, [normalizeServerMessage]);


  const loadChatHistory = useCallback(async (targetSessionId) => {
    if (!targetSessionId) return false;
    const res = await fetch(`${UARC_API_BASE}/chat/history?sessionId=${encodeURIComponent(targetSessionId)}`);
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.messages?.length) return false;

    const loadedMessages = data.messages.map((m, i) => ({
      id: `loaded_${i}`,
      role: m.role,
      kind: m.kind === 'automation-intent' ? 'text' : (m.kind || 'text'),
      content: m.content,
    }));
    if (loadedMessages[0]?.role !== 'assistant') loadedMessages.unshift(INITIAL_MESSAGES[0]);
    setMessages(loadedMessages);
    idRef.current = loadedMessages.length + 1;
    return true;
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!wallet.address) {
      setChatSessions([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch(`${UARC_API_BASE}/chat/sessions?userAddress=${encodeURIComponent(wallet.address)}&limit=30`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setChatSessions(data.sessions || []);
    } catch (err) {
      console.log('[Chat] Could not load sessions:', err.message);
      setChatSessions([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [wallet.address]);

  const loadSession = useCallback(async (targetSessionId) => {
    if (!targetSessionId || targetSessionId === sessionId) return;
    setBusy(true);
    try {
      const loaded = await loadChatHistory(targetSessionId);
      if (loaded) {
        setSessionId(targetSessionId);
        localStorage.setItem('uarc_session_id', targetSessionId);
        setPendingPreview(null);
      }
    } catch (err) {
      console.log('[Chat] Could not switch sessions:', err.message);
    } finally {
      setBusy(false);
    }
  }, [loadChatHistory, sessionId]);

  const send = useCallback(async (text) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || busy) return;
    setInput('');
    setBusy(true);
    setMessages(cur => [
      ...cur,
      { id: nextId(), role: 'user', kind: 'text', content: trimmed },
      { id: nextId(), role: 'assistant', kind: 'thinking', content: 'Thinking...' },
    ]);

    try {
      const res = await fetch(`${UARC_API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          sessionId,
          userAddress: wallet.address,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);

      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
      }

      if (data.pendingPreview?.payload) {
        setPendingPreview(data.pendingPreview);
      }

      if (data.messages?.length) {
        renderServerMessages(data.messages);
      } else {
        renderServerMessages([{
          role: 'assistant',
          kind: 'text',
          content: data.message || 'I received your message, but the backend did not return a renderable response.',
          suggestions: data.suggestions,
        }]);
      }
      refreshSessions();
    } catch (err) {
      console.error('[Chat] API error:', err);
      setMessages(cur => [
        ...cur.filter(m => m.kind !== 'thinking'),
        { id: nextId(), role: 'assistant', kind: 'text', content: `The UARC backend is unavailable: ${err.message}` },
      ]);
    }

    setBusy(false);
  }, [input, busy, wallet.address, sessionId, renderServerMessages, refreshSessions]);

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
    setPendingPreview(null);
    // Create new session
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    setSessionId(newSessionId);
    localStorage.setItem('uarc_session_id', newSessionId);
  }, []);

  // Load chat history on mount (if session exists)
  useEffect(() => {
    loadChatHistory(sessionId).catch(err => {
      console.log('[Chat] Could not load history:', err.message);
    });
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions, sessionId]);

  return { messages, input, setInput, send, confirm, sign, reset, busy, sessionId, chatSessions, historyLoading, loadSession, refreshSessions };
}

Object.assign(window, { useChatEngine });
