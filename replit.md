# Waqf Evaluation System (نظام تقييم المؤسسات الوقفية)

## Overview
A management and evaluation platform for Omani Waqf (charitable endowment) institutions. Built for the Ministry of Endowments and Religious Affairs, it provides a structured sequential workflow for institutions to submit data, financial reports, and compliance information while administrators can monitor and evaluate submissions.

## Tech Stack
- **Frontend:** React 19 + TypeScript
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS (CDN)
- **Icons:** Lucide React
- **Charts:** Recharts
- **Routing:** React Router Dom v7
- **Data Persistence:** PostgreSQL via Express backend (server is the single source of truth; nothing stored in localStorage)
- **Backend:** Express.js (server.js) — API on port 3001
- **Database:** PostgreSQL (Replit managed) — tables `app_records` (one row per record), `app_accounts`, `app_admins`, `app_meta`. The legacy `waqf_store` table is left untouched as a backup.
- **Package Manager:** npm

## Project Structure
```
/
├── App.tsx              # Main router with protected/sequential routes
├── index.tsx            # React DOM entry point
├── types.ts             # TypeScript interfaces
├── constants.ts         # Static data (governorates, default indicators)
├── vite.config.ts       # Vite configuration (port 5000, host 0.0.0.0)
├── services/
│   └── db.ts            # Client data layer: per-record saves through the API
├── server.js            # Express backend: REST API + static file server
├── contexts/
│   └── UiContext.tsx    # Global state (auth, user roles, selected institution)
├── pages/               # Feature views
│   ├── Dashboard.tsx
│   ├── Institutions.tsx
│   ├── FinancialReports.tsx
│   ├── Evaluation.tsx
│   ├── Compliance.tsx
│   └── Login.tsx
├── components/          # Reusable UI components
└── public/              # Static assets (logo.png)
```

## Key Features
- **Role-Based Access:** Admin (strategic view) and User (institution data entry)
- **Sequential Workflow:** Guards prevent skipping steps
- **Arabic Localization:** UI is primarily in Arabic (RTL)
- **No demo data:** institutions are seeded from `server/seed-institutions.json` (names only)

## Security model (do not regress)
- Login is verified on the server. Sessions are signed HttpOnly cookies (12h). Passwords are hashed with scrypt.
- Institution users receive and can modify ONLY their own institution's records; the server enforces this in `checkUserWrite`.
- Every save sends a single record (`PUT /api/records/:collection/:id`). Never reintroduce whole-collection writes: they caused lost data when two institutions saved at once.
- Institutions cannot approve/return evaluations or edit answers after submitting.
- Migration (first start only): all data in the legacy `waqf_store` table is copied into `app_records`, and every institution keeps its existing login code and password (stored hashed, no forced change). The admin keeps the previous password unless the Secret `ADMIN_PASSWORD` is set before the first start. `waqf_store` is never modified.
- Admin username `admin` (or `ADMIN_USERNAME`). To reset the admin password later: set `ADMIN_PASSWORD` plus `ADMIN_PASSWORD_FORCE=true`, restart once, then remove `ADMIN_PASSWORD_FORCE`. Or use the in-app "تغيير كلمة المرور" button.
- New institutions added by the admin get a random password shown once; existing ones can be reissued from "ملاحظات النظام ← حسابات المؤسسات".
- Optional Secret `SESSION_SECRET`; otherwise one is generated and stored in `app_meta`.

## Development
```bash
npm install
npm run dev      # Starts at http://0.0.0.0:5000
```

## Deployment
- **Type:** Static site
- **Build:** `npm run build` → outputs to `dist/`
- **Deploy Target:** Static hosting
