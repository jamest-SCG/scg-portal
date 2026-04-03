import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import CostCodeTable from './CostCodeTable';

const MONTHS = [
  { key: 'feb_26', label: 'Feb 26' },
  { key: 'mar_26', label: 'Mar 26' },
  { key: 'apr_26', label: 'Apr 26' },
  { key: 'may_26', label: 'May 26' },
  { key: 'jun_26', label: 'Jun 26' },
  { key: 'jul_26', label: 'Jul 26' },
  { key: 'aug_26', label: 'Aug 26' },
  { key: 'sep_26', label: 'Sep 26' },
  { key: 'oct_26', label: 'Oct 26' },
  { key: 'nov_26', label: 'Nov 26' },
  { key: 'dec_26', label: 'Dec 26' },
];

function fmt(val) {
  if (val === null || val === undefined || val === '') return '-';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '-';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(val) {
  if (val === null || val === undefined) return '-';
  return `${(val * 100).toFixed(1)}%`;
}

export default function JobCard({ job, onUpdate, onSubmit }) {
  const { authFetch } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [showCostCodes, setShowCostCodes] = useState(false);
  const debounceRef = useRef(null);
  const isLocked = !!job.submitted_at;

  useEffect(() => {
    const data = {};
    MONTHS.forEach(m => {
      data[m.key] = job[m.key] || 0;
    });
    data.ctc_override = job.ctc_override !== null && job.ctc_override !== undefined ? job.ctc_override : '';
    data.notes = job.notes || '';
    setFormData(data);
  }, [job.job_no]);

  const remaining = job.remaining || 0;
  const monthSum = MONTHS.reduce((acc, m) => acc + (parseFloat(formData[m.key]) || 0), 0);
  const gap = remaining - monthSum;
  const isValid = remaining <= 0.01 || gap <= 0.01;

  // Use PM revised total if available, otherwise fall back to original est_cost
  const effectiveEst = job.pm_revised_total != null ? job.pm_revised_total : (job.est_cost || 0);
  const isOverBudget = effectiveEst > 0 && (job.cost_to_date || 0) > effectiveEst;
  const ctcCalculated = job.ctc_calculated;

  const autoSave = useCallback(async (data) => {
    if (isLocked) return;
    setSaving(true);
    setSaveStatus('Saving...');
    try {
      const res = await authFetch(`/api/pm/submissions/${job.job_no}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.ok) {
        setSaveStatus('Saved');
        if (onUpdate) onUpdate(job.job_no, result);
      } else {
        setSaveStatus('Error');
      }
    } catch {
      setSaveStatus('Error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(''), 2000);
    }
  }, [authFetch, job.job_no, isLocked, onUpdate]);

  const handleChange = (field, value) => {
    if (isLocked) return;
    const newData = { ...formData, [field]: value };
    setFormData(newData);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => autoSave(newData), 2000);
  };

  const divBadgeColor = {
    'CLE': 'bg-blue-100 text-blue-800',
    'CBUS': 'bg-green-100 text-green-800',
  };

  return (
    <div className={`card overflow-hidden transition-all ${isLocked ? 'opacity-75' : ''}`}>
      {/* Collapsed Header */}
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left min-w-0"
        >
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-navy">{job.job_no}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${divBadgeColor[job.division] || 'bg-gray-100 text-gray-700'}`}>
                {job.division}
              </span>
              {isLocked && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Submitted</span>
              )}
              {!isLocked && isValid && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Valid</span>
              )}
              {!isLocked && !isValid && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                  {monthSum > 0 ? `Gap: ${fmt(gap)}` : 'Not scheduled'}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 truncate mt-0.5">{job.job_name}</p>
          </div>

          <div className="text-right flex-shrink-0 hidden sm:block">
            <p className="text-xs text-gray-500">Remaining</p>
            <p className="text-sm font-semibold">{fmt(remaining)}</p>
          </div>
        </button>

        {/* Submit button — visible without expanding */}
        {!isLocked && isValid && onSubmit && (
          <button
            onClick={() => {
              if (window.confirm(`Submit job ${job.job_no}? This will lock it for editing.`)) {
                onSubmit(job.job_no);
              }
            }}
            className="flex-shrink-0 mr-4 px-3 py-1.5 text-xs font-medium bg-navy text-white rounded-lg hover:bg-navy-dark transition-colors"
          >
            Submit
          </button>
        )}
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Job Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoCell label="Contract" value={fmt(job.contract)} />
            <InfoCell label="Billed to Date" value={fmt(job.billed)} />
            <InfoCell label="Remaining to Bill" value={fmt(remaining)} />
            <InfoCell label="% Complete" value={fmtPct(job.pct_complete)} />
          </div>

          {/* Cost to Complete Summary */}
          {job.has_cost_codes > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InfoCell label="Original Est" value={fmt(job.est_cost)} />
              <InfoCell label="PM Revised Est" value={job.pm_revised_total != null ? fmt(job.pm_revised_total) : '-'} />
              <InfoCell label="Actual to Date" value={fmt(job.cost_to_date)} />
              <InfoCell
                label="Est. Cost to Complete"
                value={ctcCalculated != null ? fmt(ctcCalculated) : '-'}
                highlight={ctcCalculated != null && ctcCalculated < 0}
              />
            </div>
          )}

          {isOverBudget && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              Actual costs exceed the estimated budget. Please review cost codes and update your estimates.
            </div>
          )}

          {/* Cost Code Detail (collapsible) */}
          <div>
            <button
              onClick={() => setShowCostCodes(!showCostCodes)}
              className="flex items-center gap-2 text-sm font-medium text-navy hover:text-navy-dark transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showCostCodes ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {showCostCodes ? 'Hide Cost Codes' : 'Show Cost Codes'}
            </button>
            {showCostCodes && (
              <div className="mt-2">
                <CostCodeTable jobNo={job.job_no} isLocked={isLocked} />
              </div>
            )}
          </div>

          {/* Billing Schedule Validation */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-sm font-medium text-gray-600">Billing Schedule</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono">{fmt(monthSum)} / {fmt(remaining)}</span>
              {isValid ? (
                <span className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded font-medium bg-yellow-100 text-yellow-700">
                  {fmt(gap)} gap remaining
                </span>
              )}
            </div>
          </div>

          {/* Monthly Billing Inputs */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Monthly Billing Projections</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {MONTHS.map(m => (
                <div key={m.key}>
                  <label className="block text-xs text-gray-500 mb-1">{m.label}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData[m.key] || ''}
                    onChange={(e) => handleChange(m.key, e.target.value)}
                    disabled={isLocked}
                    placeholder="0"
                    className="input-field text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* CTC Override */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cost-to-Complete Override
              <span className="text-xs font-normal text-gray-400 ml-2">Leave blank for formula</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.ctc_override}
              onChange={(e) => handleChange('ctc_override', e.target.value)}
              disabled={isLocked}
              placeholder="Leave blank for formula"
              className={`input-field text-sm max-w-xs ${isOverBudget ? 'border-yellow-400 bg-yellow-50' : ''}`}
            />
            {isOverBudget && (
              <p className="text-xs text-yellow-600 mt-1">Job is over budget — please enter your estimated remaining cost</p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-xs font-normal text-gray-400">(optional, 500 char max)</span>
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value.slice(0, 500))}
              disabled={isLocked}
              placeholder="Any notes about this job..."
              maxLength={500}
              rows={2}
              className="input-field text-sm resize-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{(formData.notes || '').length}/500</p>
          </div>

          {/* Save Status */}
          {saveStatus && (
            <p className={`text-xs ${saveStatus === 'Error' ? 'text-red-500' : 'text-green-600'}`}>
              {saveStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function InfoCell({ label, value, highlight }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-red-50' : 'bg-gray-50'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-red-600' : ''}`}>{value}</p>
    </div>
  );
}
