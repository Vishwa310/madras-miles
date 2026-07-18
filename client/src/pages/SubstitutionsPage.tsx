import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function SubstitutionsPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [_teams, setTeams] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  // Search / filter
  const [searchTeam, setSearchTeam] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchId, setSearchId] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);

  // Sub form
  const [substituteId, setSubstituteId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [notes, setNotes] = useState('');
  const [executing, setExecuting] = useState(false);

  // History search
  const [historySearch, setHistorySearch] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [pData, tData, hData] = await Promise.all([
      api.get('/players'),
      api.get('/teams'),
      api.get('/substitutions'),
    ]);
    setPlayers(pData.players);
    setTeams(tData.teams);
    setHistory(hData.substitutions);
  }

  // Filter players based on search
  const filteredPlayers = players.filter(p => {
    if (p.status === 'RETIRED') return false;
    if (p.status !== 'ACTIVE') return false;
    const matchTeam = !searchTeam || p.team.name.toLowerCase().includes(searchTeam.toLowerCase());
    const matchName = !searchName || p.user.name.toLowerCase().includes(searchName.toLowerCase());
    const matchId = !searchId || p.user.stravaAthleteId.includes(searchId);
    return matchTeam && matchName && matchId;
  });

  // Available subs for selected player's team
  const availableSubs = selectedPlayer
    ? players.filter(p => p.teamId === selectedPlayer.teamId && p.status === 'STANDBY')
    : [];

  // Filtered history
  const filteredHistory = history.filter(h => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return (
      h.retiredPlayer?.user?.name?.toLowerCase().includes(q) ||
      h.substitutePlayer?.user?.name?.toLowerCase().includes(q) ||
      h.team?.name?.toLowerCase().includes(q) ||
      h.notes?.toLowerCase().includes(q)
    );
  });

  async function executeSub(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlayer || !substituteId) return;
    if (!confirm('This is PERMANENT. The retired player cannot come back. Proceed?')) return;

    setExecuting(true);
    try {
      await api.post('/substitutions', {
        retiredPlayerId: selectedPlayer.id,
        substitutePlayerId: substituteId,
        notes,
      });
      // Reset
      setSelectedPlayer(null);
      setSubstituteId('');
      setEffectiveFrom('');
      setNotes('');
      setSearchName('');
      setSearchTeam('');
      setSearchId('');
      loadData();
    } catch (err: any) {
      alert('Failed: check that both players are on the same team');
    }
    setExecuting(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold uppercase">Substitutions</h1>
        <p className="text-sm text-mm-text-muted mt-1">Search for a player, review their details, then execute a substitution.</p>
      </div>

      {/* Search Filters */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mb-6">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4 flex items-center gap-2">
          <span className="icon-sm">search</span> Find Player to Substitute
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-mm-text-muted uppercase tracking-wider">Team Name</label>
            <div className="relative mt-1">
              <span className="icon-sm absolute left-3 top-2.5 text-mm-text-muted">groups</span>
              <input value={searchTeam} onChange={e => { setSearchTeam(e.target.value); setSelectedPlayer(null); }}
                placeholder="Filter by team..."
                className="w-full pl-10 pr-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-mm-text-muted uppercase tracking-wider">Player Name</label>
            <div className="relative mt-1">
              <span className="icon-sm absolute left-3 top-2.5 text-mm-text-muted">person</span>
              <input value={searchName} onChange={e => { setSearchName(e.target.value); setSelectedPlayer(null); }}
                placeholder="Filter by name..."
                className="w-full pl-10 pr-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs text-mm-text-muted uppercase tracking-wider">Strava ID</label>
            <div className="relative mt-1">
              <span className="icon-sm absolute left-3 top-2.5 text-mm-text-muted">tag</span>
              <input value={searchId} onChange={e => { setSearchId(e.target.value); setSelectedPlayer(null); }}
                placeholder="Filter by ID..."
                className="w-full pl-10 pr-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
          </div>
        </div>

        {/* Search Results */}
        {(searchTeam || searchName || searchId) && !selectedPlayer && (
          <div className="mt-4 border-t border-mm-border pt-4">
            <div className="text-xs text-mm-text-muted mb-2">{filteredPlayers.length} player(s) found</div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredPlayers.map(p => (
                <button key={p.id} onClick={() => setSelectedPlayer(p)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-mm-bg-primary/80 text-left transition border border-transparent hover:border-mm-orange/20">
                  <div className="w-8 h-8 rounded-full gradient-hero flex items-center justify-center text-xs font-bold text-white">
                    {p.user.name.split(' ').map((n: string) => n[0]).join('')}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p.user.name}</div>
                    <div className="text-xs text-mm-text-muted">{p.team.emblem} {p.team.name} · {p.gender === 'MALE' ? '♂' : '♀'} · ID: {p.user.stravaAthleteId}</div>
                  </div>
                  <span className="icon-sm text-mm-text-muted">chevron_right</span>
                </button>
              ))}
              {filteredPlayers.length === 0 && <p className="text-sm text-mm-text-muted text-center py-3">No matching players</p>}
            </div>
          </div>
        )}
      </div>

      {/* Selected Player Details + Sub Form */}
      {selectedPlayer && (
        <form onSubmit={executeSub} className="bg-mm-bg-card border border-mm-orange/20 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-orange flex items-center gap-2">
              <span className="icon-sm">person</span> Selected Player
            </h3>
            <button type="button" onClick={() => setSelectedPlayer(null)} className="text-xs text-mm-text-muted hover:text-white flex items-center gap-1">
              <span className="icon-sm">close</span> Clear
            </button>
          </div>

          {/* Player card */}
          <div className="bg-mm-bg-primary border border-mm-border rounded-xl p-5 mb-5 flex items-center gap-5">
            <div className="w-14 h-14 rounded-full gradient-hero flex items-center justify-center text-lg font-bold text-white">
              {selectedPlayer.user.name.split(' ').map((n: string) => n[0]).join('')}
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold">{selectedPlayer.user.name}</div>
              <div className="text-sm text-mm-text-muted flex items-center gap-4 mt-1">
                <span className="flex items-center gap-1"><span className="icon-sm">groups</span> {selectedPlayer.team.name}</span>
                <span className={selectedPlayer.gender === 'MALE' ? 'text-mm-blue' : 'text-mm-hot'}>{selectedPlayer.gender === 'MALE' ? '♂ Male' : '♀ Female'}</span>
                <span>Strava: {selectedPlayer.user.stravaAthleteId}</span>
                <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold bg-mm-teal/15 text-mm-teal border border-mm-teal/30">{selectedPlayer.slot} · {selectedPlayer.status}</span>
              </div>
            </div>
          </div>

          {/* Sub selection */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Substitute With *</label>
              <select value={substituteId} onChange={e => setSubstituteId(e.target.value)} required
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
                <option value="">Select available sub</option>
                {availableSubs.map(s => (
                  <option key={s.id} value={s.id}>{s.user.name} ({s.gender === 'MALE' ? '♂' : '♀'})</option>
                ))}
              </select>
              {availableSubs.length === 0 && (
                <p className="text-xs text-mm-hot mt-1">No substitutes available in this team</p>
              )}
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Effective From *</label>
              <input type="datetime-local" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} required
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Notes</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for substitution"
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between pt-4 border-t border-mm-border">
            <span className="text-xs text-mm-hot flex items-center gap-1">
              <span className="icon-sm">warning</span> Once retired, this player cannot return to the challenge.
            </span>
            <button type="submit" disabled={executing || !substituteId}
              className="flex items-center gap-2 px-6 py-2.5 bg-mm-hot/90 hover:bg-mm-hot rounded-lg font-semibold text-sm text-white transition disabled:opacity-50">
              <span className="icon-sm">{executing ? 'progress_activity' : 'swap_horiz'}</span>
              {executing ? 'Executing...' : 'Execute Substitution'}
            </button>
          </div>
        </form>
      )}

      {/* Substitution History */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted flex items-center gap-2">
            <span className="icon-sm">history</span> Substitution History
          </h3>
          <div className="relative">
            <span className="icon-sm absolute left-3 top-2 text-mm-text-muted">search</span>
            <input value={historySearch} onChange={e => setHistorySearch(e.target.value)}
              placeholder="Search history..."
              className="pl-9 pr-4 py-2 bg-mm-bg-primary border border-mm-border rounded-lg text-xs focus:border-mm-orange outline-none w-56" />
          </div>
        </div>

        {filteredHistory.length > 0 ? (
          <div className="space-y-2">
            {filteredHistory.map(h => (
              <div key={h.id} className="flex items-center gap-4 py-3 px-3 rounded-lg border-b border-mm-border last:border-0 hover:bg-mm-bg-primary/30 transition">
                <div className="w-9 h-9 rounded-full bg-mm-hot/15 flex items-center justify-center flex-shrink-0">
                  <span className="icon-sm text-mm-hot">swap_horiz</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="text-mm-hot line-through">{h.retiredPlayer?.user?.name}</span>
                    <span className="text-mm-text-muted mx-2">→</span>
                    <span className="text-mm-teal font-medium">{h.substitutePlayer?.user?.name}</span>
                  </div>
                  <div className="text-xs text-mm-text-muted mt-0.5 flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="icon-sm" style={{fontSize: '12px'}}>groups</span> {h.team?.name}</span>
                    <span className="flex items-center gap-1"><span className="icon-sm" style={{fontSize: '12px'}}>schedule</span> {new Date(h.effectiveFrom).toLocaleString()}</span>
                    <span className="flex items-center gap-1"><span className="icon-sm" style={{fontSize: '12px'}}>person</span> by {h.performedBy?.name}</span>
                  </div>
                </div>
                {h.notes && (
                  <span className="text-xs text-mm-text-muted italic max-w-[180px] truncate flex-shrink-0 bg-mm-bg-primary px-2 py-1 rounded">
                    {h.notes}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-mm-text-muted py-6">
            {historySearch ? 'No matching records' : 'No substitutions made yet'}
          </p>
        )}
      </div>
    </div>
  );
}
