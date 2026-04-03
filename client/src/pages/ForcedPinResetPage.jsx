import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ForcedPinResetPage() {
  const { authFetch, clearForcePinReset, logout } = useAuth();
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch('/api/auth/forced-change-pin', {
        method: 'PUT',
        body: JSON.stringify({ newPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      clearForcePinReset();
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
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-navy font-bold text-xl">SCG</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Set Your PIN</h1>
          <p className="text-blue-200 text-sm mt-1">You must choose a new PIN to continue</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4-digit PIN"
                className="input-field text-center text-lg tracking-widest"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Re-enter PIN"
                className="input-field text-center text-lg tracking-widest"
                autoComplete="off"
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-2 rounded-lg">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || newPin.length !== 4 || confirmPin.length !== 4}
              className="btn-primary w-full py-3"
            >
              {loading ? 'Saving...' : 'Set PIN'}
            </button>
          </form>

          <button
            onClick={logout}
            className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            Log out instead
          </button>
        </div>
      </div>
    </div>
  );
}
