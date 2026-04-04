import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { user, login, adminLogin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    fetch('/api/auth/users')
      .then(r => r.json())
      .then(setUsers)
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isAdmin) {
        await adminLogin(pin);
      } else {
        if (!selectedUser) {
          setError('Please select your name.');
          setLoading(false);
          return;
        }
        await login(selectedUser, pin);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy to-navy-light flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-white rounded-xl px-6 py-3 shadow-lg">
              <img src="/logo.png" alt="Sixth City Glazing" className="h-10 w-auto" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Employee Portal</h1>
        </div>

        <div className="card p-6">
          <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => { setIsAdmin(false); setPin(''); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                !isAdmin ? 'bg-white text-navy shadow-sm' : 'text-gray-500'
              }`}
            >
              Employee
            </button>
            <button
              onClick={() => { setIsAdmin(true); setPin(''); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                isAdmin ? 'bg-white text-navy shadow-sm' : 'text-gray-500'
              }`}
            >
              Admin
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select your name...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.initials}>{u.name} ({u.initials})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4-digit PIN"
                className="input-field text-center text-lg tracking-widest"
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-2 rounded-lg">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || pin.length !== 4}
              className="btn-primary w-full py-3"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
