import { PageLoader } from '../lib/loaders';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';

const PLAYER_QUOTES = [
  "Walk like you own the city. Because today, you do.",
  "Your future self will thank you for every step today.",
  "Sitting is the new smoking. You're the cure.",
  "A 30-minute walk burns ~150 calories. That's one samosa earned.",
  "Walking boosts creativity by 60%. Your ideas need fresh air too.",
  "10,000 steps = roughly 8 km. You're almost there.",
  "Morning walks reduce blood pressure better than most pills.",
  "Walking after meals cuts blood sugar spikes by 30%.",
  "Your brain releases endorphins after just 10 minutes of walking.",
  "Fun fact: walking uses 200 muscles. Even your face muscles (from smiling).",
  "The best time to walk was yesterday. The next best time is now.",
  "Walk more, worry less. Your feet are free therapists.",
];

export default function PlayerDashboard() {
  const { viewAs: _viewAs } = useOutletContext<{ user?: any; viewAs?: string }>() || {};
  const [user, setUser] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [scores, setScores] = useState<any>(null);
  const [challenge, setChallenge] = useState<any>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const interval = setInterval(() => setQuoteIndex(i => (i + 1) % PLAYER_QUOTES.length), 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    const userData = await api.get('/auth/me');
    setUser(userData.user);

    // Fetch only this player's activities
    const playerId = userData.user.player?.id;
    const [actData, challengeData, syncData] = await Promise.all([
      playerId ? api.get(`/activities?playerId=${playerId}&limit=50`) : Promise.resolve({ activities: [] }),
      api.get('/challenge'),
      api.get('/sync/status'),
    ]);
    setActivities(actData.activities || []);
    setChallenge(challengeData.config || null);
    setLastSync(syncData.lastSync?.completedAt || syncData.lastSync?.startedAt || null);

    if (userData.user.player) {
      const scoreData = await api.get(`/scores/player/${userData.user.player.id}`);
      setScores(scoreData);
    }
  }

  if (!user) return <PageLoader />;

  const accepted = (activities || []).filter(a => a.status === 'ACCEPTED');
  const rejected = (activities || []).filter(a => a.status === 'REJECTED');
  const totalKm = accepted.reduce((s, a) => s + a.distanceMeters / 1000, 0);

  // Weekly chart data (last 7 days)
  const weekData = getWeekData(accepted);

  return (
    <div className="relative">
      {/* Gradient blobs in background */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] rounded-full bg-[#ff6b35] opacity-[0.04] blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-[#7b2ff7] opacity-[0.03] blur-[100px] pointer-events-none" />

      <style>{`
        @keyframes fadeQuote {
          0%, 8% { opacity: 0; transform: translateY(4px); }
          16%, 84% { opacity: 1; transform: translateY(0); }
          92%, 100% { opacity: 0; transform: translateY(-4px); }
        }
      `}</style>

      {/* Greeting + Team banner */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} className="w-16 h-16 rounded-2xl border-2 border-mm-orange/30 shadow-lg shadow-mm-orange/10" alt="" />
            ) : (
              <div className="w-16 h-16 rounded-2xl gradient-hero flex items-center justify-center text-xl font-bold text-white shadow-lg shadow-mm-orange/10">
                {user.name?.split(' ').map((n: string) => n[0]).join('')}
              </div>
            )}
            <h1 className="font-display text-2xl font-bold">
              Hey, <span className="text-gradient-hero">{user.name?.split(' ')[0]}</span>
            </h1>
          </div>
          {scores && (scores.daysScored || scores.totalActivities) >= 3 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-mm-orange/10 border border-mm-orange/30 rounded-full text-sm text-mm-orange font-display font-semibold">
              <span className="icon-sm">local_fire_department</span> {scores.daysScored || scores.totalActivities} Day Streak
            </div>
          )}
        </div>

        {/* Last sync info */}
        {lastSync && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-mm-orange/5 border border-mm-orange/20">
            <div className="flex items-center gap-3">
              <span className="icon text-mm-orange" style={{ fontSize: '22px' }}>sync</span>
              <div>
                <div className="text-sm text-mm-text-primary font-semibold">
                  Data last refreshed: <span className="text-mm-orange">{new Date(lastSync).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="text-xs text-mm-text-secondary mt-1">
                  Missing activities? Your walk happened. We believe you. But our sync runs on IST — Indian Sync Time. Slightly delayed but always accurate. 🇮🇳⏰
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Team name - prominent */}
        {user.player?.team ? (
          <div className="mt-4 px-5 py-4 rounded-2xl border" style={{
            borderColor: `${user.player.team.emblem}40`,
            background: `${user.player.team.emblem}08`,
          }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: user.player.team.emblem }}>
                <span className="icon text-white" style={{ fontSize: '20px' }}>shield</span>
              </div>
              <div>
                <p className="font-display text-lg font-bold uppercase tracking-wide" style={{ color: user.player.team.emblem }}>
                  {user.player.team.name}
                </p>
                <p className="text-xs text-mm-text-muted">Your team</p>
              </div>
            </div>
            {/* Quote inside team banner */}
            <div className="mt-3 pt-3 border-t" style={{ borderColor: `${user.player.team.emblem}20` }}>
              <p key={quoteIndex} className="text-white/40 italic text-xs animate-[fadeQuote_5s_ease-in-out_infinite]">
                💡 {PLAYER_QUOTES[quoteIndex]}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 px-5 py-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
            <p key={quoteIndex} className="text-white/40 italic text-xs animate-[fadeQuote_5s_ease-in-out_infinite]">
              💡 {PLAYER_QUOTES[quoteIndex]}
            </p>
          </div>
        )}
      </div>

      {/* No team banner */}
      {!user.player?.team && (
        <div className="mb-8 px-6 py-5 bg-mm-gold/5 border border-mm-gold/20 rounded-2xl flex items-center gap-4">
          <span className="icon text-mm-gold" style={{ fontSize: '28px' }}>info</span>
          <div>
            <div className="text-sm font-semibold text-mm-gold">You're not assigned to a team yet</div>
            <div className="text-xs text-mm-text-muted mt-1">Your admin will add you to a team soon. Once assigned, your activities will be tracked and scored.</div>
          </div>
        </div>
      )}

      {/* Activity content — with frosted overlay when hidden by admin */}
      <div className="relative">
        {challenge?.hideActivitiesFromPlayers && (
          <div className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-md bg-mm-bg-primary/60 rounded-2xl">
            <div className="text-center max-w-md px-8 py-10">
              <span className="icon text-mm-orange block mb-4" style={{ fontSize: '56px' }}>visibility_off</span>
              <h2 className="font-display text-2xl font-bold mb-3">Nice try, detective 🕵️</h2>
              <p className="text-mm-text-secondary leading-relaxed">
                This section is on a chai break ☕ — the admin hid it because some of you kept refreshing every 5 minutes like it's a cricket score.
              </p>
              <p className="text-mm-text-secondary mt-3 leading-relaxed">
                Relax — your walks are being counted. We promise. Now go touch some grass... oh wait, you already did that this morning. 🌿
              </p>
              <div className="mt-6 px-4 py-2 bg-mm-orange/10 border border-mm-orange/20 rounded-xl">
                <p className="text-xs text-mm-orange font-semibold">Pro tip: Refreshing won't make it sync faster. Patience, grasshopper. 🦗</p>
              </div>
            </div>
          </div>
        )}

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard icon="route" label="Total KM" value={(scores?.totalKm || totalKm).toFixed(2)} color="text-mm-teal" />
        <StatCard icon="check_circle" label="Accepted" value={scores?.totalActivities || accepted.length} color="text-mm-teal" />
        <StatCard icon="cancel" label="Rejected" value={scores?.rejectedCount || rejected.length} color="text-mm-hot" />
      </div>

      {/* Fun trivia — only when there's meaningful data */}
      {accepted.length >= 3 && (() => {
        const myKm = scores?.totalKm || totalKm;
        const steps = Math.round(myKm * 1312);
        const calories = Math.round(myKm * 65);
        const filterCoffees = Math.floor(calories / 95);
        const daysWalked = new Set(accepted.map(a => new Date(a.startDate).toLocaleDateString('en-CA'))).size;
        const avgPace = accepted.length > 0
          ? accepted.reduce((s, a) => s + (a.movingTimeSeconds / 60) / (a.distanceMeters / 1000), 0) / accepted.length
          : 0;

        const destination = myKm >= 100 ? 'Pondicherry 🏖️' : myKm >= 60 ? 'Tirupati 🛕' : myKm >= 30 ? 'Kanchipuram 🏛️' : 'Mahabalipuram 🌊';
        const paceVibe = avgPace <= 10 ? 'power walker 💪' : avgPace <= 12 ? 'steady cruiser 🚶' : avgPace <= 14 ? 'sunset stroller 🌅' : 'window shopper 🛍️';

        return (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-mm-teal/5 to-transparent border border-mm-teal/10">
              <p className="text-xs text-mm-text-secondary leading-relaxed">
                <span className="text-base">🦶</span> <strong className="text-mm-teal">{steps.toLocaleString()}</strong> steps.
                That's Chennai → <strong className="text-white">{destination}</strong>
              </p>
            </div>
            <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-mm-orange/5 to-transparent border border-mm-orange/10">
              <p className="text-xs text-mm-text-secondary leading-relaxed">
                <span className="text-base">☕</span> Burned <strong className="text-mm-orange">{calories.toLocaleString()}</strong> cal.
                You've earned <strong className="text-white">{filterCoffees} filter coffees</strong> guilt-free.
              </p>
            </div>
            <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-purple-500/5 to-transparent border border-purple-500/10">
              <p className="text-xs text-mm-text-secondary leading-relaxed">
                <span className="text-base">⏱️</span> Your vibe: <strong className="text-purple-300">{paceVibe}</strong>
                <span className="text-mm-text-muted"> ({avgPace.toFixed(1)} min/km)</span>
              </p>
            </div>
            <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-mm-gold/5 to-transparent border border-mm-gold/10">
              <p className="text-xs text-mm-text-secondary leading-relaxed">
                <span className="text-base">📅</span> Walked <strong className="text-mm-gold">{daysWalked} days</strong>.
                {daysWalked >= 7 ? " Consistency machine! 🔥" : daysWalked >= 4 ? " Getting there!" : " Room to grow 💪"}
              </p>
            </div>
            <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-pink-500/5 to-transparent border border-pink-500/10">
              <p className="text-xs text-mm-text-secondary leading-relaxed">
                <span className="text-base">🎯</span> At this rate, you'll finish with
                <strong className="text-pink-300"> ~{challenge ? (myKm / Math.max(1, daysWalked) * Math.ceil((new Date(challenge.endDate).getTime() - new Date(challenge.startDate).getTime()) / 86400000)).toFixed(0) : '?'} km</strong> total.
              </p>
            </div>
            <div className="px-4 py-3.5 rounded-xl bg-gradient-to-br from-mm-teal/5 to-transparent border border-mm-teal/10">
              <p className="text-xs text-mm-text-secondary leading-relaxed">
                <span className="text-base">🏅</span>
                {daysWalked >= 7 && <span className="inline-block px-1.5 py-0.5 bg-mm-gold/15 text-mm-gold border border-mm-gold/30 rounded text-[0.6rem] font-semibold mr-1">7-day!</span>}
                {myKm >= 50 && <span className="inline-block px-1.5 py-0.5 bg-mm-teal/15 text-mm-teal border border-mm-teal/30 rounded text-[0.6rem] font-semibold mr-1">50km+</span>}
                {avgPace <= 11 && <span className="inline-block px-1.5 py-0.5 bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded text-[0.6rem] font-semibold mr-1">Speedy</span>}
                {daysWalked < 7 && myKm < 50 && avgPace > 11 && <span className="text-mm-text-muted">Keep walking to unlock badges!</span>}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Challenge Progress */}
      {challenge && (() => {
        const start = new Date(challenge.startDate);
        const end = new Date(challenge.endDate);
        const now = new Date();
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const elapsed = Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))));
        const remaining = Math.max(0, totalDays - elapsed);
        const pct = Math.round((elapsed / totalDays) * 100);

        return (
          <div className="mb-8 px-5 py-4 bg-mm-bg-card border border-mm-border rounded-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="icon text-mm-orange" style={{ fontSize: '18px' }}>calendar_month</span>
                <span className="font-display text-sm font-semibold uppercase tracking-wide">Challenge Progress</span>
              </div>
              <span className="text-xs text-mm-text-muted">
                Day {elapsed} of {totalDays}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-mm-bg-elevated overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #06d6a0, #00b4d8)',
              }} />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-mm-text-muted">{elapsed} days done</span>
              <span className="text-xs font-semibold text-mm-teal">{remaining} days remaining ({100 - pct}%)</span>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-3 gap-6">
        {/* Weekly Chart */}
        <div className="col-span-2 bg-mm-bg-card border border-mm-border rounded-2xl p-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4">This Week</h3>
          <div className="flex items-end gap-3 h-40">
            {weekData.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-mono text-mm-text-muted">{day.km > 0 ? day.km.toFixed(2) : ''}</span>
                <div className="w-full rounded-t-md transition-all" style={{
                  height: `${Math.max(day.km / 7 * 100, 4)}%`,
                  background: day.isToday ? 'linear-gradient(180deg, #ff6b35, #ff006e)' : 'linear-gradient(180deg, #06d6a0, #00b4d8)',
                  opacity: day.km > 0 ? 1 : 0.2,
                  boxShadow: day.isToday ? '0 0 16px rgba(255,107,53,0.3)' : 'none',
                }} />
                <span className="text-[0.6rem] text-mm-text-muted uppercase">{day.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Progress */}
        <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 flex flex-col items-center justify-center">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4">Today</h3>
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-mm-bg-elevated)" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="url(#prog-grad)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(weekData[6]?.km || 0) / 7 * 264} 264`} />
              <defs>
                <linearGradient id="prog-grad"><stop offset="0%" stopColor="#06d6a0"/><stop offset="100%" stopColor="#00b4d8"/></linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-2xl font-bold">{weekData[6]?.km.toFixed(2) || '0'}</span>
              <span className="text-[0.6rem] text-mm-text-muted uppercase">of 7 km</span>
            </div>
          </div>
          <div className="mt-3 text-xs text-mm-text-muted">
            {(7 - (weekData[6]?.km || 0)).toFixed(2)} km remaining
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mt-6">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4">Recent Activities</h3>
        <div className="space-y-1">
          {activities.slice(0, 10).map(a => (
            <div key={a.id} className="flex items-center gap-4 py-3 px-3 rounded-lg hover:bg-mm-bg-primary/50 transition">
              <span className={`icon ${a.status === 'ACCEPTED' ? 'text-mm-teal' : a.status === 'REJECTED' ? 'text-mm-hot' : 'text-mm-gold'}`}>
                {a.status === 'ACCEPTED' ? 'check_circle' : a.status === 'REJECTED' ? 'cancel' : 'warning'}
              </span>
              <div className="flex-1">
                <div className="text-sm">{(a.distanceMeters / 1000).toFixed(2)} km · {(a.avgSpeed * 3.6).toFixed(1)} km/h</div>
                <div className="text-xs text-mm-text-muted">{new Date(a.startDate).toLocaleDateString()}</div>
              </div>
              {a.rejectionReason && (
                <span className="text-xs text-mm-hot max-w-[250px] truncate">{a.rejectionReason}</span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase border ${
                a.status === 'ACCEPTED' ? 'bg-mm-teal/15 text-mm-teal border-mm-teal/30' :
                a.status === 'REJECTED' ? 'bg-mm-hot/15 text-mm-hot border-mm-hot/30' :
                'bg-mm-gold/15 text-mm-gold border-mm-gold/30'
              }`}>{a.status}</span>
            </div>
          ))}
          {activities.length === 0 && <p className="text-center text-mm-text-muted py-6">No activities yet. Sync to fetch from Strava.</p>}
        </div>
      </div>

      {/* Points Breakdown */}
      {scores && scores.daily && scores.daily.length > 0 && (
        <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mt-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4">Points Breakdown</h3>
          <div className="space-y-2">
            {scores.daily.slice(0, 7).map((d: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-mm-border last:border-0">
                <span className="text-sm text-mm-text-secondary">{new Date(d.date).toLocaleDateString()}</span>
                <div className="flex items-center gap-3">
                  {Object.entries(d.breakdown).map(([key, val]) => (
                    <span key={key} className="text-xs text-mm-text-muted">{key}: <span className="text-mm-gold font-mono">+{val as number}</span></span>
                  ))}
                </div>
                <span className="font-display font-bold text-mm-gold">{d.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>{/* end relative wrapper */}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: any; color: string }) {
  return (
    <div className="bg-mm-bg-card border border-mm-border rounded-xl p-5">
      <span className={`icon ${color} mb-2`}>{icon}</span>
      <div className={`font-display text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-mm-text-muted uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function getWeekData(accepted: any[]) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  const dayOfWeek = today.getDay() || 7; // 1=Mon...7=Sun
  const result = [];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (dayOfWeek - i));
    const dateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local TZ
    const dayActivities = accepted.filter(a => new Date(a.startDate).toLocaleDateString('en-CA') === dateStr);
    const km = dayActivities.reduce((s, a) => s + a.distanceMeters / 1000, 0);
    result.push({ label: days[i - 1], km, isToday: i === dayOfWeek });
  }
  return result;
}
