import { useState, useRef, useEffect } from 'react';
import type { ChatResponse, PendingAction, BlockedAlert, ToolCallResult } from '../api';
import { api } from '../api';
import { Mail, Calendar, FileText, Folder, Send, Check, X, ShieldAlert, Sparkles, Clock, AlertTriangle } from './Icons';

interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: ToolCallResult[];
  blockedAlerts?: BlockedAlert[];
  pendingActions?: PendingAction[];
}

const STARTER_CARDS = [
  {
    title: 'Check bills & set reminders',
    subtitle: 'Finds due bills, drafts reminders',
    prompt: 'Check upcoming bills, add calendar reminder & draft Netflix cancellation',
    icon: <Calendar size={18} className="text-[#3B82F6]" />,
  },
  {
    title: 'Summarize my latest invoice',
    subtitle: 'Reads it safely, flags anything odd',
    prompt: 'Summarize my latest invoice email',
    icon: <FileText size={18} className="text-[#3B82F6]" />,
  },
  {
    title: 'Organize my receipts',
    subtitle: 'Sorts local receipts, hides personal data',
    prompt: 'Read rent_receipt.pdf',
    icon: <Folder size={18} className="text-[#3B82F6]" />,
  },
];

/* ── Decision Chips ────────────────────────────────────────── */

function DecisionChip({ tc }: { tc: ToolCallResult }) {
  if (tc.result_status === 'AUTO_ALLOWED') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2.5 py-0.5 rounded-full">
        <span>✓</span>
        <span>Read allowed</span>
        <span className="text-[#22C55E]/70 font-mono-code text-[10px]">({tc.server}.{tc.tool})</span>
      </span>
    );
  }
  if (tc.result_status === 'PENDING_APPROVAL') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/25 px-2.5 py-0.5 rounded-full">
        <span>⏸</span>
        <span>Awaiting approval</span>
        <span className="text-[#F59E0B]/70 font-mono-code text-[10px]">({tc.server}.{tc.tool})</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/25 px-2.5 py-0.5 rounded-full">
      <span>✕</span>
      <span>Blocked</span>
      <span className="text-[#EF4444]/70 font-mono-code text-[10px]">({tc.server}.{tc.tool})</span>
    </span>
  );
}

/* ── Hero Approval Card ────────────────────────────────────── */

function HeroApprovalCard({
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
    <div className="my-3 p-4 rounded-[12px] bg-[#162238] border-2 border-[#F59E0B]/60 shadow-lg transition-all animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#F59E0B]/15 flex items-center justify-center text-[#F59E0B]">
            <Clock size={14} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[#E6EAF2]">
              Action Paused — Your Approval Required
            </h4>
            <p className="text-[11px] text-[#94A3B8]">
              SafePilot halted execution until you explicitly authorize this change
            </p>
          </div>
        </div>

        {/* Risk Badge */}
        <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30 flex items-center gap-1">
          <AlertTriangle size={11} />
          <span>Irreversible Write Action</span>
        </span>
      </div>

      {/* Provenance Context / Plain English Reason */}
      <div className="mb-3 px-3 py-2 rounded-lg bg-[#0B1220]/70 border border-[#1F2A44] text-[12px] text-[#CBD5E1]">
        <strong className="text-[#E6EAF2] font-medium">Why was this paused? </strong>
        Modifying external state ({pa.tool_name.replace('_', ' ')}) requires personal consent.
        {pa.pii_masked ? (
          <span className="text-[#22C55E] block mt-1 font-medium">
            ✓ Privacy Shield active: {pa.redacted_count ?? 1} sensitive field(s) masked before drafting.
          </span>
        ) : (
          <span className="text-[#94A3B8] block mt-1">
            Origin: Direct user instruction. No untrusted external overrides detected.
          </span>
        )}
      </div>

      {/* Diff Preview Box */}
      <div className="mb-3.5">
        <div className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">
          Pending Action Preview
        </div>
        <pre className="text-[12px] text-[#E6EAF2] bg-[#0B1220] border border-[#1F2A44] rounded-lg p-3 whitespace-pre-wrap font-mono-code leading-relaxed max-h-48 overflow-y-auto">
          {pa.diff_preview}
        </pre>
      </div>

      {/* Big Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onApprove(pa.pending_id)}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#22C55E] hover:bg-[#16A34A] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          <Check size={14} />
          <span>Approve & Execute</span>
        </button>
        <button
          onClick={() => onReject(pa.pending_id)}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#1F2A44] hover:bg-[#2A3B5E] text-[#E6EAF2] hover:text-white text-xs font-semibold border border-[#2D3D60] transition-all cursor-pointer disabled:opacity-50"
        >
          <X size={14} />
          <span>Deny & Cancel</span>
        </button>
      </div>
    </div>
  );
}

/* ── Threat Quarantined Card ───────────────────────────────── */

function ThreatAlertCard({ alert }: { alert: BlockedAlert }) {
  return (
    <div className="my-3 p-4 rounded-[12px] bg-[#EF4444]/10 border-2 border-[#EF4444]/50 shadow-md">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert size={18} className="text-[#EF4444]" />
        <h4 className="text-xs font-bold text-[#EF4444] uppercase tracking-wider">
          Threat Quarantined & Blocked
        </h4>
      </div>

      <div className="text-xs text-[#E6EAF2] bg-[#0B1220]/70 p-2.5 rounded-lg border border-[#EF4444]/20 mb-2.5">
        {alert.reason}
      </div>

      {/* Visual Provenance Chain */}
      {alert.provenance_chain && alert.provenance_chain.length > 0 && (
        <div className="pt-2 border-t border-[#EF4444]/20">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#EF4444]/90 mb-1.5">
            Deterministic Provenance Chain:
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 text-[10px] font-mono-code">
            {alert.provenance_chain.map((c, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <div
                  className={`px-2.5 py-1.5 rounded-md border flex flex-col ${
                    idx === 0
                      ? 'bg-[#0B1220] border-[#1F2A44] text-[#8B97B1]'
                      : idx === 1
                      ? 'bg-[#F59E0B]/10 border-[#F59E0B]/30 text-[#F59E0B]'
                      : 'bg-[#EF4444]/20 border-[#EF4444]/60 text-[#EF4444] font-bold'
                  }`}
                >
                  <span className="font-semibold text-[9px] uppercase opacity-75">{c.step}</span>
                  <span className="truncate max-w-[140px]" title={c.detail}>
                    {c.detail}
                  </span>
                </div>
                {idx < alert.provenance_chain!.length - 1 && (
                  <span className="text-[#64748B] hidden sm:inline">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Chat Component ───────────────────────────────────── */

interface ChatPanelProps {
  onRefresh: () => void;
}

export default function ChatPanel({ onRefresh }: ChatPanelProps) {
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, sending]);

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
        text: `Error connecting to gateway: ${err instanceof Error ? err.message : 'Unknown error'}`,
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
        text: `Action approved and executed successfully (${res.status}).`,
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
        text: `Approval failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
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
        text: `Action denied. The write operation was safely discarded.`,
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
        text: `Deny failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
      setHistory((h) => [...h, entry]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-[#0B1220] overflow-hidden">
      {/* Messages Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
        {history.length === 0 ? (
          /* Empty / Welcome State with 3 Starter Cards */
          <div className="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-[#111A2B] border border-[#1F2A44] flex items-center justify-center text-[#3B82F6] mb-3 shadow-sm">
              <Sparkles size={24} />
            </div>
            <h3 className="text-base font-semibold text-[#E6EAF2] mb-1">
              What can SafePilot do for you today?
            </h3>
            <p className="text-xs text-[#94A3B8] mb-6 max-w-md">
              Every action is checked by a safety gateway before it runs.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
              {STARTER_CARDS.map((card, i) => (
                <button
                  key={i}
                  onClick={() => send(card.prompt)}
                  disabled={sending}
                  className="flex flex-col items-start p-3.5 rounded-[12px] bg-[#111A2B] hover:bg-[#162238] border border-[#1F2A44] hover:border-[#3B82F6]/50 text-left transition-all cursor-pointer group shadow-xs"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#0B1220] border border-[#1F2A44] flex items-center justify-center mb-2.5 group-hover:border-[#3B82F6]/40 transition-colors">
                    {card.icon}
                  </div>
                  <h4 className="text-xs font-semibold text-[#E6EAF2] mb-1 leading-snug">
                    {card.title}
                  </h4>
                  <p className="text-[11px] text-[#94A3B8] leading-tight line-clamp-2">
                    {card.subtitle}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          history.map((entry) => (
            <div
              key={entry.id}
              className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-[12px] px-4 py-3 ${
                  entry.role === 'user'
                    ? 'bg-[#3B82F6] text-white shadow-sm'
                    : 'bg-[#111A2B] border border-[#1F2A44] text-[#E6EAF2]'
                }`}
              >
                {/* Decision Chips under Assistant Action */}
                {entry.toolCalls && entry.toolCalls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {entry.toolCalls.map((tc, idx) => (
                      <DecisionChip key={idx} tc={tc} />
                    ))}
                  </div>
                )}

                {/* Message Prose */}
                <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
                  {entry.text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                    part.startsWith('**') && part.endsWith('**') ? (
                      <strong key={i} className="font-semibold text-white">
                        {part.slice(2, -2)}
                      </strong>
                    ) : (
                      <span key={i}>{part}</span>
                    )
                  )}
                </div>

                {/* Inline Threat Alerts */}
                {entry.blockedAlerts?.map((alert, idx) => (
                  <ThreatAlertCard key={`threat-${idx}`} alert={alert} />
                ))}

                {/* Inline Hero Approval Cards */}
                {entry.pendingActions?.map((pa) => (
                  <HeroApprovalCard
                    key={pa.pending_id}
                    pa={pa}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    busy={busy}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-[12px] px-4 py-3 bg-[#111A2B] border border-[#1F2A44] flex items-center gap-1.5 text-xs text-[#8B97B1]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#3B82F6] animate-bounce [animation-delay:300ms]" />
              <span className="ml-1 text-[11px]">SafePilot is verifying policy rules...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Bar */}
      <div className="flex-shrink-0 px-6 py-3.5 border-t border-[#1F2A44] bg-[#111A2B]/70">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 max-w-4xl mx-auto"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask SafePilot to check bills, organize files, or schedule events..."
            disabled={sending}
            className="flex-1 bg-[#0B1220] border border-[#1F2A44] rounded-[10px] px-3.5 py-2.5 text-xs text-[#E6EAF2] placeholder:text-[#64748B] outline-none focus:border-[#3B82F6] transition-colors"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-[10px] px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
