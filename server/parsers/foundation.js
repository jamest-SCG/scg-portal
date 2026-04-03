/**
 * Foundation CSV Parser
 *
 * Parses per-job cost detail CSV exports from Foundation accounting software.
 * Format: 12-line multiline header → cost code rows → totals → footer summary
 */

function parseNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  const cleaned = String(val).replace(/[$,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Split a CSV line respecting quoted fields
 */
function splitCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse a single Foundation CSV file content into structured data.
 *
 * Returns: { job_no, job_name, cost_codes: [...], totals: {...}, footer: {...} }
 */
function parseFoundationCSV(content) {
  // Normalize line endings and split
  const rawLines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // The header spans multiple lines due to multiline quoted fields.
  // We need to reassemble lines that are inside quoted fields.
  const lines = [];
  let buffer = '';
  let quoteCount = 0;
  for (const rawLine of rawLines) {
    buffer += (buffer ? '\n' : '') + rawLine;
    // Count unescaped quotes
    for (const ch of rawLine) {
      if (ch === '"') quoteCount++;
    }
    // If quotes are balanced, this is a complete line
    if (quoteCount % 2 === 0) {
      lines.push(buffer);
      buffer = '';
      quoteCount = 0;
    }
  }
  if (buffer) lines.push(buffer);

  const result = {
    job_no: null,
    job_name: null,
    cost_codes: [],
    totals: null,
    footer: {
      client_name: null,
      original_contract: 0,
      change_orders: 0,
      total_revised_contract: 0,
      billed_to_date: 0,
      left_to_bill: 0,
    },
  };

  // The first reassembled line is the full header row (12 raw lines merged).
  // Skip it — we know the column order.
  // Start parsing from line index 1 onward.

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line === ',') continue;

    // Check for Grand Totals — skip
    if (line.includes('** Grand Totals **')) continue;

    // Check for totals row: "** Job Name Totals **"
    if (line.includes('** ') && line.includes(' Totals **')) {
      // Extract job name from the totals label (only use first match)
      if (!result.job_name) {
        const match = line.match(/\*\*\s*(.+?)\s*Totals\s*\*\*/);
        if (match) {
          result.job_name = match[1].trim();
        }
      }
      continue;
    }

    // Check for footer lines
    if (line.startsWith('Client Name:')) {
      const parts = line.split(',');
      result.footer.client_name = (parts[1] || '').trim();
      continue;
    }
    if (line.startsWith('Original Contract Amount:')) {
      const parts = line.split(',');
      result.footer.original_contract = parseNum(parts[1]);
      continue;
    }
    if (line.startsWith('Change Orders to Date:')) {
      const parts = line.split(',');
      result.footer.change_orders = parseNum(parts[1]);
      continue;
    }
    if (line.startsWith('Total Revised Contract Amount:')) {
      const parts = line.split(',');
      result.footer.total_revised_contract = parseNum(parts[1]);
      continue;
    }
    if (line.startsWith('Billed To Date:')) {
      const parts = line.split(',');
      result.footer.billed_to_date = parseNum(parts[1]);
      continue;
    }
    if (line.startsWith('Left To Bill On Contract:')) {
      const parts = line.split(',');
      result.footer.left_to_bill = parseNum(parts[1]);
      continue;
    }

    // Try to parse as a cost code row or totals data row
    // Format: ,,JOB_NO,COST_CODE_NO,DESCRIPTION,ORIGINAL_EST,APPROVED_COS,REVISED_EST,...
    const fields = splitCSVLine(line);

    // Cost code / data rows start with two empty fields and a job number
    if (fields.length >= 5 && fields[0] === '' && fields[1] === '' && fields[2]) {
      const jobNo = fields[2].trim();
      // Validate it looks like a job number (contains digits and possibly a dash)
      if (/\d/.test(jobNo)) {
        if (!result.job_no) {
          result.job_no = jobNo;
        }

        const costCodeNo = (fields[3] || '').trim();
        const description = (fields[4] || '').trim();
        const originalEst = parseNum(fields[5]);
        const approvedCos = parseNum(fields[6]);
        const revisedEst = parseNum(fields[7]);
        const costsToDate = parseNum(fields[8]);
        const remainingBudget = parseNum(fields[9]);
        const remainingCommitted = parseNum(fields[10]);
        const projectedOverUnder = parseNum(fields[11]);
        const pctVariance = parseNum(fields[12]);

        if (costCodeNo) {
          // This is a cost code line item
          result.cost_codes.push({
            cost_code_no: costCodeNo,
            description,
            original_est: originalEst,
            approved_cos: approvedCos,
            revised_est_cost: revisedEst,
            costs_to_date: costsToDate,
            remaining_budget: remainingBudget,
            remaining_committed_cost: remainingCommitted,
            projected_over_under: projectedOverUnder,
            pct_variance: pctVariance,
          });
        } else {
          // No cost code number = this is a totals data row
          result.totals = {
            original_est: originalEst,
            approved_cos: approvedCos,
            revised_est_cost: revisedEst,
            costs_to_date: costsToDate,
            remaining_budget: remainingBudget,
            remaining_committed_cost: remainingCommitted,
            projected_over_under: projectedOverUnder,
            pct_variance: pctVariance,
          };
        }
      }
    }
  }

  return result;
}

module.exports = { parseFoundationCSV };
