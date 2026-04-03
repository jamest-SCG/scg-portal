import { useLocation, useNavigate } from 'react-router-dom';

export default function SubmitConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { count, submitted_at, jobs } = location.state || {};

  if (!count) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="card p-8 text-center max-w-md">
          <p className="text-gray-500">No submission data found.</p>
          <button onClick={() => navigate('/pm')} className="btn-primary mt-4">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const formattedDate = new Date(submitted_at).toLocaleString();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card p-8 max-w-lg w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">Submission Complete</h2>
        <p className="text-gray-600 mb-6">
          {count} job{count !== 1 ? 's' : ''} submitted successfully on {formattedDate}
        </p>

        {jobs && jobs.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Jobs Submitted:</h3>
            <ul className="space-y-1">
              {jobs.map(j => (
                <li key={j.job_no} className="text-sm text-gray-600">
                  <span className="font-mono font-semibold">{j.job_no}</span> — {j.job_name}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button onClick={() => navigate('/pm')} className="btn-primary">
            Back to Dashboard
          </button>
          <button onClick={() => window.print()} className="btn-outline">
            Print Summary
          </button>
        </div>
      </div>
    </div>
  );
}
