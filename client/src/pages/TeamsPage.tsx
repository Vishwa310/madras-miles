import { PageLoader } from '../lib/loaders';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function TeamsPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', emblem: '', minPlayers: 6, maxPlayers: 20, minFemale: 3 });

  useEffect(() => { loadTeams(); }, []);

  async function loadTeams() {
    const data = await api.get('/teams');
    setTeams(data.teams);
    setLoading(false);
  }

  async function createTeam(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/teams', form);
    setForm({ name: '', emblem: '', minPlayers: 6, maxPlayers: 20, minFemale: 3 });
    setShowCreate(false);
    loadTeams();
  }

  async function deleteTeam(id: string) {
    if (!confirm('Delete this team?')) return;
    await api.delete(`/teams/${id}`);
    loadTeams();
  }

  function downloadTeam(id: string, name: string) {
    const token = localStorage.getItem('mm_token');
    const link = document.createElement('a');
    link.href = `/api/export/team/${id}`;
    // Use fetch to include auth header
    fetch(`/api/export/team/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name.replace(/[^a-zA-Z0-9]/g, '_')}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  if (loading) return <PageLoader />;
  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Teams</h1>
          <p className="text-sm text-mm-text-muted mt-1">{teams.length} teams configured</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-5 py-2.5 gradient-hero rounded-full font-display font-semibold text-sm uppercase tracking-wide text-white shadow-lg shadow-mm-orange/30 hover:-translate-y-0.5 transition">
          + Create Team
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={createTeam} className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mb-6">
          <h3 className="font-display text-lg font-semibold mb-4">New Team</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Name *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Emblem (emoji)</label>
              <input value={form.emblem} onChange={e => setForm({...form, emblem: e.target.value})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" placeholder="⚡" />
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Max Players</label>
              <input type="number" value={form.maxPlayers} onChange={e => setForm({...form, maxPlayers: +e.target.value})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Min Female per Week</label>
              <input type="number" value={form.minFemale} onChange={e => setForm({...form, minFemale: +e.target.value})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
            <div></div>
            <div className="flex items-end">
              <button type="submit" className="px-6 py-2.5 gradient-hero rounded-lg font-semibold text-sm text-white">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="ml-3 px-4 py-2.5 text-sm text-mm-text-muted hover:text-white">Cancel</button>
            </div>
          </div>
        </form>
      )}

      {/* Teams grid */}
      <div className="grid grid-cols-2 gap-5">
        {teams.map(team => (
          <div key={team.id} className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 hover:border-mm-orange/30 transition group">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl" style={{ backgroundColor: team.emblem || '#6B7280' }} />
                <div>
                  <h3 className="font-display text-lg font-bold">{team.name}</h3>
                  <p className="text-xs text-mm-text-muted">
                    {team.captain ? `Captain: ${team.captain.name}` : 'No captain assigned'}
                  </p>
                </div>
              </div>
              <button onClick={() => deleteTeam(team.id)}
                className="opacity-0 group-hover:opacity-100 text-mm-text-muted hover:text-mm-hot transition">
                <span className="icon-sm">delete</span>
              </button>
              <button onClick={() => downloadTeam(team.id, team.name)}
                className="opacity-0 group-hover:opacity-100 text-mm-text-muted hover:text-mm-teal transition" title="Download CSV">
                <span className="icon-sm">download</span>
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-xl font-bold text-mm-teal">{team.playerCount}</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Total Players</div>
              </div>
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-xl font-bold text-mm-gold">{team.players?.filter((p: any) => p.status === 'ACTIVE').length || 0}</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Active</div>
              </div>
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-sm font-bold text-purple-400">Min {team.minFemale}♀ / week</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Female Req</div>
              </div>
            </div>

            {/* Player list */}
            {team.players.length > 0 && (
              <div className="border-t border-mm-border pt-3">
                <div className="flex flex-wrap gap-2">
                  {team.players.map((p: any) => (
                    <span key={p.id} className={`px-2 py-1 rounded-full text-xs font-medium border ${
                      p.status === 'RETIRED' ? 'bg-mm-hot/10 text-mm-hot border-mm-hot/30 line-through' :
                      p.status === 'STANDBY' ? 'bg-mm-gold/10 text-mm-gold border-mm-gold/30' :
                      'bg-mm-teal/10 text-mm-teal border-mm-teal/30'
                    }`}>
                      {p.user.name} {p.gender === 'MALE' ? '♂' : '♀'}
                      {p.status === 'STANDBY' && ' (standby)'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
