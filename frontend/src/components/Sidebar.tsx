import { useState } from 'react';
import type { AppInfo } from '../api';
import { api } from '../api';
import { Mail, Calendar, FileText, ShieldCheck, ShieldAlert, Lock, FlaskConical, ChevronDown, ChevronUp, Play, RotateCcw } from './Icons';

interface SidebarProps {
  apps: Record<string, AppInfo>;
  poisonActive: boolean;
  stealthActive: boolean;
  rugPullActive: boolean;
  rugPullDetected: boolean;
  killSwitchActive?: boolean;
  onRefresh: () => void;
}

const APP_META: Record<string, { label: string; icon: React.ReactNode; desc: string }> = {
  gmail_mcp: {
    label: 'Gmail',
    icon: <Mail size={16} className="text-[#3B82F6]" />,
    desc: 'Inbox, drafts & outbound messages',
  },
  calendar_mcp: {
    label: 'Google Calendar',
    icon: <Calendar size={16} className="text-[#3B82F6]" />,
    desc: 'Event scheduling & daily agendas',
  },
  files_mcp: {
    label: 'Local Files',
    icon: <FileText size={16} className="text-[#3B82F6]" />,
    desc: 'Sandboxed documents & receipts',
  },
};

const SCOPE_STEPS = [
  { value: 'off', label: 'Off' },
  { value: 'read_only', label: 'Read' },
  { value: 'read_write_gated', label: 'Read+Write' },
];

export default function Sidebar({
  apps,
  poisonActive,
  stealthActive,
  rugPullActive,
  rugPullDetected,
  killSwitchActive = false,
  onRefresh,
}: SidebarProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [labOpen, setLabOpen] = useState(false);
  const [selectedAttack, setSelectedAttack] = useState<'poison' | 'stealth' | 'rugpull'>('poison');

  const anyAttackActive = poisonActive || stealthActive || rugPullActive || rugPullDetected;
  const totalApps = Object.keys(apps).length;
  const anyTampered = Object.values(apps).some((a) => !a.manifest_valid) || rugPullDetected;
  const isLocked = killSwitchActive;

  const handleScope = async (appId: string, scope: string) => {
    setLoading(appId);
    try {
      await api.setScope(appId, scope);
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const handleRunAttack = async () => {
    setLoading('attack-action');
    try {
      if (selectedAttack === 'poison') {
        await api.togglePoison();
      } else if (selectedAttack === 'stealth') {
        await api.toggleStealth();
      } else if (selectedAttack === 'rugpull') {
        await api.toggleRugPull();
      }
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  const handleResetAllAttacks = async () => {
    setLoading('attack-reset');
    try {
      if (poisonActive) await api.togglePoison();
      if (stealthActive) await api.toggleStealth();
      if (rugPullActive || rugPullDetected) await api.toggleRugPull();
      onRefresh();
    } finally {
      setLoading(null);
    }
  };

  return (
    <aside className="w-[300px] xl:w-[320px] flex-shrink-0 bg-[#111A2B] border-r border-[#1F2A44] flex flex-col h-full overflow-hidden select-none">
      {/* Sidebar Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-[#1F2A44]">
        <h2 className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-0.5">
          Connected Apps
        </h2>
        <p className="text-[12px] text-[#94A3B8]">
          Zero-config least privilege controls
        </p>
      </div>

      {/* App Cards List */}
      <div className="flex-1 min-h-0 px-4 py-3 space-y-3 overflow-y-auto">
        {Object.entries(apps).map(([appId, info]) => {
          const meta = APP_META[appId] ?? {
            label: info.display_name,
            icon: <FileText size={16} className="text-[#3B82F6]" />,
            desc: 'MCP Tool Server',
          };
          const isTampered = !info.manifest_valid;

          return (
            <div
              key={appId}
              className={`rounded-[12px] p-3.5 border transition-all duration-150 ${
                isTampered
                  ? 'bg-[#EF4444]/10 border-[#EF4444]/50 shadow-sm'
                  : 'bg-[#162238]/60 border-[#1F2A44] hover:border-[#2A3B5E]'
              }`}
            >
              {/* App Identity Row */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#0B1220] border border-[#1F2A44] flex items-center justify-center">
                    {meta.icon}
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-[#E6EAF2] leading-tight">
                      {meta.label}
                    </h3>
                  </div>
                </div>

                {/* Verified Shield Badge with Tooltip */}
                {isTampered ? (
                  <div
                    className="flex items-center gap-1 text-[10px] font-semibold text-[#EF4444] bg-[#EF4444]/15 px-2 py-0.5 rounded-full border border-[#EF4444]/30"
                    title={`Manifest Hash Mismatch!\nCurrent: ${info.current_sha256}\nPinned: ${info.pinned_sha256}`}
                  >
                    <ShieldAlert size={12} />
                    <span>Mismatch</span>
                  </div>
                ) : (
                  <div
                    className="group relative flex items-center gap-1 text-[10px] font-medium text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full border border-[#22C55E]/20 cursor-help"
                  >
                    <ShieldCheck size={12} />
                    <span>✓ Verified</span>

                    {/* Monospace SHA-256 Tooltip on Hover */}
                    <div className="absolute right-0 top-full mt-1.5 hidden group-hover:flex z-50 flex-col w-56 p-2 bg-[#0B1220] border border-[#1F2A44] rounded-lg shadow-xl text-[10px] text-[#8B97B1] font-mono-code break-all pointer-events-none">
                      <span className="text-[#E6EAF2] font-sans font-semibold mb-1">SHA-256 Manifest Pin</span>
                      <span className="text-[#22C55E]">{info.pinned_sha256}</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-[#CBD5E1] mb-2.5">
                {meta.desc}
              </p>

              {/* 3-Way Segmented Control */}
              <div className="grid grid-cols-3 p-0.5 bg-[#0B1220] border border-[#1F2A44] rounded-lg">
                {SCOPE_STEPS.map((step) => {
                  const isActive = info.scope === step.value;
                  return (
                    <button
                      key={step.value}
                      onClick={() => handleScope(appId, step.value)}
                      disabled={loading === appId}
                      className={`text-[11px] font-medium py-1 rounded-[6px] transition-all text-center cursor-pointer ${
                        isActive
                          ? 'bg-[#1F2A44] text-[#E6EAF2] font-semibold shadow-xs'
                          : 'text-[#CBD5E1] hover:text-white'
                      }`}
                    >
                      {step.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Safety Status Card */}
        <div
          className={`rounded-[12px] p-3 border transition-all duration-150 ${
            isLocked
              ? 'bg-[#EF4444]/10 border-[#EF4444]/40 text-[#EF4444]'
              : anyTampered
              ? 'bg-[#F59E0B]/10 border-[#F59E0B]/40 text-[#F59E0B]'
              : 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E]'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            {isLocked ? (
              <Lock size={14} className="text-[#EF4444]" />
            ) : anyTampered ? (
              <ShieldAlert size={14} className="text-[#F59E0B]" />
            ) : (
              <ShieldCheck size={14} className="text-[#22C55E]" />
            )}
            <h4 className="text-xs font-semibold uppercase tracking-wider">
              Safety Status
            </h4>
          </div>
          <p className="text-[11px] font-medium leading-snug">
            {isLocked
              ? 'All writes locked: emergency mode active'
              : anyTampered
              ? 'Manifest changed: integrity check failed'
              : `${totalApps} apps verified, manifests pinned, writes gated`}
          </p>
        </div>
      </div>

      {/* Attack Lab Drawer (Bottom) */}
      <div className="flex-shrink-0 border-t border-[#1F2A44] bg-[#0E1626]">
        {/* Drawer Header Toggle */}
        <button
          onClick={() => setLabOpen(!labOpen)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-[#162238]/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FlaskConical size={14} className="text-[#94A3B8]" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#E6EAF2]">Attack Lab</span>
                {anyAttackActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse" />
                )}
              </div>
              <p className="text-[10px] text-[#94A3B8]">Simulated payloads in sandboxed mailbox</p>
            </div>
          </div>
          <div className="text-[#94A3B8]">
            {labOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
        </button>

        {/* Collapsible Drawer Content */}
        {labOpen && (
          <div className="px-4 pb-3.5 pt-1 space-y-2 border-t border-[#1F2A44]/50">
            <label className="block text-[11px] font-medium text-[#94A3B8]">
              Select Payload
            </label>
            <select
              value={selectedAttack}
              onChange={(e) => setSelectedAttack(e.target.value as any)}
              className="w-full text-xs bg-[#0B1220] border border-[#1F2A44] rounded-lg px-2.5 py-1.5 text-[#E6EAF2] outline-none focus:border-[#3B82F6] cursor-pointer"
            >
              <option value="poison">Poisoned Invoice (Prompt Injection)</option>
              <option value="stealth">Stealth Social Attack (Zero-Keyword)</option>
              <option value="rugpull">Tool Rug-Pull (Manifest Tampering)</option>
            </select>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleRunAttack}
                disabled={loading === 'attack-action'}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-[#1F2A44] hover:bg-[#2A3B5E] text-[#E6EAF2] rounded-lg py-1.5 border border-[#2D3D60] cursor-pointer disabled:opacity-50"
              >
                <Play size={12} className="text-[#3B82F6]" />
                <span>
                  {selectedAttack === 'poison' && (poisonActive ? 'Remove Poison' : 'Run Attack')}
                  {selectedAttack === 'stealth' && (stealthActive ? 'Remove Stealth' : 'Run Attack')}
                  {selectedAttack === 'rugpull' && (rugPullActive || rugPullDetected ? 'Restore Tool' : 'Run Attack')}
                </span>
              </button>

              {anyAttackActive && (
                <button
                  onClick={handleResetAllAttacks}
                  disabled={loading === 'attack-reset'}
                  title="Reset all active attacks"
                  className="px-2.5 py-1.5 text-xs font-medium bg-[#0B1220] hover:bg-[#162238] text-[#94A3B8] hover:text-[#E6EAF2] border border-[#1F2A44] rounded-lg cursor-pointer"
                >
                  <RotateCcw size={12} />
                </button>
              )}
            </div>

            {/* Status indicator */}
            <div className="text-[10px] text-[#94A3B8] pt-0.5">
              Status:{' '}
              {anyAttackActive ? (
                <span className="text-[#EF4444] font-medium">Attack payload active</span>
              ) : (
                <span className="text-[#22C55E] font-medium">Clean sandbox</span>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
