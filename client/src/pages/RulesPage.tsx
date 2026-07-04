import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const RULE_TYPES = ['distance', 'speed_bonus', 'streak', 'early_bird', 'daily_cap', 'time_bonus', 'max_km_bonus', 'custom'];

const RULE_TEMPLATES = [
  { name: 'Distance Points', ruleType: 'distance', params: { pointsPerUnit: 1, unitMeters: 1000 }, desc: '1 point per km walked' },
  { name: 'Max Day Bonus', ruleType: 'max_km_bonus', params: { targetKm: 7, points: 3 }, desc: 'Bonus for hitting 7km in a day' },
  { name: 'Consistency Bonus', ruleType: 'streak', params: { pointsPerDay: 1, minStreakDays: 5 }, desc: 'Bonus for 5+ consecutive active days' },
  { name: 'Early Bird', ruleType: 'early_bird', params: { beforeHour: 7, points: 2 }, desc: 'Bonus for walking before 7 AM' },
  { name: 'Daily Cap', ruleType: 'daily_cap', params: { maxPoints: 15 }, desc: 'Max points earnable per day' },
];

export default function RulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', ruleType: 'distance', params: '{}', priority: 0 });

  useEffect(() => { loadRules(); }, []);

  async function loadRules() {
    const data = await api.get('/rules');
    setRules(data.rules);
  }

  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/rules', { ...form, params: JSON.parse(form.params) });
      setForm({ name: '', ruleType: 'distance', params: '{}', priority: 0 });
      setShowCreate(false);
      loadRules();
    } catch { alert('Invalid params JSON'); }
  }

  async function toggleRule(id: string) {
    await fetch(`/api/rules/${id}/toggle`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${localStorage.getItem('mm_token')}` } });
    loadRules();
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this rule?')) return;
    await api.delete(`/rules/${id}`);
    loadRules();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase">Scoring Rules</h1>
          <p className="text-sm text-mm-text-muted mt-1">{rules.filter(r => r.isActive).length} active / {rules.length} total</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-5 py-2.5 gradient-hero rounded-full font-display font-semibold text-sm uppercase tracking-wide text-white shadow-lg shadow-mm-orange/30 hover:-translate-y-0.5 transition">
          <span className="icon-sm">add</span> Add Rule
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createRule} className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mb-6">
          <h3 className="font-display text-lg font-semibold mb-4">New Scoring Rule</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Name *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Type *</label>
              <select value={form.ruleType} onChange={e => setForm({...form, ruleType: e.target.value})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none">
                {RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-mm-text-muted uppercase tracking-wider">Priority</label>
              <input type="number" value={form.priority} onChange={e => setForm({...form, priority: +e.target.value})}
                className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm focus:border-mm-orange outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="px-6 py-2.5 gradient-hero rounded-lg font-semibold text-sm text-white">Create</button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2.5 text-sm text-mm-text-muted hover:text-white">Cancel</button>
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs text-mm-text-muted uppercase tracking-wider">Params (JSON) *</label>
            <textarea value={form.params} onChange={e => setForm({...form, params: e.target.value})} rows={3}
              className="w-full mt-1 px-4 py-2.5 bg-mm-bg-primary border border-mm-border rounded-lg text-sm font-mono focus:border-mm-orange outline-none"
              placeholder='{"pointsPerUnit": 2, "unitMeters": 1000}' />
          </div>
          <div className="mt-3 text-xs text-mm-text-muted">
            Examples: distance → {`{"pointsPerUnit": 2, "unitMeters": 1000}`} | speed_bonus → {`{"points": 4, "minSpeedKmh": 5.5, "maxSpeedKmh": 7}`} | streak → {`{"pointsPerDay": 2, "minStreakDays": 3}`}
          </div>
        </form>
      )}

      {/* Quick-Add Templates */}
      {rules.length === 0 && (
        <div className="bg-mm-bg-card border border-mm-border rounded-2xl p-6 mb-6">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-mm-text-muted mb-3 flex items-center gap-2">
            <span className="icon-sm text-mm-gold">bolt</span> Quick Setup — Recommended Rules
          </h3>
          <p className="text-xs text-mm-text-muted mb-4">No rules configured yet. Click to add recommended scoring rules:</p>
          <div className="grid grid-cols-2 gap-3">
            {RULE_TEMPLATES.map((tmpl, i) => (
              <button key={i} onClick={async () => { await api.post('/rules', { ...tmpl, priority: i + 1 }); loadRules(); }}
                className="flex items-center gap-3 p-3 bg-mm-bg-primary border border-mm-border rounded-lg text-left hover:border-mm-orange/30 transition">
                <span className="icon-sm text-mm-gold">add_circle</span>
                <div>
                  <div className="text-xs font-medium">{tmpl.name}</div>
                  <div className="text-[0.6rem] text-mm-text-muted">{tmpl.desc}</div>
                </div>
              </button>
            ))}
            <button onClick={async () => { for (let i = 0; i < RULE_TEMPLATES.length; i++) { await api.post('/rules', { ...RULE_TEMPLATES[i], priority: i + 1 }); } loadRules(); }}
              className="flex items-center gap-3 p-3 gradient-hero rounded-lg text-left">
              <span className="icon-sm text-white">playlist_add</span>
              <div>
                <div className="text-xs font-semibold text-white">Add All Recommended</div>
                <div className="text-[0.6rem] text-white/70">Set up all {RULE_TEMPLATES.length} rules at once</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div className="space-y-3">
        {rules.map(rule => (
          <div key={rule.id} className={`bg-mm-bg-card border rounded-xl p-5 flex items-center gap-5 transition ${rule.isActive ? 'border-mm-border' : 'border-mm-border opacity-50'}`}>
            {/* Toggle */}
            <button onClick={() => toggleRule(rule.id)}
              className={`w-10 h-6 rounded-full relative transition-colors ${rule.isActive ? 'bg-mm-teal' : 'bg-mm-bg-elevated'}`}>
              <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${rule.isActive ? 'left-5' : 'left-1'}`} />
            </button>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="font-medium text-sm">{rule.name}</span>
                <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase bg-mm-purple/15 text-purple-300 border border-mm-purple/30">
                  {rule.ruleType}
                </span>
                <span className="text-xs text-mm-text-muted">Priority: {rule.priority}</span>
              </div>
              <div className="text-xs text-mm-text-muted font-mono mt-1">
                {JSON.stringify(rule.params)}
              </div>
            </div>

            {/* Delete */}
            <button onClick={() => deleteRule(rule.id)} className="text-mm-text-muted hover:text-mm-hot transition">
              <span className="icon-sm">delete</span>
            </button>
          </div>
        ))}
        {rules.length === 0 && <p className="text-center text-mm-text-muted py-8">No scoring rules configured</p>}
      </div>
    </div>
  );
}
