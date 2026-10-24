import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchHealth,
  fetchOllamaStatus,
  fetchAgentStatus,
  runAgentTask,
} from "./api";

// ── Small SVG icons (inline, no external dependency) ────────────────────────

const IconAgent = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 8v4l3 3"/>
  </svg>
);

const IconHistory = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/>
    <path d="M3.51 15a9 9 0 1 0 .49-3.59"/>
  </svg>
);

const IconBrowser = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/>
  </svg>
);

const IconClear = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
  </svg>
);

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"/>
  </svg>
);

const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const IconX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconInfo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
);

// ── Constants ────────────────────────────────────────────────────────────────

const EXAMPLE_TASKS = [
  "Open https://example.com and tell me the page title",
  "Go to https://httpbin.org/get and show me the response",
  "Open https://example.com, get its full text content",
  "What is the page title of https://neverssl.com?",
];

// ── Status helpers ────────────────────────────────────────────────────────────

function StatusDot({ state }) {
  // state: 'online' | 'offline' | 'unknown' | 'pulse'
  return <span className={`status-dot ${state}`} />;
}

function AgentBadge({ status }) {
  const label = status === "idle" ? "Idle"
    : status === "running" ? "Running…"
    : status === "completed" ? "Completed"
    : status === "failed" ? "Failed"
    : "Idle";
  return (
    <span className={`agent-badge ${status || "idle"}`}>
      {status === "running" && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />}
      {label}
    </span>
  );
}

// ── Trace Step ────────────────────────────────────────────────────────────────

function TraceStep({ step }) {
  const isOk = step.status === "success";
  const result = step.result;

  let detailText = "";
  if (isOk && result) {
    if (result.url)     detailText += `→ ${result.url}`;
    if (result.title)   detailText += `  "${result.title}"`;
    if (result.status)  detailText += `  (HTTP ${result.status})`;
    if (result.content) detailText += `  ${result.content.slice(0, 80)}…`;
    if (result.message) detailText += `  ${result.message}`;
  } else if (!isOk) {
    detailText = step.error || "Unknown error";
  }

  const argStr = step.args
    ? Object.entries(step.args)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ")
    : "";

  return (
    <div className={`trace-step ${step.status}`}>
      <span className="trace-step-num">#{step.step}</span>
      <span className="trace-tool">{step.tool}</span>
      <span className="trace-detail">
        {argStr && <span style={{ color: "var(--text-muted)", marginRight: 6 }}>{argStr}</span>}
        {isOk
          ? <span className="result-ok">{detailText || "OK"}</span>
          : <span className="result-err">{detailText}</span>
        }
        {step.durationMs !== undefined && (
          <span style={{ color: "var(--text-muted)", marginLeft: 6, fontSize: 10 }}>
            {step.durationMs}ms
          </span>
        )}
      </span>
    </div>
  );
}

// ── Sidebar Status Rows ───────────────────────────────────────────────────────

function SidebarStatus({ health, ollama }) {
  const backendOk = health?.status === "ok";
  const ollamaOk  = ollama?.status === "ok";
  const modelReady = Boolean(ollama?.modelReady);
  const activeModel = ollama?.activeModel || (modelReady ? ollama?.models?.[0]?.name : null);
  const requiredModel = ollama?.requiredModel || "qwen2.5:7b";

  let ollamaDot = "offline";
  let ollamaText = "Ollama offline";
  if (ollamaOk && modelReady) {
    ollamaDot = "online";
    ollamaText = "Ollama online";
  } else if (ollamaOk && !modelReady) {
    ollamaDot = "pulse";
    ollamaText = ollama?.reason === "no_models_available" ? "Ollama (no models)" : "Ollama (model missing)";
  }

  return (
    <div className="sidebar-status">
      <div className="status-row">
        <StatusDot state={backendOk ? "online" : "offline"} />
        <span>Backend {backendOk ? "online" : "offline"}</span>
      </div>
      <div className="status-row">
        <StatusDot state={ollamaDot} />
        <span>{ollamaText}</span>
      </div>
      {modelReady && activeModel && (
        <div className="status-row">
          <StatusDot state="online" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{activeModel}</span>
        </div>
      )}
      {ollamaOk && !modelReady && (
        <div className="status-row">
          <StatusDot state="pulse" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--amber)" }}>
            Needs {requiredModel}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

const MAX_HISTORY = 8;

export default function App() {
  const [page, setPage] = useState("agent"); // 'agent' | 'history'

  // System status
  const [health, setHealth]   = useState(null);
  const [ollama, setOllama]   = useState(null);
  const [statusErr, setStatusErr] = useState(null);

  // Task state
  const [task, setTask]       = useState("");
  const [running, setRunning] = useState(false);
  const [agentStatus, setAgentStatus] = useState("idle"); // idle | running | completed | failed
  const [result, setResult]   = useState(null); // last agent result
  const [error, setError]     = useState(null);

  // History (session-only)
  const [history, setHistory] = useState([]);

  const textareaRef = useRef(null);

  // ── System status polling (every 10s) ──
  const pollStatus = useCallback(async () => {
    try {
      const [h, o] = await Promise.all([fetchHealth(), fetchOllamaStatus()]);
      setHealth(h);
      setOllama(o);
      setStatusErr(null);
    } catch (err) {
      setStatusErr(err.message);
      setHealth(null);
      setOllama(null);
    }
  }, []);

  useEffect(() => {
    pollStatus();
    const id = setInterval(pollStatus, 10000);
    return () => clearInterval(id);
  }, [pollStatus]);

  // ── Run task ──
  const handleRun = useCallback(async () => {
    const trimmed = task.trim();
    if (!trimmed || running) return;

    setRunning(true);
    setAgentStatus("running");
    setResult(null);
    setError(null);

    try {
      const res = await runAgentTask(trimmed);
      const data = res.data || res;
      setResult(data);
      setAgentStatus(data.status === "completed" ? "completed" : "failed");
      setHistory((h) => [
        { task: trimmed, status: data.status, finalAnswer: data.finalAnswer, trace: data.trace, durationMs: data.durationMs, ts: Date.now() },
        ...h.slice(0, MAX_HISTORY - 1),
      ]);
    } catch (err) {
      setError(err.message);
      setAgentStatus("failed");
    } finally {
      setRunning(false);
    }
  }, [task, running]);

  const handleClear = () => {
    setTask("");
    setResult(null);
    setError(null);
    setAgentStatus("idle");
    textareaRef.current?.focus();
  };

  const insertExample = (ex) => {
    setTask(ex);
    textareaRef.current?.focus();
  };

  // Keyboard shortcut: Ctrl+Enter to run
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleRun();
    }
  };

  // ── Render ──
  return (
    <div className="app">
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">
          <h1>WebPilot AI</h1>
          <div className="brand-sub">Browser Agent</div>
        </div>

        <div className="sidebar-nav">
          <button
            className={`nav-item ${page === "agent" ? "active" : ""}`}
            onClick={() => setPage("agent")}
          >
            <IconAgent />
            Task Runner
          </button>
          <button
            className={`nav-item ${page === "history" ? "active" : ""}`}
            onClick={() => setPage("history")}
          >
            <IconHistory />
            History
            {history.length > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 10, background: "var(--accent-dim)", color: "var(--accent)", padding: "1px 6px", borderRadius: 10 }}>
                {history.length}
              </span>
            )}
          </button>
          <button className="nav-item" disabled style={{ cursor: "not-allowed", opacity: 0.4 }}>
            <IconBrowser />
            Browser View
          </button>
        </div>

        <SidebarStatus health={health} ollama={ollama} />
      </nav>

      {/* Main */}
      <div className="main">
        {/* Topbar */}
        <div className="topbar">
          <span className="topbar-title">
            {page === "agent" ? "Task Runner" : "Session History"}
          </span>
          <AgentBadge status={agentStatus} />
        </div>

        {/* Content */}
        <div className="content">
          {statusErr && (
            <div className="error-banner">
              <strong>Backend unreachable:</strong> {statusErr}. Make sure the backend server is running on port 3001.
            </div>
          )}

          {page === "agent" && (
            <AgentPage
              task={task}
              setTask={setTask}
              running={running}
              result={result}
              error={error}
              agentStatus={agentStatus}
              handleRun={handleRun}
              handleClear={handleClear}
              handleKeyDown={handleKeyDown}
              insertExample={insertExample}
              textareaRef={textareaRef}
              health={health}
              ollama={ollama}
            />
          )}

          {page === "history" && (
            <HistoryPage
              history={history}
              onSelect={(item) => { insertExample(item.task); setPage("agent"); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Agent Page ────────────────────────────────────────────────────────────────

function AgentPage({ task, setTask, running, result, error, agentStatus, handleRun, handleClear, handleKeyDown, insertExample, textareaRef, health, ollama }) {
  const backendDown = health?.status !== "ok";
  const ollamaDown  = ollama?.status !== "ok";
  const modelMissing = !ollamaDown && ollama?.modelReady !== true;
  const canRun = task.trim().length > 0 && !running && !backendDown && !ollamaDown && !modelMissing;

  return (
    <>
      {/* Task Input */}
      <div className="card">
        <div className="card-title">Natural Language Task</div>

        {backendDown && !running && (
          <div className="error-banner" style={{ marginBottom: 12 }}>
            Backend is not reachable. Start the backend server and try again.
          </div>
        )}
        {!backendDown && ollamaDown && !running && (
          <div className="error-banner" style={{ marginBottom: 12, borderColor: "var(--amber)", background: "var(--amber-dim)", color: "var(--amber)" }}>
            Ollama is offline. Start Ollama with <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>ollama serve</code> and reload.
          </div>
        )}
        {!backendDown && !ollamaDown && modelMissing && !running && (
          <div className="error-banner" style={{ marginBottom: 12, borderColor: "var(--amber)", background: "var(--amber-dim)", color: "var(--amber)" }}>
            <strong>Model not ready:</strong> {ollama?.message || `Required model "${ollama?.requiredModel || "qwen2.5:7b"}" is not loaded.`}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="task-textarea"
          placeholder="Describe what you want the browser agent to do…"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={running}
          maxLength={2000}
          aria-label="Task description"
          id="task-input"
        />

        <div className="task-actions">
          <span className="examples-label">Try:</span>
          <div className="examples-list">
            {EXAMPLE_TASKS.map((ex) => (
              <button
                key={ex}
                className="example-chip"
                onClick={() => insertExample(ex)}
                disabled={running}
                title={ex}
              >
                {ex.length > 42 ? ex.slice(0, 42) + "…" : ex}
              </button>
            ))}
          </div>

          <div className="btn-group">
            {(result || error) && !running && (
              <button className="btn btn-ghost" onClick={handleClear} id="clear-btn">
                <IconClear /> Clear
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleRun}
              disabled={!canRun}
              id="run-btn"
              title="Ctrl+Enter"
            >
              {running ? <span className="spinner" /> : <IconPlay />}
              {running ? "Running…" : "Run Task"}
            </button>
          </div>
        </div>

        {task.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
            {task.length}/2000 chars · Ctrl+Enter to run
          </div>
        )}
      </div>

      {/* Running progress */}
      {running && (
        <div className="card">
          <div className="card-title">Executing</div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" />
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            Agent is thinking and navigating… On local CPU this may take 30–90 seconds.
          </div>
        </div>
      )}

      {/* Error */}
      {error && !running && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results */}
      {result && !running && (
        <>
          {/* Final Answer */}
          <div className="card">
            <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {result.status === "completed"
                ? <><IconCheck /> Final Answer</>
                : <><IconX /> Task {result.status}</>
              }
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
                {result.toolExecutionCount} tool{result.toolExecutionCount !== 1 ? "s" : ""} · {result.durationMs}ms
              </span>
            </div>
            {result.finalAnswer
              ? <div className="answer-box">{result.finalAnswer}</div>
              : <div className="empty-state"><IconInfo /> No final answer returned.</div>
            }
          </div>

          {/* Execution Trace */}
          {result.trace && result.trace.length > 0 && (
            <div className="card">
              <div className="card-title">Execution Trace</div>
              <div className="trace-list">
                {result.trace.map((step) => (
                  <TraceStep key={step.step} step={step} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!result && !error && !running && (
        <div className="empty-state" style={{ flex: 1, justifyContent: "center" }}>
          <IconAgent />
          <p>Enter a task above and click <strong>Run Task</strong> to start the agent.</p>
          <p style={{ fontSize: 11 }}>The agent will choose browser tools, execute them and return a final answer.</p>
        </div>
      )}
    </>
  );
}

// ── History Page ──────────────────────────────────────────────────────────────

function HistoryPage({ history, onSelect }) {
  if (history.length === 0) {
    return (
      <div className="empty-state" style={{ flex: 1, justifyContent: "center" }}>
        <IconHistory />
        <p>No tasks run yet in this session.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">Recent Tasks ({history.length})</div>
      <div className="history-list">
        {history.map((item) => (
          <button
            key={item.ts}
            className="history-item"
            onClick={() => onSelect(item)}
            title="Click to rerun this task"
          >
            <span className={`status-dot ${item.status === "completed" ? "online" : "offline"}`} />
            <span className="history-task">{item.task}</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
              {item.durationMs ? `${(item.durationMs / 1000).toFixed(1)}s` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
