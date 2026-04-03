import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API = '/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [forcePinReset, setForcePinReset] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('scg_auth');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed.user);
        setToken(parsed.token);
        setForcePinReset(!!parsed.forcePinReset);
      } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (initials, pin) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initials, pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setUser(data.user);
    setToken(data.token);
    setForcePinReset(!!data.forcePinReset);
    localStorage.setItem('scg_auth', JSON.stringify(data));
    return data;
  };

  const adminLogin = async (pin) => {
    const res = await fetch(`${API}/auth/admin-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setUser(data.user);
    setToken(data.token);
    setForcePinReset(!!data.forcePinReset);
    localStorage.setItem('scg_auth', JSON.stringify(data));
    return data;
  };

  const clearForcePinReset = () => {
    setForcePinReset(false);
    const saved = localStorage.getItem('scg_auth');
    if (saved) {
      const parsed = JSON.parse(saved);
      parsed.forcePinReset = false;
      localStorage.setItem('scg_auth', JSON.stringify(parsed));
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setForcePinReset(false);
    localStorage.removeItem('scg_auth');
  };

  const authFetch = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
    });
    if (res.status === 401 || res.status === 403) {
      logout();
      throw new Error('Session expired. Please log in again.');
    }
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, forcePinReset, login, adminLogin, logout, authFetch, clearForcePinReset }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
