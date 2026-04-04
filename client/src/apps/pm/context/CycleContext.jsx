import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';

const CycleContext = createContext(null);

export function CycleProvider({ children }) {
  const { authFetch } = useAuth();
  const [cycle, setCycle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/pm/cycles/active')
      .then(r => r.json())
      .then(setCycle)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch]);

  const months = cycle?.months || [];
  const monthKeys = months.map(m => m.key);
  const monthLabels = months.map(m => m.label);

  return (
    <CycleContext.Provider value={{ cycle, months, monthKeys, monthLabels, loading }}>
      {children}
    </CycleContext.Provider>
  );
}

export function useCycle() {
  const ctx = useContext(CycleContext);
  if (!ctx) throw new Error('useCycle must be used within CycleProvider');
  return ctx;
}
