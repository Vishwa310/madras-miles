import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, clearToken, isLoggedIn } from '../lib/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { navigate('/login'); return; }
    loadData();
  }, [navigate]);

  async function loadData() {
    try {
      const [userData, teamsData, activitiesData, syncData] = await Promise.all([
        api.get('/auth/me'),
        api.get('/teams'),
        api.get('/activities?limit=10'),
        api.get('/sync/status'),
      ]);
      setUser(userData.user);
      setTeams(teamsData.teams);
      setActivities(activitiesData.activities);
      setSyncStatus(syncData.lastSync);
    } catch (err) {
      console.error(err);
    }
  }

  async function triggerSync() {
    setSyncing(true);
    try {
      await api.post('/sync');
      await loadData();
    } catch (err) {
      console.error(err);
    }
    setSyncing(false);
  }

  function logout() {
    clearToken();
    navigate('/login');
  }

  if (!user) return <div className="min-h-screen bg-mm-bg-primary flex items-center justify-center text-mm-text-muted">Loading...</div>;

  return (
    <div className="min-h-screen bg-mm-bg-primary">
      {/* Top nav */}
      <nav className="border-b border-mm-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 gradient-hero rounded-lg flex items-center justify-center text-lg">🏃</div>
          <span className="font-display text-lg font-bold uppercase tracking-wider">
            <span className="text-gradient-hero">Madras</span> Miles
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-mm-orange font-semibold uppercase">{user.role}</div>
          </div>
          {user.avatarUrl && <img src={user.avatarUrl} className="w-9 h-9 rounded-full" alt="" />}
          <button onClick={logout} className="text-xs text-mm-text-muted hover:text-white transition">Logout</button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Welcome + Sync */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-bold uppercase">Dashboard</h1>
            <p className="text-sm text-mm-text-muted mt-1">
              {syncStatus ? `Last sync: ${new Date(syncStatus.startedAt).toLocaleString()} (${syncStatus.status})` : 'Never synced'}
            </p>
          </div>
          {user.role === 'ADMIN' && (
            <button onClick={triggerSync} disabled={syncing}
              className="px-5 py-2.5 gradient-hero rounded-full font-display font-semibold text-sm uppercase tracking-wide text-white shadow-lg shadow-mm-orange/30 hover:-translate-y-0.5 transition disabled:opacity-50">
              {syncing ? '🔄 Syncing...' : '🔄 Sync Now'}
            </button>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="Teams" value={teams.length} icon="👥" color="teal" />
          <StatCard label="Players" value={teams.reduce((sum, t) => sum + t.playerCount, 0)} icon="🏃" color="gold" />
          <StatCard label="Activities" value={activities.length + '+'} icon="📊" color="purple" />
          <StatCard label="Accepted" value={activities.filter(a => a.status === 'ACCEPTED').length} icon="✅" color="orange" />
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-2 gap-6">
          {/* Teams */}
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide mb-4">Teams</h2>
            {teams.map((team) => (
              <div key={team.id} className="flex items-center justify-between py-3 border-b border-mm-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{team.emblem}</span>
                  <div>
                    <div className="font-medium text-sm">{team.name}</div>
                    <div className="text-xs text-mm-text-muted">{team.playerCount} players</div>
                  </div>
                </div>
              </div>
            ))}
            {teams.length === 0 && <p className="text-mm-text-muted text-sm">No teams yet</p>}
          </div>

          {/* Recent Activities */}
          <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6">
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide mb-4">Recent Activities</h2>
            {activities.map((act) => (
              <div key={act.id} className="flex items-center justify-between py-3 border-b border-mm-border last:border-0">
                <div>
                  <div className="text-sm font-medium">{(act.distanceMeters / 1000).toFixed(1)} km</div>
                  <div className="text-xs text-mm-text-muted">
                    {new Date(act.startDate).toLocaleDateString()} · {(act.avgSpeed * 3.6).toFixed(1)} km/h
                  </div>
                  {act.rejectionReason && (
                    <div className="text-xs text-mm-hot mt-1">⚠️ {act.rejectionReason}</div>
                  )}
                </div>
                <StatusBadge status={act.status} />
              </div>
            ))}
            {activities.length === 0 && <p className="text-mm-text-muted text-sm">No activities synced yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: any; icon: string; color: string }) {
  const colorMap: Record<string, string> = {
    teal: 'text-mm-teal',
    gold: 'text-mm-gold',
    purple: 'text-purple-400',
    orange: 'text-mm-orange',
  };
  return (
    <div className="bg-mm-bg-card border border-mm-border rounded-xl p-5">
      <div className="text-xl mb-2">{icon}</div>
      <div className={`font-display text-2xl font-bold ${colorMap[color]}`}>{value}</div>
      <div className="text-xs text-mm-text-muted uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACCEPTED: 'bg-mm-teal/15 text-mm-teal border-mm-teal/30',
    REJECTED: 'bg-mm-hot/15 text-mm-hot border-mm-hot/30',
    FLAGGED: 'bg-mm-gold/15 text-mm-gold border-mm-gold/30',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase border ${styles[status]}`}>
      {status}
    </span>
  );
}
