import { PageLoader } from '../lib/loaders';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../lib/api';

const PAGE_SIZE = 50;

interface WeekGroup {
  label: string;
  startDate: Date;
  activities: any[];
  totalKm: number;
  accepted: number;
  rejected: number;
}

function groupByWeek(activities: any[], challengeStartDate?: string): WeekGroup[] {
  const groups = new Map<string, WeekGroup>();
  const chalStart = challengeStartDate ? new Date(challengeStartDate) : null;

  for (const a of activities) {
    const date = new Date(a.startDate);
    let key: string;
    let label: string;
    let weekStart: Date;

    if (chalStart) {
      // Challenge-based weeks: W1, W2, W3, W4
      const localDate = new Date(date.toLocaleDateString('en-CA'));
      const localStart = new Date(chalStart.toLocaleDateString('en-CA'));
      const diffDays = Math.floor((localDate.getTime() - localStart.getTime()) / (1000 * 60 * 60 * 24));
      const weekNum = Math.min(Math.floor(diffDays / 7) + 1, 4);
      key = `W${weekNum}`;

      const wStart = new Date(localStart);
      wStart.setDate(wStart.getDate() + (weekNum - 1) * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + (weekNum === 4 ? 2 : 6)); // W4 is only 3 days

      const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      label = `Week ${weekNum} (${fmt(wStart)} – ${fmt(wEnd)})`;
      weekStart = wStart;
    } else {
      // Fallback: calendar Monday-based
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      key = monday.toLocaleDateString('en-CA');
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      label = `${fmt(monday)} – ${fmt(sunday)}`;
      weekStart = monday;
    }

    if (!groups.has(key)) {
      groups.set(key, {
        label,
        startDate: weekStart,
        activities: [],
        totalKm: 0,
        accepted: 0,
        rejected: 0,
      });
    }

    const group = groups.get(key)!;
    group.activities.push(a);
    if (a.status === 'ACCEPTED') {
      group.totalKm += (a.creditedMeters || a.distanceMeters) / 1000;
      group.accepted++;
    }
    if (a.status === 'REJECTED') group.rejected++;
  }

  return Array.from(groups.values()).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

export default function ActivitiesPage() {
  const { user, viewAs } = useOutletContext<{ user: any; viewAs?: string }>();
  const [activities, setActivities] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<any>(null);

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { loadActivities(); }, [filter, page]);

  async function loadActivities() {
    const offset = (page - 1) * PAGE_SIZE;
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (filter) params.set('status', filter);
    const [actData, chalData] = await Promise.all([
      api.get(`/activities?${params}`),
      api.get('/challenge'),
    ]);
    setActivities(actData.activities || []);
    setChallenge(chalData.config);
    setLoading(false);
    setTotal(actData.total ?? actData.activities?.length ?? 0);
  }

  async function approveActivity(id: string) {
    await api.post(`/activities/${id}/approve`);
    loadActivities();
  }

  async function rejectActivity(id: string) {
    await api.post(`/activities/${id}/reject`, { reason: 'Rejected by admin after review' });
    loadActivities();
  }

  if (loading) return <PageLoader />;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isAdmin = user?.role === 'ADMIN' && viewAs !== 'PLAYER';

  // Block activities view for players when admin has hidden it
  if (challenge?.hideActivitiesFromPlayers && !isAdmin) {
    return (
      <div className="relative min-h-[400px] bg-mm-bg-card border border-mm-border rounded-2xl overflow-hidden">
        <div className="p-6 opacity-40">
          <div className="h-8 w-48 bg-mm-bg-elevated rounded-lg mb-6"></div>
          <div className="space-y-3">
            <div className="h-16 bg-mm-bg-elevated rounded-lg"></div>
            <div className="h-16 bg-mm-bg-elevated rounded-lg"></div>
            <div className="h-16 bg-mm-bg-elevated rounded-lg"></div>
            <div className="h-16 bg-mm-bg-elevated rounded-lg"></div>
            <div className="h-16 bg-mm-bg-elevated rounded-lg"></div>
          </div>
        </div>
        <div className="absolute inset-0 z-30 flex items-center justify-center backdrop-blur-[2px] bg-mm-bg-primary/20">
          <div className="text-center max-w-2xl px-10 py-10">
            <span className="icon text-mm-orange block mb-4" style={{ fontSize: '56px' }}>visibility_off</span>
            <h2 className="font-mono text-2xl font-bold mb-4 uppercase tracking-wide">Hold your horses</h2>
            <p className="font-mono text-sm text-mm-text-secondary leading-relaxed">
              We hid your stats because some of you treat this page like a stock ticker. It's a walkathon, not the NSE.
            </p>
            <p className="font-mono text-sm text-mm-text-secondary mt-4 leading-relaxed">
              Your km are safe. Our sanity wasn't — so the admin pressed the "everybody calm down" button.
            </p>
            <div className="mt-6 px-4 py-3 bg-mm-bg-card border border-mm-border rounded-xl">
              <p className="font-mono text-xs text-mm-text-muted">The data will be back when the admin decides you've learned patience. Which, at this rate, might take a while.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const weeks = groupByWeek(isAdmin ? activities : activities.filter(a => a.status !== 'FLAGGED'), challenge?.startDate);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Activities</h1>
          <p className="text-sm text-mm-text-muted mt-1">{total} activities total</p>
        </div>
        <div className="flex gap-2">
          {(isAdmin ? ['', 'ACCEPTED', 'REJECTED', 'FLAGGED'] : ['', 'ACCEPTED', 'REJECTED']).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-semibold uppercase transition ${
                filter === f ? 'gradient-hero text-white' : 'bg-mm-bg-card border border-mm-border text-mm-text-secondary hover:text-white'
              }`}>
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped by week */}
      <div className="space-y-6">
        {weeks.map(week => (
          <div key={week.label} className="bg-mm-bg-card border border-mm-border rounded-2xl overflow-hidden">
            {/* Week header */}
            <div className="flex items-center justify-between px-5 py-3 bg-mm-bg-elevated border-b border-mm-border">
              <div className="flex items-center gap-3">
                <span className="icon text-mm-orange" style={{ fontSize: '18px' }}>date_range</span>
                <span className="font-display text-sm font-semibold uppercase tracking-wide">{week.label}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-mm-text-muted">
                <span className="flex items-center gap-1.5 font-display font-semibold text-mm-teal text-sm">
                  {week.totalKm.toFixed(2)} km
                </span>
                <span className="text-mm-border">|</span>
                <span>{week.accepted} activities counted</span>
                {week.rejected > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="icon-sm text-mm-hot">cancel</span>
                    {week.rejected} rejected
                  </span>
                )}
              </div>
            </div>

            {/* Activities table */}
            <table className="w-full">
              <thead>
                <tr className="border-b border-mm-border">
                  <th className="text-left px-5 py-2.5 text-[0.65rem] text-mm-text-muted uppercase">Player</th>
                  <th className="text-left px-5 py-2.5 text-[0.65rem] text-mm-text-muted uppercase">Date</th>
                  <th className="text-left px-5 py-2.5 text-[0.65rem] text-mm-text-muted uppercase">Distance</th>
                  <th className="text-left px-5 py-2.5 text-[0.65rem] text-mm-text-muted uppercase">Speed</th>
                  <th className="text-left px-5 py-2.5 text-[0.65rem] text-mm-text-muted uppercase">Status</th>
                  <th className="text-left px-5 py-2.5 text-[0.65rem] text-mm-text-muted uppercase">Reason</th>
                  {isAdmin && <th className="px-5 py-2.5"></th>}
                </tr>
              </thead>
              <tbody>
                {week.activities.map(a => (
                  <tr key={a.id} className="border-b border-mm-border last:border-0 hover:bg-mm-bg-primary/50 transition">
                    <td className="px-5 py-2.5 text-sm">{a.player?.user?.name || '—'}</td>
                    <td className="px-5 py-2.5 text-sm text-mm-text-secondary">
                      {new Date(a.startDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-5 py-2.5 text-sm font-display font-semibold text-mm-teal">{(a.distanceMeters / 1000).toFixed(2)} km</td>
                    <td className="px-5 py-2.5 text-sm text-mm-text-secondary">{(a.avgSpeed * 3.6).toFixed(1)} km/h</td>
                    <td className="px-5 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase border ${
                        a.status === 'ACCEPTED' ? 'bg-mm-teal/15 text-mm-teal border-mm-teal/30' :
                        a.status === 'REJECTED' ? 'bg-mm-hot/15 text-mm-hot border-mm-hot/30' :
                        'bg-mm-gold/15 text-mm-gold border-mm-gold/30'
                      }`}>{a.status}</span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-mm-text-muted max-w-[200px] truncate">{a.rejectionReason || '—'}</td>
                    {isAdmin && (
                      <td className="px-5 py-2.5">
                        {a.status === 'ACCEPTED' ? (
                          <button onClick={() => rejectActivity(a.id)} title="Override: Reject"
                            className="w-7 h-7 rounded-full bg-mm-hot/10 text-mm-hot border border-mm-hot/20 flex items-center justify-center hover:scale-110 transition opacity-40 hover:opacity-100">
                            <span className="icon-sm">close</span>
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => approveActivity(a.id)} title="Override: Approve"
                              className="w-7 h-7 rounded-full bg-mm-teal/15 text-mm-teal border border-mm-teal/30 flex items-center justify-center hover:scale-110 transition">
                              <span className="icon-sm">check</span>
                            </button>
                            {a.status === 'FLAGGED' && (
                              <button onClick={() => rejectActivity(a.id)} title="Override: Reject"
                                className="w-7 h-7 rounded-full bg-mm-hot/15 text-mm-hot border border-mm-hot/30 flex items-center justify-center hover:scale-110 transition">
                                <span className="icon-sm">close</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {activities.length === 0 && (
        <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-8 text-center text-mm-text-muted">
          No activities found
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <span className="text-xs text-mm-text-muted">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-mm-bg-card border border-mm-border text-mm-text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button key={pageNum} onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${
                    page === pageNum ? 'gradient-hero text-white' : 'bg-mm-bg-card border border-mm-border text-mm-text-secondary hover:text-white'
                  }`}>
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-mm-bg-card border border-mm-border text-mm-text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
