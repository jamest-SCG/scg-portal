import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';

function fmt(val) {
  if (val === null || val === undefined || val === 0) return '$0';
  return Number(val).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function ImportPanel({ onImportComplete }) {
  const { authFetch } = useAuth();
  const [users, setUsers] = useState([]);
  const [preview, setPreview] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/auth/users')
      .then(r => r.json())
      .then(setUsers)
      .catch(() => {});
  }, []);

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setMessage('');
    setPreview(null);

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    try {
      const res = await authFetch('/api/pm/admin/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPreview(data);
      setParsedData(data.data);

      // Pre-fill assignments for existing jobs
      const initial = {};
      for (const f of data.files) {
        initial[f.job_no] = {
          pm: f.existing_pm || '',
          division: f.existing_division || '',
        };
      }
      setAssignments(initial);
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
    e.target.value = '';
  };

  const updateAssignment = (jobNo, field, value) => {
    setAssignments(prev => ({
      ...prev,
      [jobNo]: { ...prev[jobNo], [field]: value },
    }));
  };

  const canConfirm = preview && preview.files.every(f => {
    const a = assignments[f.job_no];
    return !f.is_new || (a && a.pm && a.division);
  });

  const handleConfirm = async () => {
    if (!parsedData) return;
    setImporting(true);
    setMessage('');
    try {
      const res = await authFetch('/api/pm/admin/import/confirm', {
        method: 'POST',
        body: JSON.stringify({ data: parsedData, assignments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.message);
      setPreview(null);
      setParsedData(null);
      setAssignments({});
      if (onImportComplete) onImportComplete();
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Import Foundation CSV Files</h2>
        <p className="text-sm text-gray-600 mb-4">
          Upload one or more Foundation cost detail CSV exports. New jobs will require PM and Division assignment.
          Existing jobs will update actual costs without overwriting PM estimates.
        </p>
        <label className="btn-primary inline-block cursor-pointer">
          Select CSV Files
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        {message && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            message.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}>
            {message}
          </div>
        )}
      </div>

      {preview && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Import Preview</h3>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-navy">{preview.files.length}</p>
              <p className="text-xs text-gray-500">Total Files</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{preview.new_count}</p>
              <p className="text-xs text-gray-500">New Jobs</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-navy-light">{preview.update_count}</p>
              <p className="text-xs text-gray-500">Updates</p>
            </div>
          </div>

          {/* Errors */}
          {preview.errors && preview.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-red-700 mb-1">Parse Errors:</p>
              {preview.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e.filename}: {e.error}</p>
              ))}
            </div>
          )}

          {/* Job Assignment Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job No.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Job Name</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Cost Codes</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Contract</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Left to Bill</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">PM</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Division</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {preview.files.map(f => (
                  <tr key={f.job_no} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        f.is_new ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {f.is_new ? 'New' : 'Update'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono font-medium">{f.job_no}</td>
                    <td className="px-3 py-2">{f.job_name}</td>
                    <td className="px-3 py-2 text-center">{f.cost_code_count}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(f.contract)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmt(f.left_to_bill)}</td>
                    <td className="px-3 py-2">
                      {f.is_new ? (
                        <select
                          value={assignments[f.job_no]?.pm || ''}
                          onChange={(e) => updateAssignment(f.job_no, 'pm', e.target.value)}
                          className="input-field text-xs py-1"
                        >
                          <option value="">Select PM...</option>
                          {users.map(u => (
                            <option key={u.id} value={u.initials}>{u.name} ({u.initials})</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-500">{f.existing_pm}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {f.is_new ? (
                        <select
                          value={assignments[f.job_no]?.division || ''}
                          onChange={(e) => updateAssignment(f.job_no, 'division', e.target.value)}
                          className="input-field text-xs py-1"
                        >
                          <option value="">Select...</option>
                          <option value="CLE">CLE</option>
                          <option value="CBUS">CBUS</option>
                        </select>
                      ) : (
                        <span className="text-xs text-gray-500">{f.existing_division}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Confirm / Cancel */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || importing}
              className="btn-primary"
            >
              {importing ? 'Importing...' : `Confirm Import (${preview.files.length} files)`}
            </button>
            <button
              onClick={() => { setPreview(null); setParsedData(null); setAssignments({}); }}
              className="btn-outline"
            >
              Cancel
            </button>
          </div>

          {!canConfirm && preview.new_count > 0 && (
            <p className="text-xs text-amber-600 mt-2">All new jobs must have a PM and Division assigned before confirming.</p>
          )}
        </div>
      )}
    </div>
  );
}
