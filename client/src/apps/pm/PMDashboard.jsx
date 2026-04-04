import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/Header';
import ConfirmModal from '../../components/ConfirmModal';
import JobDetail from './components/JobDetail';
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
  const [selectedJobNo, setSelectedJobNo] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(288); // 18rem default
  const isResizing = useRef(false);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(Math.max(startWidth + (e.clientX - startX), 200), 500);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidebarWidth]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await authFetch('/api/pm/jobs');
      const data = await res.json();
      setJobs(data);
      // Auto-select first job if none selected
      if (data.length > 0 && !selectedJobNo) {
        setSelectedJobNo(data[0].job_no);
      }
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
      j.job_no === jobNo ? { ...j, ...result } : j
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

  const selectedJob = jobs.find(j => j.job_no === selectedJobNo);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
        <Header />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3].map(i => (
              <div key={i} className="card px-4 py-3 animate-pulse">
                <div className="h-8 w-16 bg-gray-200 rounded mx-auto mb-1"></div>
                <div className="h-3 w-20 bg-gray-100 rounded mx-auto"></div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  const divBadgeColor = {
    'CLE': 'bg-blue-100 text-blue-800',
    'CBUS': 'bg-green-100 text-green-800',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Top bar: admin link + KPI summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-6 text-sm">
              <span className="text-gray-500">Jobs: <strong className="text-navy">{jobs.length}</strong></span>
              <span className="text-gray-500">Remaining: <strong className="text-amber-600">{fmt(totalRemaining)}</strong></span>
              <span className="text-gray-500">Submitted: <strong className="text-green-600">{submittedCount}/{jobs.length}</strong></span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!allSubmitted && jobs.length > 0 && (
              <button
                onClick={() => setShowSubmitAll(true)}
                disabled={!canSubmit || submitting}
                className={`px-4 py-1.5 rounded-lg font-medium text-sm transition-all ${
                  canSubmit
                    ? 'bg-navy text-white hover:bg-navy-dark shadow-sm'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {submitting ? 'Submitting...' : 'Submit All'}
              </button>
            )}
            {isPMAdmin && (
              <Link to="/pm/admin" className="btn-outline text-sm py-1.5 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Admin
              </Link>
            )}
          </div>
        </div>

        {/* Validation / status messages */}
        {!allSubmitted && (
          <div className={`rounded-lg px-4 py-2 text-sm ${
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
          <div className="bg-green-50 text-green-700 border border-green-200 rounded-lg px-4 py-2 text-sm">
            All jobs have been submitted for this cycle.
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2 text-sm">{error}</div>
        )}

        {/* Master-Detail Layout */}
        {jobs.length > 0 ? (
          <div className="flex" style={{ height: 'calc(100vh - 220px)' }}>
            {/* Sidebar — Job List */}
            <div className={`flex-shrink-0 overflow-y-auto rounded-lg border border-gray-200 bg-white ${selectedJobNo && 'hidden sm:block'}`} style={{ width: sidebarWidth }}>
              <div className="bg-navy px-3 py-2 sticky top-0 z-10">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wide">Jobs ({jobs.length})</h4>
              </div>
              <div className="divide-y divide-gray-100">
                {jobs.map(job => {
                  const isSelected = job.job_no === selectedJobNo;
                  const isLocked = !!job.submitted_at;
                  const isValid = job.schedule_valid;
                  return (
                    <button
                      key={job.job_no}
                      onClick={() => setSelectedJobNo(job.job_no)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        isSelected
                          ? 'bg-navy/5 border-l-4 border-l-navy'
                          : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                      } ${isLocked ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-sm font-semibold text-navy">{job.job_no}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${divBadgeColor[job.division] || 'bg-gray-100 text-gray-700'}`}>
                          {job.division}
                        </span>
                        {isLocked && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Done</span>
                        )}
                        {!isLocked && isValid && (
                          <svg className="w-3.5 h-3.5 text-green-500 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {!isLocked && !isValid && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium ml-auto flex-shrink-0">
                            {fmt(job.remaining)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate">{job.job_name}</p>
                    </button>
                  );
                })}
              </div>

              {/* Charts link at bottom of sidebar */}
              <div className="sticky bottom-0 bg-white border-t border-gray-200 p-2">
                <button
                  onClick={() => setSelectedJobNo('__charts__')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedJobNo === '__charts__'
                      ? 'bg-navy/5 text-navy'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Revenue Charts
                </button>
              </div>
            </div>

            {/* Resize Handle */}
            <div
              onMouseDown={handleMouseDown}
              className="hidden sm:flex w-2 flex-shrink-0 cursor-col-resize items-center justify-center group hover:bg-navy/5 rounded transition-colors"
            >
              <div className="w-0.5 h-8 bg-gray-300 rounded-full group-hover:bg-navy/40 transition-colors"></div>
            </div>

            {/* Detail Panel */}
            <div className={`flex-1 min-w-0 overflow-y-auto rounded-lg border border-gray-200 bg-white ${!selectedJobNo && 'hidden sm:block'}`}>
              {/* Mobile back button */}
              {selectedJobNo && (
                <button
                  onClick={() => setSelectedJobNo(null)}
                  className="sm:hidden w-full px-4 py-2 text-sm text-navy font-medium border-b border-gray-200 text-left"
                >
                  &larr; Back to jobs
                </button>
              )}

              {selectedJobNo === '__charts__' ? (
                <div className="p-4">
                  <RevenueCharts />
                </div>
              ) : selectedJob ? (
                <JobDetail
                  job={selectedJob}
                  onUpdate={handleUpdate}
                  onSubmit={handleSubmitOne}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Select a job from the list
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No jobs assigned</p>
            <p className="text-sm mt-1">Contact your admin if you believe this is an error.</p>
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
      </main>
    </div>
  );
}
