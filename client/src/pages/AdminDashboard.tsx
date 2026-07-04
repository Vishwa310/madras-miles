import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageLoader } from '../lib/loaders';

export default function AdminDashboard() {
  const [teams, setTeams] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [playerRankings, setPlayerRankings] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [challenge, setChallenge] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncLog, setSyncLog] = useState<{ player: string; status: string; activities?: number; accepted?: number; rejected?: number; reason?: string }[]>([]);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, currentPlayer: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [teamsD, lbD, prD, syncD, chalD, actD] = await Promise.all([
      api.get('/teams'),
      api.get('/scores/leaderboard'),
      api.get('/scores/players'),
      api.get('/sync/status'),
      api.get('/challenge'),
      api.get('/activities?limit=50'),
    ]);
    setTeams(teamsD.teams);
    setLeaderboard(lbD.leaderboard);
    setPlayerRankings(prD.rankings);
    setSyncStatus(syncD.lastSync);
    setChallenge(chalD.config);
    setActivities(actD.activities);
    setLoading(false);
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncLog([]);
    setSyncProgress({ current: 0, total: 0, currentPlayer: '' });

    try {
      const { syncLogId } = await api.post('/sync/start');
      const { players } = await api.get('/sync/players');
      setSyncProgress({ current: 0, total: players.length, currentPlayer: '' });

      let playersSynced = 0, totalFetched = 0, totalAccepted = 0, totalRejected = 0;

      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        setSyncProgress({ current: i + 1, total: players.length, currentPlayer: p.name });

        if (!p.hasToken) {
          setSyncLog(prev => [...prev, { player: p.name, status: 'skipped', reason: 'No Strava token' }]);
          continue;
        }

        try {
          const result = await api.post(`/sync/player/${p.playerId}`);
          setSyncLog(prev => [...prev, { player: result.player, status: result.status, activities: result.activities, accepted: result.accepted, rejected: result.rejected, reason: result.reason }]);
          playersSynced++;
          totalFetched += result.activities || 0;
          totalAccepted += result.accepted || 0;
          totalRejected += result.rejected || 0;
        } catch (err: any) {
          setSyncLog(prev => [...prev, { player: p.name, status: 'error', reason: err.message }]);
        }
      }

      await api.post(`/sync/complete/${syncLogId}`, { playersSynced, activitiesFound: totalFetched, accepted: totalAccepted, rejected: totalRejected, flagged: 0 });
      setSyncProgress(prev => ({ ...prev, currentPlayer: 'Done!' }));
      await loadData();
    } catch (err) {
      console.error('Sync error:', err);
    }
    setSyncing(false);
  }

  // Loading state
  if (loading) return <PageLoader />;

  // Computed stats
  const totalPlayers = teams.reduce((s, t) => s + t.playerCount, 0);
  const acceptedActs = activities.filter(a => a.status === 'ACCEPTED');
  const totalKm = playerRankings.reduce((s, p) => s + (p.totalKm || 0), 0);

  // Challenge timing
  const now = new Date();
  const startDate = challenge ? new Date(challenge.startDate) : now;
  const endDate = challenge ? new Date(challenge.endDate) : now;
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysPassed = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const progressPct = totalDays > 0 ? Math.min(100, (daysPassed / totalDays) * 100) : 0;

  // Fun stats for mailers
  const avgKmPerPlayer = totalPlayers > 0 ? (totalKm / totalPlayers).toFixed(1) : '0';
  const topPlayer = playerRankings[0];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">{challenge?.name || 'Dashboard'}</h1>
          <p className="text-sm text-mm-text-muted mt-1">
            {syncStatus ? `Last sync: ${new Date(syncStatus.startedAt).toLocaleString()}` : 'Never synced'}
          </p>
        </div>
        <button onClick={triggerSync} disabled={syncing}
          className="flex items-center gap-2 px-5 py-2.5 gradient-hero rounded-full font-display font-semibold text-sm uppercase text-white shadow-lg shadow-mm-orange/30 hover:-translate-y-0.5 transition disabled:opacity-50">
          <span className={`icon-sm ${syncing ? 'animate-spin' : ''}`}>{syncing ? 'progress_activity' : 'sync'}</span>
          {syncing ? 'Syncing...' : 'Sync & Score'}
        </button>
      </div>

      {/* Challenge Progress Banner */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mb-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 gradient-hero" />
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted">Challenge Progress</h3>
          <span className="text-xs text-mm-text-muted">{challenge?.startDate?.split('T')[0]} → {challenge?.endDate?.split('T')[0]}</span>
        </div>

        {/* Progress bar */}
        <div className="relative h-3 bg-mm-bg-elevated rounded-full mb-4 overflow-visible">
          <div className="h-full gradient-hero rounded-full transition-all duration-1000" style={{ width: `${progressPct}%` }} />
          <div className="absolute top-[-6px] transition-all duration-1000" style={{ left: `${progressPct}%` }}>
            <div className="w-6 h-6 bg-white border-3 border-mm-orange rounded-full shadow-lg shadow-mm-orange/40 -translate-x-1/2" />
          </div>
        </div>

        {/* Day counters */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-mm-bg-primary rounded-xl p-4 text-center">
            <div className="font-display text-3xl font-bold text-mm-teal">{daysPassed}</div>
            <div className="text-[0.65rem] text-mm-text-muted uppercase tracking-wider mt-1">Days Completed</div>
          </div>
          <div className="bg-mm-bg-primary rounded-xl p-4 text-center">
            <div className="font-display text-3xl font-bold text-mm-orange">{daysRemaining}</div>
            <div className="text-[0.65rem] text-mm-text-muted uppercase tracking-wider mt-1">Days Remaining</div>
          </div>
          <div className="bg-mm-bg-primary rounded-xl p-4 text-center">
            <div className="font-display text-3xl font-bold text-mm-gold">{totalDays}</div>
            <div className="text-[0.65rem] text-mm-text-muted uppercase tracking-wider mt-1">Total Days</div>
          </div>
        </div>
      </div>

      {/* Catchy Stats — Shareable / Mailer-ready */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <CatchyStat icon="route" value={`${totalKm.toFixed(0)} km`} label="Total Distance" sub="All players combined" color="text-mm-teal" />
        <CatchyStat icon="groups" value={totalPlayers} label="Athletes" sub={`${teams.length} teams`} color="text-mm-purple" />
        <CatchyStat icon="route" value={`${totalKm.toFixed(1)} km`} label="Total Distance" sub="All players combined" color="text-mm-gold" />
        <CatchyStat icon="avg_pace" value={`${avgKmPerPlayer} km`} label="Avg Per Player" sub="Total distance ÷ players" color="text-mm-blue" />
        <CatchyStat icon="directions_walk" value={acceptedActs.length} label="Valid Activities" sub={`${activities.filter(a=>a.status==='REJECTED').length} rejected`} color="text-mm-orange" />
      </div>

      {/* Team Leaderboard — Full Width */}
      <div className="mb-6">
        {/* Team Leaderboard — Horizontal Bar Style */}
        <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-5 flex items-center gap-2">
            <span className="icon-sm text-mm-gold">emoji_events</span> Team Distance Overview
          </h3>
          <div className="space-y-4">
            {leaderboard.map(t => {
              const maxKm = leaderboard[0]?.totalKm || 1;
              const barWidth = Math.max(5, (t.totalKm / maxKm) * 100);
              return (
                <div key={t.teamId} className="flex items-center gap-4">
                  {/* Rank circle */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 border-2"
                    style={{ borderColor: t.teamEmblem, color: t.teamEmblem }}>
                    {t.rank}
                  </div>
                  {/* Team name + members */}
                  <div className="w-36 flex-shrink-0">
                    <div className="text-sm font-semibold">{t.teamName}</div>
                    <div className="text-[0.6rem] text-mm-text-muted">{t.totalActivities} activities</div>
                  </div>
                  {/* Progress bar */}
                  <div className="flex-1 h-8 bg-mm-bg-primary rounded-full overflow-hidden relative">
                    <div className="h-full rounded-full transition-all duration-700 relative"
                      style={{ width: `${barWidth}%`, background: `linear-gradient(90deg, ${t.teamEmblem}88, ${t.teamEmblem})` }}>
                      <div className="absolute inset-0 rounded-full opacity-30"
                        style={{ background: `linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 60%)` }} />
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="text-right flex-shrink-0 w-24">
                    <div className="font-display text-lg font-bold" style={{ color: t.teamEmblem }}>{t.totalKm.toFixed(1)} km</div>
                  </div>
                </div>
              );
            })}
            {leaderboard.length === 0 && <p className="text-mm-text-muted text-sm text-center py-4">No data yet — sync to populate</p>}
          </div>
        </div>

      </div>

      {/* Top Players */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mb-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4 flex items-center gap-2">
            <span className="icon-sm text-mm-teal">military_tech</span> Top Players
          </h3>
          {playerRankings.slice(0, 8).map(p => (
            <div key={p.playerId} className={`flex items-center gap-4 py-3 border-b border-mm-border last:border-0 ${p.rank === 1 ? 'bg-mm-teal/[0.03] -mx-3 px-3 rounded-lg' : ''}`}>
              <RankBadge rank={p.rank} />
              <div className="flex-1">
                <div className="text-sm font-medium">{p.playerName}</div>
                <div className="text-xs text-mm-text-muted flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: p.teamEmblem || '#6B7280' }} />
                  {p.teamName}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-lg font-bold text-mm-teal">{(p.totalKm || 0).toFixed(1)}</div>
                <div className="text-[0.6rem] text-mm-text-muted">km</div>
              </div>
            </div>
          ))}
          {playerRankings.length === 0 && <p className="text-mm-text-muted text-sm text-center py-4">No scores yet</p>}
      </div>

      {/* Trivia */}
      <div className="bg-gradient-to-r from-mm-bg-card to-mm-bg-secondary border border-mm-border rounded-2xl p-6">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-3 flex items-center gap-2">
          <span className="icon-sm text-mm-orange">emoji_events</span> Trivia
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-mm-bg-primary/50 rounded-xl p-4 border border-mm-border">
            <p className="text-sm text-mm-text-secondary leading-relaxed">
              🦶 <strong className="text-white">{totalPlayers} warriors</strong> have taken roughly
              <strong className="text-mm-teal"> {(totalKm * 1312).toLocaleString()} steps</strong> combined.
              That's {totalKm >= 42 ? `${(totalKm / 42.195).toFixed(1)} marathons` : `${(totalKm / 5).toFixed(0)} park runs`} worth of walking!
            </p>
          </div>
          <div className="bg-mm-bg-primary/50 rounded-xl p-4 border border-mm-border">
            <p className="text-sm text-mm-text-secondary leading-relaxed">
              🍕 Together, you've burned approximately <strong className="text-mm-orange">{(totalKm * 65).toLocaleString()} calories</strong>.
              That's <strong className="text-white">{Math.floor(totalKm * 65 / 285)} dosas</strong> or <strong className="text-white">{Math.floor(totalKm * 65 / 270)} samosas</strong> guilt-free. You're welcome.
            </p>
          </div>
          <div className="bg-mm-bg-primary/50 rounded-xl p-4 border border-mm-border">
            <p className="text-sm text-mm-text-secondary leading-relaxed">
              🏆 <strong className="text-mm-gold">{topPlayer?.playerName || '—'}</strong> is the current beast with
              <strong className="text-mm-teal"> {(topPlayer?.totalKm || 0).toFixed(1)} km</strong>.
              {(topPlayer?.totalKm || 0) >= 50 ? " Somebody check if they're secretly running! 👀" : " Keep pushing, legend!"}
            </p>
          </div>
          <div className="bg-mm-bg-primary/50 rounded-xl p-4 border border-mm-border">
            <p className="text-sm text-mm-text-secondary leading-relaxed">
              🌍 If you lined up all {totalKm.toFixed(0)} km in a straight line, you'd have walked from Chennai to
              <strong className="text-white">{totalKm >= 600 ? ' Mumbai and back! 🚀' : totalKm >= 350 ? ' Bangalore and halfway back! 🛣️' : totalKm >= 150 ? ' Pondicherry and beyond! 🏖️' : ' Mahabalipuram a few times! 🏛️'}</strong>
            </p>
          </div>
          <div className="bg-mm-bg-primary/50 rounded-xl p-4 border border-mm-border">
            <p className="text-sm text-mm-text-secondary leading-relaxed">
              ⏱️ <strong className="text-mm-orange">{daysRemaining} days</strong> left.
              At current pace ({avgKmPerPlayer} km/player), the fleet will add
              <strong className="text-white"> {(parseFloat(avgKmPerPlayer) * totalPlayers * daysRemaining).toFixed(0)} km</strong> more. Let's goooo! 🔥
            </p>
          </div>
          <div className="bg-mm-bg-primary/50 rounded-xl p-4 border border-mm-border">
            <p className="text-sm text-mm-text-secondary leading-relaxed">
              😤 <strong className="text-mm-hot">{acceptedActs.length > 0 ? Math.round((1 - acceptedActs.length / (acceptedActs.length + 5)) * 100) : 0}%</strong> of walks got rejected.
              Common excuse: <em className="text-white/60">"My GPS was off!"</em> Sure, buddy. Sure. 🙄
            </p>
          </div>
        </div>
      </div>

      {/* Sync Progress Dialog */}
      {syncing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 w-full max-w-lg max-h-[80vh] shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-bold flex items-center gap-2">
                  <span className="icon text-mm-orange animate-spin" style={{ fontSize: '20px' }}>progress_activity</span>
                  Syncing with Strava
                </h3>
                <p className="text-xs text-mm-text-muted mt-1">Type: Walk, Hike · Period: Challenge window · Source: Strava API</p>
              </div>
              <span className="text-sm text-mm-text-secondary font-mono">{syncProgress.current}/{syncProgress.total}</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-mm-bg-elevated mb-2 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{
                width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #ff6b35, #06d6a0)',
              }} />
            </div>
            <p className="text-xs text-mm-text-muted mb-4">
              {syncProgress.currentPlayer && syncProgress.currentPlayer !== 'Done!'
                ? `Syncing: ${syncProgress.currentPlayer}...`
                : syncProgress.currentPlayer === 'Done!' ? '✅ All players synced!' : 'Preparing...'}
            </p>

            {/* Log */}
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[200px] max-h-[400px] bg-mm-bg-primary rounded-xl p-3">
              {syncLog.length === 0 && (
                <p className="text-xs text-mm-text-muted text-center py-8">Waiting for first player...</p>
              )}
              {syncLog.map((log, i) => (
                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                  log.status === 'done' ? 'bg-mm-teal/5 border border-mm-teal/10' :
                  log.status === 'skipped' ? 'bg-mm-bg-elevated border border-mm-border' :
                  'bg-mm-hot/5 border border-mm-hot/10'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`icon-sm ${
                      log.status === 'done' ? 'text-mm-teal' : log.status === 'skipped' ? 'text-mm-text-muted' : 'text-mm-hot'
                    }`}>
                      {log.status === 'done' ? 'check_circle' : log.status === 'skipped' ? 'skip_next' : 'error'}
                    </span>
                    <span className="font-medium">{log.player}</span>
                    {log.reason && <span className="text-mm-text-muted">— {log.reason}</span>}
                  </div>
                  {log.status === 'done' && (
                    <div className="flex gap-2">
                      <span className="text-mm-teal">+{log.accepted}</span>
                      {(log.rejected || 0) > 0 && <span className="text-mm-hot">-{log.rejected}</span>}
                      <span className="text-mm-text-muted">{log.activities} fetched</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Close button (only when done) */}
            {syncProgress.currentPlayer === 'Done!' && (
              <button onClick={() => setSyncing(false)}
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

function CatchyStat({ icon, value, label, sub, color }: { icon: string; value: any; label: string; sub: string; color: string }) {
  return (
    <div className="bg-mm-bg-card border border-mm-border rounded-xl p-4 text-center hover:border-mm-orange/20 transition">
      <span className={`icon-sm ${color}`}>{icon}</span>
      <div className={`font-display text-xl font-bold mt-2 ${color}`}>{value}</div>
      <div className="text-[0.65rem] text-mm-text-secondary mt-1">{label}</div>
      <div className="text-[0.55rem] text-mm-text-muted">{sub}</div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles = rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-black shadow-lg shadow-yellow-500/30' :
    rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-black' :
    rank === 3 ? 'bg-gradient-to-br from-orange-600 to-orange-800 text-white' :
    'bg-mm-bg-elevated text-mm-text-muted';
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${styles}`}>{rank}</div>
  );
}
