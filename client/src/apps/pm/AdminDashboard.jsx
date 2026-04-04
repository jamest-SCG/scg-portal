import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import ImportPanel from './components/ImportPanel';
import RevenueCharts from './components/RevenueCharts';

function fmt(val) {
  if (val === null || val === undefined || val === '') return '-';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '-';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const MONTH_LABELS = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_KEYS = ['feb_26','mar_26','apr_26','may_26','jun_26','jul_26','aug_26','sep_26','oct_26','nov_26','dec_26'];

export default function AdminDashboard() {
  const { authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [pmStats, setPmStats] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [incomplete, setIncomplete] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);


  const fetchData = useCallback(async () => {
    try {
      const [statsRes, jobsRes, incompleteRes, usersRes] = await Promise.all([
        authFetch('/api/pm/submissions/status'),
        authFetch('/api/pm/jobs'),
        authFetch('/api/pm/admin/incomplete'),
        fetch('/api/auth/users').then(r => r.json()).catch(() => []),
      ]);
      setPmStats(await statsRes.json());
      setJobs(await jobsRes.json());
      setIncomplete(await incompleteRes.json());
      setUsers(usersRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Export handler
  const handleExport = async (withNotes = false) => {
    try {
      const res = await authFetch(`/api/pm/admin/export?notes=${withNotes}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `SCG_PM_Submissions_${date}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  // New cycle
  const handleNewCycle = async () => {
    if (!window.confirm('This will unlock all submissions for editing. Are you sure?')) return;
    try {
      const res = await authFetch('/api/pm/admin/new-cycle', { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReassign = async (jobNo, field, value) => {
    try {
      await authFetch(`/api/pm/jobs/${jobNo}/assign`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value }),
      });
      setJobs(prev => prev.map(j => j.job_no === jobNo ? { ...j, [field]: value } : j));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlockJob = async (jobNo) => {
    if (!window.confirm(`Unlock job ${jobNo}? The PM will be able to edit and re-submit it.`)) return;
    try {
      const res = await authFetch(`/api/pm/admin/unlock/${jobNo}`, { method: 'POST', body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'import', label: 'Import' },
    { id: 'export', label: 'Export' },
    { id: 'jobs', label: 'All Jobs' },
    { id: 'charts', label: 'Charts' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
        </div>
      </div>
    );
  }

  const totalJobs = jobs.length;
  const totalSubmitted = jobs.filter(j => j.submitted_at).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Tab Navigation */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Cycle Status */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Cycle Status</h2>
                <button onClick={handleNewCycle} className="btn-outline text-sm">
                  Open New Cycle
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-navy">{totalJobs}</p>
                  <p className="text-xs text-gray-500 mt-1">Total Jobs</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{totalSubmitted}</p>
                  <p className="text-xs text-gray-500 mt-1">Submitted</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-yellow-600">{totalJobs - totalSubmitted}</p>
                  <p className="text-xs text-gray-500 mt-1">Pending</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-navy">
                    {totalJobs > 0 ? Math.round((totalSubmitted / totalJobs) * 100) : 0}%
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Completion</p>
                </div>
              </div>
            </div>

            {/* PM Status Table */}
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">PM Submission Status</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PM</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Jobs</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Submitted</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Valid</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Activity</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {pmStats.map((pm, i) => {
                      const allDone = pm.submitted_count === pm.total_jobs && pm.total_jobs > 0;
                      const hasActivity = pm.last_activity;
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium">{pm.pm}</td>
                          <td className="px-4 py-3 text-sm text-center">{pm.total_jobs}</td>
                          <td className="px-4 py-3 text-sm text-center">{pm.submitted_count}</td>
                          <td className="px-4 py-3 text-sm text-center">{pm.valid_count}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {hasActivity ? new Date(pm.last_activity).toLocaleString() : 'No activity'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              allDone
                                ? 'bg-green-100 text-green-700'
                                : hasActivity
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {allDone ? 'Complete' : hasActivity ? 'In Progress' : 'Not Started'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Incomplete Alert */}
            {incomplete.length > 0 && (
              <div className="card p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  Incomplete Jobs ({incomplete.length})
                </h2>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {incomplete.map(j => (
                    <div key={j.job_no} className="flex items-center justify-between bg-yellow-50 rounded-lg px-4 py-2">
                      <div>
                        <span className="font-mono text-sm font-semibold">{j.job_no}</span>
                        <span className="text-sm text-gray-600 ml-2">{j.job_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{j.pm}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          !j.schedule_valid ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {!j.schedule_valid && !j.submitted_at ? 'Invalid Schedule' : 'Not Submitted'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* IMPORT TAB */}
        {activeTab === 'import' && (
          <ImportPanel onImportComplete={fetchData} />
        )}

        {/* EXPORT TAB */}
        {activeTab === 'export' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Export Submission Data</h2>
            <p className="text-sm text-gray-600">
              Download submission data as CSV. Use the Python helper script to paste this data
              back into the master Excel workbook.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => handleExport(false)} className="btn-primary">
                Download CSV
              </button>
              <button onClick={() => handleExport(true)} className="btn-secondary">
                Download CSV with Notes
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Export Format</h3>
              <p className="text-xs text-gray-500 font-mono">
                job_no, feb_26, mar_26, apr_26, may_26, jun_26, jul_26, aug_26, sep_26, oct_26, nov_26, dec_26, ctc_override
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Filename: SCG_PM_Submissions_YYYY-MM-DD.csv
              </p>
            </div>
          </div>
        )}

        {/* ALL JOBS TAB */}
        {activeTab === 'jobs' && (
          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">All Jobs ({jobs.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job No.</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job Name</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Div</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">PM</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Remaining</th>
                    {MONTH_LABELS.map(m => (
                      <th key={m} className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase">{m}</th>
                    ))}
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">CTC</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {jobs.map(j => (
                    <tr key={j.job_no} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">{j.job_no}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate">{j.job_name}</td>
                      <td className="px-3 py-2 text-center">
                        <select
                          value={j.division || ''}
                          onChange={(e) => handleReassign(j.job_no, 'division', e.target.value)}
                          className="text-xs px-1 py-0.5 border border-transparent hover:border-gray-300 rounded bg-transparent cursor-pointer focus:ring-1 focus:ring-navy-light"
                        >
                          <option value="">—</option>
                          <option value="CLE">CLE</option>
                          <option value="CBUS">CBUS</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <select
                          value={j.pm || ''}
                          onChange={(e) => handleReassign(j.job_no, 'pm', e.target.value)}
                          className="text-xs px-1 py-0.5 border border-transparent hover:border-gray-300 rounded bg-transparent cursor-pointer focus:ring-1 focus:ring-navy-light"
                        >
                          <option value="">Unassigned</option>
                          {users.map(u => (
                            <option key={u.id} value={u.initials}>{u.initials}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{fmt(j.remaining)}</td>
                      {MONTH_KEYS.map(k => (
                        <td key={k} className="px-2 py-2 text-right font-mono text-xs">
                          {j[k] ? fmt(j[k]) : '-'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {j.ctc_override != null ? fmt(j.ctc_override) : '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          j.submitted_at
                            ? 'bg-green-100 text-green-700'
                            : j.schedule_valid
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {j.submitted_at ? 'Submitted' : j.schedule_valid ? 'Valid' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 max-w-[150px] truncate">
                        {j.notes || '-'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {j.submitted_at && (
                          <button
                            onClick={() => handleUnlockJob(j.job_no)}
                            className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                          >
                            Unlock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CHARTS TAB */}
        {activeTab === 'charts' && (
          <RevenueCharts />
        )}
      </main>
    </div>
  );
}
