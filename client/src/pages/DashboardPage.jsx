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
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="mb-8">
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 w-64 bg-gray-200 rounded animate-pulse mt-2"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="card p-6 space-y-4 animate-pulse">
                <div className="w-14 h-14 bg-gray-200 rounded-xl"></div>
                <div className="h-5 w-32 bg-gray-200 rounded"></div>
                <div className="h-4 w-48 bg-gray-100 rounded"></div>
              </div>
            ))}
          </div>
        </main>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
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
