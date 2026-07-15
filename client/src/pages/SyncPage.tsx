import { PageLoader } from '../lib/loaders';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncAfter, setSyncAfter] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [syncIssues, setSyncIssues] = useState<any[]>([]);
  const [syncLog, setSyncLog] = useState<{ player: string; status: string; activities?: number; accepted?: number; rejected?: number; skipped?: number; flagged?: number; reason?: string }[]>([]);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, currentPlayer: '', done: false });
  const [syncSummary, setSyncSummary] = useState<{ totalFetched: number; totalAccepted: number; totalRejected: number; totalSkipped: number } | null>(null);
  const [challenge, setChallenge] = useState<any>(null);

  // Auto-sync state
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoInterval, setAutoInterval] = useState(4);
  const [nextSyncAt, setNextSyncAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState('');
  const [autoRunning, setAutoRunning] = useState(false);
  const [schedule, setSchedule] = useState<{ frequency: 'hourly' | 'daily' | 'alternate' | 'weekly'; intervalHours: number; syncTime: string; days: number[] }>({
    frequency: 'hourly', intervalHours: 4, syncTime: '06:00', days: [0, 1, 2, 3, 4, 5, 6],
  });

  useEffect(() => { loadData(); }, []);

  // Countdown timer
  useEffect(() => {
    if (!nextSyncAt) { setCountdown(''); return; }
    const tick = () => {
      const diff = new Date(nextSyncAt).getTime() - Date.now();
      if (diff <= 0) { setCountdown('Syncing now...'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [nextSyncAt]);

  async function loadData() {
    const [historyData, chalData, autoData, issuesData] = await Promise.all([
      api.get('/sync/history'),
      api.get('/challenge'),
      api.get('/sync/auto'),
      api.get('/sync/issues'),
    ]);
    setHistory(historyData.history || []);
    setChallenge(chalData.config);
    setSyncIssues(issuesData.issues || []);
    setAutoEnabled(autoData.enabled);
    setAutoInterval(autoData.intervalHours);
    setNextSyncAt(autoData.nextSyncAt);
    setAutoRunning(autoData.running);
    if (autoData.schedule) setSchedule(autoData.schedule);
    setLoading(false);
  }

  async function toggleAutoSync(enabled: boolean) {
    const result = await api.post('/sync/auto', { enabled, intervalHours: autoInterval, schedule });
    setAutoEnabled(result.enabled);
    setNextSyncAt(result.nextSyncAt);
  }

  async function updateSchedule(newSchedule: typeof schedule) {
    setSchedule(newSchedule);
    // Convert schedule to interval hours for the backend
    let hours = newSchedule.intervalHours;
    if (newSchedule.frequency === 'daily') hours = 24;
    else if (newSchedule.frequency === 'alternate') hours = 48;
    else if (newSchedule.frequency === 'weekly') hours = 24; // checked daily, but only runs on selected days
    setAutoInterval(hours);

    if (autoEnabled) {
      const result = await api.post('/sync/auto', { enabled: true, intervalHours: hours, schedule: newSchedule });
      setNextSyncAt(result.nextSyncAt);
    }
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncLog([]);
    setSyncSummary(null);
    setSyncProgress({ current: 0, total: 0, currentPlayer: '', done: false });

    try {
      const { players } = await api.get('/sync/players');

      // Check for a running sync to resume
      let syncLogId: string;
      let skipPlayerIds: string[] = [];

      const runningSyncLog = history.find((h: any) => h.status === 'running');
      if (runningSyncLog) {
        // Resume from checkpoint
        const checkpoint = await api.get(`/sync/checkpoint/${runningSyncLog.id}`);
        syncLogId = runningSyncLog.id;
        skipPlayerIds = checkpoint.completedPlayerIds || [];
      } else {
        // New sync
        const startRes = await api.post('/sync/start', {
          type: 'all',
          playerCount: players.length,
          afterDate: syncAfter || null,
        });
        syncLogId = startRes.syncLogId;
      }

      const remainingPlayers = players.filter((p: any) => !skipPlayerIds.includes(p.playerId));
      const alreadyDone = skipPlayerIds.length;
      if (alreadyDone > 0) {
        setSyncLog([{ player: `${alreadyDone} players`, status: 'done', reason: 'Resumed from checkpoint' }]);
      }
      setSyncProgress({ current: alreadyDone, total: players.length, currentPlayer: alreadyDone > 0 ? 'Resuming...' : '', done: false });

      let totalFetched = 0, totalAccepted = 0, totalRejected = 0, totalSkipped = 0;
      let playersSynced = alreadyDone;

      for (let i = 0; i < remainingPlayers.length; i++) {
        const p = remainingPlayers[i];
        setSyncProgress({ current: alreadyDone + i + 1, total: players.length, currentPlayer: p.name, done: false });

        if (!p.hasToken) {
          setSyncLog(prev => [...prev, { player: p.name, status: 'skipped', reason: 'No Strava token' }]);
          await api.post(`/sync/checkpoint/${syncLogId}`, { playerId: p.playerId, playerName: p.name, result: 'skipped' }).catch(() => {});
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
          await api.post(`/sync/checkpoint/${syncLogId}`, { playerId: p.playerId, playerName: p.name, result: 'done' }).catch(() => {});
          totalFetched += result.activities || 0;
          totalAccepted += result.accepted || 0;
          totalRejected += result.rejected || 0;
          totalSkipped += result.skipped || 0;
          playersSynced++;
        } catch (err: any) {
          setSyncLog(prev => [...prev, { player: p.name, status: 'error', reason: err.message }]);
          await api.post(`/sync/checkpoint/${syncLogId}`, { playerId: p.playerId, playerName: p.name, result: 'error' }).catch(() => {});
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

      {/* Auto-Sync */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted flex items-center gap-2">
            <span className="icon-sm text-mm-orange">schedule</span> Auto-Sync Schedule
          </h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-xs text-mm-text-muted">{autoEnabled ? 'Active' : 'Off'}</span>
            <div className="relative" onClick={() => toggleAutoSync(!autoEnabled)}>
              <div className={`w-11 h-6 rounded-full transition-colors ${autoEnabled ? 'bg-mm-teal' : 'bg-mm-bg-elevated'}`} />
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </div>
          </label>
        </div>

        {autoEnabled && (
          <div className="space-y-4">
            {/* Countdown */}
            <div className="text-center py-4 bg-mm-bg-primary rounded-xl border border-mm-border">
              <div className="text-xs text-mm-text-muted uppercase tracking-wider mb-2">Next sync in</div>
              <div className="font-display text-3xl font-bold text-mm-orange">
                {autoRunning ? '🔄 Syncing...' : countdown || '—'}
              </div>
              {nextSyncAt && !autoRunning && (
                <div className="text-xs text-mm-text-muted mt-2">
                  {new Date(nextSyncAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>

            {/* Frequency */}
            <div>
              <span className="text-xs text-mm-text-muted uppercase tracking-wider">Frequency</span>
              <div className="flex gap-2 mt-2">
                {(['hourly', 'daily', 'alternate', 'weekly'] as const).map(f => (
                  <button key={f} onClick={() => updateSchedule({ ...schedule, frequency: f })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                      schedule.frequency === f ? 'gradient-hero text-white' : 'bg-mm-bg-elevated border border-mm-border text-mm-text-secondary hover:text-white'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Hourly: pick interval */}
            {schedule.frequency === 'hourly' && (
              <div>
                <span className="text-xs text-mm-text-muted uppercase tracking-wider">Every</span>
                <div className="flex gap-2 mt-2">
                  {[1, 2, 3, 4, 6, 8, 12].map(h => (
                    <button key={h} onClick={() => updateSchedule({ ...schedule, intervalHours: h })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        schedule.intervalHours === h ? 'gradient-hero text-white' : 'bg-mm-bg-elevated border border-mm-border text-mm-text-secondary hover:text-white'
                      }`}>
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Daily/Alternate: pick time */}
            {(schedule.frequency === 'daily' || schedule.frequency === 'alternate') && (
              <div>
                <span className="text-xs text-mm-text-muted uppercase tracking-wider">Sync at</span>
                <div className="flex gap-2 mt-2">
                  {['06:00', '08:00', '10:00', '12:00', '18:00', '21:00'].map(t => (
                    <button key={t} onClick={() => updateSchedule({ ...schedule, syncTime: t })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        schedule.syncTime === t ? 'gradient-hero text-white' : 'bg-mm-bg-elevated border border-mm-border text-mm-text-secondary hover:text-white'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Weekly: pick days */}
            {schedule.frequency === 'weekly' && (
              <div>
                <span className="text-xs text-mm-text-muted uppercase tracking-wider">Days</span>
                <div className="flex gap-2 mt-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                    <button key={d} onClick={() => {
                      const days = schedule.days.includes(i) ? schedule.days.filter(x => x !== i) : [...schedule.days, i];
                      updateSchedule({ ...schedule, days });
                    }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        schedule.days.includes(i) ? 'gradient-hero text-white' : 'bg-mm-bg-elevated border border-mm-border text-mm-text-secondary hover:text-white'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <span className="text-xs text-mm-text-muted uppercase tracking-wider">At</span>
                  <div className="flex gap-2 mt-2">
                    {['06:00', '08:00', '10:00', '18:00', '21:00'].map(t => (
                      <button key={t} onClick={() => updateSchedule({ ...schedule, syncTime: t })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          schedule.syncTime === t ? 'gradient-hero text-white' : 'bg-mm-bg-elevated border border-mm-border text-mm-text-secondary hover:text-white'
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="p-3 bg-mm-bg-primary rounded-lg border border-mm-border text-xs text-mm-text-secondary">
              📋 {schedule.frequency === 'hourly' && `Syncing every ${schedule.intervalHours} hour(s)`}
              {schedule.frequency === 'daily' && `Syncing daily at ${schedule.syncTime}`}
              {schedule.frequency === 'alternate' && `Syncing every other day at ${schedule.syncTime}`}
              {schedule.frequency === 'weekly' && `Syncing on ${schedule.days.map(d => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d]).join(', ')} at ${schedule.syncTime}`}
            </div>
          </div>
        )}

        {!autoEnabled && (
          <p className="text-xs text-mm-text-muted">Enable to automatically sync all players on a schedule. Activities will be fetched, validated, and scored without manual intervention.</p>
        )}
      </div>

      {/* Sync Issues */}
      {syncIssues.length > 0 && (
        <div className="bg-mm-bg-card border border-mm-hot/20 rounded-2xl p-6 mb-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-hot mb-4 flex items-center gap-2">
            <span className="icon-sm">warning</span> Players with 0 Activities ({syncIssues.length})
          </h3>
          <p className="text-xs text-mm-text-muted mb-3">These players have no synced activities — they may not have walked yet, or their sync failed.</p>
          <div className="grid grid-cols-2 gap-2">
            {syncIssues.map((p: any) => (
              <div key={p.playerId} className="flex items-center gap-2 px-3 py-2 bg-mm-bg-primary rounded-lg border border-mm-border">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[0.5rem] font-bold text-white flex-shrink-0" style={{ background: p.teamEmblem || '#6B7280' }}>
                  {p.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{p.name}</div>
                  <div className="text-[0.6rem] text-mm-text-muted">{p.team}</div>
                </div>
                {p.tokenExpired && <span className="text-[0.55rem] text-mm-hot font-semibold">Token expired</span>}
                {!p.hasToken && <span className="text-[0.55rem] text-mm-hot font-semibold">No token</span>}
              </div>
            ))}
          </div>
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
