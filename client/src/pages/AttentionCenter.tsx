import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PageLoader } from '../lib/loaders';

export default function AttentionCenter() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const data = await api.get('/activities/attention');
    setActivities(data.activities || []);
    setLoading(false);
  }

  async function approve(id: string) {
    await api.post(`/activities/${id}/approve`);
    setActivities(prev => prev.filter(a => a.id !== id));
  }

  async function reject(id: string) {
    await api.post(`/activities/${id}/reject`, { reason: 'Rejected after review' });
    setActivities(prev => prev.filter(a => a.id !== id));
  }

  async function dismiss(id: string) {
    await api.post(`/activities/${id}/dismiss`);
    setActivities(prev => prev.filter(a => a.id !== id));
  }

  if (loading) return <PageLoader />;

  const [statusFilter, setStatusFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);

  const teams = [...new Set(activities.map(a => a.player?.team?.name).filter(Boolean))].sort();

  const filtered = activities.filter(a => {
    if (statusFilter === 'flagged' && !a.flagReason) return false;
    if (statusFilter === 'rejected' && a.status !== 'REJECTED') return false;
    if (teamFilter && a.player?.team?.name !== teamFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Attention Center</h1>
          <p className="text-sm text-mm-text-muted mt-1">{filtered.length} items {statusFilter || teamFilter ? '(filtered)' : 'need your review'}</p>
        </div>
        <div className="flex items-center gap-3">
          {activities.length > 0 && (
            <button onClick={async () => {
              if (!confirm('Dismiss all visible items?')) return;
              for (const a of filtered) await api.post(`/activities/${a.id}/dismiss`);
              setActivities(prev => prev.filter(x => !filtered.find(f => f.id === x.id)));
            }} className="px-4 py-2 bg-mm-bg-card border border-mm-border rounded-full text-xs font-semibold text-mm-text-secondary hover:text-white transition">
              Dismiss All
            </button>
          )}
          <button onClick={async () => {
            setShowDismissed(!showDismissed);
            if (!showDismissed) {
              // Fetch all including dismissed
              const data = await api.get('/activities/attention?includeDismissed=true');
              setActivities(data.activities || []);
            } else {
              loadData();
            }
          }} className={`px-4 py-2 rounded-full text-xs font-semibold transition ${showDismissed ? 'bg-mm-orange/15 text-mm-orange border border-mm-orange/30' : 'bg-mm-bg-card border border-mm-border text-mm-text-secondary hover:text-white'}`}>
            {showDismissed ? 'Hide Dismissed' : 'Show All'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex gap-2">
          {['', 'flagged', 'rejected'].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase transition ${
                statusFilter === f ? (f === 'flagged' ? 'bg-mm-gold/15 text-mm-gold border border-mm-gold/30' : f === 'rejected' ? 'bg-mm-hot/15 text-mm-hot border border-mm-hot/30' : 'gradient-hero text-white') : 'bg-mm-bg-card border border-mm-border text-mm-text-muted hover:text-white'
              }`}>
              {f || 'All'}
            </button>
          ))}
        </div>
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
          className="px-3 py-1.5 bg-mm-bg-card border border-mm-border rounded-lg text-xs focus:border-mm-orange outline-none">
          <option value="">All Teams</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {filtered.length === 0 && (
        <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-12 text-center">
          <span className="icon text-mm-teal block mb-4" style={{ fontSize: '48px' }}>check_circle</span>
          <p className="font-display text-lg font-semibold">All clear!</p>
          <p className="text-sm text-mm-text-muted mt-2">No activities need your attention right now.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(a => (
          <div key={a.id} className={`bg-mm-bg-card border rounded-xl p-4 ${
            a.status === 'REJECTED' ? 'border-mm-hot/30' : 'border-mm-gold/30'
          }`}>
            <div className="flex items-center gap-4">
              {/* Player info */}
              <div className="flex items-center gap-3 min-w-[200px]">
                {a.player?.user?.avatarUrl ? (
                  <img src={a.player.user.avatarUrl} className="w-9 h-9 rounded-full" alt="" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: a.player?.team?.emblem || '#6B7280' }}>
                    {a.player?.user?.name?.split(' ').map((n: string) => n[0]).join('') || '?'}
                  </div>
                )}
                <div>
                  <div className="text-sm font-semibold">{a.player?.user?.name || 'Unknown'}</div>
                  <div className="text-xs text-mm-text-muted">{a.player?.team?.name || ''}</div>
                </div>
              </div>

              {/* Activity details */}
              <div className="flex-1">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-display font-semibold">{(a.distanceMeters / 1000).toFixed(2)} km</span>
                  <span className="text-mm-text-muted">{(a.avgSpeed * 3.6).toFixed(1)} km/h</span>
                  <span className="text-mm-text-muted">{Math.round(a.movingTimeSeconds / 60)} min</span>
                  <span className="text-mm-text-muted">{new Date(a.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className={`text-xs mt-1 ${a.status === 'REJECTED' ? 'text-mm-hot' : 'text-mm-gold'}`}>
                  {a.flagReason && <span>⚠️ {a.flagReason}</span>}
                  {a.rejectionReason && a.flagReason && <br />}
                  {a.rejectionReason && <span>{a.status === 'REJECTED' ? '❌' : 'ℹ️'} {a.rejectionReason}</span>}
                  {!a.flagReason && !a.rejectionReason && <span>Needs review</span>}
                </div>
                {/* Split data if available */}
                {a.splitData && a.splitData.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {a.splitData.map((s: any, i: number) => (
                      <span key={i} className={`px-1.5 py-0.5 rounded text-[0.6rem] font-mono font-semibold border ${
                        s.status === 'ok' ? 'bg-mm-teal/10 text-mm-teal border-mm-teal/20' :
                        s.status === 'fast' ? 'bg-mm-hot/10 text-mm-hot border-mm-hot/20' :
                        'bg-mm-gold/10 text-mm-gold border-mm-gold/20'
                      }`}>
                        Km{s.km}:{s.pace}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Status badge */}
              <span className={`px-2.5 py-1 rounded-full text-[0.6rem] font-semibold uppercase border ${
                a.status === 'REJECTED' ? 'bg-mm-hot/15 text-mm-hot border-mm-hot/30' :
                'bg-mm-gold/15 text-mm-gold border-mm-gold/30'
              }`}>
                {a.status === 'REJECTED' ? 'Rejected' : 'Flagged'}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => approve(a.id)} title="Approve"
                  className="w-8 h-8 rounded-lg bg-mm-teal/15 text-mm-teal border border-mm-teal/30 flex items-center justify-center hover:scale-110 transition">
                  <span className="icon-sm">check</span>
                </button>
                <button onClick={() => reject(a.id)} title="Reject"
                  className="w-8 h-8 rounded-lg bg-mm-hot/15 text-mm-hot border border-mm-hot/30 flex items-center justify-center hover:scale-110 transition">
                  <span className="icon-sm">close</span>
                </button>
                <button onClick={() => dismiss(a.id)} title="Dismiss (hide)"
                  className="w-8 h-8 rounded-lg bg-mm-bg-elevated text-mm-text-muted border border-mm-border flex items-center justify-center hover:scale-110 transition">
                  <span className="icon-sm">visibility_off</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
