import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, LogOut, Settings, ShoppingBasket, Store } from 'lucide-react';
import { longDay, todayLocal } from '../lib/format';

const NAV = [
  { to: '/', label: 'Sell', icon: Store, end: true },
  { to: '/purchases', label: 'Purchases', icon: ShoppingBasket },
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

export function Layout({ onLogout }: { onLogout?: () => void }) {
  const { pathname } = useLocation();
  const current = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-item">
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>{longDay(todayLocal())}</span>
          {onLogout && (
            <button type="button" className="nav-item" onClick={onLogout}>
              <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
              Log out
            </button>
          )}
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
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tab">
            <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
