import { useState } from 'react';
import type { AuditEntry } from '../api';
import { ShieldCheck, Download, ChevronDown, ChevronRight, Clock } from './Icons';

interface AuditPassbookProps {
  entries: AuditEntry[];
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch {
    return ts;
  }
}

function getPlainEnglishReason(entry: AuditEntry): string {
  if (entry.decision === 'KILL_SWITCH_ENGAGED') {
    return 'Kill switch engaged: all writes locked';
  }
  if (entry.decision === 'KILL_SWITCH_RELEASED') {
    return 'Kill switch released: writes restored to gated';
  }
  if (entry.decision === 'KILL_SWITCH_ACTIVATED') {
    return 'Kill switch engaged: all writes locked';
  }
  if (entry.decision === 'BLOCKED_TAINT_FLOW') {
    return 'Blocked: Data from untrusted email attempted unauthorized write to unverified destination.';
  }
  if (entry.decision === 'BLOCKED') {
    if (entry.reason.includes('Rug-Pull') || entry.reason.includes('SHA-256 mismatch')) {
      return 'Blocked: Tool description was modified after startup (manifest integrity mismatch).';
    }
    if (entry.reason.includes('Injection')) {
      return 'Blocked: Hidden instructions detected inside incoming email payload.';
    }
    if (entry.reason.includes('Kill Switch')) {
      return 'Blocked: Emergency kill switch is active (all write operations paused).';
    }
    return entry.reason.replace(/🛑|⚠️|🚨/g, '').trim();
  }
  if (entry.decision === 'APPROVED') {
    return 'Approved by user: write action authorized and executed.';
  }
  if (entry.decision === 'REJECTED') {
    return 'Denied by user: write action was cancelled.';
  }
  if (entry.decision === 'PENDING_APPROVAL') {
    return 'Awaiting consent: write operation held for user review.';
  }
  return 'Allowed: verified read access within security scope.';
}

type TimelineItem =
  | { type: 'single'; entry: AuditEntry; id: string }
  | { type: 'collapsed'; entries: AuditEntry[]; id: string };

function groupEntries(entries: AuditEntry[]): TimelineItem[] {
  const reversed = [...entries].reverse();
  const grouped: TimelineItem[] = [];
  let buffer: AuditEntry[] = [];

  const flushBuffer = () => {
    if (buffer.length === 1) {
      grouped.push({ type: 'single', entry: buffer[0], id: `item-${grouped.length}` });
    } else if (buffer.length > 1) {
      grouped.push({ type: 'collapsed', entries: [...buffer], id: `collapsed-${grouped.length}` });
    }
    buffer = [];
  };

  for (const entry of reversed) {
    if (entry.decision === 'AUTO_ALLOWED') {
      buffer.push(entry);
    } else {
      flushBuffer();
      grouped.push({ type: 'single', entry, id: `item-${grouped.length}` });
    }
  }
  flushBuffer();
  return grouped;
}

export default function AuditPassbook({ entries }: AuditPassbookProps) {
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [expandedCollapsed, setExpandedCollapsed] = useState<Record<string, boolean>>({});

  const latencies = entries.map((e) => e.latency_ms).filter((l) => l > 0);
  const avgLatency = latencies.length > 0 ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) : '1.2';

  const groupedTimeline = groupEntries(entries);

  const toggleDetails = (id: string) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCollapsed = (id: string) => {
    setExpandedCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(entries, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `safepilot-audit-log-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <aside className="w-[300px] xl:w-[320px] flex-shrink-0 bg-[#111A2B] border-l border-[#1F2A44] flex flex-col h-full overflow-hidden select-none">
      {/* Header with Chain Verified Badge & Export */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-[#1F2A44]">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
            Audit Passbook
          </h2>
          {/* Chain Verified Badge */}
          <div className="flex items-center gap-1 text-[10px] font-medium text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded-full">
            <ShieldCheck size={11} />
            <span>Chain verified ✓</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
            <Clock size={12} />
            <span>Avg Overhead: <strong className="text-[#E6EAF2] font-mono-code">{avgLatency} ms</strong></span>
          </div>

          <button
            onClick={handleExport}
            className="flex items-center gap-1 text-[11px] font-medium text-[#94A3B8] hover:text-[#E6EAF2] bg-[#0B1220] hover:bg-[#162238] border border-[#1F2A44] rounded-[6px] px-2 py-1 transition-all cursor-pointer"
            title="Download full JSON audit ledger"
          >
            <Download size={11} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Timeline Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-2.5">
        {groupedTimeline.length === 0 ? (
          <p className="text-xs text-[#94A3B8] text-center pt-12">No audit entries recorded yet.</p>
        ) : (
          groupedTimeline.map((item) => {
            if (item.type === 'collapsed') {
              const isOpen = expandedCollapsed[item.id] ?? false;
              return (
                <div key={item.id} className="rounded-r-lg rounded-l-none bg-[#0B1220]/50 border border-[#1F2A44] border-l border-l-[#22C55E]/60 opacity-75 hover:opacity-100 transition-opacity overflow-hidden">
                  <button
                    onClick={() => toggleCollapsed(item.id)}
                    className="w-full p-2.5 flex items-center justify-between text-left hover:bg-[#162238]/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                      <span className="text-xs font-medium text-[#E6EAF2]">
                        {item.entries.length} reads auto-allowed
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-[#94A3B8]">
                      <span className="font-mono-code text-[10px]">{formatTime(item.entries[0].timestamp)}</span>
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </div>
                  </button>

                  {/* Expanded read entries */}
                  {isOpen && (
                    <div className="px-3 pb-2.5 pt-1 space-y-1.5 border-t border-[#1F2A44]/50 text-[11px] text-[#CBD5E1]">
                      {item.entries.map((e, idx) => (
                        <div key={idx} className="flex items-center justify-between font-mono-code text-[10px]">
                          <span>{e.server}.{e.tool}</span>
                          <span className="text-[#94A3B8]">{e.latency_ms.toFixed(1)}ms</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const { entry, id } = item;
            const isBlocked = entry.decision === 'BLOCKED' || entry.decision === 'BLOCKED_TAINT_FLOW';
            const isKillSwitch =
              entry.decision === 'KILL_SWITCH_ENGAGED' ||
              entry.decision === 'KILL_SWITCH_RELEASED' ||
              entry.decision === 'KILL_SWITCH_ACTIVATED';
            const isApproval =
              entry.decision === 'PENDING_APPROVAL' ||
              entry.decision === 'APPROVED' ||
              entry.decision === 'REJECTED';
            const isDetailsOpen = expandedDetails[id] ?? false;

            const cardStyle = isBlocked
              ? 'opacity-100 bg-[#162238] border-[#EF4444]/40 border-l-4 border-l-[#EF4444] shadow-md'
              : isKillSwitch
              ? 'opacity-95 bg-[#111A2B] border-[#1F2A44] border-l-3 border-l-[#3B82F6]'
              : isApproval
              ? 'opacity-100 bg-[#141E33] border-[#1F2A44] border-l-3 border-l-[#F59E0B]'
              : 'opacity-75 hover:opacity-100 bg-[#0B1220]/50 border-[#1F2A44] border-l border-l-[#22C55E]/60';

            const badgeConfig = isBlocked
              ? {
                  color: 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/30',
                  label: entry.decision === 'BLOCKED_TAINT_FLOW' ? 'TAINT BLOCKED' : 'BLOCKED',
                }
              : isKillSwitch
              ? {
                  color: 'text-[#60A5FA] bg-[#3B82F6]/15 border-[#3B82F6]/30',
                  label: 'KILL SWITCH',
                }
              : isApproval
              ? {
                  color: 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/30',
                  label: entry.decision.replace('_', ' '),
                }
              : {
                  color: 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/30',
                  label: 'AUTO ALLOWED',
                };

            return (
              <div
                key={id}
                className={`group rounded-r-lg rounded-l-none border p-2.5 transition-all ${cardStyle}`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeConfig.color}`}>
                    {badgeConfig.label}
                  </span>
                  <span className="text-[10px] text-[#94A3B8] font-mono-code">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>

                {/* Target tool */}
                <p className="text-[12px] font-semibold text-[#E6EAF2] mb-0.5">
                  <span className="text-[#94A3B8] font-normal">{entry.server} → </span>
                  {entry.tool}
                </p>

                {/* One-line Plain-English reason */}
                <p className="text-[11px] text-[#CBD5E1] leading-tight line-clamp-2 mb-1.5">
                  {getPlainEnglishReason(entry)}
                </p>

                {/* Expandable Details link — always visible on blocked, hover on others */}
                <button
                  onClick={() => toggleDetails(id)}
                  className={`flex items-center gap-1 text-[10px] text-[#3B82F6] hover:text-[#60A5FA] cursor-pointer transition-opacity ${
                    isBlocked || isDetailsOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <span>{isDetailsOpen ? 'Hide technical details' : 'View technical details'}</span>
                  {isDetailsOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>

                {/* Expanded Details Row */}
                {isDetailsOpen && (
                  <div className="mt-2 pt-2 border-t border-[#1F2A44] text-[10px] text-[#CBD5E1] font-mono-code space-y-1">
                    <div>Latency: <span className="text-[#E6EAF2]">{entry.latency_ms.toFixed(2)} ms</span></div>
                    {entry.sha256_hash && (
                      <div className="truncate" title={entry.sha256_hash}>
                        Hash: <span className="text-[#94A3B8]">#{entry.sha256_hash.slice(0, 16)}…</span>
                      </div>
                    )}
                    <div className="text-[#94A3B8] font-sans break-words">{entry.reason}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
