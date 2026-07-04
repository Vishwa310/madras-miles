import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [statusData, historyData] = await Promise.all([
      api.get('/sync/status'),
      api.get('/sync/history'),
    ]);
    setLastResult(statusData.lastSync);
    setHistory(historyData.history || []);
  }

  async function triggerSync() {
    setSyncing(true);
    try {
      const result = await api.post('/sync');
      setLastResult(result);
      loadData();
    } catch (err) {
      console.error(err);
    }
    setSyncing(false);
  }

  async function computeScores() {
    alert('Rankings are now computed live from accepted activities. No manual computation needed!');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Sync Control</h1>
          <p className="text-sm text-mm-text-muted mt-1">Manage Strava sync and scoring</p>
        </div>
        <div className="flex gap-3">
          <button onClick={computeScores}
            className="flex items-center gap-2 px-5 py-2.5 border border-mm-gold/30 bg-mm-gold/10 rounded-full font-display font-semibold text-sm uppercase text-mm-gold hover:-translate-y-0.5 transition">
            <span className="icon-sm">star</span> Compute Scores
          </button>
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-2 px-5 py-2.5 gradient-hero rounded-full font-display font-semibold text-sm uppercase tracking-wide text-white shadow-lg shadow-mm-orange/30 hover:-translate-y-0.5 transition disabled:opacity-50">
            <span className={`icon-sm ${syncing ? 'animate-spin' : ''}`}>{syncing ? 'progress_activity' : 'sync'}</span>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Last sync result */}
      {lastResult && (
        <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mb-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4">Latest Sync</h3>
          <div className="grid grid-cols-5 gap-4">
            <Stat label="Status" value={lastResult.status || 'completed'} color={lastResult.status === 'completed' ? 'text-mm-teal' : 'text-mm-hot'} />
            <Stat label="Players" value={lastResult.playerssynced || lastResult.playersSynced || 0} />
            <Stat label="Activities" value={lastResult.activitiesFound || 0} />
            <Stat label="Accepted" value={lastResult.accepted || 0} color="text-mm-teal" />
            <Stat label="Rejected" value={lastResult.rejected || 0} color="text-mm-hot" />
          </div>
          {lastResult.error && (
            <div className="mt-4 p-3 bg-mm-hot/10 border border-mm-hot/30 rounded-lg text-xs text-mm-hot">
              {lastResult.error}
            </div>
          )}
        </div>
      )}

      {/* Sync history */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4">Sync History</h3>
        <div className="space-y-3">
          {history.map(h => (
            <div key={h.id} className="flex items-center justify-between py-3 border-b border-mm-border last:border-0">
              <div className="flex items-center gap-4">
                <span className={`w-2 h-2 rounded-full ${h.status === 'completed' ? 'bg-mm-teal' : h.status === 'failed' ? 'bg-mm-hot' : 'bg-mm-gold animate-pulse'}`} />
                <div>
                  <div className="text-sm">{new Date(h.startedAt).toLocaleString()}</div>
                  <div className="text-xs text-mm-text-muted">{h.playerssynced} players synced</div>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold bg-mm-teal/15 text-mm-teal border border-mm-teal/30">✓ {h.accepted}</span>
                <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold bg-mm-hot/15 text-mm-hot border border-mm-hot/30">✗ {h.rejected}</span>
                <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold bg-mm-gold/15 text-mm-gold border border-mm-gold/30">⚠ {h.flagged}</span>
              </div>
            </div>
          ))}
          {history.length === 0 && <p className="text-mm-text-muted text-sm text-center py-4">No sync history yet</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div className="text-center">
      <div className={`font-display text-2xl font-bold ${color || 'text-white'}`}>{value}</div>
      <div className="text-[0.6rem] text-mm-text-muted uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
