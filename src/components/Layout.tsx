import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, LogOut, Settings, ShoppingBasket, Store, Timer } from 'lucide-react';
import { longDay, todayLocal } from '../lib/format';

const NAV = [
  { to: '/', label: 'Sell', icon: Store, end: true },
  { to: '/sessions', label: 'Sessions', icon: Timer },
  // One entry for the three ingredient screens (daily use, purchases, stock)
  { to: '/usage', label: 'Ingredients', icon: ShoppingBasket, also: ['/purchases', '/stock'] },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Brand() {
  return (
    <div className="brand">
      <img src="/logo-240.webp" alt="" width={36} height={36} />
      <div>
        <strong>MISU</strong>
        <span>Tiramisu stall</span>
      </div>
    </div>
  );
}

type NavEntry = (typeof NAV)[number] & { also?: string[] };

function isCurrent(n: NavEntry, pathname: string): boolean {
  if (n.end) return pathname === n.to;
  return [n.to, ...(n.also ?? [])].some((p) => pathname.startsWith(p));
}

export function Layout({ username, onLogout }: { username: string; onLogout: () => void }) {
  const { pathname } = useLocation();
  const current = NAV.find((n) => isCurrent(n, pathname));

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={() => `nav-item ${isCurrent(n, pathname) ? 'active' : ''}`}>
              <n.icon size={18} strokeWidth={1.75} aria-hidden="true" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>{longDay(todayLocal())}</span>
          <div className="sidebar-user">
            <span className="avatar" aria-hidden="true">
              {username.charAt(0).toUpperCase()}
            </span>
            <span className="sidebar-username">{username}</span>
            <button type="button" className="icon-btn" onClick={onLogout} aria-label="Log out" title="Log out">
              <LogOut size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <img src="/logo-240.webp" alt="MISU" width={32} height={32} />
        <span className="topbar-title">{current?.label ?? 'MISU'}</span>
      </header>

      <main className="canvas">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={() => `tab ${isCurrent(n, pathname) ? 'active' : ''}`}>
            <n.icon size={22} strokeWidth={1.75} aria-hidden="true" />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
