// Shared message renderers for both UARC variations.
// Both variations consume the same chat-engine and render messages
// using CSS custom properties scoped to each artboard.

const { useEffect: useEffectM, useRef: useRefM } = React;

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
  return (
    <div>
      <AgentLabel />
      <div className="ua-receipt">
        <div className="ua-receipt-head">
          <div>
            <div className="ua-receipt-eyebrow">{m.title}</div>
            <div className="ua-receipt-title">
              <em>Sell</em> 4.2 ETH
              <div className="ua-receipt-sub">when ETH ≤ $2,000</div>
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
  return (
    <div>
      <AgentLabel />
      <div className="ua-sign">
        <div className="ua-sign-eyebrow">STEP 2 OF 2 · WALLET SIGNATURE</div>
        <div className="ua-sign-title">{m.title}</div>
        <div className="ua-sign-wallet">
          <span className="ua-sign-avatar" />
          <div>
            <div className="ua-sign-addr">{m.wallet}</div>
            <div className="ua-sign-hint">Arc wallet · Connected</div>
          </div>
        </div>
        <div className="ua-sign-msg">{m.message}</div>
        <div className="ua-sign-actions">
          <button className="ua-btn-primary" onClick={sign}>Sign in wallet</button>
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
    case 'chart': return <MsgChart m={m} />;
    case 'confirm-cta': return <MsgConfirmCTA confirm={engine.confirm} />;
    case 'sign': return <MsgSign m={m} sign={engine.sign} />;
    case 'tx-status': return <MsgTxStatus m={m} />;
    default: return <MsgText m={m} />;
  }
}

// ---------- Shared layout ----------
function HistoryPane({ mode, onToggleMode, variant }) {
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
        <span className="ua-side-avatar" />
        <div className="ua-side-wallet">
          <div className="ua-side-addr">0x9F2…c4A1</div>
          <div className="ua-side-net"><span className="ua-dot ua-dot-good" /> Connected · Arc</div>
        </div>
      </div>
    </aside>
  );
}

function ActivePane() {
  return (
    <aside className="ua-side ua-side-right">
      <div className="ua-active-head">
        <div>
          <div className="ua-side-label">ACTIVE</div>
          <div className="ua-active-count">3 automations</div>
        </div>
        <button className="ua-active-all">All</button>
      </div>

      <div className="ua-wallet-card">
        <div className="ua-wallet-eyebrow">WALLET BALANCE</div>
        <div className="ua-wallet-amount">
          $14,902<span className="ua-wallet-cents">.18</span>
        </div>
        <div className="ua-wallet-row">
          <span>4.21 ETH</span>
          <span>1,240 USDT</span>
          <span className="ua-wallet-delta">+2.1%</span>
        </div>
      </div>

      <div className="ua-auto-list">
        {window.ACTIVE_AUTOMATIONS.map(a => (
          <div key={a.id} className="ua-auto-card">
            <div className="ua-auto-head">
              <span className="ua-auto-name">{a.name}</span>
              <span className={`ua-status ua-status-${a.status === 'running' ? 'good' : a.status === 'armed' ? 'accent' : 'mute'}`}>
                <span className="ua-dot" /> {a.status.toUpperCase()}
              </span>
            </div>
            <div className="ua-auto-detail">{a.detail}</div>
            <div className="ua-auto-meta">
              <span>{a.trigger}</span>
              <span>{a.last}</span>
            </div>
            {a.progress > 0 && (
              <div className="ua-auto-bar">
                <div style={{ width: `${a.progress * 100}%` }} className={`ua-auto-bar-fill ua-bar-${a.status}`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

function ChatPane({ engine, variant }) {
  const scrollRef = useRefM(null);
  useEffectM(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [engine.messages.length]);

  const showHero = engine.messages.length <= 1;

  return (
    <main className="ua-chat">
      <div className="ua-topbar">
        <div className="ua-topbar-title">
          <span className="ua-topbar-name">Stop-loss for ETH at $2000</span>
          <span className="ua-topbar-meta">DRAFT · session #4821</span>
        </div>
        <div className="ua-topbar-bal">
          <span className="ua-bal-pill"><b>ETH</b> 4.2104 <i>$9,953</i></span>
          <span className="ua-bal-pill"><b>USDT</b> 1,240 <i>$1,240</i></span>
          <span className="ua-bal-pill is-accent"><b>ARC</b> 8,491 <i>$3,571</i></span>
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
