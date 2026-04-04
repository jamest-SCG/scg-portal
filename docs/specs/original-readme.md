# SCG PM Portal

Internal billing projection tool for Sixth City Glazing. Project managers submit monthly billing schedules and cost-to-complete estimates. The financial manager imports job data from and exports submission data back to the master Excel workbook.

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (single file at `server/data/scg_portal.db`)
- **Frontend:** React + Vite
- **Styling:** Tailwind CSS
- **Auth:** PIN-based (4-digit), JWT session tokens

## Quick Start

### Prerequisites

- Node.js 18+ (https://nodejs.org)
- Python 3.8+ with `openpyxl` (only for the Excel import helper)

### Setup & Development

```bash
# 1. Install all dependencies
npm install
cd client && npm install && cd ..

# 2. Start development servers (backend + frontend)
npm run dev
```

The app will be available at **http://localhost:5173**. The API server runs on port 3001.

On first run, the database is automatically created and seeded with default users.

### Default Users

| Name  | Initials | Role  | Default PIN |
|-------|----------|-------|-------------|
| R.S.  | R.S.     | PM    | 1234        |
| C.G.  | C.G.     | PM    | 1234        |
| D.S.  | D.S.     | PM    | 1234        |
| A.E.  | A.E.     | PM    | 1234        |
| S.M.  | S.M.     | PM    | 1234        |
| Admin | ADMIN    | Admin | 1234        |

**Important:** Change all PINs via the Admin panel before distributing to PMs.

### Production Build

```bash
# Build the frontend
npm run build

# Start production server (serves API + static files)
npm start
```

In production, the Express server serves both the API and the built frontend from `client/dist/`.

## Admin Panel

1. On the login screen, click the **Admin** tab
2. Enter the admin PIN (default: `1234`)
3. From the admin dashboard you can:
   - **Import:** Upload a CSV exported from the master Excel workbook
   - **Export:** Download PM submissions as CSV
   - **Export with Notes:** Same export but includes PM notes
   - **PIN Management:** Reset any PM's PIN
   - **Cycle Management:** Open a new billing cycle (unlocks all submissions)
   - **View All Jobs:** See every job and its submission data

## CSV Import Format

Export the `JOB_DETAIL` sheet from the master Excel workbook as CSV. The expected column headers are:

```
Job No. | Job Name / Description | Div. | PM | Revised Contract ($) | Rev Est Cost ($) | Cost to Date ($) | Billed to Date ($) | Ret. % | Feb-26 Billings | Mar-26 Billings | ... | Dec-26 Billings | PM Est Cost-to-Cmplt Override ($)
```

A sample file (`sample_job_detail_export.csv`) is included for testing.

## Pasting Export Data Back into Excel

### Option 1: Python Helper Script (Recommended)

```bash
pip install openpyxl
python import_submissions.py SCG_PM_Submissions_2026-02-26.csv "SCG Master Workbook.xlsx"
```

The script automatically:
- Reads the export CSV
- Opens the master workbook
- Finds the `JOB_DETAIL` sheet
- Matches jobs by Job No.
- Pastes billing values into columns W through AH
- Saves the workbook

### Option 2: Manual Excel Paste

1. Open the export CSV in Excel
2. Open the master workbook `JOB_DETAIL` sheet
3. For each job row in the CSV:
   - Find the matching Job No. in the master workbook
   - Copy the billing values (columns B-M in the CSV)
   - Paste into columns W-AH of the matching row in JOB_DETAIL
4. Save the master workbook

### Column Mapping Reference

| Export CSV Column | Excel JOB_DETAIL Column |
|-------------------|------------------------|
| feb_26            | W (Feb-26 Billings)    |
| mar_26            | X (Mar-26 Billings)    |
| apr_26            | Y (Apr-26 Billings)    |
| may_26            | Z (May-26 Billings)    |
| jun_26            | AA (Jun-26 Billings)   |
| jul_26            | AB (Jul-26 Billings)   |
| aug_26            | AC (Aug-26 Billings)   |
| sep_26            | AD (Sep-26 Billings)   |
| oct_26            | AE (Oct-26 Billings)   |
| nov_26            | AF (Nov-26 Billings)   |
| dec_26            | AG (Dec-26 Billings)   |
| ctc_override      | AH (PM Est CTC Override) |

## Project Structure

```
SCG PM Portal/
├── server/
│   ├── data/              # SQLite database (auto-created)
│   ├── routes/
│   │   ├── auth.js        # Login, PIN management
│   │   ├── jobs.js        # Job queries (PM-filtered)
│   │   ├── submissions.js # Auto-save, submit-all
│   │   └── admin.js       # Import, export, cycle management
│   ├── middleware/
│   │   └── auth.js        # JWT verification, role guards
│   ├── db.js              # SQLite connection + schema
│   ├── seed.js            # Manual seed script
│   └── index.js           # Express server entry point
├── client/
│   ├── src/
│   │   ├── components/    # Header, JobCard
│   │   ├── pages/         # Login, PM Dashboard, Admin Dashboard
│   │   ├── context/       # Auth context (JWT management)
│   │   ├── App.jsx        # Routes
│   │   └── main.jsx       # Entry point
│   └── ...                # Vite + Tailwind config
├── import_submissions.py  # Python helper for Excel import
├── sample_job_detail_export.csv
└── README.md
```
