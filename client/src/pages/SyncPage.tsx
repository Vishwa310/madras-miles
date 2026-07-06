import { PageLoader } from '../lib/loaders';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncAfter, setSyncAfter] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [syncLog, setSyncLog] = useState<{ player: string; status: string; activities?: number; accepted?: number; rejected?: number; skipped?: number; flagged?: number; reason?: string }[]>([]);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, currentPlayer: '', done: false });
  const [syncSummary, setSyncSummary] = useState<{ totalFetched: number; totalAccepted: number; totalRejected: number; totalSkipped: number } | null>(null);
  const [challenge, setChallenge] = useState<any>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [historyData, chalData] = await Promise.all([
      api.get('/sync/history'),
      api.get('/challenge'),
    ]);
    setHistory(historyData.history || []);
    setChallenge(chalData.config);
    setLoading(false);
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncLog([]);
    setSyncSummary(null);
    setSyncProgress({ current: 0, total: 0, currentPlayer: '', done: false });

    try {
      // Start sync log
      const { players } = await api.get('/sync/players');
      const { syncLogId } = await api.post('/sync/start', {
        type: 'all',
        playerCount: players.length,
        afterDate: syncAfter || null,
      });
      setSyncProgress({ current: 0, total: players.length, currentPlayer: '', done: false });

      let totalFetched = 0, totalAccepted = 0, totalRejected = 0, totalSkipped = 0;
      let playersSynced = 0;

      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        setSyncProgress({ current: i + 1, total: players.length, currentPlayer: p.name, done: false });

        if (!p.hasToken) {
          setSyncLog(prev => [...prev, { player: p.name, status: 'skipped', reason: 'No Strava token' }]);
          totalSkipped++;
          continue;
        }

        try {
          const result = await api.post(`/sync/player/${p.playerId}${syncAfter ? `?after=${syncAfter}` : ''}`);
          setSyncLog(prev => [...prev, {
            player: result.player || p.name,
            status: result.status,
            activities: result.activities,
            accepted: result.accepted,
            rejected: result.rejected,
            skipped: result.skipped,
            flagged: result.flagged,
            reason: result.reason,
          }]);
          totalFetched += result.activities || 0;
          totalAccepted += result.accepted || 0;
          totalRejected += result.rejected || 0;
          totalSkipped += result.skipped || 0;
          playersSynced++;
        } catch (err: any) {
          setSyncLog(prev => [...prev, { player: p.name, status: 'error', reason: err.message }]);
        }
      }

      // Complete sync log
      await api.post(`/sync/complete/${syncLogId}`, {
        playersSynced,
        activitiesFound: totalFetched,
        accepted: totalAccepted,
        rejected: totalRejected,
        flagged: 0,
      });

      setSyncSummary({ totalFetched, totalAccepted, totalRejected, totalSkipped });
      setSyncProgress(prev => ({ ...prev, currentPlayer: 'Done!', done: true }));
      await loadData();
    } catch (err) {
      console.error('Sync error:', err);
    }
    setSyncing(false);
  }

  if (loading) return <PageLoader />;
  const endDate = challenge ? new Date(challenge.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Sync Control</h1>
          <p className="text-sm text-mm-text-muted mt-1">Manage Strava sync for all active players</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-mm-text-muted">Sync after:</label>
            <input type="date" value={syncAfter} onChange={e => setSyncAfter(e.target.value)}
              className="px-3 py-2 bg-mm-bg-card border border-mm-border rounded-lg text-xs focus:border-mm-orange outline-none" />
            {syncAfter && <button onClick={() => setSyncAfter('')} className="text-xs text-mm-text-muted hover:text-white">✕</button>}
          </div>
          <button onClick={triggerSync} disabled={syncing}
            className="flex items-center gap-2 px-5 py-2.5 gradient-hero rounded-full font-display font-semibold text-sm uppercase tracking-wide text-white shadow-lg shadow-mm-orange/30 hover:-translate-y-0.5 transition disabled:opacity-50">
            <span className={`icon-sm ${syncing ? 'animate-spin' : ''}`}>{syncing ? 'progress_activity' : 'sync'}</span>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

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
                  <div className="text-xs text-mm-text-muted flex items-center gap-2">
                    <span>{h.playerssynced} players</span>
                    {h.params && (
                      <>
                        <span className="text-mm-border">·</span>
                        <span className="capitalize">{h.params.type === 'all' ? 'Sync All' : `${h.params.playerCount} selected`}</span>
                        {h.params.afterDate && (
                          <>
                            <span className="text-mm-border">·</span>
                            <span>After: {h.params.afterDate}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
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

      {/* Sync Progress Dialog — large */}
      {(syncLog.length > 0 || syncProgress.total > 0) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col">
            {/* Header with criteria */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-display text-lg font-bold flex items-center gap-2">
                  {!syncProgress.done && <span className="icon text-mm-orange animate-spin" style={{ fontSize: '22px' }}>progress_activity</span>}
                  {syncProgress.done && <span className="icon text-mm-teal" style={{ fontSize: '22px' }}>check_circle</span>}
                  Strava Sync
                </h3>
              </div>
              <span className="text-sm text-mm-text-secondary font-mono">{syncProgress.current}/{syncProgress.total} players</span>
            </div>

            {/* Criteria info */}
            <div className="flex flex-wrap gap-3 mb-4 text-xs">
              <span className="px-2.5 py-1 bg-mm-bg-elevated rounded-lg border border-mm-border text-mm-text-secondary">
                📅 Fetching after: <strong className="text-white">{syncAfter || 'Last synced (auto)'}</strong>
              </span>
              <span className="px-2.5 py-1 bg-mm-bg-elevated rounded-lg border border-mm-border text-mm-text-secondary">
                🏁 Until: <strong className="text-white">{endDate}</strong>
              </span>
              <span className="px-2.5 py-1 bg-mm-bg-elevated rounded-lg border border-mm-border text-mm-text-secondary">
                🚶 Types: <strong className="text-white">Walk, Hike</strong>
              </span>
              <span className="px-2.5 py-1 bg-mm-bg-elevated rounded-lg border border-mm-border text-mm-text-secondary">
                ⚡ Source: <strong className="text-white">Strava API v3</strong>
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2.5 rounded-full bg-mm-bg-elevated mb-2 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{
                width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%`,
                background: syncProgress.done ? '#06d6a0' : 'linear-gradient(90deg, #ff6b35, #06d6a0)',
              }} />
            </div>
            <p className="text-xs text-mm-text-muted mb-4">
              {syncProgress.currentPlayer && !syncProgress.done
                ? `⏳ Syncing: ${syncProgress.currentPlayer}...`
                : syncProgress.done ? '✅ All players synced!' : 'Preparing player list...'}
            </p>

            {/* Log */}
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[250px] max-h-[350px] bg-mm-bg-primary rounded-xl p-3">
              {syncLog.length === 0 && (
                <p className="text-xs text-mm-text-muted text-center py-8">Waiting for first player...</p>
              )}
              {syncLog.map((log, i) => (
                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                  log.status === 'done' ? 'bg-mm-teal/5 border border-mm-teal/10' :
                  log.status === 'skipped' ? 'bg-mm-bg-elevated border border-mm-border' :
                  'bg-mm-hot/5 border border-mm-hot/10'
                }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`icon-sm flex-shrink-0 ${
                      log.status === 'done' ? 'text-mm-teal' : log.status === 'skipped' ? 'text-mm-text-muted' : 'text-mm-hot'
                    }`}>
                      {log.status === 'done' ? 'check_circle' : log.status === 'skipped' ? 'skip_next' : 'error'}
                    </span>
                    <span className="font-medium truncate">{log.player}</span>
                    {log.reason && <span className="text-mm-text-muted truncate">— {log.reason}</span>}
                  </div>
                  {log.status === 'done' && (
                    <div className="flex gap-3 flex-shrink-0 ml-2">
                      {(log.accepted || 0) > 0 && <span className="text-mm-teal font-semibold">+{log.accepted} ✓</span>}
                      {(log.rejected || 0) > 0 && <span className="text-mm-hot font-semibold">{log.rejected} ✗</span>}
                      {(log.flagged || 0) > 0 && <span className="text-mm-gold font-semibold">{log.flagged} ⚠</span>}
                      {(log.skipped || 0) > 0 && <span className="text-mm-text-muted">{log.skipped} dup</span>}
                      <span className="text-mm-text-muted">{log.activities} found</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary after completion */}
            {syncProgress.done && syncSummary && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                <div className="bg-mm-bg-primary rounded-lg p-3 text-center border border-mm-border">
                  <div className="font-display text-xl font-bold text-white">{syncSummary.totalFetched}</div>
                  <div className="text-[0.6rem] text-mm-text-muted uppercase">Fetched</div>
                </div>
                <div className="bg-mm-bg-primary rounded-lg p-3 text-center border border-mm-teal/20">
                  <div className="font-display text-xl font-bold text-mm-teal">{syncSummary.totalAccepted}</div>
                  <div className="text-[0.6rem] text-mm-text-muted uppercase">Accepted</div>
                </div>
                <div className="bg-mm-bg-primary rounded-lg p-3 text-center border border-mm-hot/20">
                  <div className="font-display text-xl font-bold text-mm-hot">{syncSummary.totalRejected}</div>
                  <div className="text-[0.6rem] text-mm-text-muted uppercase">Rejected</div>
                </div>
                <div className="bg-mm-bg-primary rounded-lg p-3 text-center border border-mm-border">
                  <div className="font-display text-xl font-bold text-mm-text-muted">{syncSummary.totalSkipped}</div>
                  <div className="text-[0.6rem] text-mm-text-muted uppercase">Duplicates</div>
                </div>
              </div>
            )}

            {/* Close button */}
            {syncProgress.done && (
              <button onClick={() => { setSyncLog([]); setSyncProgress({ current: 0, total: 0, currentPlayer: '', done: false }); setSyncSummary(null); }}
                className="mt-4 px-5 py-2.5 gradient-hero rounded-full font-display font-semibold text-sm text-white w-full">
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
