import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function ChallengePage() {
  const [config, setConfig] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    maxDailyKm: 7,
    minDistancePerActivity: 1000,
    minPaceMinPerKm: 9,
    maxPaceMinPerKm: 16,
    maxPlayersWeek1: 12,
    maxPlayersWeek2: 15,
    maxPlayersWeek3: 18,
    maxPlayersWeek4: 15,
    useConstantRoster: false,
    minFemalePerWeek: 3,
    maxSubstitutions: 5,
    maleCanReturn: false,
    femaleCanReturn: true,
    maxReturns: 1,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  async function loadConfig() {
    const data = await api.get('/challenge');
    if (data.config) {
      setConfig(data.config);
      setForm({
        name: data.config.name || '',
        startDate: data.config.startDate?.split('T')[0] || '',
        endDate: data.config.endDate?.split('T')[0] || '',
        maxDailyKm: data.config.maxDailyKm ?? 7,
        minDistancePerActivity: data.config.minDistancePerActivity ?? 1000,
        minPaceMinPerKm: data.config.minPaceMinPerKm ?? 9,
        maxPaceMinPerKm: data.config.maxPaceMinPerKm ?? 16,
        maxPlayersWeek1: data.config.maxPlayersWeek1 ?? 12,
        maxPlayersWeek2: data.config.maxPlayersWeek2 ?? 15,
        maxPlayersWeek3: data.config.maxPlayersWeek3 ?? 18,
        maxPlayersWeek4: data.config.maxPlayersWeek4 ?? 15,
        useConstantRoster: data.config.useConstantRoster ?? false,
        minFemalePerWeek: data.config.minFemalePerWeek ?? 3,
        maxSubstitutions: data.config.maxSubstitutions ?? 5,
        maleCanReturn: data.config.maleCanReturn ?? false,
        femaleCanReturn: data.config.femaleCanReturn ?? true,
        maxReturns: data.config.maxReturns ?? 1,
      });
    }
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    if (config) {
      await api.put(`/challenge/${config.id}`, form);
    } else {
      await api.post('/challenge', form);
    }
    await loadConfig();
    setSaving(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Challenge Config</h1>
          <p className="text-sm text-mm-text-muted mt-1">{config ? `Active: ${config.name}` : 'No active challenge'}</p>
        </div>
        {config && (
          <div className="flex items-center gap-2 px-4 py-2 bg-mm-teal/10 border border-mm-teal/30 rounded-full text-xs text-mm-teal font-semibold">
            <span className="icon-sm">check_circle</span> Active
          </div>
        )}
      </div>

      <form onSubmit={saveConfig} className="space-y-6">
        {/* Event Details */}
        <Section title="Event Details" icon="event">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Challenge Name" value={form.name} onChange={v => setForm({...form, name: v})} placeholder="Madras Walkathon 2026" />
            <Field label="Start Date" type="date" value={form.startDate} onChange={v => setForm({...form, startDate: v})} />
            <Field label="End Date (3 weeks)" type="date" value={form.endDate} onChange={v => setForm({...form, endDate: v})} />
          </div>
          <p className="text-xs text-mm-text-muted mt-2">Duration must be exactly 3 weeks (21 days). All calendar days included.</p>
        </Section>

        {/* Walking Rules */}
        <Section title="Walking Rules" icon="directions_walk">
          <div className="grid grid-cols-3 gap-4">
            <Field label="Max Daily KM (cap)" type="number" value={form.maxDailyKm} onChange={v => setForm({...form, maxDailyKm: +v})} />
            <Field label="Min Distance per Activity (m)" type="number" value={form.minDistancePerActivity} onChange={v => setForm({...form, minDistancePerActivity: +v})} />
            <div className="col-span-1">
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Allowed Type</label>
              <div className="mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm text-mm-text-secondary">
                Walk only (enforced)
              </div>
            </div>
          </div>
          <p className="text-xs text-mm-text-muted mt-2">
            Players can do unlimited activities per day but each must be ≥ {form.minDistancePerActivity/1000} km. Total capped at {form.maxDailyKm} km/day.
          </p>
        </Section>

        {/* Pace Rules */}
        <Section title="Pace Rules" icon="speed">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min Pace (min/km) — fastest allowed" type="number" value={form.minPaceMinPerKm} onChange={v => setForm({...form, minPaceMinPerKm: +v})} />
            <Field label="Max Pace (min/km) — slowest allowed" type="number" value={form.maxPaceMinPerKm} onChange={v => setForm({...form, maxPaceMinPerKm: +v})} />
          </div>
          <div className="mt-3 p-3 bg-mm-bg-primary rounded-lg border border-mm-border">
            <p className="text-xs text-mm-text-secondary">
              <strong className="text-white">Pace range: {form.minPaceMinPerKm} – {form.maxPaceMinPerKm} min/km</strong>
              <span className="text-mm-text-muted ml-2">
                (= {(60/form.maxPaceMinPerKm).toFixed(1)} – {(60/form.minPaceMinPerKm).toFixed(1)} km/h)
              </span>
            </p>
            <p className="text-xs text-mm-text-muted mt-1">
              Checked on overall average AND per-km split via Strava GPS streams. If any 1km split falls outside this range, the activity is rejected.
            </p>
          </div>
        </Section>

        {/* Weekly Roster */}
        {/* Substitution Rules */}
        <Section title="Substitution Rules" icon="swap_horiz">
          <div className="grid grid-cols-4 gap-4">
            <Field label="Max Subs per Team" type="number" value={form.maxSubstitutions} onChange={v => setForm({...form, maxSubstitutions: +v})} />
            <Field label="Max Returns per Player" type="number" value={form.maxReturns} onChange={v => setForm({...form, maxReturns: +v})} />
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Male Can Return?</label>
              <select value={form.maleCanReturn ? 'yes' : 'no'} onChange={e => setForm({...form, maleCanReturn: e.target.value === 'yes'})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
                <option value="no">No — retired permanently</option>
                <option value="yes">Yes — can return</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Female Can Return?</label>
              <select value={form.femaleCanReturn ? 'yes' : 'no'} onChange={e => setForm({...form, femaleCanReturn: e.target.value === 'yes'})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
                <option value="yes">Yes — can return</option>
                <option value="no">No — retired permanently</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-mm-text-muted mt-2">
            {form.maxReturns === 0 ? 'No player can return once retired.' : `Players can return up to ${form.maxReturns} time(s).`}
            {' '}Male: {form.maleCanReturn ? '✅ can return' : '❌ permanent'}. Female: {form.femaleCanReturn ? '✅ can return' : '❌ permanent'}.
          </p>
        </Section>

        {/* Roster Config */}
        <Section title="Weekly Active Roster" icon="groups">
          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.useConstantRoster} onChange={e => setForm({...form, useConstantRoster: e.target.checked})} className="accent-mm-orange w-4 h-4" />
              <span className="text-sm">Use constant roster size (same number every week)</span>
            </label>
          </div>
          {form.useConstantRoster ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Players per Week (all weeks)" type="number" value={form.maxPlayersWeek1} onChange={v => setForm({...form, maxPlayersWeek1: +v, maxPlayersWeek2: +v, maxPlayersWeek3: +v})} />
              <Field label="Min Female per Week" type="number" value={form.minFemalePerWeek} onChange={v => setForm({...form, minFemalePerWeek: +v})} />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              <Field label="Week 1 Active Players" type="number" value={form.maxPlayersWeek1} onChange={v => setForm({...form, maxPlayersWeek1: +v})} />
              <Field label="Week 2 Active Players" type="number" value={form.maxPlayersWeek2} onChange={v => setForm({...form, maxPlayersWeek2: +v})} />
              <Field label="Week 3 Active Players" type="number" value={form.maxPlayersWeek3} onChange={v => setForm({...form, maxPlayersWeek3: +v})} />
              <Field label="Week 4 Active Players" type="number" value={form.maxPlayersWeek4} onChange={v => setForm({...form, maxPlayersWeek4: +v})} />
              <Field label="Min Female per Week" type="number" value={form.minFemalePerWeek} onChange={v => setForm({...form, minFemalePerWeek: +v})} />
            </div>
          )}
          <p className="text-xs text-mm-text-muted mt-2">
            {form.useConstantRoster
              ? `All weeks: ${form.maxPlayersWeek1} players active daily (min ${form.minFemalePerWeek} female). 1 mandatory rest day per week.`
              : `W1: ${form.maxPlayersWeek1} → W2: ${form.maxPlayersWeek2} → W3: ${form.maxPlayersWeek3} → W4: ${form.maxPlayersWeek4} players (min ${form.minFemalePerWeek} female). 1 rest day per week.`}
          </p>
        </Section>

        {/* Rest Day (info only) */}
        <Section title="Rest Day (auto-enforced)" icon="hotel">
          <div className="p-4 bg-mm-bg-primary rounded-lg border border-mm-border">
            <p className="text-xs text-mm-text-muted">1 mandatory rest day per calendar week. Weeks are defined from challenge start date in 7-day blocks (last week may be shorter). If a player walks every available day in a week, the last activity is rejected as rest day.</p>
          </div>
        </Section>

        {/* Save */}
        <div className="flex justify-end pt-4 border-t border-mm-border">
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 gradient-hero rounded-lg font-semibold text-sm text-white disabled:opacity-50 hover:-translate-y-0.5 transition shadow-lg shadow-mm-orange/30">
            <span className="icon-sm">{saving ? 'progress_activity' : 'save'}</span>
            {config ? 'Update Config' : 'Create Config'}
          </button>
        </div>
      </form>

      {/* Validation Rules Reference */}
      <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mt-6">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4 flex items-center gap-2">
          <span className="icon-sm text-mm-orange">gavel</span> Validation Rules (Auto-enforced on Sync)
        </h3>
        <table className="w-full">
          <thead>
            <tr className="border-b border-mm-border">
              <th className="text-left px-4 py-2.5 text-xs text-mm-text-muted uppercase">Rule</th>
              <th className="text-left px-4 py-2.5 text-xs text-mm-text-muted uppercase w-[120px]">Action</th>
            </tr>
          </thead>
          <tbody>
            <RuleRow rule="Manual entry (no GPS)" action="rejected" />
            <RuleRow rule="Activity type is not Walk" action="rejected" />
            <RuleRow rule="No GPS polyline / start location (possible treadmill)" action="flagged" />
            <RuleRow rule="Activity outside challenge date window" action="rejected" />
            <RuleRow rule={`Distance less than ${form.minDistancePerActivity / 1000} km`} action="rejected" />
            <RuleRow rule={`Average pace outside ${form.minPaceMinPerKm}–${form.maxPaceMinPerKm} min/km`} action="rejected" />
            <RuleRow rule="Player not in active roster for that week" action="rejected" />
            <RuleRow rule="Rest day — 1 mandatory rest per week (walks all available days = last rejected)" action="rejected" />
            <RuleRow rule={`Daily cap exceeded (>${form.maxDailyKm} km) — partial credit applied`} action="accepted" />
            <RuleRow rule="Activity outside allowed time window (weekday 4-9AM/5-10PM, weekend 4AM-10PM)" action="flagged" />
            <RuleRow rule="Duplicate activity (already synced)" action="rejected" />
            <RuleRow rule="Suspicious pause: elapsed time > 1.8× moving time" action="flagged" />
            <RuleRow rule="Speed spike: max speed > 2.5× average speed" action="flagged" />
            <RuleRow rule="Overlapping activities (same player, same time)" action="flagged" />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6">
      <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-4 flex items-center gap-2">
        <span className="icon-sm text-mm-orange">{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: any; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs text-mm-text-muted uppercase tracking-wider">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} step={type === 'number' ? 'any' : undefined} placeholder={placeholder}
        className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
    </div>
  );
}

function RuleRow({ rule, action }: { rule: string; action: 'accepted' | 'rejected' | 'flagged' }) {
  const styles = {
    accepted: 'bg-mm-teal/10 text-mm-teal border-mm-teal/30',
    rejected: 'bg-mm-hot/10 text-mm-hot border-mm-hot/30',
    flagged: 'bg-mm-gold/10 text-mm-gold border-mm-gold/30',
  };
  return (
    <tr className="border-b border-mm-border/50 last:border-0">
      <td className="px-4 py-3 text-sm text-mm-text-secondary">{rule}</td>
      <td className="px-4 py-3">
        <span className={`px-2.5 py-1 rounded-full text-[0.65rem] font-semibold uppercase border ${styles[action]}`}>
          {action}
        </span>
      </td>
    </tr>
  );
}
