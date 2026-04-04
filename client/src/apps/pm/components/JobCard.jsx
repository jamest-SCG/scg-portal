import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import CostCodeTable from './CostCodeTable';
import ConfirmModal from '../../../components/ConfirmModal';

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
  const [showCostCodes, setShowCostCodes] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
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
  const isValid = Math.abs(remaining) <= 0.01 || (remaining > 0.01 && gap <= 0.01);

  // Local CTC state that updates in real-time as PM edits cost codes
  const [localPMRevisedTotal, setLocalPMRevisedTotal] = useState(null);
  const [localCTC, setLocalCTC] = useState(null);

  const effectiveEst = (localPMRevisedTotal != null ? localPMRevisedTotal : job.pm_revised_total) ?? (job.est_cost || 0);
  const isOverBudget = effectiveEst > 0 && (job.cost_to_date || 0) > effectiveEst;
  const ctcCalculated = localCTC != null ? localCTC : job.ctc_calculated;

  const handleCTCChange = useCallback((pmRevisedTotal, ctc) => {
    setLocalPMRevisedTotal(pmRevisedTotal);
    setLocalCTC(ctc);
  }, []);

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
            onClick={() => setShowConfirm(true)}
            className="flex-shrink-0 mr-4 px-3 py-1.5 text-xs font-medium bg-navy text-white rounded-lg hover:bg-navy-dark transition-colors"
          >
            Submit
          </button>
        )}
      </div>

      <ConfirmModal
        open={showConfirm}
        title="Submit Job"
        message={`Submit job ${job.job_no}? This will lock it for editing.`}
        confirmLabel="Submit"
        onConfirm={() => { setShowConfirm(false); onSubmit(job.job_no); }}
        onCancel={() => setShowConfirm(false)}
      />

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Job Info section */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-navy px-3 py-2">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wide">Job Summary</h4>
            </div>
            <div className="p-4 space-y-4 bg-white">
              {/* Billing fields */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <IconCell icon="contract" label="Contract" value={fmt(job.contract)} />
                <IconCell icon="billed" label="Billed to Date" value={fmt(job.billed)} />
                <IconCell icon="remaining" label="Remaining to Bill" value={fmt(remaining)} />
                <IconCell icon="pct" label="% Complete" value={fmtPct(job.pct_complete)} />
              </div>

              {/* Cost fields */}
              {job.has_cost_codes > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <IconCell icon="estimate" label="Original Est" value={fmt(job.est_cost)} />
                  <IconCell icon="revised" label="PM Revised Est" value={effectiveEst ? fmt(effectiveEst) : '-'} />
                  <IconCell icon="actual" label="Actual to Date" value={fmt(job.cost_to_date)} />
                  <IconCell
                    icon="ctc"
                    label="Est. Cost to Complete"
                    value={ctcCalculated != null ? fmt(ctcCalculated) : '-'}
                    highlight={ctcCalculated != null && ctcCalculated < 0}
                  />
                </div>
              )}

              {/* Visual rings row */}
              <div className="flex items-start justify-center gap-6 sm:gap-10 pt-3 border-t border-gray-100">
                {job.contract > 0 && (
                  <LabeledRing
                    label="Billed"
                    pct={(job.billed || 0) / job.contract}
                    detail={`${fmt(job.billed)} / ${fmt(job.contract)}`}
                    color="green"
                  />
                )}
                <LabeledRing
                  label="Complete"
                  pct={job.pct_complete || 0}
                  detail={fmtPct(job.pct_complete)}
                  color="auto"
                />
                {job.has_cost_codes > 0 && effectiveEst > 0 && (
                  <CostHealthRing
                    actual={job.cost_to_date || 0}
                    estimate={effectiveEst}
                  />
                )}
              </div>
            </div>
          </div>

          {isOverBudget && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              Actual costs exceed the estimated budget. Please review cost codes and update your estimates.
            </div>
          )}

          {/* Cost Codes section */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowCostCodes(!showCostCodes)}
              className="w-full bg-navy px-3 py-2 flex items-center gap-2 hover:bg-navy-dark transition-colors"
            >
              <svg
                className={`w-3 h-3 text-white transition-transform ${showCostCodes ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wide">Cost Code Breakdown</h4>
            </button>
            {showCostCodes && (
              <div className="p-3 bg-white">
                <CostCodeTable jobNo={job.job_no} isLocked={isLocked} onCTCChange={handleCTCChange} />
              </div>
            )}
          </div>

          {/* Billing Schedule section */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-navy px-3 py-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wide">Billing Schedule</h4>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-white">{fmt(monthSum)} / {fmt(remaining)}</span>
                {isValid ? (
                  <span className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded font-medium bg-yellow-300 text-yellow-900">
                    {fmt(gap)} gap remaining
                  </span>
                )}
              </div>
            </div>
            <div className="p-3 bg-white">
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
                      onWheel={(e) => e.target.blur()}
                      disabled={isLocked}
                      placeholder="0"
                      className="input-field text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CTC Override & Notes section */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-navy px-3 py-2">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wide">Overrides & Notes</h4>
            </div>
            <div className="p-3 bg-white space-y-3">
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
                  onWheel={(e) => e.target.blur()}
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
            </div>
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

const ICONS = {
  contract: (
    <svg className="w-5 h-5 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  billed: (
    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
    </svg>
  ),
  remaining: (
    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  pct: (
    <svg className="w-5 h-5 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
    </svg>
  ),
  estimate: (
    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  revised: (
    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  actual: (
    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  ctc: (
    <svg className="w-5 h-5 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
};

function IconCell({ icon, label, value, highlight }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${highlight ? 'bg-red-50' : 'bg-gray-50'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {ICONS[icon]}
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <p className={`text-base font-bold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function LabeledRing({ label, pct, detail, color }) {
  const p = Math.min(Math.max(pct || 0, 0), 1);
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - p);

  let strokeColor;
  if (color === 'green') {
    strokeColor = '#16a34a';
  } else {
    strokeColor = p >= 0.9 ? '#16a34a' : p >= 0.5 ? '#d97706' : '#1F4E79';
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" className="flex-shrink-0">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={strokeColor} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
          className="transition-all duration-700"
        />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="central"
          className="text-sm font-bold" fill="#374151">
          {Math.round(p * 100)}%
        </text>
      </svg>
      <p className="text-xs font-semibold text-gray-700">{label}</p>
      <p className="text-xs text-gray-600">{detail}</p>
    </div>
  );
}

function CostHealthRing({ actual, estimate }) {
  const ratio = estimate > 0 ? actual / estimate : 0;
  const isOver = ratio > 1;
  const isWarning = ratio > 0.8 && !isOver;
  const r = 28;
  const circ = 2 * Math.PI * r;
  // Ring fills fully when at or over budget
  const fillPct = Math.min(ratio, 1);
  const offset = circ * (1 - fillPct);

  const strokeColor = isOver ? '#dc2626' : isWarning ? '#d97706' : '#2563eb';
  const bgFill = isOver ? '#fef2f2' : 'none'; // red tint background when over
  const textColor = isOver ? '#dc2626' : '#374151';
  const displayPct = Math.round(ratio * 100);
  const overage = actual - estimate;

  let statusLabel, statusColor;
  if (isOver) {
    statusLabel = `+${fmt(overage)} over`;
    statusColor = 'text-red-600 font-semibold';
  } else if (isWarning) {
    statusLabel = `${fmt(estimate - actual)} left`;
    statusColor = 'text-amber-600';
  } else {
    statusLabel = `${fmt(estimate - actual)} left`;
    statusColor = 'text-blue-600';
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" className="flex-shrink-0">
        <circle cx="36" cy="36" r={r} fill={bgFill} stroke="#e5e7eb" strokeWidth="5" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={strokeColor} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
          className="transition-all duration-700"
        />
        <text x="36" y="36" textAnchor="middle" dominantBaseline="central"
          className="text-sm font-bold" fill={textColor}>
          {displayPct}%
        </text>
      </svg>
      <p className="text-xs font-semibold text-gray-700">Cost Health</p>
      <p className={`text-xs ${statusColor}`}>{statusLabel}</p>
      <p className="text-xs text-gray-600">{fmt(actual)} / {fmt(estimate)}</p>
    </div>
  );
}
