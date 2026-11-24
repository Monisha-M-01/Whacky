import { useState } from 'react';
import type { AppInfo } from '../api';
import { api } from '../api';

const SCOPE_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'read_only', label: 'Read-Only' },
  { value: 'read_write_gated', label: 'Read + Write (Gated)' },
];

const APP_ICONS: Record<string, string> = {
  gmail_mcp: '✉️',
  calendar_mcp: '📅',
  files_mcp: '📁',
};

const APP_LABELS: Record<string, string> = {
  gmail_mcp: 'Gmail',
  calendar_mcp: 'Google Calendar',
  files_mcp: 'Local Files',
};

interface SidebarProps {
  apps: Record<string, AppInfo>;
  poisonActive: boolean;
  stealthActive: boolean;
  rugPullActive: boolean;
  rugPullDetected: boolean;
  onRefresh: () => void;
}

export default function Sidebar({ apps, poisonActive, stealthActive, rugPullActive, rugPullDetected, onRefresh }: SidebarProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleScope = async (appId: string, scope: string) => {
    setLoading(appId);
    try {
      await api.setScope(appId, scope);
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const handlePoison = async () => {
    setLoading('poison');
    try {
      await api.togglePoison();
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const handleStealth = async () => {
    setLoading('stealth');
    try {
      await api.toggleStealth();
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const handleRugPull = async () => {
    setLoading('rugpull');
    try {
      await api.toggleRugPull();
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  return (
    <aside className="w-72 xl:w-80 flex-shrink-0 bg-navy-light border-r border-navy-lighter flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2.5 border-b border-navy-lighter/60">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xl">🛡️</span>
          <h1 className="text-base font-bold text-white tracking-tight">SafePilot</h1>
          <span className="text-[10px] uppercase font-bold tracking-wider bg-primary/20 text-primary-light px-1.5 py-0.5 rounded ml-auto">
            Gateway
          </span>
        </div>
        <p className="text-[11px] text-slate-400">Connected Apps (Zero-Config)</p>
      </div>

      {/* App cards scroll area */}
      <div className="flex-1 min-h-0 px-3.5 py-3 space-y-2.5 overflow-y-auto">
        {Object.entries(apps).map(([appId, info]) => {
          const isMismatch = !info.manifest_valid;
          return (
            <div
              key={appId}
              className={`rounded-xl p-3 border transition-all ${
                isMismatch
                  ? 'bg-red-950/40 border-danger/60 ring-1 ring-danger/30'
                  : 'bg-white/[0.04] border-white/[0.06] hover:border-white/[0.12]'
              }`}
            >
              {/* App title row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{APP_ICONS[appId] ?? '📦'}</span>
                  <span className="font-semibold text-xs text-white">
                    {APP_LABELS[appId] ?? info.display_name}
                  </span>
                </div>
                {isMismatch ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-danger bg-danger/15 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                    Tampered
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-safe bg-safe/15 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-safe" />
                    Verified
                  </span>
                )}
              </div>

              {/* SHA-256 hash */}
              <div className={`text-[10px] font-mono mb-2 px-2 py-1 rounded ${
                isMismatch
                  ? 'bg-danger/15 text-danger-light'
                  : 'bg-white/[0.04] text-slate-400'
              }`}>
                {isMismatch ? (
                  <span className="font-bold flex items-center gap-1">
                    <span>🚨</span> HASH MISMATCH — QUARANTINED
                  </span>
                ) : (
                  <span title={info.pinned_sha256}>
                    SHA-256: {info.pinned_sha256.slice(0, 16)}…
                  </span>
                )}
              </div>

              {/* Scope selector */}
              <select
                value={info.scope}
                onChange={(e) => handleScope(appId, e.target.value)}
                disabled={loading === appId}
                className="w-full text-xs font-medium bg-navy border border-navy-lighter rounded-lg px-2.5 py-1.5 text-slate-300 outline-none focus:border-primary cursor-pointer transition-colors"
              >
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {/* Demo Controls - Pinned at bottom */}
      <div className="flex-shrink-0 px-3.5 py-3 border-t border-navy-lighter bg-navy-light/95">
        <div className="rounded-xl border border-navy-lighter bg-white/[0.02] p-3">
          <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2 flex items-center gap-1.5">
            <span>⚡</span> Judge Demo Controls
          </p>
          <div className="space-y-1.5">
            <button
              onClick={handlePoison}
              disabled={loading === 'poison'}
              className={`w-full text-xs font-semibold rounded-lg px-3 py-2 border transition-all cursor-pointer text-left flex items-center justify-between ${
                poisonActive
                  ? 'bg-danger/20 border-danger text-danger-light shadow-sm'
                  : 'bg-transparent border-danger/40 text-danger hover:border-danger hover:bg-danger/10'
              }`}
            >
              <span>{poisonActive ? '☠️ Poison Active' : '💉 Poisoned Invoice'}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${poisonActive ? 'bg-danger text-white' : 'bg-danger/15 text-danger'}`}>
                {poisonActive ? 'Active' : 'Off'}
              </span>
            </button>
            <button
              onClick={handleStealth}
              disabled={loading === 'stealth'}
              className={`w-full text-xs font-semibold rounded-lg px-3 py-2 border transition-all cursor-pointer text-left flex items-center justify-between ${
                stealthActive
                  ? 'bg-purple-950/40 border-purple-500 text-purple-300 shadow-sm ring-1 ring-purple-500/30'
                  : 'bg-transparent border-purple-500/40 text-purple-400 hover:border-purple-500 hover:bg-purple-500/10'
              }`}
            >
              <span>{stealthActive ? '🕵️ Stealth Active' : '🕵️ Stealth Social Attack'}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${stealthActive ? 'bg-purple-500 text-white' : 'bg-purple-500/15 text-purple-300'}`}>
                {stealthActive ? 'Active' : 'Off'}
              </span>
            </button>
            <button
              onClick={handleRugPull}
              disabled={loading === 'rugpull'}
              className={`w-full text-xs font-semibold rounded-lg px-3 py-2 border transition-all cursor-pointer text-left flex items-center justify-between ${
                rugPullActive || rugPullDetected
                  ? 'bg-danger/20 border-danger text-danger-light shadow-sm'
                  : 'bg-transparent border-danger/40 text-danger hover:border-danger hover:bg-danger/10'
              }`}
            >
              <span>{rugPullActive ? '🛑 Rug-Pull Active' : '🔧 Tool Rug-Pull'}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${rugPullActive || rugPullDetected ? 'bg-danger text-white' : 'bg-danger/15 text-danger'}`}>
                {rugPullActive || rugPullDetected ? 'Active' : 'Off'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
