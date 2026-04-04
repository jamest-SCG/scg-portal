import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const APP_NAMES = {
  '/pm': 'PM Portal',
  '/storefront': 'Storefront',
  '/entrance': 'Entrance Estimator',
};

export default function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();

  // Determine which app we're in (if any)
  const appPath = Object.keys(APP_NAMES).find(p => location.pathname.startsWith(p));
  const appName = appPath ? APP_NAMES[appPath] : null;

  return (
    <header className="bg-navy text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="bg-white rounded-lg px-2 py-1 flex items-center">
              <img src="/logo.png" alt="Sixth City Glazing" className="h-6 w-auto" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold leading-tight">SCG Portal</h1>
                {appName && (
                  <>
                    <span className="text-blue-300">/</span>
                    <span className="text-sm text-blue-200">{appName}</span>
                  </>
                )}
              </div>
            </div>
          </Link>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block h-8 w-px bg-white/20"></div>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-blue-200 capitalize">
                {user.role === 'admin' ? 'Administrator' : 'Employee'}
              </p>
            </div>
            <span className="text-sm sm:hidden font-medium">{user.initials}</span>
            <Link
              to="/change-pin"
              className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors hidden sm:inline-block"
            >
              Change PIN
            </Link>
            <button
              onClick={logout}
              className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
