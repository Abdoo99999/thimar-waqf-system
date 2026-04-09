# Waqf Evaluation System (نظام تقييم المؤسسات الوقفية - ثمار)

## Overview
A management and evaluation platform for Omani Waqf (charitable endowment) institutions. Built for the Ministry of Endowments and Religious Affairs, it provides a structured sequential workflow for institutions to submit data, financial reports, and compliance information while administrators can monitor and evaluate submissions.

## Tech Stack
- **Frontend:** React 19 + TypeScript
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS (CDN)
- **Icons:** Lucide React
- **Charts:** Recharts
- **Routing:** React Router Dom v7
- **Data Persistence:** localStorage (mock database via `services/db.ts`)
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
│   └── db.ts            # localStorage-based mock database
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
- **Mock Database:** localStorage with seeded VIP institution data

## Development
```bash
npm install
npm run dev      # Starts at http://0.0.0.0:5000
```

## Deployment
- **Type:** Static site
- **Build:** `npm run build` → outputs to `dist/`
- **Deploy Target:** Static hosting
