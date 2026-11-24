import type { AuditEntry } from '../api';

const DECISION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  AUTO_ALLOWED: { bg: 'bg-safe/15', text: 'text-safe', label: 'AUTO-ALLOWED' },
  APPROVED: { bg: 'bg-safe/15', text: 'text-safe-light', label: 'APPROVED' },
  REJECTED: { bg: 'bg-slate-700/40', text: 'text-slate-400', label: 'REJECTED' },
  BLOCKED: { bg: 'bg-danger/15', text: 'text-danger', label: 'BLOCKED' },
  BLOCKED_TAINT_FLOW: { bg: 'bg-purple-950/60 border border-purple-500/40', text: 'text-purple-300 font-bold', label: 'TAINT-BLOCKED' },
  KILL_SWITCH_ACTIVATED: { bg: 'bg-danger text-white animate-pulse', text: 'text-white font-bold', label: 'KILL-SWITCH' },
  PENDING_APPROVAL: { bg: 'bg-pending/15', text: 'text-pending', label: 'PENDING' },
};

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return ts;
  }
}

interface AuditPassbookProps {
  entries: AuditEntry[];
}

export default function AuditPassbook({ entries }: AuditPassbookProps) {
  const reversed = [...entries].reverse();
  const latencies = entries.map((e) => e.latency_ms).filter((l) => l > 0);
  const avgLatency = latencies.length > 0 ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) : '—';

  return (
    <aside className="w-72 xl:w-80 flex-shrink-0 bg-navy-light border-l border-navy-lighter flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2.5 border-b border-navy-lighter/60">
        <h2 className="text-xs font-bold text-white flex items-center gap-1.5 mb-1.5">
          <span>📒</span> Signed Audit Passbook
        </h2>
        <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-medium bg-primary/10 text-primary-light px-2.5 py-0.5 rounded-full border border-primary/20">
          ⚡ Avg Gateway Overhead: {avgLatency} ms
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-2">
        {reversed.length === 0 && (
          <p className="text-xs text-slate-500 text-center pt-10">No audit entries yet.</p>
        )}

        {reversed.map((entry, i) => {
          const style = DECISION_STYLES[entry.decision] ?? DECISION_STYLES.BLOCKED;
          return (
            <div
              key={i}
              className="bg-white/[0.03] border border-white/[0.05] rounded-lg p-2.5 hover:border-white/[0.1] transition-colors"
            >
              {/* Top row: badge + time */}
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {formatTime(entry.timestamp)}
                </span>
              </div>

              {/* Tool info */}
              <p className="text-xs font-medium text-slate-300 mb-0.5">
                <span className="text-slate-500">{entry.server}</span>
                <span className="text-slate-600 mx-1">→</span>
                <span className="text-white font-semibold">{entry.tool}</span>
              </p>

              {/* Reason (truncated) */}
              {entry.reason && (
                <p className="text-[10px] text-slate-400 leading-snug line-clamp-2" title={entry.reason}>
                  {entry.reason}
                </p>
              )}

              {/* Latency + hash */}
              <div className="flex items-center justify-between mt-1 text-[10px] font-mono">
                <span className="text-slate-500">
                  {entry.sha256_hash ? `#${entry.sha256_hash.slice(0, 8)}` : ''}
                </span>
                <span className="text-primary-light/80 font-medium">
                  {entry.latency_ms.toFixed(1)} ms
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
