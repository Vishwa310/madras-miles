import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function CaptainTeamView() {
  const [team, setTeam] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const userData = await api.get('/auth/me');
    const teamsData = await api.get('/teams');

    // Find captain's team
    const myTeam = teamsData.teams.find((t: any) => t.captain?.id === userData.user.id);
    if (myTeam) {
      const teamDetail = await api.get(`/teams/${myTeam.id}`);
      setTeam(teamDetail.team);

      const rankData = await api.get(`/scores/players?teamId=${myTeam.id}`);
      setLeaderboard(rankData.rankings);

      const actData = await api.get('/activities?limit=20');
      setActivities(actData.activities);
    }
  }

  if (!team) return <div className="text-mm-text-muted flex items-center gap-2"><span className="icon animate-spin">progress_activity</span> Loading team...</div>;

  const activePlayers = team.players.filter((p: any) => p.status === 'ACTIVE');
  const subs = team.players.filter((p: any) => p.status === 'STANDBY');
  const retired = team.players.filter((p: any) => p.status === 'RETIRED');
  const flaggedActivities = activities.filter(a => a.status === 'FLAGGED' || a.status === 'REJECTED');

  return (
    <div>
      {/* Team Banner */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-8 mb-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 gradient-hero" />
        <div className="absolute top-[-50%] right-[-5%] w-[250px] h-[250px] rounded-full bg-mm-orange/5 blur-3xl" />

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-mm-bg-elevated border-2 border-mm-orange rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-mm-orange/20">
              {team.emblem || '🏷️'}
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-gradient-hero">{team.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-mm-teal/15 text-mm-teal border border-mm-teal/30">{activePlayers.length} Active</span>
                <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-mm-purple/15 text-purple-300 border border-mm-purple/30">{subs.length} Subs</span>
                {retired.length > 0 && <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-mm-hot/15 text-mm-hot border border-mm-hot/30">{retired.length} Retired</span>}
              </div>
            </div>
          </div>
          <div className="text-center">
            <div className="font-display text-4xl font-bold text-mm-gold">
              {leaderboard.reduce((s, p) => s + p.totalPoints, 0)}
            </div>
            <div className="text-[0.65rem] text-mm-text-muted uppercase tracking-wider">Team Points</div>
          </div>
        </div>
      </div>

      {/* Team Members Grid */}
      <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4">Team Members</h3>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {team.players.map((player: any, _i: number) => {
          const rank = leaderboard.findIndex(l => l.playerId === player.id) + 1;
          const pts = leaderboard.find(l => l.playerId === player.id)?.totalPoints || 0;

          return (
            <div key={player.id} className={`bg-mm-bg-card border rounded-xl p-5 relative transition hover:border-mm-orange/30 ${
              player.status === 'RETIRED' ? 'border-mm-hot/30 opacity-60' : player.status === 'STANDBY' ? 'border-dashed border-mm-gold/30' : 'border-mm-border'
            }`}>
              {/* Rank badge */}
              {rank > 0 && player.status !== 'RETIRED' && (
                <div className={`absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  rank === 1 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-black' :
                  rank === 2 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-black' :
                  rank === 3 ? 'bg-gradient-to-br from-orange-600 to-orange-800 text-white' :
                  'bg-mm-bg-elevated text-mm-text-muted'
                }`}>{rank}</div>
              )}
              {player.status === 'STANDBY' && (
                <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[0.55rem] font-semibold bg-mm-gold/15 text-mm-gold border border-mm-gold/30 uppercase tracking-wider">Standby</div>
              )}

              {/* Player info */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full gradient-hero flex items-center justify-center text-xs font-bold text-white">
                  {player.user.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div>
                  <div className="text-sm font-medium">{player.user.name}</div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[0.6rem] font-semibold ${player.gender === 'MALE' ? 'text-mm-blue' : 'text-mm-hot'}`}>
                      {player.gender === 'MALE' ? '♂' : '♀'}
                    </span>
                    {player.status === 'RETIRED' && <span className="text-[0.6rem] text-mm-hot">RETIRED</span>}
                  </div>
                </div>
              </div>

              {/* Stats */}
              {player.status !== 'RETIRED' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-mm-bg-primary rounded-lg p-2 text-center">
                    <div className="font-display text-lg font-bold text-mm-gold">{pts}</div>
                    <div className="text-[0.55rem] text-mm-text-muted uppercase">Points</div>
                  </div>
                  <div className="bg-mm-bg-primary rounded-lg p-2 text-center">
                    <div className="font-display text-lg font-bold text-mm-teal">
                      {player.status === 'ACTIVE' ? '●' : '○'}
                    </div>
                    <div className="text-[0.55rem] text-mm-text-muted uppercase">{player.status}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Team Flags */}
      {flaggedActivities.length > 0 && (
        <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4 flex items-center gap-2">
            <span className="icon-sm text-mm-gold">warning</span> Team Flags & Rejections
          </h3>
          {flaggedActivities.slice(0, 5).map(a => (
            <div key={a.id} className="flex items-center gap-4 py-3 border-b border-mm-border last:border-0">
              <span className={`icon-sm ${a.status === 'FLAGGED' ? 'text-mm-gold' : 'text-mm-hot'}`}>
                {a.status === 'FLAGGED' ? 'warning' : 'cancel'}
              </span>
              <div className="flex-1">
                <div className="text-sm">{a.player?.user?.name} — {(a.distanceMeters / 1000).toFixed(2)} km</div>
                <div className="text-xs text-mm-text-muted">{a.rejectionReason}</div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase border ${
                a.status === 'FLAGGED' ? 'bg-mm-gold/15 text-mm-gold border-mm-gold/30' : 'bg-mm-hot/15 text-mm-hot border-mm-hot/30'
              }`}>{a.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
