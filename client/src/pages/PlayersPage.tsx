import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function PlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', stravaAthleteId: '', teamId: '', gender: 'MALE', slot: 'MAIN', email: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [pData, tData] = await Promise.all([api.get('/players'), api.get('/teams')]);
    setPlayers(pData.players);
    setTeams(tData.teams);
  }

  async function createPlayer(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/players', form);
    setForm({ name: '', stravaAthleteId: '', teamId: '', gender: 'MALE', slot: 'MAIN', email: '' });
    setShowCreate(false);
    loadData();
  }

  async function deletePlayer(id: string) {
    if (!confirm('Remove this player?')) return;
    try {
      await api.delete(`/players/${id}`);
      loadData();
    } catch { alert('Cannot delete player with activities'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Players</h1>
          <p className="text-sm text-mm-text-muted mt-1">{players.length} players registered</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-5 py-2.5 gradient-hero rounded-full font-display font-semibold text-sm uppercase tracking-wide text-white shadow-lg shadow-mm-orange/30 hover:-translate-y-0.5 transition">
          + Add Player
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={createPlayer} className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mb-6">
          <h3 className="font-display text-lg font-semibold mb-4">Add Player</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Name *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Strava Athlete ID *</label>
              <input value={form.stravaAthleteId} onChange={e => setForm({...form, stravaAthleteId: e.target.value})} required
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Email</label>
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Team *</label>
              <select value={form.teamId} onChange={e => setForm({...form, teamId: e.target.value})} required
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
                <option value="">Select team</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.emblem} {t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Gender *</label>
              <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Slot</label>
              <select value={form.slot} onChange={e => setForm({...form, slot: e.target.value})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
                <option value="MAIN">Main</option>
                <option value="SUBSTITUTE">Substitute</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="px-6 py-2.5 gradient-hero rounded-lg font-semibold text-sm text-white">Add</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-sm text-mm-text-muted hover:text-white">Cancel</button>
            </div>
          </div>
        </form>
      )}

      {/* Players table */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-mm-border">
              <th className="text-left px-5 py-3 text-xs text-mm-text-muted uppercase tracking-wider">Player</th>
              <th className="text-left px-5 py-3 text-xs text-mm-text-muted uppercase tracking-wider">Team</th>
              <th className="text-left px-5 py-3 text-xs text-mm-text-muted uppercase tracking-wider">Gender</th>
              <th className="text-left px-5 py-3 text-xs text-mm-text-muted uppercase tracking-wider">Slot</th>
              <th className="text-left px-5 py-3 text-xs text-mm-text-muted uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs text-mm-text-muted uppercase tracking-wider">Strava</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {players.map(p => (
              <tr key={p.id} className="border-b border-mm-border last:border-0 hover:bg-mm-bg-card-hover transition">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 gradient-hero rounded-full flex items-center justify-center text-xs font-bold">
                      {p.user.name.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{p.user.name}</div>
                      <div className="text-xs text-mm-text-muted">{p.user.email || '—'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm">{p.team.emblem} {p.team.name}</td>
                <td className="px-5 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    p.gender === 'MALE' ? 'bg-mm-blue/15 text-mm-blue' : 'bg-mm-hot/15 text-mm-hot'
                  }`}>
                    {p.gender === 'MALE' ? '♂ M' : '♀ F'}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    p.slot === 'MAIN' ? 'bg-mm-teal/15 text-mm-teal' : 'bg-mm-purple/15 text-purple-300'
                  }`}>
                    {p.slot}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    p.status === 'ACTIVE' ? 'bg-mm-teal/15 text-mm-teal' : 'bg-mm-hot/15 text-mm-hot'
                  }`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-mm-text-muted font-mono">{p.user.stravaAthleteId}</td>
                <td className="px-5 py-4">
                  <button onClick={() => deletePlayer(p.id)} className="text-mm-text-muted hover:text-mm-hot transition">
                    <span className="icon-sm">delete</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {players.length === 0 && <p className="text-center text-mm-text-muted py-8">No players yet</p>}
      </div>
    </div>
  );
}
