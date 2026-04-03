import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
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
  const [showCharts, setShowCharts] = useState(false);

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
    const unsubmitted = jobs.filter(j => !j.submitted_at).length;
    if (!window.confirm(`Submit all ${unsubmitted} remaining job${unsubmitted !== 1 ? 's' : ''}? This will lock them for editing.`)) return;
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
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
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

        {/* Revenue Charts Toggle */}
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="text-sm text-navy hover:text-navy-dark font-medium flex items-center gap-1"
        >
          <svg className={`w-3 h-3 transition-transform ${showCharts ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showCharts ? 'Hide Revenue Overview' : 'Show Revenue Overview'}
        </button>
        {showCharts && <RevenueCharts />}

        {/* Summary Strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card px-4 py-3 text-center">
            <p className="text-2xl font-bold text-navy">{jobs.length}</p>
            <p className="text-xs text-gray-500">Total Jobs</p>
          </div>
          <div className="card px-4 py-3 text-center">
            <p className="text-2xl font-bold text-navy">{fmt(totalRemaining)}</p>
            <p className="text-xs text-gray-500">Remaining to Bill</p>
          </div>
          <div className="card px-4 py-3 text-center">
            <p className="text-2xl font-bold text-navy">{submittedCount}/{jobs.length}</p>
            <p className="text-xs text-gray-500">Submitted</p>
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
              onClick={handleSubmitAll}
              disabled={!canSubmit || submitting}
              className={`px-5 py-2 rounded-lg font-medium text-sm transition-all ${
                canSubmit
                  ? 'bg-navy text-white hover:bg-navy-dark shadow-sm'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit All Remaining'}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
