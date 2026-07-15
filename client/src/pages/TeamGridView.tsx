import { GridLoader } from '../lib/loaders';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

interface DayCell {
  date: string;
  totalKm: number;
  scoredKm: number;
  activities: any[];
}

export default function TeamGridView() {
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('filter') || '');
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [playerDays, setPlayerDays] = useState<Map<string, Map<string, DayCell>>>(new Map());
  const [dates, setDates] = useState<string[]>([]);
  const [challenge, setChallenge] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ player: any; date: string; cell: DayCell } | null>(null);
  const [splitResult, setSplitResult] = useState<{ id: string; status: string; reason: string } | null>(null);

  async function overrideActivity(actId: string, action: 'approve' | 'reject') {
    await api.post(`/activities/${actId}/${action}`, action === 'reject' ? { reason: 'Rejected by admin (manual override)' } : undefined);
    setModal(null);
    await loadTeamData(selectedTeamId);
  }

  async function checkSplitPace(actId: string) {
    setSplitResult({ id: actId, status: 'checking', reason: 'Fetching Strava streams...' });
    try {
      const result = await api.post(`/sync/split-pace/${actId}`);
      setSplitResult({ id: actId, status: result.status, reason: result.reason });
      if (result.status === 'flagged') {
        // Refresh grid after flagging
        setTimeout(() => { setModal(null); loadTeamData(selectedTeamId); }, 2000);
      }
    } catch (err: any) {
      setSplitResult({ id: actId, status: 'error', reason: err.message });
    }
  }

  useEffect(() => { loadTeams(); }, []);

  async function loadTeams() {
    const [tData, cData] = await Promise.all([api.get('/teams'), api.get('/challenge')]);
    setTeams(tData.teams);
    setChallenge(cData.config);
    if (tData.teams.length > 0) {
      setSelectedTeamId(tData.teams[0].id);
      loadTeamData(tData.teams[0].id, cData.config);
    }
  }

  async function loadTeamData(teamId: string, challengeConfig?: any) {
    const config = challengeConfig || challenge;
    const teamDetail = await api.get(`/teams/${teamId}`);
    const teamPlayers = teamDetail.team.players;
    setPlayers(teamPlayers);

    // Generate date range
    const start = config ? new Date(config.startDate) : new Date();
    const end = config ? new Date(config.endDate) : new Date();
    const now = new Date();
    const effectiveEnd = end < now ? end : now;
    const dateList: string[] = [];
    const d = new Date(start);
    while (d <= effectiveEnd) {
      dateList.push(d.toLocaleDateString('en-CA')); // YYYY-MM-DD in local TZ
      d.setDate(d.getDate() + 1);
    }
    setDates(dateList);

    // Fetch activities for this team only
    const actData = await api.get(`/activities?teamId=${teamId}&limit=5000`);
    const teamActivities = actData.activities || [];

    // Helper: get local date string (IST) from UTC datetime string
    const toLocalDate = (utcStr: string) => {
      const d = new Date(utcStr);
      return d.toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone
    };

    // Build player → day → cell map
    const pdMap = new Map<string, Map<string, DayCell>>();

    for (const player of teamPlayers) {
      const dayMap = new Map<string, DayCell>();

      for (const date of dateList) {
        const dayActs = teamActivities.filter((a: any) =>
          a.playerId === player.id && toLocalDate(a.startDate) === date
        );

        const totalKm = dayActs.reduce((s: number, a: any) => s + a.distanceMeters / 1000, 0);
        const scoredKm = dayActs
          .filter((a: any) => a.status === 'ACCEPTED')
          .reduce((s: number, a: any) => s + (a.creditedMeters || a.distanceMeters) / 1000, 0);

        dayMap.set(date, { date, totalKm, scoredKm, activities: dayActs });
      }

      pdMap.set(player.id, dayMap);
    }

    setPlayerDays(pdMap);
    setLoading(false);
  }

  function handleTeamChange(teamId: string) {
    setSelectedTeamId(teamId);
    loadTeamData(teamId);
  }


  if (loading) return <GridLoader />;
  // Show all dates — horizontal scroll handles overflow
  const visibleDates = dates;

  return (
    <div className="max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Team Grid View</h1>
          <p className="text-sm text-mm-text-muted mt-1">Players × Days — click any cell for details</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {['', 'flagged', 'rejected'].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-full text-[0.65rem] font-semibold uppercase transition ${
                  statusFilter === f ? (f === 'flagged' ? 'bg-mm-gold/15 text-mm-gold border border-mm-gold/30' : f === 'rejected' ? 'bg-mm-hot/15 text-mm-hot border border-mm-hot/30' : 'gradient-hero text-white') : 'bg-mm-bg-card border border-mm-border text-mm-text-muted hover:text-white'
                }`}>
                {f || 'All'}
              </button>
            ))}
          </div>
          <select value={selectedTeamId} onChange={e => handleTeamChange(e.target.value)}
            className="px-4 py-2.5 bg-mm-bg-card border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
            {teams.map(t => <option key={t.id} value={t.id}>{t.emblem} {t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-mm-text-muted">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-mm-teal/15 border border-mm-teal/30"></span> Max (7km)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-mm-teal/8 border border-mm-teal/20"></span> Partial</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-mm-gold/10 border border-mm-gold/30"></span> Flagged</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-mm-hot/10 border border-mm-hot/30"></span> All Rejected</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-mm-border"></span> No Activity</span>
      </div>

      {/* Grid Table */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto" style={{ maxWidth: '100%' }}>
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-mm-bg-card px-4 py-3 text-left text-xs text-mm-text-muted uppercase tracking-wider border-b border-r border-mm-border min-w-[160px]">
                  Player
                </th>
                {visibleDates.map(date => {
                  const d = new Date(date);
                  const dayName = d.toLocaleDateString('en', { weekday: 'short' });
                  const dayNum = d.getDate();
                  const isToday = date === new Date().toLocaleDateString('en-CA');
                  const isMonday = d.getDay() === 1;
                  return (
                    <th key={date} className={`px-1 py-3 text-center text-[0.6rem] uppercase tracking-wider border-b border-mm-border min-w-[44px] ${isToday ? 'text-mm-orange' : 'text-mm-text-muted'} ${isMonday ? 'border-l-2 border-l-mm-orange/30' : ''}`}>
                      <div>{dayName}</div>
                      <div className={`font-display text-sm font-bold ${isToday ? 'text-mm-orange' : 'text-mm-text-secondary'}`}>{dayNum}</div>
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-center text-xs text-mm-text-muted uppercase tracking-wider border-b border-l border-mm-border min-w-[70px]">Total</th>
              </tr>
            </thead>
            <tbody>
              {players.map(player => {
                const dayMap = playerDays.get(player.id);
                const totalScored = dayMap
                  ? Array.from(dayMap.values()).reduce((s, c) => s + c.scoredKm, 0)
                  : 0;

                return (
                  <tr key={player.id} className="hover:bg-mm-bg-primary/30 transition">
                    {/* Player name */}
                    <td className="sticky left-0 z-10 bg-mm-bg-card px-4 py-2 border-b border-r border-mm-border">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full gradient-hero flex items-center justify-center text-[0.55rem] font-bold text-white flex-shrink-0">
                          {player.user.name.split(' ').map((n: string) => n[0]).join('')}
                        </div>
                        <div>
                          <div className="text-xs font-medium truncate max-w-[100px]">{player.user.name}</div>
                          <div className="text-[0.55rem] text-mm-text-muted">
                            {player.gender === 'MALE' ? '♂' : '♀'}
                            {player.status === 'RETIRED' && <span className="text-mm-hot ml-1">RET</span>}
                            {player.status === 'STANDBY' && <span className="text-mm-gold ml-1">SBY</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Day cells */}
                    {visibleDates.map(date => {
                      const cell = dayMap?.get(date);
                      const isMonday = new Date(date).getDay() === 1;
                      const mondayBorder = isMonday ? 'border-l-2 border-l-mm-orange/30' : '';

                      if (!cell || cell.activities.length === 0) {
                        return (
                          <td key={date} className={`px-1 py-2 text-center border-b border-mm-border ${mondayBorder}`}>
                            <div className="w-full h-9 rounded-md border border-mm-border/50 opacity-30"></div>
                          </td>
                        );
                      }

                      return (
                        <td key={date} className={`px-0.5 py-1 text-center border-b border-mm-border ${mondayBorder}`}>
                          <button
                            onClick={() => setModal({ player, date, cell })}
                            className="w-full flex flex-col gap-0.5 items-center transition hover:scale-105"
                          >
                            {cell.activities.map((act: any, idx: number) => {
                              const matchesFilter = !statusFilter ||
                                (statusFilter === 'flagged' ? !!act.flagReason : act.status === statusFilter.toUpperCase());
                              const isFlagged = act.status === 'ACCEPTED' && act.flagReason;
                              return (
                                <div key={idx} className={`w-full rounded-sm px-0.5 py-0.5 text-[0.55rem] font-display font-bold leading-tight relative ${
                                  isFlagged ? 'bg-mm-gold/15 text-mm-teal border border-mm-gold/40' :
                                  act.status === 'ACCEPTED' ? 'bg-mm-teal/15 text-mm-teal border border-mm-teal/30' :
                                  act.status === 'REJECTED' ? 'bg-mm-hot/15 text-mm-hot border border-mm-hot/30' :
                                  'bg-mm-gold/15 text-mm-gold border border-mm-gold/30'
                                } ${!matchesFilter ? 'opacity-10' : ''}`}>
                                  {((act.creditedMeters || act.distanceMeters) / 1000).toFixed(2)}
                                </div>
                              );
                            })}
                          </button>
                        </td>
                      );
                    })}

                    {/* Total */}
                    <td className="px-4 py-2 text-center border-b border-l border-mm-border">
                      <span className="font-display font-bold text-sm text-mm-teal">{totalScored.toFixed(2)}</span>
                      <span className="text-[0.55rem] text-mm-text-muted ml-0.5">km</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-bold">{modal.player.user.name}</h3>
                <p className="text-sm text-mm-text-muted">{new Date(modal.date).toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
              <button onClick={() => setModal(null)} className="w-8 h-8 rounded-full bg-mm-bg-primary flex items-center justify-center text-mm-text-muted hover:text-white">
                <span className="icon-sm">close</span>
              </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-xl font-bold text-mm-teal">{modal.cell.scoredKm.toFixed(2)}</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Scored KM</div>
              </div>
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-xl font-bold text-white">{modal.cell.totalKm.toFixed(2)}</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Total KM</div>
              </div>
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-xl font-bold text-mm-gold">{modal.cell.activities.length}</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Activities</div>
              </div>
            </div>

            {/* Activity list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {modal.cell.activities.map((act: any) => (
                <div key={act.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                  act.status === 'ACCEPTED' ? 'bg-mm-teal/5 border-mm-teal/20' :
                  act.status === 'REJECTED' ? 'bg-mm-hot/5 border-mm-hot/20' :
                  'bg-mm-gold/5 border-mm-gold/20'
                }`}>
                  <span className={`icon-sm flex-shrink-0 ${
                    act.status === 'ACCEPTED' ? 'text-mm-teal' : act.status === 'REJECTED' ? 'text-mm-hot' : 'text-mm-gold'
                  }`}>
                    {act.status === 'ACCEPTED' ? 'check_circle' : act.status === 'REJECTED' ? 'cancel' : 'warning'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-display font-semibold">{(act.distanceMeters / 1000).toFixed(2)} km</span>
                      <span className="text-mm-text-muted">{(act.avgSpeed * 3.6).toFixed(1)} km/h</span>
                      <span className="text-mm-text-muted">{(act.movingTimeSeconds / 60).toFixed(0)} min</span>
                    </div>
                    {act.rejectionReason && (
                      <div className="text-xs text-mm-hot mt-0.5 truncate">{act.rejectionReason}</div>
                    )}
                    {splitResult && splitResult.id === act.id && (
                      <div className={`text-xs mt-0.5 ${
                        splitResult.status === 'clean' ? 'text-mm-teal' :
                        splitResult.status === 'checking' ? 'text-mm-text-muted animate-pulse' :
                        splitResult.status === 'flagged' ? 'text-mm-gold' : 'text-mm-hot'
                      }`}>
                        {splitResult.status === 'checking' ? '⏳ ' : splitResult.status === 'clean' ? '✅ ' : splitResult.status === 'flagged' ? '⚠️ ' : '❌ '}
                        {splitResult.reason}
                      </div>
                    )}
                  </div>
                  {/* Override actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => checkSplitPace(act.id)} title="Check km splits"
                      className="w-7 h-7 rounded-full bg-mm-purple/15 text-purple-300 border border-mm-purple/30 flex items-center justify-center hover:scale-110 transition">
                      <span className="icon-sm">query_stats</span>
                    </button>
                    {act.status !== 'ACCEPTED' && (
                      <button onClick={() => overrideActivity(act.id, 'approve')} title="Approve"
                        className="w-7 h-7 rounded-full bg-mm-teal/15 text-mm-teal border border-mm-teal/30 flex items-center justify-center hover:scale-110 transition">
                        <span className="icon-sm">check</span>
                      </button>
                    )}
                    {act.status !== 'REJECTED' && (
                      <button onClick={() => overrideActivity(act.id, 'reject')} title="Reject"
                        className="w-7 h-7 rounded-full bg-mm-hot/15 text-mm-hot border border-mm-hot/30 flex items-center justify-center hover:scale-110 transition">
                        <span className="icon-sm">close</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
