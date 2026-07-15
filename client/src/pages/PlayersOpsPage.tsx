import { PageLoader } from '../lib/loaders';
import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface PlayerRow {
  id: string;
  user: { id: string; name: string; stravaAthleteId: string; email: string; avatarUrl: string; role: string };
  team: { id: string; name: string; emblem: string };
  teamId: string;
  gender: string;
  status: string;
  substitutedAt: string | null;
}

interface TeamGroup {
  teamId: string;
  teamName: string;
  teamEmblem: string;
  players: PlayerRow[];
  totalDistance: number;
  totalPoints: number;
  isExpanded: boolean;
}

export default function PlayersOpsPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teamGroups, setTeamGroups] = useState<TeamGroup[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Unassigned users
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [showUnassigned, setShowUnassigned] = useState(false);

  // Activity modal
  const [activityModal, setActivityModal] = useState<{ player: PlayerRow; activities: any[] } | null>(null);

  // Weekly stats per player
  const [playerStats, setPlayerStats] = useState<Map<string, { weeks: { acts: number; km: number }[]; total: { acts: number; km: number } }>>(new Map());
  const [numWeeks, setNumWeeks] = useState(3);

  // Sub modal
  const [subModal, setSubModal] = useState<{ player: PlayerRow; subs: PlayerRow[] } | null>(null);
  const [subForm, setSubForm] = useState({ substituteId: '', notes: '', effectiveDate: '' });

  // Sync progress
  const [syncLog, setSyncLog] = useState<{ player: string; status: string; activities?: number; accepted?: number; rejected?: number; reason?: string }[]>([]);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, currentPlayer: '', done: false });

  // Split pace audit
  const [splitAudit, setSplitAudit] = useState<{ playerName: string; activities: any[]; accessToken: string; results: Map<string, { status: string; splits: { km: number; pace: number; status: string }[]; reason: string }>; current: number; total: number; done: boolean } | null>(null);

  // Team change modal
  const [teamChangeModal, setTeamChangeModal] = useState<PlayerRow | null>(null);
  const [newTeamId, setNewTeamId] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [pData, tData, lbData, actData, chalData, unassignedData] = await Promise.all([
      api.get('/players'),
      api.get('/teams'),
      api.get('/scores/players'),
      api.get('/activities?limit=5000'),
      api.get('/challenge'),
      api.get('/players/unassigned'),
    ]);
    setPlayers(pData.players);
    setTeams(tData.teams);
    setUnassigned(unassignedData.users || []);

    // Compute weekly stats per player
    const challenge = chalData.config;
    const startDate = challenge ? new Date(challenge.startDate) : new Date();
    const endDate = challenge ? new Date(challenge.endDate) : new Date();
    const totalWeeks = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7));
    const statsMap = new Map<string, { weeks: { acts: number; km: number }[]; total: { acts: number; km: number } }>();

    for (const p of pData.players) {
      const pActs = (actData.activities || []).filter((a: any) => a.playerId === p.id && a.status === 'ACCEPTED');
      const weeks: { acts: number; km: number }[] = Array.from({ length: totalWeeks }, () => ({ acts: 0, km: 0 }));

      for (const a of pActs) {
        const actDate = new Date(a.startDate);
        // Use local date (IST) for day calculation
        const actLocal = actDate.toLocaleDateString('en-CA'); // YYYY-MM-DD in IST
        const startLocal = startDate.toLocaleDateString('en-CA');
        const diffDays = Math.floor((new Date(actLocal).getTime() - new Date(startLocal).getTime()) / (1000 * 60 * 60 * 24));
        const weekIdx = Math.min(Math.floor(diffDays / 7), totalWeeks - 1);
        if (weekIdx >= 0) {
          const km = (a.creditedMeters || a.distanceMeters || 0) / 1000;
          weeks[weekIdx].acts++;
          weeks[weekIdx].km += km;
        }
      }

      const total = weeks.reduce((s, w) => ({ acts: s.acts + w.acts, km: s.km + w.km }), { acts: 0, km: 0 });
      statsMap.set(p.id, { weeks, total });
    }
    setPlayerStats(statsMap);
    setLoading(false);
    setNumWeeks(totalWeeks);

    // Build team groups
    const groups: TeamGroup[] = tData.teams.map((t: any) => {
      const teamPlayers = pData.players.filter((p: any) => p.teamId === t.id);
      const playerPts = lbData.rankings || [];
      const totalPts = teamPlayers.reduce((s: number, p: any) => {
        const pr = playerPts.find((r: any) => r.playerId === p.id);
        return s + (pr?.totalPoints || pr?.totalKm || 0);
      }, 0);
      return {
        teamId: t.id,
        teamName: t.name,
        teamEmblem: t.emblem || '',
        players: teamPlayers,
        totalDistance: 0,
        totalPoints: totalPts,
        isExpanded: false,
      };
    });
    setTeamGroups(groups);
  }

  if (loading) return <PageLoader />;
  // Search filter
  const filteredGroups = teamGroups.map(g => ({
    ...g,
    players: g.players.filter(p => {
      if (!search) return true;
      const q = search.toLowerCase();
      return p.user.name.toLowerCase().includes(q) ||
        p.user.stravaAthleteId.includes(q) ||
        p.team.name.toLowerCase().includes(q);
    }),
  })).filter(g => g.players.length > 0);

  const totalFiltered = filteredGroups.reduce((s, g) => s + g.players.length, 0);

  // Selection
  function toggleSelect(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function selectAll() {
    const all = new Set(filteredGroups.flatMap(g => g.players.map(p => p.id)));
    setSelected(all);
  }
  function deselectAll() { setSelected(new Set()); }

  // Bulk actions
  async function syncPlayers(playerIds: string[]) {
    setSyncing(true);
    setSyncLog([]);
    setSyncProgress({ current: 0, total: playerIds.length, currentPlayer: '', done: false });

    const { syncLogId } = await api.post('/sync/start', { type: playerIds.length === players.filter(p => p.status === 'ACTIVE').length ? 'all' : 'selected', playerCount: playerIds.length, afterDate: null });
    const playersToSync = players.filter(p => playerIds.includes(p.id));
    let playersSynced = 0, totalFetched = 0, totalAccepted = 0, totalRejected = 0;

    for (let i = 0; i < playersToSync.length; i++) {
      const p = playersToSync[i];
      setSyncProgress({ current: i + 1, total: playersToSync.length, currentPlayer: p.user.name, done: false });

      try {
        const result = await api.post(`/sync/player/${p.id}`);
        setSyncLog(prev => [...prev, { player: result.player || p.user.name, status: result.status, activities: result.activities, accepted: result.accepted, rejected: result.rejected, reason: result.reason }]);
        playersSynced++;
        totalFetched += result.activities || 0;
        totalAccepted += result.accepted || 0;
        totalRejected += result.rejected || 0;
      } catch (err: any) {
        setSyncLog(prev => [...prev, { player: p.user.name, status: 'error', reason: err.message }]);
      }
    }

    await api.post(`/sync/complete/${syncLogId}`, { playersSynced, activitiesFound: totalFetched, accepted: totalAccepted, rejected: totalRejected, flagged: 0 });
    setSyncProgress(prev => ({ ...prev, currentPlayer: 'Done!', done: true }));
    await loadData();
    setSyncing(false);
  }

  function syncSelected() {
    syncPlayers(Array.from(selected));
  }

  function syncAll() {
    const allActive = players.filter(p => p.status === 'ACTIVE').map(p => p.id);
    syncPlayers(allActive);
  }

  // Split pace audit for a player
  async function runSplitAudit(player: PlayerRow) {
    const data = await api.post(`/sync/split-pace/player/${player.id}`);
    if (data.error) { alert(data.error); return; }

    const results = new Map<string, { status: string; splits: { km: number; pace: number; status: string }[]; reason: string }>();
    setSplitAudit({ playerName: data.player, activities: data.activities, accessToken: data.accessToken, results, current: 0, total: data.activities.length, done: false });

    // Process each activity sequentially
    for (let i = 0; i < data.activities.length; i++) {
      const act = data.activities[i];
      setSplitAudit(prev => prev ? { ...prev, current: i + 1 } : null);

      try {
        const result = await api.post(`/sync/split-pace/${act.id}/analyze`, { accessToken: data.accessToken });
        results.set(act.id, { status: result.status, splits: result.splits || [], reason: result.reason });
        setSplitAudit(prev => prev ? { ...prev, results: new Map(results) } : null);
      } catch (err: any) {
        results.set(act.id, { status: 'error', splits: [], reason: err.message });
        setSplitAudit(prev => prev ? { ...prev, results: new Map(results) } : null);
      }

      // Small delay to avoid Strava rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    setSplitAudit(prev => prev ? { ...prev, done: true } : null);
  }

  // View activities
  async function viewActivities(player: PlayerRow) {
    const data = await api.get(`/activities?limit=30`);
    const playerActs = data.activities.filter((a: any) => a.playerId === player.id);
    setActivityModal({ player, activities: playerActs });
  }

  // Open sub modal
  function openSubModal(player: PlayerRow) {
    // Show standby players + retired females (who can return) from the same team
    const availSubs = players.filter(p =>
      p.teamId === player.teamId &&
      p.id !== player.id &&
      (p.status === 'STANDBY' || (p.status === 'RETIRED' && p.gender === 'FEMALE'))
    );
    setSubModal({ player, subs: availSubs });
    setSubForm({ substituteId: '', notes: '', effectiveDate: new Date().toISOString().split('T')[0] });
  }

  async function executeSub() {
    if (!subModal || !subForm.substituteId) return;
    if (!confirm('PERMANENT: This player cannot return. Proceed?')) return;
    await api.post('/substitutions', {
      retiredPlayerId: subModal.player.id,
      substitutePlayerId: subForm.substituteId,
      notes: subForm.notes,
      effectiveDate: subForm.effectiveDate || undefined,
    });
    setSubModal(null);
    // Only refresh players list
    const pData = await api.get('/players');
    setPlayers(pData.players);
    setTeamGroups(prev => prev.map(g => ({
      ...g,
      players: pData.players.filter((p: PlayerRow) => p.teamId === g.teamId),
    })));
  }

  // Change team
  async function changeTeam() {
    if (!teamChangeModal || !newTeamId) return;
    if (newTeamId === '__unassign__') {
      if (!confirm('This will remove the player from their team. Their activities will be deleted. Continue?')) return;
      await api.delete(`/players/${teamChangeModal.id}`);
    } else {
      await api.put(`/players/${teamChangeModal.id}`, { teamId: newTeamId });
    }
    setTeamChangeModal(null);
    setNewTeamId('');
    // Refresh
    const [pData, tData, unData] = await Promise.all([api.get('/players'), api.get('/teams'), api.get('/players/unassigned')]);
    setPlayers(pData.players);
    setUnassigned(unData.users || []);
    setTeamGroups(tData.teams.map((t: any) => ({
      teamId: t.id,
      teamName: t.name,
      teamEmblem: t.emblem || '',
      players: pData.players.filter((p: PlayerRow) => p.teamId === t.id),
      totalDistance: 0,
      totalPoints: 0,
      isExpanded: true,
    })));
  }

  // Delete
  async function deletePlayer(id: string) {
    if (!confirm('Remove this player?')) return;
    try {
      await api.delete(`/players/${id}`);
      // Only refresh players list
      const pData = await api.get('/players');
      setPlayers(pData.players);
      setTeamGroups(prev => prev.map(g => ({
        ...g,
        players: pData.players.filter((p: PlayerRow) => p.teamId === g.teamId),
      })));
    }
    catch { alert('Cannot delete player with activities'); }
  }

  // Toggle status: ACTIVE ↔ STANDBY
  async function toggleStatus(player: PlayerRow) {
    if (player.status === 'RETIRED') return;
    const newStatus = player.status === 'ACTIVE' ? 'STANDBY' : 'ACTIVE';
    await api.put(`/players/${player.id}`, { status: newStatus });
    // Only refresh players list, not activities/scores
    const pData = await api.get('/players');
    setPlayers(pData.players);
    setTeamGroups(prev => prev.map(g => ({
      ...g,
      players: pData.players.filter((p: PlayerRow) => p.teamId === g.teamId),
    })));
  }

  // Toggle team expand
  function toggleTeam(teamId: string) {
    setTeamGroups(prev => prev.map(g => g.teamId === teamId ? { ...g, isExpanded: !g.isExpanded } : g));
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Players & Operations</h1>
          <p className="text-sm text-mm-text-muted mt-1">{totalFiltered} players across {filteredGroups.length} teams</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={syncAll} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-mm-orange/15 border border-mm-orange/30 rounded-full text-xs font-semibold text-mm-orange hover:-translate-y-0.5 transition disabled:opacity-50">
            <span className="icon-sm">{syncing ? 'progress_activity' : 'sync'}</span> Sync All
          </button>
          {selected.size > 0 && (
            <>
              <button onClick={syncSelected} disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-mm-teal/15 border border-mm-teal/30 rounded-full text-xs font-semibold text-mm-teal hover:-translate-y-0.5 transition disabled:opacity-50">
                <span className="icon-sm">{syncing ? 'progress_activity' : 'sync'}</span> Sync ({selected.size})
              </button>
            </>
          )}
          {unassigned.length > 0 && (
            <button onClick={() => setShowUnassigned(!showUnassigned)}
              className="flex items-center gap-2 px-4 py-2.5 bg-mm-gold/15 border border-mm-gold/30 rounded-full font-display font-semibold text-sm text-mm-gold hover:-translate-y-0.5 transition">
              <span className="icon-sm">person_search</span> Unassigned ({unassigned.length})
            </button>
          )}
        </div>
      </div>

      {/* Search + Selection */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1">
          <span className="icon-sm absolute left-3 top-2.5 text-mm-text-muted">search</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, Strava ID, or team..."
            className="w-full pl-10 pr-4 py-2.5 bg-mm-bg-card border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
        </div>
        <button onClick={selectAll} className="text-xs text-mm-text-muted hover:text-white transition flex items-center gap-1">
          <span className="icon-sm">select_all</span> All
        </button>
        <button onClick={deselectAll} className="text-xs text-mm-text-muted hover:text-white transition flex items-center gap-1">
          <span className="icon-sm">deselect</span> None
        </button>
        <span className="text-xs text-mm-text-muted">{selected.size} selected</span>
      </div>

      {/* Unassigned Users Panel */}
      {showUnassigned && unassigned.length > 0 && (
        <div className="bg-mm-bg-card border border-mm-gold/30 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="icon text-mm-gold" style={{ fontSize: '18px' }}>person_search</span>
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide">Unassigned Users</h3>
            <span className="text-xs text-mm-text-muted">— Logged in via Strava but not assigned to any team</span>
          </div>
          <div className="space-y-2">
            {unassigned.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 bg-mm-bg-primary rounded-lg">
                <div className="flex items-center gap-3">
                  {u.avatarUrl ? (
                    <img src={u.avatarUrl} className="w-8 h-8 rounded-full" alt="" />
                  ) : (
                    <div className="w-8 h-8 rounded-full gradient-hero flex items-center justify-center text-[0.55rem] font-bold text-white">
                      {u.name?.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">{u.name}</div>
                    <div className="text-[0.6rem] text-mm-text-muted">Strava: {u.stravaAthleteId} · Joined {new Date(u.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select id={`assign-team-${u.id}`} className="px-2 py-1.5 bg-mm-bg-card border border-mm-border rounded-lg text-xs focus:border-mm-orange outline-none">
                    <option value="">Team...</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select id={`assign-gender-${u.id}`} className="px-2 py-1.5 bg-mm-bg-card border border-mm-border rounded-lg text-xs focus:border-mm-orange outline-none">
                    <option value="MALE">♂ M</option>
                    <option value="FEMALE">♀ F</option>
                  </select>
                  <select id={`assign-status-${u.id}`} className="px-2 py-1.5 bg-mm-bg-card border border-mm-border rounded-lg text-xs focus:border-mm-orange outline-none">
                    <option value="ACTIVE">Active</option>
                    <option value="STANDBY">Standby</option>
                  </select>
                  <button onClick={async () => {
                    const teamId = (document.getElementById(`assign-team-${u.id}`) as HTMLSelectElement).value;
                    const gender = (document.getElementById(`assign-gender-${u.id}`) as HTMLSelectElement).value;
                    const status = (document.getElementById(`assign-status-${u.id}`) as HTMLSelectElement).value;
                    if (!teamId) { alert('Select a team'); return; }
                    await api.post('/players', { userId: u.id, teamId, gender, slot: 'MAIN', status });
                    const [pData, unData] = await Promise.all([api.get('/players'), api.get('/players/unassigned')]);
                    setPlayers(pData.players);
                    setUnassigned(unData.users || []);
                    setTeamGroups(prev => prev.map(g => ({ ...g, players: pData.players.filter((p: PlayerRow) => p.teamId === g.teamId) })));
                  }}
                    className="px-3 py-1.5 gradient-hero rounded-lg text-xs font-semibold text-white">
                    Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team-Grouped Table */}
      <div className="space-y-3">
        {filteredGroups.map(group => (
          <div key={group.teamId} className="border border-mm-border rounded-xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${group.teamEmblem || '#6B7280'}08, ${group.teamEmblem || '#6B7280'}03)` }}>
            {/* Team Header (clickable) */}
            <button onClick={() => toggleTeam(group.teamId)}
              className="w-full flex items-center justify-between px-5 py-3 transition" style={{ background: `${group.teamEmblem || '#6B7280'}12` }}>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-md flex-shrink-0" style={{ backgroundColor: group.teamEmblem || '#6B7280' }} />
                <span className="font-display font-semibold text-sm uppercase tracking-wide">{group.teamName}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-mm-text-muted">
                <span>{group.players.length} players</span>
                <span className="text-mm-border">|</span>
                <span>{group.players.filter(p => p.gender === 'FEMALE').length}F</span>
                <span className="text-mm-border">|</span>
                <span>{group.players.filter(p => p.gender === 'MALE').length}M</span>
                <span className="text-mm-border">|</span>
                <span>{playerStats.get(group.players[0]?.id)?.total?.acts !== undefined ? group.players.reduce((s, p) => s + (playerStats.get(p.id)?.total?.acts || 0), 0) : 0} activities</span>
                <span className="text-mm-border">|</span>
                <span className="text-mm-gold font-semibold">{typeof group.totalPoints === 'number' ? group.totalPoints.toFixed(2) : group.totalPoints} km</span>
                <span className={`icon-sm transition-transform ${group.isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
              </div>
            </button>

            {/* Expanded Members */}
            {group.isExpanded && (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed">
                <thead>
                  <tr className="border-t border-mm-border">
                    <th className="w-10 px-3 py-2 text-center align-middle"><input type="checkbox" className="accent-mm-orange" onChange={() => {
                      const ids = group.players.map(p => p.id);
                      const allSelected = ids.every(id => selected.has(id));
                      const next = new Set(selected);
                      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
                      setSelected(next);
                    }} checked={group.players.every(p => selected.has(p.id))} /></th>
                    <th className="w-[160px] text-left px-3 py-2 text-[0.6rem] text-mm-text-muted uppercase">Player</th>
                    <th className="w-[50px] text-left px-3 py-2 text-[0.6rem] text-mm-text-muted uppercase">Gender</th>
                    <th className="w-[75px] text-left px-3 py-2 text-[0.6rem] text-mm-text-muted uppercase">Status</th>
                    <th className="w-[90px] text-left px-3 py-2 text-[0.6rem] text-mm-text-muted uppercase">Strava ID</th>
                    {Array.from({ length: numWeeks }, (_, i) => (
                      <th key={i} className="w-[70px] text-center px-1 py-2 text-[0.6rem] text-mm-text-muted uppercase border-l border-mm-border/30" colSpan={2}>W{i + 1}</th>
                    ))}
                    <th className="w-[70px] text-center px-1 py-2 text-[0.6rem] text-mm-gold uppercase border-l border-mm-border/30 font-semibold" colSpan={2}>Total</th>
                    <th className="w-[100px] text-right px-3 py-2 text-[0.6rem] text-mm-text-muted uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.players.map(p => (
                    <tr key={p.id} className={`border-t border-mm-border/50 hover:bg-mm-bg-primary/30 transition ${p.status === 'RETIRED' ? 'opacity-50' : ''}`}>
                      <td className="w-10 px-3 py-2.5 text-center align-middle"><input type="checkbox" className="accent-mm-orange" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} /></td>
                      <td className="w-[160px] px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[0.55rem] font-bold text-white flex-shrink-0" style={{ background: group.teamEmblem || '#6B7280' }}>
                            {p.user.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate max-w-[100px]" title={p.user.name}>{p.user.name}</div>
                            {p.substitutedAt && <div className="text-[0.55rem] text-mm-hot">Retired {new Date(p.substitutedAt).toLocaleDateString()}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="w-[50px] px-3 py-2.5">
                        <span className={`text-xs font-semibold ${p.gender === 'MALE' ? 'text-mm-blue' : 'text-mm-hot'}`}>
                          {p.gender === 'MALE' ? '♂ M' : '♀ F'}
                        </span>
                      </td>
                      <td className="w-[75px] px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[0.55rem] font-semibold border cursor-pointer transition hover:scale-105 ${
                          p.status === 'ACTIVE' ? 'bg-mm-teal/10 text-mm-teal border-mm-teal/30' :
                          p.status === 'STANDBY' ? 'bg-mm-gold/10 text-mm-gold border-mm-gold/30' :
                          'bg-mm-hot/10 text-mm-hot border-mm-hot/30'
                        }`} onClick={() => toggleStatus(p)} title="Click to toggle status">{p.status}</span>
                      </td>
                      <td className="w-[90px] px-3 py-2.5 text-xs text-mm-text-muted font-mono truncate" title={p.user.stravaAthleteId}>{p.user.stravaAthleteId}</td>
                      {/* Weekly stats */}
                      {(() => {
                        const stats = playerStats.get(p.id) || { weeks: Array.from({ length: numWeeks }, () => ({ acts: 0, km: 0 })), total: { acts: 0, km: 0 } };
                        return (
                          <>
                            {stats.weeks.map((w, i) => (
                              <React.Fragment key={i}>
                                <td className="px-1 py-2.5 text-center text-[0.6rem] text-mm-text-muted border-l border-mm-border/30">{w.acts || '–'}</td>
                                <td className="px-1 py-2.5 text-center text-[0.6rem] font-semibold text-mm-teal">{w.km > 0 ? w.km.toFixed(2) : '–'}</td>
                              </React.Fragment>
                            ))}
                            <td className="px-1 py-2.5 text-center text-[0.6rem] text-mm-text-muted border-l border-mm-border/30 font-semibold">{stats.total.acts || '–'}</td>
                            <td className="px-1 py-2.5 text-center text-[0.6rem] font-bold text-mm-gold">{stats.total.km > 0 ? stats.total.km.toFixed(2) : '–'}</td>
                          </>
                        );
                      })()}
                      <td className="w-[100px] px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => viewActivities(p)} title="View Activities"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-mm-text-muted hover:text-mm-teal hover:bg-mm-teal/10 transition">
                            <span className="icon-sm">directions_run</span>
                          </button>
                          <button onClick={() => runSplitAudit(p)} title="Split Pace Audit"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-mm-text-muted hover:text-purple-300 hover:bg-purple-500/10 transition">
                            <span className="icon-sm">query_stats</span>
                          </button>
                          <button onClick={() => { setTeamChangeModal(p); setNewTeamId(''); }} title="Change Team"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-mm-text-muted hover:text-mm-purple hover:bg-purple-500/10 transition">
                            <span className="icon-sm">move_up</span>
                          </button>
                          {p.status === 'ACTIVE' && (
                            <button onClick={() => openSubModal(p)} title="Substitute"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-mm-text-muted hover:text-mm-orange hover:bg-mm-orange/10 transition">
                              <span className="icon-sm">swap_horiz</span>
                            </button>
                          )}
                          <button onClick={() => deletePlayer(p.id)} title="Remove"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-mm-text-muted hover:text-mm-hot hover:bg-mm-hot/10 transition">
                            <span className="icon-sm">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Activity Modal */}
      {activityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setActivityModal(null)}>
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">{activityModal.player.user.name} — Activities</h3>
              <button onClick={() => setActivityModal(null)} className="w-8 h-8 rounded-full bg-mm-bg-primary flex items-center justify-center text-mm-text-muted hover:text-white">
                <span className="icon-sm">close</span>
              </button>
            </div>
            <div className="space-y-2">
              {activityModal.activities.length === 0 && <p className="text-sm text-mm-text-muted text-center py-6">No activities synced</p>}
              {activityModal.activities.map((a: any) => (
                <div key={a.id} className={`flex items-center gap-3 p-3 rounded-lg border ${
                  a.status === 'ACCEPTED' ? 'border-mm-teal/20 bg-mm-teal/5' :
                  a.status === 'REJECTED' ? 'border-mm-hot/20 bg-mm-hot/5' : 'border-mm-gold/20 bg-mm-gold/5'
                }`}>
                  <span className={`icon-sm ${a.status === 'ACCEPTED' ? 'text-mm-teal' : a.status === 'REJECTED' ? 'text-mm-hot' : 'text-mm-gold'}`}>
                    {a.status === 'ACCEPTED' ? 'check_circle' : a.status === 'REJECTED' ? 'cancel' : 'warning'}
                  </span>
                  <div className="flex-1">
                    <div className="text-xs font-medium">{(a.distanceMeters/1000).toFixed(2)} km · {(a.avgSpeed*3.6).toFixed(1)} km/h · {(a.movingTimeSeconds/60).toFixed(0)} min</div>
                    <div className="text-[0.6rem] text-mm-text-muted">{new Date(a.startDate).toLocaleString()}</div>
                    {a.rejectionReason && <div className="text-[0.6rem] text-mm-hot mt-0.5">{a.rejectionReason}</div>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[0.5rem] font-semibold uppercase border ${
                    a.status === 'ACCEPTED' ? 'text-mm-teal border-mm-teal/30' : a.status === 'REJECTED' ? 'text-mm-hot border-mm-hot/30' : 'text-mm-gold border-mm-gold/30'
                  }`}>{a.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sub Modal */}
      {subModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSubModal(null)}>
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">Substitute Player</h3>
              <button onClick={() => setSubModal(null)} className="w-8 h-8 rounded-full bg-mm-bg-primary flex items-center justify-center text-mm-text-muted hover:text-white">
                <span className="icon-sm">close</span>
              </button>
            </div>
            <div className="bg-mm-bg-primary rounded-lg p-3 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-xs font-bold text-white">
                {subModal.player.user.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <div className="text-sm font-medium">{subModal.player.user.name}</div>
                <div className="text-xs text-mm-text-muted">Will be retired permanently</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[0.6rem] text-mm-text-muted uppercase">Replace with *</label>
                <select value={subForm.substituteId} onChange={e => setSubForm({...subForm, substituteId: e.target.value})}
                  className="w-full mt-1 px-3 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
                  <option value="">Select substitute</option>
                  {subModal.subs.map(s => <option key={s.id} value={s.id}>{s.user.name} ({s.gender === 'MALE' ? '♂' : '♀'})</option>)}
                </select>
                {subModal.subs.length === 0 && <p className="text-xs text-mm-hot mt-1">No subs available in this team</p>}
              </div>
              <div>
                <label className="text-[0.6rem] text-mm-text-muted uppercase">Effective Date *</label>
                <input type="date" value={subForm.effectiveDate} onChange={e => setSubForm({...subForm, effectiveDate: e.target.value})}
                  className="w-full mt-1 px-3 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
                <p className="text-[0.55rem] text-mm-text-muted mt-1">Date from which the substitute becomes active</p>
              </div>
              <div>
                <label className="text-[0.6rem] text-mm-text-muted uppercase">Notes</label>
                <input value={subForm.notes} onChange={e => setSubForm({...subForm, notes: e.target.value})}
                  placeholder="Reason..." className="w-full mt-1 px-3 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
              </div>
            </div>
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-mm-border">
              <span className="text-[0.6rem] text-mm-hot flex items-center gap-1"><span className="icon-sm">warning</span> Permanent action</span>
              <button onClick={executeSub} disabled={!subForm.substituteId}
                className="flex items-center gap-2 px-5 py-2 bg-mm-hot/90 hover:bg-mm-hot rounded-lg text-xs font-semibold text-white transition disabled:opacity-50">
                <span className="icon-sm">swap_horiz</span> Execute Sub
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Change Modal */}
      {teamChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setTeamChangeModal(null)}>
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold">Change Team</h3>
              <button onClick={() => setTeamChangeModal(null)} className="w-8 h-8 rounded-full bg-mm-bg-primary flex items-center justify-center text-mm-text-muted hover:text-white">
                <span className="icon-sm">close</span>
              </button>
            </div>
            <div className="bg-mm-bg-primary rounded-lg p-3 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-xs font-bold text-white">
                {teamChangeModal.user.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <div className="text-sm font-medium">{teamChangeModal.user.name}</div>
                <div className="text-xs text-mm-text-muted flex items-center gap-1.5">
                  Currently in: <span className="inline-block w-2.5 h-2.5 rounded" style={{ background: teamChangeModal.team.emblem }} />
                  <span className="font-semibold">{teamChangeModal.team.name}</span>
                </div>
              </div>
            </div>
            <div>
              <label className="text-[0.6rem] text-mm-text-muted uppercase">Move to team</label>
              <select value={newTeamId} onChange={e => setNewTeamId(e.target.value)}
                className="w-full mt-1 px-3 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
                <option value="">Select team</option>
                <option value="__unassign__" className="text-mm-hot">⊘ Unassign (remove from team)</option>
                {teams.filter(t => t.id !== teamChangeModal.teamId).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end mt-5 pt-4 border-t border-mm-border">
              <button onClick={changeTeam} disabled={!newTeamId}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold text-white transition disabled:opacity-50 ${newTeamId === '__unassign__' ? 'bg-mm-hot' : 'gradient-hero'}`}>
                <span className="icon-sm">{newTeamId === '__unassign__' ? 'person_remove' : 'move_up'}</span>
                {newTeamId === '__unassign__' ? 'Unassign' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Progress Dialog */}
      {(syncLog.length > 0 || syncProgress.total > 0) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 w-full max-w-lg max-h-[80vh] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-bold flex items-center gap-2">
                  {!syncProgress.done && <span className="icon text-mm-orange animate-spin" style={{ fontSize: '20px' }}>progress_activity</span>}
                  {syncProgress.done && <span className="icon text-mm-teal" style={{ fontSize: '20px' }}>check_circle</span>}
                  Strava Sync
                </h3>
                <p className="text-xs text-mm-text-muted mt-1">Type: Walk, Hike · Fetching since last sync</p>
              </div>
              <span className="text-sm text-mm-text-secondary font-mono">{syncProgress.current}/{syncProgress.total}</span>
            </div>

            <div className="w-full h-2 rounded-full bg-mm-bg-elevated mb-2 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{
                width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%`,
                background: syncProgress.done ? '#06d6a0' : 'linear-gradient(90deg, #ff6b35, #06d6a0)',
              }} />
            </div>
            <p className="text-xs text-mm-text-muted mb-4">
              {syncProgress.currentPlayer && !syncProgress.done
                ? `Syncing: ${syncProgress.currentPlayer}...`
                : syncProgress.done ? '✅ Sync complete!' : 'Preparing...'}
            </p>

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

            {syncProgress.done && (
              <button onClick={() => { setSyncLog([]); setSyncProgress({ current: 0, total: 0, currentPlayer: '', done: false }); }}
                className="mt-4 px-5 py-2.5 gradient-hero rounded-full font-display font-semibold text-sm text-white w-full">
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* Split Pace Audit Dialog */}
      {splitAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-lg font-bold flex items-center gap-2">
                  <span className="icon text-purple-400" style={{ fontSize: '20px' }}>query_stats</span>
                  Split Pace Audit — {splitAudit.playerName}
                </h3>
                <p className="text-xs text-mm-text-muted mt-1">Checking each km split for {splitAudit.total} activities (9–16 min/km allowed)</p>
              </div>
              <span className="text-sm text-mm-text-secondary font-mono">{splitAudit.current}/{splitAudit.total}</span>
            </div>

            <div className="w-full h-2 rounded-full bg-mm-bg-elevated mb-4 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{
                width: `${splitAudit.total > 0 ? (splitAudit.current / splitAudit.total) * 100 : 0}%`,
                background: splitAudit.done ? '#06d6a0' : 'linear-gradient(90deg, #7b2ff7, #06d6a0)',
              }} />
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 min-h-[250px] max-h-[450px]">
              {splitAudit.activities.map((act: any) => {
                const result = splitAudit.results.get(act.id);
                return (
                  <div key={act.id} className={`p-3 rounded-xl border ${
                    !result ? 'bg-mm-bg-primary border-mm-border' :
                    result.status === 'clean' ? 'bg-mm-teal/5 border-mm-teal/15' :
                    result.status === 'flagged' ? 'bg-mm-gold/5 border-mm-gold/15' :
                    'bg-mm-hot/5 border-mm-hot/15'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-mm-text-secondary">{new Date(act.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        <span className="font-semibold">{act.distanceKm} km</span>
                        <span className="text-mm-text-muted">{act.avgPace} min/km avg</span>
                        <span className="text-mm-text-muted">{act.movingMin} min</span>
                      </div>
                      {!result && <span className="text-xs text-mm-text-muted animate-pulse">waiting...</span>}
                      {result && (
                        <span className={`text-xs font-semibold ${
                          result.status === 'clean' ? 'text-mm-teal' : result.status === 'flagged' ? 'text-mm-gold' : 'text-mm-hot'
                        }`}>
                          {result.status === 'clean' ? '✅ OK' : result.status === 'flagged' ? '⚠️ Flagged' : '❌ Error'}
                        </span>
                      )}
                    </div>
                    {/* Split pace list */}
                    {result && result.splits.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {result.splits.map((s, i) => (
                          <span key={i} className={`px-2 py-0.5 rounded text-[0.65rem] font-mono font-semibold border ${
                            s.status === 'ok' ? 'bg-mm-teal/10 text-mm-teal border-mm-teal/20' :
                            s.status === 'fast' ? 'bg-mm-hot/10 text-mm-hot border-mm-hot/20' :
                            'bg-mm-gold/10 text-mm-gold border-mm-gold/20'
                          }`}>
                            Km{s.km}: {s.pace}
                          </span>
                        ))}
                      </div>
                    )}
                    {result && result.status === 'flagged' && (
                      <p className="text-xs text-mm-gold mt-1">{result.reason}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {splitAudit.done && (
              <button onClick={() => setSplitAudit(null)}
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
