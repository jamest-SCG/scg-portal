import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import CurrencyInput from '../../../components/CurrencyInput';

function fmt(val) {
  if (val === null || val === undefined || val === '' || val === 0) return '-';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '-';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function CostCodeTable({ jobNo, isLocked, onCTCChange }) {
  const { authFetch } = useAuth();
  const [costCodes, setCostCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState(null);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const debounceRefs = useRef({});
  const onCTCChangeRef = useRef(onCTCChange);
  onCTCChangeRef.current = onCTCChange;

  useEffect(() => {
    authFetch(`/api/pm/jobs/${jobNo}/cost-codes`)
      .then(r => r.json())
      .then(setCostCodes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobNo, authFetch]);

  const handleEstChange = useCallback((costCodeNo, value) => {
    setCostCodes(prev => {
      const updated = prev.map(cc =>
        cc.cost_code_no === costCodeNo
          ? { ...cc, pm_revised_est: value === '' ? null : parseFloat(value) }
          : cc
      );
      // Report CTC to parent via ref to avoid re-render cascade
      if (onCTCChangeRef.current) {
        const pmRevisedTotal = updated.reduce((sum, cc) => {
          return sum + (cc.pm_revised_est != null ? cc.pm_revised_est : (cc.revised_est_cost || 0));
        }, 0);
        const totalCostsToDate = updated.reduce((sum, cc) => sum + (cc.costs_to_date || 0), 0);
        // Use setTimeout to defer parent update and avoid synchronous re-render
        setTimeout(() => onCTCChangeRef.current(pmRevisedTotal, Math.max(0, pmRevisedTotal - totalCostsToDate)), 0);
      }
      return updated;
    });

    // Debounced save
    if (debounceRefs.current[costCodeNo]) clearTimeout(debounceRefs.current[costCodeNo]);
    debounceRefs.current[costCodeNo] = setTimeout(async () => {
      setSavingCode(costCodeNo);
      try {
        await authFetch(`/api/pm/jobs/${jobNo}/cost-codes/${costCodeNo}`, {
          method: 'PUT',
          body: JSON.stringify({ pm_revised_est: value === '' ? null : value }),
        });
      } catch {}
      setSavingCode(null);
    }, 1500);
  }, [jobNo, authFetch]);

  const handleSort = useCallback((col) => {
    setSortCol(prev => {
      if (prev === col) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return col;
      }
      setSortDir('asc');
      return col;
    });
  }, []);

  const sortedCodes = useMemo(() => {
    if (!sortCol) return costCodes;
    return [...costCodes].sort((a, b) => {
      let av, bv;
      if (sortCol === 'remaining') {
        const estA = a.pm_revised_est != null ? a.pm_revised_est : (a.revised_est_cost || 0);
        const estB = b.pm_revised_est != null ? b.pm_revised_est : (b.revised_est_cost || 0);
        av = estA - (a.costs_to_date || 0);
        bv = estB - (b.costs_to_date || 0);
      } else if (sortCol === 'over_under') {
        const estA = a.pm_revised_est != null ? a.pm_revised_est : (a.revised_est_cost || 0);
        const estB = b.pm_revised_est != null ? b.pm_revised_est : (b.revised_est_cost || 0);
        av = estA - (a.costs_to_date || 0);
        bv = estB - (b.costs_to_date || 0);
      } else if (sortCol === 'pm_est') {
        av = a.pm_revised_est != null ? a.pm_revised_est : (a.revised_est_cost || 0);
        bv = b.pm_revised_est != null ? b.pm_revised_est : (b.revised_est_cost || 0);
      } else {
        av = a[sortCol];
        bv = b[sortCol];
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0);
    });
  }, [costCodes, sortCol, sortDir]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-navy"></div>
      </div>
    );
  }

  if (costCodes.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">No cost codes imported for this job.</p>
    );
  }

  const totalRevisedEst = costCodes.reduce((s, cc) => s + (cc.revised_est_cost || 0), 0);
  const totalCostsToDate = costCodes.reduce((s, cc) => s + (cc.costs_to_date || 0), 0);
  const totalPMEst = costCodes.reduce((s, cc) => {
    return s + (cc.pm_revised_est !== null && cc.pm_revised_est !== undefined ? cc.pm_revised_est : (cc.revised_est_cost || 0));
  }, 0);

  const sortIcon = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  const thClass = (align) => `px-3 py-2.5 font-semibold text-xs uppercase tracking-wide cursor-pointer hover:bg-white/10 transition-colors select-none ${align || 'text-right'}`;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-navy text-white">
          <tr>
            <th className={thClass('text-left')} onClick={() => handleSort('cost_code_no')}>Code{sortIcon('cost_code_no')}</th>
            <th className={thClass('text-left')} onClick={() => handleSort('description')}>Description{sortIcon('description')}</th>
            <th className={thClass()} onClick={() => handleSort('revised_est_cost')}>Revised Est{sortIcon('revised_est_cost')}</th>
            <th className={thClass()} onClick={() => handleSort('costs_to_date')}>Costs to Date{sortIcon('costs_to_date')}</th>
            <th className={thClass()} onClick={() => handleSort('remaining')}>Remaining{sortIcon('remaining')}</th>
            <th className={`${thClass()} text-amber-300`} onClick={() => handleSort('pm_est')}>PM Est{sortIcon('pm_est')}</th>
            <th className={thClass()} onClick={() => handleSort('over_under')}>Over/Under{sortIcon('over_under')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedCodes.map((cc, idx) => {
            const effectiveEst = cc.pm_revised_est != null ? cc.pm_revised_est : (cc.revised_est_cost || 0);
            const effectiveRemaining = effectiveEst - (cc.costs_to_date || 0);
            const overUnder = effectiveRemaining;
            const overBudget = cc.costs_to_date > effectiveEst && effectiveEst > 0;
            const stripe = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            return (
              <tr key={cc.cost_code_no} className={overBudget ? 'bg-red-50' : `${stripe} hover:bg-blue-50`}>
                <td className="px-3 py-2 font-mono text-gray-700">{cc.cost_code_no}</td>
                <td className="px-3 py-2 truncate max-w-[200px] text-gray-800">{cc.description}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(cc.revised_est_cost)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-700">{fmt(cc.costs_to_date)}</td>
                <td className={`px-3 py-2 text-right font-mono ${effectiveRemaining < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                  {fmt(effectiveRemaining)}
                </td>
                <td className="px-3 py-2 text-right">
                  {isLocked ? (
                    <span className="font-mono">{cc.pm_revised_est != null ? fmt(cc.pm_revised_est) : '-'}</span>
                  ) : (
                    <CurrencyInput
                      value={cc.pm_revised_est != null ? cc.pm_revised_est : ''}
                      onChange={(e) => handleEstChange(cc.cost_code_no, e.target.value)}
                      placeholder={cc.revised_est_cost ? cc.revised_est_cost.toLocaleString() : '0'}
                      className="w-28 px-2 py-1 border border-gray-300 rounded text-right text-sm font-mono focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                    />
                  )}
                  {savingCode === cc.cost_code_no && (
                    <span className="text-xs text-green-500 ml-1">saving...</span>
                  )}
                </td>
                <td className={`px-3 py-2 text-right font-mono font-medium ${
                  overUnder < 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {fmt(overUnder)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-navy/10 font-semibold border-t-2 border-navy/20">
          <tr>
            <td className="px-3 py-2.5 text-gray-800" colSpan={2}>Totals</td>
            <td className="px-3 py-2.5 text-right font-mono text-gray-800">{fmt(totalRevisedEst)}</td>
            <td className="px-3 py-2.5 text-right font-mono text-gray-800">{fmt(totalCostsToDate)}</td>
            <td className={`px-3 py-2.5 text-right font-mono ${(totalPMEst - totalCostsToDate) < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(totalPMEst - totalCostsToDate)}</td>
            <td className="px-3 py-2.5 text-right font-mono text-amber-700">{fmt(totalPMEst)}</td>
            <td className={`px-3 py-2.5 text-right font-mono font-bold ${(totalPMEst - totalCostsToDate) < 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(totalPMEst - totalCostsToDate)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
