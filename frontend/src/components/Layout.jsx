import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

const THEME_KEY = 'underpressure-theme';

function getInitialDark() {
  if (typeof window === 'undefined') return false;
  const t = localStorage.getItem(THEME_KEY);
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/log', label: 'Log' },
  { to: '/history', label: 'History' },
  { to: '/report', label: 'Report' },
  { to: '/admin', label: 'Admin' },
];

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(getInitialDark);
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  const isActive = (path) => location.pathname === path || (path === '/' && location.pathname === '/');

  return (
    <div className="min-h-screen flex flex-col" style={{ paddingTop: 'var(--safe-top)' }}>
      <header
        className="sticky top-0 z-30 border-b border-slate-700/50 text-white shadow-lg dark:border-slate-600/50"
        style={{ background: 'var(--header-bg)' }}
      >
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 sm:h-16 items-center justify-between">
            <Link
              to="/"
              className="text-lg sm:text-xl font-semibold tracking-tight text-white hover:text-teal-200 transition-colors"
            >
              Under Pressure
            </Link>

            <div className="flex items-center gap-2">
              {/* Dark mode toggle */}
              <button
                type="button"
                onClick={() => setDark((d) => !d)}
                className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={dark ? 'Light mode' : 'Dark mode'}
              >
                {dark ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* Desktop nav */}
              <nav className="hidden sm:flex items-center gap-1">
              {navItems.map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive(to)
                      ? 'bg-teal-500/20 text-teal-200'
                      : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="sm:hidden flex items-center justify-center w-11 h-11 rounded-lg text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
          </div>

          {/* Mobile nav dropdown */}
          {menuOpen && (
            <nav
              className="sm:hidden py-3 border-t border-slate-700/50"
              style={{ paddingBottom: 'max(0.75rem, var(--safe-bottom))' }}
            >
              <div className="flex flex-col gap-0.5">
                {navItems.map(({ to, label }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className={`rounded-lg px-4 py-3 text-base font-medium transition-colors ${
                      isActive(to)
                        ? 'bg-teal-500/20 text-teal-200'
                        : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </nav>
          )}
        </div>
      </header>

      <main
        className="flex-1 mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
        style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom))' }}
      >
        <Outlet />
      </main>
    </div>
  );
}
