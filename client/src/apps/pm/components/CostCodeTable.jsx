import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';

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
  const debounceRefs = useRef({});

  useEffect(() => {
    authFetch(`/api/pm/jobs/${jobNo}/cost-codes`)
      .then(r => r.json())
      .then(setCostCodes)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [jobNo, authFetch]);

  const handleEstChange = useCallback((costCodeNo, value) => {
    // Update local state immediately
    setCostCodes(prev => {
      const updated = prev.map(cc =>
        cc.cost_code_no === costCodeNo
          ? { ...cc, pm_revised_est: value === '' ? null : parseFloat(value) }
          : cc
      );
      // Report CTC change to parent
      if (onCTCChange) {
        const pmRevisedTotal = updated.reduce((sum, cc) => {
          return sum + (cc.pm_revised_est != null ? cc.pm_revised_est : (cc.revised_est_cost || 0));
        }, 0);
        const totalCostsToDate = updated.reduce((sum, cc) => sum + (cc.costs_to_date || 0), 0);
        onCTCChange(pmRevisedTotal, pmRevisedTotal - totalCostsToDate);
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
  }, [jobNo, authFetch, onCTCChange]);

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

  // Compute totals
  const totalRevisedEst = costCodes.reduce((s, cc) => s + (cc.revised_est_cost || 0), 0);
  const totalCostsToDate = costCodes.reduce((s, cc) => s + (cc.costs_to_date || 0), 0);
  const totalPMEst = costCodes.reduce((s, cc) => {
    return s + (cc.pm_revised_est !== null && cc.pm_revised_est !== undefined ? cc.pm_revised_est : (cc.revised_est_cost || 0));
  }, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Code</th>
            <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase">Description</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase">Revised Est</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase">Costs to Date</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase">Remaining</th>
            <th className="px-2 py-2 text-right font-medium text-amber-600 uppercase">PM Est</th>
            <th className="px-2 py-2 text-right font-medium text-gray-500 uppercase">Over/Under</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {costCodes.map(cc => {
            const overBudget = cc.costs_to_date > (cc.revised_est_cost || 0) && cc.revised_est_cost > 0;
            return (
              <tr key={cc.cost_code_no} className={overBudget ? 'bg-red-50' : 'hover:bg-gray-50'}>
                <td className="px-2 py-1.5 font-mono">{cc.cost_code_no}</td>
                <td className="px-2 py-1.5 truncate max-w-[160px]">{cc.description}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmt(cc.revised_est_cost)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmt(cc.costs_to_date)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmt(cc.remaining_budget)}</td>
                <td className="px-2 py-1.5 text-right">
                  {isLocked ? (
                    <span className="font-mono">{cc.pm_revised_est != null ? fmt(cc.pm_revised_est) : '-'}</span>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      value={cc.pm_revised_est != null ? cc.pm_revised_est : ''}
                      onChange={(e) => handleEstChange(cc.cost_code_no, e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      placeholder={cc.revised_est_cost ? String(cc.revised_est_cost) : '0'}
                      className="w-24 px-1.5 py-0.5 border border-gray-200 rounded text-right text-xs font-mono focus:ring-1 focus:ring-amber-400 focus:border-transparent"
                    />
                  )}
                  {savingCode === cc.cost_code_no && (
                    <span className="text-[10px] text-green-500 ml-1">saving...</span>
                  )}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono ${
                  (cc.projected_over_under || 0) < 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {fmt(cc.projected_over_under)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-gray-50 font-medium">
          <tr>
            <td className="px-2 py-2" colSpan={2}>Totals</td>
            <td className="px-2 py-2 text-right font-mono">{fmt(totalRevisedEst)}</td>
            <td className="px-2 py-2 text-right font-mono">{fmt(totalCostsToDate)}</td>
            <td className="px-2 py-2 text-right font-mono">{fmt(totalRevisedEst - totalCostsToDate)}</td>
            <td className="px-2 py-2 text-right font-mono text-amber-600">{fmt(totalPMEst)}</td>
            <td className="px-2 py-2 text-right font-mono">{fmt(totalRevisedEst - totalCostsToDate)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
