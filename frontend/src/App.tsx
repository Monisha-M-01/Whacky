import { useEffect, useState, useCallback } from 'react';
import type { AppState } from './api';
import { api } from './api';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import AuditPassbook from './components/AuditPassbook';
import { Shield, Lock, Unlock, ShieldAlert, Clock } from './components/Icons';

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [killLoading, setKillLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getState();
      setState(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend');
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleToggleKillSwitch = async () => {
    if (!state) return;
    setKillLoading(true);
    try {
      if (state.kill_switch_active) {
        await api.resetKillSwitch();
      } else {
        await api.activateKillSwitch();
      }
      refresh();
    } finally {
      setKillLoading(false);
    }
  };

  /* ── Skeleton Loading State ─────────────────────────────────── */
  if (!state && !error) {
    return (
      <div className="h-screen w-screen flex flex-col bg-[#0B1220] text-[#E6EAF2]">
        {/* Top bar skeleton */}
        <div className="h-14 border-b border-[#1F2A44] bg-[#111A2B] px-6 flex items-center justify-between animate-pulse">
          <div className="w-36 h-6 rounded bg-[#1F2A44]" />
          <div className="w-64 h-6 rounded bg-[#1F2A44]" />
          <div className="w-32 h-6 rounded bg-[#1F2A44]" />
        </div>
        {/* 3 panels skeleton */}
        <div className="flex-1 flex min-h-0">
          <div className="w-80 border-r border-[#1F2A44] bg-[#111A2B] p-4 space-y-4 animate-pulse">
            <div className="w-3/4 h-5 rounded bg-[#1F2A44]" />
            <div className="w-full h-24 rounded bg-[#162238]" />
            <div className="w-full h-24 rounded bg-[#162238]" />
          </div>
          <div className="flex-1 bg-[#0B1220] p-6 space-y-4 animate-pulse">
            <div className="w-48 h-6 rounded bg-[#1F2A44] mx-auto mt-20" />
            <div className="w-80 h-4 rounded bg-[#1F2A44] mx-auto" />
          </div>
          <div className="w-80 border-l border-[#1F2A44] bg-[#111A2B] p-4 space-y-4 animate-pulse">
            <div className="w-1/2 h-5 rounded bg-[#1F2A44]" />
            <div className="w-full h-20 rounded bg-[#162238]" />
          </div>
        </div>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0B1220] text-[#E6EAF2] p-4">
        <div className="text-center max-w-md bg-[#111A2B] border border-[#1F2A44] rounded-[16px] p-8 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/30 text-[#EF4444] flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={24} />
          </div>
          <h1 className="text-base font-bold text-[#E6EAF2] mb-1">Gateway Offline</h1>
          <p className="text-xs text-[#8B97B1] mb-4">{error}</p>
          <p className="text-[11px] font-mono-code text-[#64748B] bg-[#0B1220] p-2.5 rounded-lg border border-[#1F2A44]">
            uvicorn main:app --reload --port 8000
          </p>
        </div>
      </div>
    );
  }

  /* Live computed statistics */
  const attacksBlocked = state!.audit_log.filter(
    (e) => e.decision === 'BLOCKED' || e.decision === 'BLOCKED_TAINT_FLOW'
  ).length;
  const approvalsPending = state!.pending_actions.length;
  const latencies = state!.audit_log.map((e) => e.latency_ms).filter((l) => l > 0);
  const avgOverhead =
    latencies.length > 0
      ? `${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)} ms`
      : '-';

  const isWritesLocked = state!.kill_switch_active ?? false;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B1220] text-[#E6EAF2] overflow-hidden">
      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <header className="flex-shrink-0 h-14 bg-[#111A2B] border-b border-[#1F2A44] px-5 flex items-center justify-between select-none z-20">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#3B82F6]/15 border border-[#3B82F6]/40 flex items-center justify-center text-[#3B82F6] shadow-sm">
            <Shield size={18} />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-[#E6EAF2]">
              SafePilot
            </h1>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-[#94A3B8] bg-[#0B1220] px-2 py-0.5 rounded border border-[#1F2A44]">
              MCP Safety Gateway
            </span>
          </div>
        </div>

        {/* Live Stat Strip */}
        <div className="hidden md:flex items-center gap-5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[#94A3B8]">Attacks blocked:</span>
            <span
              className={`font-semibold font-mono-code px-2 py-0.5 rounded text-[11px] ${
                attacksBlocked > 0
                  ? 'text-[#EF4444] bg-[#EF4444]/15 border border-[#EF4444]/30'
                  : 'text-[#E6EAF2] bg-[#0B1220] border border-[#1F2A44]'
              }`}
            >
              {attacksBlocked}
            </span>
          </div>

          <div className="w-px h-4 bg-[#1F2A44]" />

          <div className="flex items-center gap-1.5">
            <span className="text-[#94A3B8]">Approvals pending:</span>
            <span
              className={`font-semibold font-mono-code px-2 py-0.5 rounded text-[11px] ${
                approvalsPending > 0
                  ? 'text-[#F59E0B] bg-[#F59E0B]/15 border border-[#F59E0B]/30'
                  : 'text-[#E6EAF2] bg-[#0B1220] border border-[#1F2A44]'
              }`}
            >
              {approvalsPending}
            </span>
          </div>

          <div className="w-px h-4 bg-[#1F2A44]" />

          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-[#94A3B8]" />
            <span className="text-[#94A3B8]">Overhead:</span>
            <span className="text-[#22C55E] font-semibold font-mono-code text-[11px]">
              {avgOverhead}
            </span>
          </div>
        </div>

        {/* Writes Lock Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleKillSwitch}
            disabled={killLoading}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
              isWritesLocked
                ? 'bg-[#1F2A44] border-[#3B82F6] text-[#E6EAF2] font-semibold shadow-xs'
                : 'bg-[#0B1220] border-[#1F2A44] text-[#94A3B8] hover:text-[#E6EAF2] hover:border-[#2A3B5E]'
            }`}
          >
            {isWritesLocked ? (
              <>
                <Lock size={13} className="text-[#3B82F6]" />
                <span>Writes: Locked</span>
              </>
            ) : (
              <>
                <Unlock size={13} className="text-[#94A3B8]" />
                <span>Writes: Unlocked</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Full-Width Red Emergency Banner (when locked) ──────── */}
      {isWritesLocked && (
        <div className="flex-shrink-0 bg-[#EF4444] text-white px-5 py-2 flex items-center justify-between text-xs font-semibold shadow-md animate-in fade-in duration-150 z-10">
          <div className="flex items-center gap-2">
            <Lock size={14} />
            <span>All writes locked. No changes can be made.</span>
          </div>
          <button
            onClick={handleToggleKillSwitch}
            className="text-[11px] underline font-bold hover:text-white/80 cursor-pointer"
          >
            Unlock writes
          </button>
        </div>
      )}

      {/* ── Main 3-Panel Layout ─────────────────────────────────── */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        <Sidebar
          apps={state!.apps}
          poisonActive={state!.poison_email.active}
          stealthActive={state!.stealth_injection?.active ?? false}
          rugPullActive={state!.rug_pull.active}
          rugPullDetected={state!.rug_pull.detected}
          killSwitchActive={state!.kill_switch_active ?? false}
          onRefresh={refresh}
        />
        <ChatPanel onRefresh={refresh} pendingFromState={state!.pending_actions} />
        <AuditPassbook entries={state!.audit_log} />
      </main>
    </div>
  );
}
