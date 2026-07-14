import { PageLoader } from '../lib/loaders';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function TeamsPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', emblem: '', minPlayers: 6, maxPlayers: 20, minFemale: 3 });
  const [auditModal, setAuditModal] = useState<{ teamName: string; logs: any[] } | null>(null);

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
    const apiUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${apiUrl}/api/export/team/${id}`, {
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

  async function loadAudit(teamId: string, teamName: string) {
    const data = await api.get(`/teams/${teamId}/audit`);
    setAuditModal({ teamName, logs: data.logs || [] });
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
          <div key={team.id} className="rounded-2xl p-6 transition group" style={{
            background: `linear-gradient(135deg, ${team.emblem || '#6B7280'}15, ${team.emblem || '#6B7280'}05)`,
            border: `1px solid ${team.emblem || '#6B7280'}40`,
          }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: team.emblem || '#6B7280' }}>
                  <span className="icon text-white" style={{ fontSize: '20px' }}>shield</span>
                </div>
                <h3 className="font-display text-lg font-bold">{team.name}</h3>
              </div>
              <button onClick={() => deleteTeam(team.id)}
                className="opacity-0 group-hover:opacity-100 text-mm-text-muted hover:text-mm-hot transition">
                <span className="icon-sm">delete</span>
              </button>
              <button onClick={() => loadAudit(team.id, team.name)} title="Audit Log"
                className="opacity-0 group-hover:opacity-100 text-mm-text-muted hover:text-mm-purple transition">
                <span className="icon-sm">history</span>
              </button>
              <button onClick={() => downloadTeam(team.id, team.name)}
                className="opacity-0 group-hover:opacity-100 text-mm-text-muted hover:text-mm-teal transition" title="Download CSV">
                <span className="icon-sm">download</span>
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-xl font-bold text-mm-teal">{team.playerCount}</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Total Players</div>
              </div>
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-xl font-bold text-mm-gold">{team.players?.filter((p: any) => p.status === 'ACTIVE').length || 0}</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Active</div>
              </div>
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-xl font-bold text-mm-orange">{8 - (team.subCreditsUsed || 0)}</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Sub Credits Left</div>
              </div>
              <div className="bg-mm-bg-primary rounded-lg p-3 text-center">
                <div className="font-display text-sm font-bold text-purple-400">Min {team.minFemale}♀</div>
                <div className="text-[0.6rem] text-mm-text-muted uppercase">Female Req</div>
              </div>
            </div>

            {/* Player list */}
            {team.players.length > 0 && (
              <div className="border-t border-mm-border pt-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[0.6rem] text-mm-teal uppercase tracking-wider font-semibold mb-2">Active ({team.players.filter((p: any) => p.status === 'ACTIVE').length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {team.players.filter((p: any) => p.status === 'ACTIVE').map((p: any) => (
                        <span key={p.id} className="px-2 py-1 rounded-full text-xs font-medium border bg-mm-teal/10 text-mm-teal border-mm-teal/30">
                          {p.user.name} {p.gender === 'MALE' ? '♂' : '♀'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[0.6rem] text-mm-gold uppercase tracking-wider font-semibold mb-2">Standby ({team.players.filter((p: any) => p.status === 'STANDBY').length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {team.players.filter((p: any) => p.status === 'STANDBY').map((p: any) => (
                        <span key={p.id} className="px-2 py-1 rounded-full text-xs font-medium border bg-mm-gold/10 text-mm-gold border-mm-gold/30">
                          {p.user.name} {p.gender === 'MALE' ? '♂' : '♀'}
                        </span>
                      ))}
                      {team.players.filter((p: any) => p.status === 'STANDBY').length === 0 && (
                        <span className="text-xs text-mm-text-muted">None</span>
                      )}
                    </div>
                    {team.players.filter((p: any) => p.status === 'RETIRED').length > 0 && (
                      <div className="mt-3">
                        <div className="text-[0.6rem] text-mm-hot uppercase tracking-wider font-semibold mb-1.5">Retired</div>
                        <div className="flex flex-wrap gap-1.5">
                          {team.players.filter((p: any) => p.status === 'RETIRED').map((p: any) => (
                            <span key={p.id} className="px-2 py-1 rounded-full text-xs font-medium border bg-mm-hot/10 text-mm-hot border-mm-hot/30 line-through">
                              {p.user.name} {p.gender === 'MALE' ? '♂' : '♀'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Audit Log Modal */}
      {auditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAuditModal(null)}>
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 w-full max-w-lg max-h-[80vh] shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold flex items-center gap-2">
                <span className="icon text-mm-purple" style={{ fontSize: '20px' }}>history</span>
                Audit Log — {auditModal.teamName}
              </h3>
              <button onClick={() => setAuditModal(null)} className="w-8 h-8 rounded-full bg-mm-bg-primary flex items-center justify-center text-mm-text-muted hover:text-white">
                <span className="icon-sm">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
              {auditModal.logs.length === 0 && (
                <p className="text-sm text-mm-text-muted text-center py-8">No audit history yet</p>
              )}
              {auditModal.logs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-mm-bg-primary border border-mm-border">
                  <span className={`icon-sm flex-shrink-0 mt-0.5 ${
                    log.action === 'assigned' ? 'text-mm-teal' :
                    log.action === 'retired' ? 'text-mm-hot' :
                    log.action === 'substitution' ? 'text-mm-orange' :
                    log.action === 'team_changed' ? 'text-mm-purple' :
                    'text-mm-gold'
                  }`}>
                    {log.action === 'assigned' ? 'person_add' :
                     log.action === 'retired' ? 'person_remove' :
                     log.action === 'substitution' ? 'swap_horiz' :
                     log.action === 'team_changed' ? 'move_up' :
                     'change_circle'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <strong>{log.playerName}</strong>
                      <span className="text-mm-text-muted"> — {log.details}</span>
                    </div>
                    <div className="text-[0.6rem] text-mm-text-muted mt-0.5">
                      {new Date(log.createdAt).toLocaleString()} · {log.action.replace('_', ' ')}
                    </div>
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
