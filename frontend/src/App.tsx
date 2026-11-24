import { useEffect, useState, useCallback } from 'react';
import type { AppState } from './api';
import { api } from './api';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import AuditPassbook from './components/AuditPassbook';

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error && !state) {
    return (
      <div className="h-screen flex items-center justify-center bg-navy text-white">
        <div className="text-center">
          <p className="text-4xl mb-4">🛡️</p>
          <h1 className="text-xl font-bold mb-2">SafePilot</h1>
          <p className="text-sm text-danger-light">{error}</p>
          <p className="text-xs text-slate-500 mt-2">
            Make sure the backend is running: <code className="text-primary-light">uvicorn main:app --port 8000</code>
          </p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="h-screen flex items-center justify-center bg-navy text-white">
        <div className="text-center">
          <p className="text-4xl mb-4 animate-pulse">🛡️</p>
          <p className="text-sm text-slate-400">Connecting to SafePilot Gateway…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-navy overflow-hidden">
      <Sidebar
        apps={state.apps}
        poisonActive={state.poison_email.active}
        stealthActive={state.stealth_injection?.active ?? false}
        rugPullActive={state.rug_pull.active}
        rugPullDetected={state.rug_pull.detected}
        onRefresh={refresh}
      />
      <ChatPanel
        onRefresh={refresh}
        killSwitchActive={state.kill_switch_active ?? false}
      />
      <AuditPassbook entries={state.audit_log} />
    </div>
  );
}
