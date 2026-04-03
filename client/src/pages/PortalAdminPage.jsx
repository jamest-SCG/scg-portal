import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';

export default function PortalAdminPage() {
  const { authFetch } = useAuth();
  const [users, setUsers] = useState([]);
  const [allApps, setAllApps] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create user form
  const [newInitials, setNewInitials] = useState('');
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newApps, setNewApps] = useState([]);
  const [createMsg, setCreateMsg] = useState('');

  // PIN reset
  const [selectedUserId, setSelectedUserId] = useState('');
  const [resetPin, setResetPin] = useState('');
  const [forceReset, setForceReset] = useState(true);
  const [pinMsg, setPinMsg] = useState('');

  // Backups
  const [backups, setBackups] = useState([]);
  const [backupMsg, setBackupMsg] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, appsRes, backupsRes] = await Promise.all([
        authFetch('/api/portal/users'),
        authFetch('/api/portal/all-apps'),
        authFetch('/api/portal/backups'),
      ]);
      setUsers(await usersRes.json());
      setAllApps(await appsRes.json());
      setBackups(await backupsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Toggle app access for a user
  const toggleAppAccess = async (userId, appId, currentApps) => {
    const hasApp = currentApps.includes(appId);
    const updatedApps = hasApp
      ? currentApps.filter(a => a !== appId)
      : [...currentApps, appId];

    try {
      await authFetch('/api/portal/user-apps', {
        method: 'PUT',
        body: JSON.stringify({ userId, apps: updatedApps }),
      });
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, apps: updatedApps } : u
      ));
    } catch (err) {
      console.error(err);
    }
  };

  // Create user
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateMsg('');
    try {
      const res = await authFetch('/api/portal/users', {
        method: 'POST',
        body: JSON.stringify({ initials: newInitials.toUpperCase(), name: newName, pin: newPin, apps: newApps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCreateMsg(data.message);
      setNewInitials('');
      setNewName('');
      setNewPin('');
      setNewApps([]);
      fetchData();
    } catch (err) {
      setCreateMsg('Error: ' + err.message);
    }
  };

  // Delete user
  const handleDeleteUser = async (userId, name) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      const res = await authFetch(`/api/portal/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // PIN reset
  const handlePinReset = async () => {
    if (!selectedUserId || resetPin.length !== 4) return;
    setPinMsg('');
    try {
      const res = await authFetch('/api/auth/change-pin', {
        method: 'PUT',
        body: JSON.stringify({ userId: parseInt(selectedUserId), newPin: resetPin, forceReset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPinMsg(data.message);
      setResetPin('');
    } catch (err) {
      setPinMsg('Error: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
        </div>
      </div>
    );
  }

  const nonAdminUsers = users.filter(u => u.role !== 'admin');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Portal Administration</h2>
          <Link to="/change-pin" className="btn-outline text-sm">Change Admin PIN</Link>
        </div>

        {/* User Permissions Table */}
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">User App Permissions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Initials</th>
                  {allApps.map(app => (
                    <th key={app.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">{app.name}</th>
                  ))}
                  {allApps.filter(a => a.active).map(app => (
                    <th key={app.id + '_admin'} className="px-4 py-3 text-center text-xs font-medium text-amber-600 uppercase">{app.name} Admin</th>
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {nonAdminUsers.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{user.initials}</td>
                    {allApps.map(app => (
                      <td key={app.id} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={user.apps.includes(app.id)}
                          onChange={() => toggleAppAccess(user.id, app.id, user.apps)}
                          className="w-4 h-4 text-navy rounded border-gray-300 focus:ring-navy-light"
                        />
                      </td>
                    ))}
                    {allApps.filter(a => a.active).map(app => (
                      <td key={app.id + '_admin'} className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={user.apps.includes(app.id + '_admin')}
                          onChange={() => toggleAppAccess(user.id, app.id + '_admin', user.apps)}
                          className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-400"
                        />
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteUser(user.id, user.name)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {nonAdminUsers.length === 0 && (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">No users found.</div>
          )}
        </div>

        {/* Create User */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New User</h3>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Initials</label>
                <input
                  type="text"
                  value={newInitials}
                  onChange={(e) => setNewInitials(e.target.value)}
                  placeholder="e.g. J.D."
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 digits"
                  className="input-field text-center tracking-widest"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">App Access</label>
              <div className="flex flex-wrap gap-3">
                {allApps.map(app => (
                  <label key={app.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newApps.includes(app.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewApps(prev => [...prev, app.id]);
                        } else {
                          setNewApps(prev => prev.filter(a => a !== app.id));
                        }
                      }}
                      className="w-4 h-4 text-navy rounded border-gray-300 focus:ring-navy-light"
                    />
                    {app.name}
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={!newInitials || !newName || newPin.length !== 4} className="btn-primary">
              Create User
            </button>
            {createMsg && (
              <p className={`text-sm ${createMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {createMsg}
              </p>
            )}
          </form>
        </div>

        {/* PIN Reset */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Reset PIN</h3>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="w-full sm:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1">Select User</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="input-field"
              >
                <option value="">Select...</option>
                {nonAdminUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.initials})</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-32">
              <label className="block text-sm font-medium text-gray-700 mb-1">Temporary PIN</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={resetPin}
                onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4 digits"
                className="input-field text-center tracking-widest"
              />
            </div>
            <button
              onClick={handlePinReset}
              disabled={!selectedUserId || resetPin.length !== 4}
              className="btn-primary whitespace-nowrap"
            >
              Reset PIN
            </button>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={forceReset}
              onChange={(e) => setForceReset(e.target.checked)}
              className="w-4 h-4 text-navy rounded border-gray-300 focus:ring-navy-light"
            />
            Force user to choose their own PIN on next login
          </label>
          {pinMsg && (
            <p className={`mt-3 text-sm ${pinMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {pinMsg}
            </p>
          )}
        </div>

        {/* Backup Management */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Database Backups</h3>
            <button
              onClick={async () => {
                setBackupMsg('');
                try {
                  const res = await authFetch('/api/portal/backups', { method: 'POST', body: JSON.stringify({}) });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error);
                  setBackupMsg(data.message);
                  fetchData();
                } catch (err) {
                  setBackupMsg('Error: ' + err.message);
                }
              }}
              className="btn-primary text-sm"
            >
              Create Backup Now
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Automatic backups run daily at 2:00 AM. Backups older than 30 days are auto-deleted.
          </p>

          {backupMsg && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              backupMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
            }`}>
              {backupMsg}
            </div>
          )}

          {backups.length === 0 ? (
            <p className="text-sm text-gray-400">No backups found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Size</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {backups.map(b => (
                    <tr key={b.filename} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{b.filename}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{new Date(b.created).toLocaleString()}</td>
                      <td className="px-4 py-2 text-xs text-right">{(b.size / 1024).toFixed(0)} KB</td>
                      <td className="px-4 py-2 text-center space-x-3">
                        <button
                          onClick={async () => {
                            const res = await authFetch(`/api/portal/backups/${b.filename}`);
                            const blob = await res.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = b.filename;
                            a.click();
                            window.URL.revokeObjectURL(url);
                          }}
                          className="text-xs text-navy hover:underline"
                        >
                          Download
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Restore database from ${b.filename}? This will replace all current data. A safety backup will be created first.`)) return;
                            setBackupMsg('');
                            try {
                              const res = await authFetch(`/api/portal/backups/${b.filename}/restore`, { method: 'POST', body: JSON.stringify({}) });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error);
                              setBackupMsg(data.message + ' Please refresh the page.');
                              fetchData();
                            } catch (err) {
                              setBackupMsg('Error: ' + err.message);
                            }
                          }}
                          className="text-xs text-amber-600 hover:underline"
                        >
                          Restore
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete backup ${b.filename}?`)) return;
                            try {
                              await authFetch(`/api/portal/backups/${b.filename}`, { method: 'DELETE' });
                              fetchData();
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
