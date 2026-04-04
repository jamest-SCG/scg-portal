import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PortalAdminPage from './pages/PortalAdminPage';
import ChangePinPage from './pages/ChangePinPage';
import ForcedPinResetPage from './pages/ForcedPinResetPage';
import PMDashboard from './apps/pm/PMDashboard';
import PMAdminDashboard from './apps/pm/AdminDashboard';
import SubmitConfirmation from './apps/pm/SubmitConfirmation';
import { CycleProvider } from './apps/pm/context/CycleContext';

function ProtectedRoute({ children, app, adminOnly, appAdminOnly }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  if (appAdminOnly && user.role !== 'admin' && (!user.apps || !user.apps.includes(`${appAdminOnly}_admin`))) {
    return <Navigate to="/" replace />;
  }
  if (app && user.role !== 'admin' && (!user.apps || !user.apps.includes(app))) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function AppRoutes() {
  const { user, forcePinReset } = useAuth();

  // If logged in and forced to reset PIN, show that screen everywhere
  if (user && forcePinReset) {
    return (
      <Routes>
        <Route path="*" element={<ForcedPinResetPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Dashboard Hub */}
      <Route
        path="/"
        element={
          user ? (
            <ProtectedRoute><DashboardPage /></ProtectedRoute>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Portal Admin */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <PortalAdminPage />
          </ProtectedRoute>
        }
      />

      {/* Self-service PIN change */}
      <Route
        path="/change-pin"
        element={
          <ProtectedRoute>
            <ChangePinPage />
          </ProtectedRoute>
        }
      />

      {/* PM Portal Routes */}
      <Route
        path="/pm"
        element={
          <ProtectedRoute app="pm">
            <CycleProvider><PMDashboard /></CycleProvider>
          </ProtectedRoute>
        }
      />
      <Route
        path="/pm/confirmed"
        element={
          <ProtectedRoute app="pm">
            <SubmitConfirmation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pm/admin"
        element={
          <ProtectedRoute app="pm" appAdminOnly="pm">
            <CycleProvider><PMAdminDashboard /></CycleProvider>
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
