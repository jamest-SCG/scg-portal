import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import AppCard from '../components/AppCard';

export default function DashboardPage() {
  const { user, authFetch } = useAuth();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/portal/apps')
      .then(r => r.json())
      .then(setApps)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome, {user?.name}
          </h2>
          <p className="text-gray-500 mt-1">Select an app to get started.</p>
        </div>

        {apps.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No apps available</p>
            <p className="text-sm mt-1">Contact your admin to request access.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {apps.map(app => (
              <AppCard key={app.id} app={app} />
            ))}

            {/* Admin card — only for admins */}
            {user?.role === 'admin' && (
              <AppCard
                app={{
                  id: 'admin',
                  name: 'Portal Admin',
                  description: 'Manage users, app permissions, and PINs',
                  path: '/admin',
                  icon: 'admin',
                }}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
