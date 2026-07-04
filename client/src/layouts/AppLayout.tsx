import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { api, clearToken, isLoggedIn } from '../lib/api';

const adminNav = [
  { path: '/app/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { path: '/app/players', icon: 'directions_run', label: 'Players' },
  { path: '/app/teams', icon: 'groups', label: 'Teams' },
  { path: '/app/grid', icon: 'grid_on', label: 'Team Grid' },
  { path: '/app/challenge', icon: 'emoji_events', label: 'Config' },
  { path: '/app/sync', icon: 'sync', label: 'Sync' },
];

const playerNav = [
  { path: '/app/my-dashboard', icon: 'dashboard', label: 'My Dashboard' },
  { path: '/app/activities', icon: 'directions_walk', label: 'My Activities' },
];

function getPageTitle(pathname: string): string {
  const map: Record<string, string> = {
    '/app/dashboard': 'Dashboard',
    '/app/teams': 'Teams',
    '/app/players': 'Players',
    '/app/sync': 'Sync Control',
    '/app/rules': 'Scoring Rules',
    '/app/activities': 'Activities',
    '/app/team': 'My Team',
  };
  return map[pathname] || 'Dashboard';
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [viewAs, setViewAs] = useState<'ADMIN' | 'PLAYER'>('ADMIN');

  const adminPaths = ['/app/dashboard', '/app/players', '/app/teams', '/app/grid', '/app/challenge', '/app/sync', '/app/rules'];

  useEffect(() => {
    if (!isLoggedIn()) { navigate('/login'); return; }
    api.get('/auth/me').then(data => {
      setUser(data.user);
      // Redirect non-admins away from admin pages
      if (data.user.role !== 'ADMIN' && adminPaths.includes(location.pathname)) {
        navigate('/app/my-dashboard', { replace: true });
      }
    }).catch(() => navigate('/login'));
  }, [navigate, location.pathname]);

  if (!user) {
    return (
      <div className="min-h-screen bg-mm-bg-primary flex items-center justify-center">
        <span className="icon icon-lg text-mm-orange animate-spin">progress_activity</span>
      </div>
    );
  }

  const nav = user.role === 'ADMIN'
    ? (viewAs === 'ADMIN' ? adminNav : playerNav)
    : playerNav;
  const pageTitle = getPageTitle(location.pathname);

  return (
    <div className="min-h-screen bg-mm-bg-primary flex">
      {/* Variant A: Dashed Lane Markers Rail */}
      <aside className="w-16 bg-mm-bg-secondary border-r border-mm-border fixed h-screen flex flex-col items-center py-4 z-50 overflow-hidden">
        {/* Dashed lane markers - left */}
        <div className="absolute top-0 bottom-0 left-2 w-[3px] opacity-40" style={{
          background: 'repeating-linear-gradient(180deg, var(--color-mm-border) 0px, var(--color-mm-border) 12px, transparent 12px, transparent 24px)'
        }} />

        {/* Dashed lane markers - right */}
        <div className="absolute top-0 bottom-0 right-2 w-[3px] opacity-40" style={{
          background: 'repeating-linear-gradient(180deg, var(--color-mm-border) 0px, var(--color-mm-border) 12px, transparent 12px, transparent 24px)'
        }} />

        {/* Logo */}
        <div className="w-10 h-10 gradient-hero rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-mm-orange/30 relative z-10">
          <span className="icon text-white" style={{ fontSize: '22px' }}>directions_run</span>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1.5 flex-1 relative z-10">
          {nav.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              title={item.label}
              className={({ isActive }) =>
                `group w-11 h-11 rounded-[14px] flex items-center justify-center relative transition-all duration-200 ${
                  isActive
                    ? 'bg-mm-orange/12 text-mm-orange rail-active'
                    : 'text-mm-text-muted hover:text-white hover:bg-white/5'
                }`
              }
            >
              <span className="icon" style={{ fontSize: '20px' }}>{item.icon}</span>
              {/* Tooltip */}
              <span className="absolute left-14 px-3 py-1.5 bg-mm-bg-card border border-mm-border rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-[-4px] group-hover:translate-x-0 z-50">
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="flex flex-col items-center gap-1.5 pt-4 border-t border-mm-border relative z-10">
          <button
            onClick={() => { clearToken(); navigate('/login'); }}
            title="Logout"
            className="group w-11 h-11 rounded-[14px] flex items-center justify-center text-mm-text-muted hover:text-white hover:bg-white/5 transition relative"
          >
            <span className="icon" style={{ fontSize: '20px' }}>logout</span>
            <span className="absolute left-14 px-3 py-1.5 bg-mm-bg-card border border-mm-border rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50">
              Logout
            </span>
          </button>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} className="w-9 h-9 rounded-full border-2 border-transparent hover:border-mm-orange transition mt-2" alt="" />
          ) : (
            <div className="w-9 h-9 rounded-full gradient-hero flex items-center justify-center text-xs font-bold mt-2">
              {user.name?.split(' ').map((n: string) => n[0]).join('')}
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="ml-16 flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-14 border-b border-mm-border flex items-center justify-between px-7 bg-mm-bg-primary sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <span className="text-mm-text-muted text-xs uppercase tracking-wider">{user.role === 'ADMIN' ? 'Admin' : user.role === 'CAPTAIN' ? 'Captain' : 'Player'}</span>
            <span className="icon text-mm-border" style={{ fontSize: '16px' }}>chevron_right</span>
            <span className="font-display font-semibold text-mm-orange uppercase tracking-wide text-sm">{pageTitle}</span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2">
            <span className="font-display text-xs font-bold uppercase tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-mm-orange via-pink-500 to-purple-500" style={{ textShadow: '0 0 20px rgba(255,107,53,0.4), 0 0 40px rgba(255,0,110,0.2)' }}>Madras Walkathon Challenge</span>
          </div>
          <div className="flex items-center gap-4">
            {/* View switcher (admin only) */}
            {user.role === 'ADMIN' && (
              <div className="flex items-center bg-mm-bg-card border border-mm-border rounded-full p-0.5">
                {(['ADMIN', 'PLAYER'] as const).map(role => (
                  <button key={role} onClick={() => { setViewAs(role); navigate(role === 'ADMIN' ? '/app/dashboard' : '/app/my-dashboard'); }}
                    className={`px-3 py-1.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-wider transition-all ${
                      viewAs === role
                        ? 'gradient-hero text-white shadow-sm'
                        : 'text-mm-text-muted hover:text-white'
                    }`}>
                    {role}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-mm-bg-card border border-mm-border rounded-full text-xs text-mm-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-mm-teal animate-pulse" />
              Synced
            </div>
            <span className="text-sm text-mm-text-secondary">{user.name}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-8">
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  );
}
