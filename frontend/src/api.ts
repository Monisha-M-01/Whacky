const API_HOST = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const BASE = `${API_HOST}/api`;

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

/* ── Types ─────────────────────────────────────────────────── */

export interface ToolInfo {
  name: string;
  access_level: 'read' | 'write';
  description: string;
}

export interface AppInfo {
  display_name: string;
  scope: string;
  tools: ToolInfo[];
  pinned_sha256: string;
  manifest_valid: boolean;
  current_sha256: string;
}

export interface PendingAction {
  pending_id: string;
  server_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  diff_preview: string;
  risk_level?: string;
  preview?: Record<string, unknown>;
  pii_masked?: boolean;
  redacted_count?: number;
  redacted_fields?: string[];
  created_at: string;
  status?: 'pending' | 'approved' | 'rejected';
}

export interface AuditEntry {
  timestamp: string;
  server: string;
  tool: string;
  decision: 'AUTO_ALLOWED' | 'APPROVED' | 'REJECTED' | 'BLOCKED' | 'PENDING_APPROVAL' | 'BLOCKED_TAINT_FLOW' | 'KILL_SWITCH_ACTIVATED' | 'KILL_SWITCH_ENGAGED' | 'KILL_SWITCH_RELEASED';
  latency_ms: number;
  sha256_hash: string;
  reason: string;
}

export interface AppState {
  apps: Record<string, AppInfo>;
  rug_pull: { active: boolean; detected: boolean; detail: string | null };
  poison_email: { active: boolean };
  stealth_injection?: { active: boolean };
  kill_switch_active?: boolean;
  pending_actions: PendingAction[];
  audit_log: AuditEntry[];
}

export interface ToolCallResult {
  server: string;
  tool: string;
  result_status: string;
}

export interface ProvenanceChainStep {
  step: string;
  detail: string;
}

export interface BlockedAlert {
  status: string;
  reason: string;
  quarantined?: boolean;
  server?: string;
  tool?: string;
  provenance?: string;
  provenance_chain?: ProvenanceChainStep[];
  provenance_chain_str?: string;
}

export interface ChatResponse {
  reply: string;
  tool_calls: ToolCallResult[];
  blocked_alerts: BlockedAlert[];
  pending_actions: PendingAction[];
}

/* ── API calls ─────────────────────────────────────────────── */

export const api = {
  getState: () => request<AppState>('/state'),

  setScope: (appId: string, scope: string) =>
    request<{ status: string }>(`/apps/${appId}/scope`, {
      method: 'POST',
      body: JSON.stringify({ scope }),
    }),

  chat: (message: string) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  approve: (pendingId: string) =>
    request<{ status: string; data?: unknown }>(`/approve/${pendingId}`, { method: 'POST' }),

  reject: (pendingId: string) =>
    request<{ status: string }>(`/reject/${pendingId}`, { method: 'POST' }),

  togglePoison: () =>
    request<{ poison_active: boolean; message: string }>('/simulate/poison-email', { method: 'POST' }),

  toggleStealth: () =>
    request<{ stealth_active: boolean; message: string }>('/simulate/stealth-injection', { method: 'POST' }),

  toggleRugPull: () =>
    request<{ rug_pull_active: boolean; detected: boolean; message: string }>('/simulate/rug-pull', { method: 'POST' }),

  activateKillSwitch: () =>
    request<{ status: string; kill_switch_active: boolean; message: string }>('/kill-switch', { method: 'POST' }),

  resetKillSwitch: () =>
    request<{ status: string; kill_switch_active: boolean; message: string }>('/kill-switch/reset', { method: 'POST' }),
};
