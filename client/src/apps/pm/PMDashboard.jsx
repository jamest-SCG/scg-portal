import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import ConfirmModal from '../../components/ConfirmModal';
import JobCard from './components/JobCard';
import RevenueCharts from './components/RevenueCharts';

function fmt(val) {
  if (val === null || val === undefined) return '$0';
  return Number(val).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function PMDashboard() {
  const { user, authFetch } = useAuth();
  const isPMAdmin = user?.role === 'admin' || (user?.apps && user.apps.includes('pm_admin'));
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSubmitAll, setShowSubmitAll] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await authFetch('/api/pm/jobs');
      const data = await res.json();
      setJobs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleUpdate = useCallback((jobNo, result) => {
    setJobs(prev => prev.map(j =>
      j.job_no === jobNo ? { ...j, schedule_valid: result.schedule_valid, last_updated: result.last_updated } : j
    ));
  }, []);

  const totalRemaining = jobs.reduce((acc, j) => acc + (j.remaining || 0), 0);
  const submittedCount = jobs.filter(j => j.submitted_at).length;
  const validCount = jobs.filter(j => j.schedule_valid).length;
  const allValid = jobs.length > 0 && validCount === jobs.length;
  const allSubmitted = jobs.length > 0 && submittedCount === jobs.length;
  const canSubmit = allValid && !allSubmitted && jobs.length > 0;

  const handleSubmitOne = useCallback(async (jobNo) => {
    setError('');
    try {
      const res = await authFetch(`/api/pm/submissions/submit/${jobNo}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJobs(prev => prev.map(j =>
        j.job_no === jobNo ? { ...j, submitted_at: data.submitted_at } : j
      ));
    } catch (err) {
      setError(err.message);
    }
  }, [authFetch]);

  const handleSubmitAll = async () => {
    if (!canSubmit) return;
    setShowSubmitAll(false);
    setSubmitting(true);
    setError('');

    try {
      const res = await authFetch('/api/pm/submissions/submit-all', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      navigate('/pm/confirmed', {
        state: {
          count: data.count,
          submitted_at: data.submitted_at,
          jobs: jobs.map(j => ({ job_no: j.job_no, job_name: j.job_name })),
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
        <Header />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => (
              <div key={i} className="card px-4 py-3 animate-pulse">
                <div className="h-8 w-16 bg-gray-200 rounded mx-auto mb-1"></div>
                <div className="h-3 w-20 bg-gray-100 rounded mx-auto"></div>
              </div>
            ))}
          </div>
          {[1,2,3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 bg-gray-200 rounded"></div>
                <div className="flex-1">
                  <div className="h-4 w-24 bg-gray-200 rounded mb-1"></div>
                  <div className="h-3 w-48 bg-gray-100 rounded"></div>
                </div>
                <div className="h-4 w-16 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* PM Admin Link */}
        {isPMAdmin && (
          <div className="flex justify-end">
            <Link
              to="/pm/admin"
              className="btn-outline text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              PM Admin
            </Link>
          </div>
        )}

        {/* Dashboard Overview */}
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-navy px-3 py-2">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wide">Dashboard Overview</h4>
          </div>
          <div className="p-4 bg-white">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-5 h-5 text-navy" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <p className="text-sm text-gray-500">Total Jobs</p>
                </div>
                <p className="text-2xl font-bold text-navy">{jobs.length}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                  <p className="text-sm text-gray-500">Remaining to Bill</p>
                </div>
                <p className="text-2xl font-bold text-amber-600">{fmt(totalRemaining)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-gray-500">Submitted</p>
                </div>
                <p className="text-2xl font-bold text-green-600">{submittedCount}/{jobs.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Validation Status */}
        {!allSubmitted && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            allValid
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
          }`}>
            {allValid
              ? 'All billing schedules are valid. You can submit.'
              : `${validCount}/${jobs.length} jobs have valid billing schedules. All must be valid to submit.`
            }
          </div>
        )}

        {allSubmitted && (
          <div className="bg-green-50 text-green-700 border border-green-200 rounded-lg px-4 py-3 text-sm">
            All jobs have been submitted for this cycle. Contact your admin if changes are needed.
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}

        {/* Job Cards */}
        <div className="space-y-2">
          {jobs.map(job => (
            <JobCard key={job.job_no} job={job} onUpdate={handleUpdate} onSubmit={handleSubmitOne} />
          ))}
        </div>

        {jobs.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No jobs assigned</p>
            <p className="text-sm mt-1">Contact your admin if you believe this is an error.</p>
          </div>
        )}

        {/* Submit All Button */}
        {!allSubmitted && jobs.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={() => setShowSubmitAll(true)}
              disabled={!canSubmit || submitting}
              className={`px-5 py-2 rounded-lg font-medium text-sm transition-all ${
                canSubmit
                  ? 'bg-navy text-white hover:bg-navy-dark hover:scale-[1.02] active:scale-[0.98] shadow-sm animate-glowPulse'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit All Remaining'}
            </button>
          </div>
        )}

        <ConfirmModal
          open={showSubmitAll}
          title="Submit All Jobs"
          message={`Submit all ${jobs.filter(j => !j.submitted_at).length} remaining job${jobs.filter(j => !j.submitted_at).length !== 1 ? 's' : ''}? This will lock them for editing.`}
          confirmLabel="Submit All"
          onConfirm={handleSubmitAll}
          onCancel={() => setShowSubmitAll(false)}
        />

        {/* Revenue Overview */}
        <RevenueCharts />
      </main>
    </div>
  );
}
