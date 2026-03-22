import { useAuth0 } from '@auth0/auth0-react';
import { CreditCard, LogOut, LayoutDashboard, User } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import BrandWordmark from './Brand/BrandWordmark';
import ConsoleAmbientDigits from './Workspace/ConsoleAmbientDigits';

const navItems = [
  { to: '/projects', label: 'Projects', icon: LayoutDashboard },
  { to: '/billing', label: 'Billing', icon: CreditCard },
];

export default function Layout() {
  const { user, logout } = useAuth0();
  const location = useLocation();

  return (
    <div className="dc-shell">
      <aside className="dc-shell__sidebar">
        <ConsoleAmbientDigits variant="rail" tone="mixed" className="dc-shell__sidebar-ambient" />

        <NavLink to="/projects" className="dc-shell__brand">
          <div className="dc-shell__brand-copy">
            <BrandWordmark size="nav" />
            <span className="dc-shell__brand-subtitle">Financial crawl console</span>
          </div>
          <span className="dc-shell__brand-mark" />
        </NavLink>

        <div className="dc-shell__signal-ribbon">
          <span>Search routes</span>
          <span>Market signals</span>
          <span>Captured data</span>
        </div>

        <nav className="dc-shell__nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/projects'}
              className={({ isActive }) => `dc-shell__nav-link${isActive ? ' is-active' : ''}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="dc-shell__footer">
          {user?.picture ? (
            <img className="dc-shell__avatar" src={user.picture} alt="" />
          ) : (
            <div className="dc-shell__avatar dc-shell__avatar-fallback">
              <User size={18} />
            </div>
          )}

          <div className="dc-shell__footer-copy">
            <div className="dc-shell__footer-name">{user?.name || 'DataCrawl user'}</div>
            <div className="dc-shell__footer-email">{user?.email || ''}</div>
          </div>

          <button
            className="btn btn--ghost"
            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            title="Log out"
            style={{ paddingInline: 12 }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="dc-shell__main">
        <div key={location.pathname} className="dc-shell__thread is-active" />
        <div className="dc-shell__main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
