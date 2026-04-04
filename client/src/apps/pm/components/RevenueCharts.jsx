import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

function fmt(val) {
  if (!val) return '$0';
  return Number(val).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function RevenueCharts() {
  const { authFetch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState('');

  // Fetch available cycles
  useEffect(() => {
    authFetch('/api/pm/cycles')
      .then(r => r.json())
      .then(list => {
        setCycles(list);
        const active = list.find(c => c.is_active);
        if (active) setSelectedCycle(String(active.id));
      })
      .catch(() => {});
  }, [authFetch]);

  // Fetch chart data when cycle changes
  const fetchChartData = useCallback(() => {
    if (!selectedCycle) return;
    setLoading(true);
    authFetch(`/api/pm/jobs/charts/revenue?cycle=${selectedCycle}`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch, selectedCycle]);

  useEffect(() => { fetchChartData(); }, [fetchChartData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-navy"></div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-center text-gray-500 py-8">No revenue data available.</p>;
  }

  const companyTotal = data.company_totals.reduce((s, v) => s + v, 0);
  const activeCycleName = cycles.find(c => String(c.id) === selectedCycle)?.name || '';

  const companyChartData = {
    labels: data.months,
    datasets: [{
      label: 'Projected Billings',
      data: data.company_totals,
      backgroundColor: '#1F4E79',
      borderRadius: 4,
    }],
  };

  const divisionChartData = {
    labels: data.months,
    datasets: [
      {
        label: 'Cleveland (CLE)',
        data: data.by_division['CLE'] || data.months.map(() => 0),
        backgroundColor: '#2E75B6',
        borderRadius: 4,
      },
      {
        label: 'Columbus (CBUS)',
        data: data.by_division['CBUS'] || data.months.map(() => 0),
        backgroundColor: '#70AD47',
        borderRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.raw)}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (val) => fmt(val),
          font: { size: 11 },
        },
        grid: { color: '#f0f0f0' },
      },
      x: {
        ticks: { font: { size: 11 } },
        grid: { display: false },
      },
    },
  };

  const divisionOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      legend: { display: true, position: 'top', labels: { font: { size: 12 } } },
    },
  };

  return (
    <div className="space-y-6">
      {/* Cycle Selector */}
      {cycles.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Billing Cycle:</label>
          <select
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
            className="input-field text-sm w-auto"
          >
            {cycles.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.is_active ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Company Total */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Projected Billings — Company Wide</h3>
          <span className="text-sm font-medium text-navy">{fmt(companyTotal)} total</span>
        </div>
        <div className="h-64">
          <Bar data={companyChartData} options={chartOptions} />
        </div>
      </div>

      {/* By Division */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Projected Billings — By Division</h3>
        <div className="h-64">
          <Bar data={divisionChartData} options={divisionOptions} />
        </div>
      </div>
    </div>
  );
}
