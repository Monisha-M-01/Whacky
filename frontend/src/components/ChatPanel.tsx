import { useState, useRef, useEffect } from 'react';
import type { ChatResponse, PendingAction, BlockedAlert, ToolCallResult } from '../api';
import { api } from '../api';

/* ── Quick-start chips ─────────────────────────────────────── */

const QUICK_PROMPTS = [
  'Check upcoming bills, add calendar reminder & draft Netflix cancellation',
  'Summarize my latest invoice email',
  'List my local receipts',
  'Check my schedule',
  'Read rent_receipt.pdf',
];

/* ── Types for chat history ────────────────────────────────── */

interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: ToolCallResult[];
  blockedAlerts?: BlockedAlert[];
  pendingActions?: PendingAction[];
}

/* ── Sub-components ────────────────────────────────────────── */

function ToolPill({ tc }: { tc: ToolCallResult }) {
  const color =
    tc.result_status === 'AUTO_ALLOWED'
      ? 'bg-safe/15 text-safe border border-safe/20'
      : tc.result_status === 'PENDING_APPROVAL'
      ? 'bg-pending/15 text-pending border border-pending/20'
      : tc.result_status === 'BLOCKED' || tc.result_status === 'BLOCKED_TAINT_FLOW'
      ? 'bg-danger/15 text-danger border border-danger/20'
      : 'bg-primary/15 text-primary-light border border-primary/20';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full ${color}`}>
      <span>{tc.server}.{tc.tool}</span>
      <span>•</span>
      <span className="font-bold">{tc.result_status}</span>
    </span>
  );
}

function ApprovalCard({
  pa,
  onApprove,
  onReject,
  busy,
}: {
  pa: PendingAction;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="border-2 border-pending/60 bg-pending/[0.08] rounded-xl p-3.5 my-2 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-pending text-base">✋</span>
          <h4 className="text-xs font-bold text-white">Action Paused — Your Approval Required</h4>
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold bg-pending/20 text-pending-light px-2 py-0.5 rounded-full">
          Irreversible Write Action
        </span>
      </div>

      {/* Privacy Shield Pill if PII was masked */}
      {pa.pii_masked && (
        <div className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold text-safe bg-safe/10 border border-safe/30 px-2.5 py-1 rounded-md">
          <span>🛡️</span>
          <span>Privacy Shield: {pa.redacted_count ?? 1} sensitive field{(pa.redacted_count ?? 1) > 1 ? 's' : ''} masked before drafting</span>
        </div>
      )}

      <pre className="text-xs text-slate-200 bg-navy/80 border border-navy-lighter rounded-lg p-3 mb-3 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
        {pa.diff_preview}
      </pre>
      <div className="flex gap-2">
        <button
          onClick={() => onApprove(pa.pending_id)}
          disabled={busy}
          className="flex-1 text-xs font-bold bg-safe hover:bg-safe-light text-white rounded-lg py-2 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
        >
          <span>✓</span> Approve & Execute
        </button>
        <button
          onClick={() => onReject(pa.pending_id)}
          disabled={busy}
          className="flex-1 text-xs font-bold bg-navy-lighter hover:bg-danger/20 text-slate-300 hover:text-danger-light border border-navy-lighter hover:border-danger/40 rounded-lg py-2 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <span>✕</span> Reject
        </button>
      </div>
    </div>
  );
}

function ThreatAlert({ alert }: { alert: BlockedAlert }) {
  return (
    <div className="border-2 border-danger/60 bg-danger/[0.08] rounded-xl p-3.5 my-2 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-danger text-base animate-pulse">🛑</span>
        <h4 className="text-xs font-bold text-danger-light">Threat Quarantined</h4>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-mono bg-danger/15 text-danger-light px-2 py-0.5 rounded text-[10px] font-semibold border border-danger/30">
          {alert.server ?? 'unknown'}.{alert.tool ?? 'unknown'}
        </span>
        {alert.provenance && (
          <span className="font-mono bg-navy/60 text-slate-300 px-2 py-0.5 rounded text-[10px] border border-navy-lighter">
            Source: {alert.provenance === 'untrusted_external_content' || alert.provenance === 'external_untrusted' ? 'Untrusted Email Body [TAINTED]' : alert.provenance}
          </span>
        )}
      </div>

      <p className="text-xs text-danger-light/95 leading-relaxed font-medium bg-danger/10 p-2.5 rounded-lg border border-danger/20 mb-2">
        {alert.reason}
      </p>

      {/* Visual Provenance Chain */}
      {alert.provenance_chain && alert.provenance_chain.length > 0 && (
        <div className="pt-2 border-t border-danger/20">
          <p className="text-[10px] font-bold uppercase tracking-wider text-danger-light/90 mb-1.5 flex items-center gap-1">
            <span>🔗</span> Deterministic Provenance Chain:
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 text-[10px] font-mono">
            {alert.provenance_chain.map((c, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <div className={`px-2 py-1 rounded border flex flex-col ${
                  idx === 0 ? 'bg-navy border-slate-600 text-slate-300' :
                  idx === 1 ? 'bg-amber-950/50 border-amber-500/40 text-amber-300' :
                  'bg-red-950/70 border-danger text-danger-light font-bold'
                }`}>
                  <span className="font-semibold text-[9px] uppercase opacity-75">{c.step}</span>
                  <span className="truncate max-w-[150px]" title={c.detail}>{c.detail}</span>
                </div>
                {idx < alert.provenance_chain!.length - 1 && (
                  <span className="text-slate-500 hidden sm:inline">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Chat Panel ───────────────────────────────────────── */

interface ChatPanelProps {
  onRefresh: () => void;
  killSwitchActive: boolean;
}

export default function ChatPanel({ onRefresh, killSwitchActive }: ChatPanelProps) {
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [killLoading, setKillLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const send = async (msg: string) => {
    if (!msg.trim() || sending) return;
    const userEntry: ChatEntry = { id: ++idRef.current, role: 'user', text: msg };
    setHistory((h) => [...h, userEntry]);
    setInput('');
    setSending(true);

    try {
      const res: ChatResponse = await api.chat(msg);
      const assistantEntry: ChatEntry = {
        id: ++idRef.current,
        role: 'assistant',
        text: res.reply,
        toolCalls: res.tool_calls,
        blockedAlerts: res.blocked_alerts,
        pendingActions: res.pending_actions,
      };
      setHistory((h) => [...h, assistantEntry]);
      onRefresh();
    } catch (err) {
      const errEntry: ChatEntry = {
        id: ++idRef.current,
        role: 'assistant',
        text: `❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
      setHistory((h) => [...h, errEntry]);
    } finally {
      setSending(false);
    }
  };

  const handleApprove = async (pendingId: string) => {
    setBusy(true);
    try {
      const res = await api.approve(pendingId);
      const entry: ChatEntry = {
        id: ++idRef.current,
        role: 'assistant',
        text: `✅ **Action Approved & Executed** (${res.status})`,
      };
      setHistory((h) => [...h, entry]);
      setHistory((h) =>
        h.map((e) => ({
          ...e,
          pendingActions: e.pendingActions?.filter((p) => p.pending_id !== pendingId),
        }))
      );
      onRefresh();
    } catch (err) {
      const entry: ChatEntry = {
        id: ++idRef.current,
        role: 'assistant',
        text: `❌ Approval failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
      setHistory((h) => [...h, entry]);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (pendingId: string) => {
    setBusy(true);
    try {
      await api.reject(pendingId);
      const entry: ChatEntry = {
        id: ++idRef.current,
        role: 'assistant',
        text: `🚫 **Action Rejected** — write operation was cancelled.`,
      };
      setHistory((h) => [...h, entry]);
      setHistory((h) =>
        h.map((e) => ({
          ...e,
          pendingActions: e.pendingActions?.filter((p) => p.pending_id !== pendingId),
        }))
      );
      onRefresh();
    } catch (err) {
      const entry: ChatEntry = {
        id: ++idRef.current,
        role: 'assistant',
        text: `❌ Reject failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
      setHistory((h) => [...h, entry]);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    setKillLoading(true);
    try {
      if (killSwitchActive) {
        await api.resetKillSwitch();
      } else {
        await api.activateKillSwitch();
      }
      onRefresh();
    } finally {
      setKillLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-3.5 pb-2.5 border-b border-navy-lighter/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <h2 className="text-sm font-bold text-white">SafePilot Everyday Assistant</h2>
          <span className="text-[11px] text-slate-400 hidden sm:inline">• Deterministic MCP Safety Host</span>
        </div>

        {/* Emergency Panic Kill Switch */}
        <button
          onClick={handleToggleKillSwitch}
          disabled={killLoading}
          className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 ${
            killSwitchActive
              ? 'bg-danger text-white border-danger shadow-md animate-pulse ring-2 ring-danger/40'
              : 'bg-navy border-danger/40 text-danger hover:bg-danger/10 hover:border-danger'
          }`}
          title={killSwitchActive ? 'Click to deactivate kill switch' : 'Emergency kill switch: instantly locks all MCP write operations to read_only'}
        >
          <span>{killSwitchActive ? '🚨' : '🔒'}</span>
          <span>{killLoading ? '...' : killSwitchActive ? 'All Writes Locked (Unlock)' : 'Lock All Writes'}</span>
        </button>
      </div>

      {/* Quick-start chips */}
      <div className="flex-shrink-0 px-5 py-2.5 flex flex-wrap gap-1.5 border-b border-white/[0.04] bg-white/[0.01]">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={sending}
            className="text-[11px] bg-primary/10 hover:bg-primary/20 text-primary-light border border-primary/25 hover:border-primary/50 rounded-full px-3 py-1 transition-all cursor-pointer disabled:opacity-40 text-left leading-snug"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat stream */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3.5">
        {history.length === 0 && (
          <div className="text-center pt-16">
            <p className="text-4xl mb-3">🛡️</p>
            <p className="text-slate-300 font-medium text-sm mb-1">Welcome to SafePilot</p>
            <p className="text-slate-400 text-xs max-w-md mx-auto">
              Your everyday personal admin assistant backed by a deterministic MCP Safety Gateway. Click any quick-start chip above or ask below.
            </p>
          </div>
        )}

        {history.map((entry) => (
          <div key={entry.id} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-3 ${
                entry.role === 'user'
                  ? 'bg-primary text-white rounded-br-md shadow-sm'
                  : 'bg-white/[0.05] border border-white/[0.06] text-slate-200 rounded-bl-md'
              }`}
            >
              {/* Tool pills */}
              {entry.toolCalls && entry.toolCalls.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {entry.toolCalls.map((tc, i) => (
                    <ToolPill key={i} tc={tc} />
                  ))}
                </div>
              )}

              {/* Message text */}
              <div className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                {entry.text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                  part.startsWith('**') && part.endsWith('**') ? (
                    <strong key={i} className="font-bold text-white">
                      {part.slice(2, -2)}
                    </strong>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </div>

              {/* Blocked alerts */}
              {entry.blockedAlerts?.map((alert, i) => (
                <ThreatAlert key={`alert-${i}`} alert={alert} />
              ))}

              {/* Pending approval cards */}
              {entry.pendingActions?.map((pa) => (
                <ApprovalCard
                  key={pa.pending_id}
                  pa={pa}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  busy={busy}
                />
              ))}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 px-5 py-3 border-t border-navy-lighter bg-navy-light/40">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask SafePilot (e.g., 'check my bills and cancel Netflix')…"
            disabled={sending}
            className="flex-1 bg-navy border border-navy-lighter rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none focus:border-primary transition-colors"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-primary hover:bg-primary-light text-white rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-40"
          >
            {sending ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
}
