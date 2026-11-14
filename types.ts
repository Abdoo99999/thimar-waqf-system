export type InstitutionType = 'وقفية عامة' | 'وقفية خاصة';

export interface InstitutionDocument {
  id: string;
  file_id?: string;
  name: string;
  type: string;
  size: string;
  upload_date: string;
}

export interface Institution {
  id: string;
  name: string;
  type: InstitutionType;
  capital_omr: number;
  employees_omani: number;
  employees_non_omani: number;
  employees_seconded: number;
  contact_phone: string;
  email?: string;
  governorate?: string;
  wilayat?: string;
  
  // New Fields
  establishment_date?: string; // تاريخ التأسيس
  license_number?: string; // رقم السجل/الترخيص
  manager_name?: string; // مدير المؤسسة
  declaration_date?: string; // تاريخ الإشهار
  commercial_record_number?: string; // رقم السجل التجاري
  establishment_decision_doc?: InstitutionDocument; // مرفقات قرار التأسيس
  
  // Workflow Control
  profile_completed?: boolean; // Flag to force user to save data first

  notes?: string;
  documents?: InstitutionDocument[];
  financial_reports?: Partial<FinancialRecord>[];
  created_at: string;
}

// --- NEW: Financial Governance Schema ---
export interface FinancialRecord {
  id: string;
  institution_id: string;
  fiscal_year: number;
  auditor_name: string;
  
  // 1. Statement of Financial Position (المركز المالي)
  total_assets: number;
  total_liabilities: number;
  net_waqf_assets: number; // Net Assets / Equity
  
  // 2. Income Statement (قائمة الدخل)
  total_revenues: number;
  total_expenses: number;
  admin_general_expenses: number; // Critical for governance
  surplus_deficit: number; // Computed

  // 3. Cash Flow Statement (قائمة التدفقات النقدية) - NEW ADDITION
  operating_cash_flow?: number; // صافي النقد من الأنشطة التشغيلية
  investing_cash_flow?: number; // صافي النقد من الأنشطة الاستثمارية
  financing_cash_flow?: number; // صافي النقد من الأنشطة التمويلية
  cash_end_period?: number;     // النقد وما في حكمه في نهاية الفترة
  
  // التوزيع على مصارف الوقف
  beneficiary_distributions?: number; // المبالغ المصروفة على مصارف الوقف (الموقوف عليهم)

  // Governance & Meta
  unaudited?: boolean; // قوائم غير مدققة (معدّة من الإدارة)
  audit_report_pdf?: InstitutionDocument;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Flagged';
  flags: string[]; // Array of warning messages
  submission_date?: string;
}

export interface Indicator {
  id: string;
  axis: string; // المحور
  text: string; // وصف التقييم
  weight: number;
  active: boolean;
}

export interface ReportBenchmark {
  overall: number;                 // نسبة مئوية
  pillars: Record<string, number>; // لكل محور
  institutions: number;            // عدد المؤسسات في المتوسط
  computed_at: string;
}

export interface Evaluation {
  id: string;
  institution_id: string;
  cycle_year: number;
  cycle_date: string;
  evaluator_name?: string;
  status: 'draft' | 'final'; // Internal status (User side)
  
  // WORKFLOW FIELDS
  workflow_status?: 'draft' | 'submitted' | 'returned' | 'approved'; 
  submission_date?: string;
  admin_feedback?: string; // Reason for return
  declaration_accepted_at?: string; // وقت إقرار المؤسسة بصحة البيانات عند الإرسال
  returned_at?: string;
  approved_at?: string;

  // التقرير الرسمي (يُعبّأ عند الاعتماد)
  report_ref?: string;            // رقم المرجع
  ministry_notes?: string;        // ملاحظات الوزارة في التقرير
  approver_name?: string;
  approver_title?: string;
  report_benchmark?: ReportBenchmark; // متوسط المؤسسات وقت الاعتماد

  attachments?: InstitutionDocument[];
  created_at: string;
}

export interface Response {
  id: string;
  evaluation_id: string;
  indicator_id: string;
  score: number; // 1-5
  evidence_text?: string;
  evidence_doc?: InstitutionDocument;
  updated_at: string;
}

export type ObligationAnswer = 'yes' | 'no' | 'na';

export interface CustomRequirement {
    id: string;
    text: string;
    met: boolean;
    evidence_doc?: InstitutionDocument;
    answer?: ObligationAnswer; // الصيغة الجديدة: ملتزم / غير ملتزم / لا ينطبق
    note?: string;             // سبب عدم الالتزام وخطة التصحيح
}

export interface ComplianceRecord {
  id: string;
  institution_id: string;
  cycle_year: number;
  institution_status: 'فاعلة' | 'غير فاعلة' | 'قيد التصفية' | 'متوقفة' | 'أخرى';
  board_status: 'قائم' | 'منتهي' | 'غير موجود';
  board_end_date?: string;
  
  // Core Fields (Fixed Logic)
  has_executive_management: boolean;
  has_auditor_company: boolean;
  has_minutes_prev_year: boolean; // e.g., 2023
  has_financial_report_prev_year: boolean; // e.g., 2023
  
  // Logic to handle Core Requirements Customization
  hidden_core_requirements?: string[]; // Keys of core reqs to hide/delete
  renamed_core_requirements?: Record<string, string>; // Keys map to new labels
  core_evidence?: Record<string, InstitutionDocument>; // Evidence for core reqs

  custom_requirements?: CustomRequirement[]; // Dynamic requirements

  // الصيغة الجديدة لصفحة الامتثال (الحقول القديمة أعلاه تبقى وتُملأ تلقائياً للتوافق)
  obligations?: Record<string, ObligationAnswer>;
  obligation_evidence?: Record<string, InstitutionDocument>;
  obligation_notes?: Record<string, string>;
  completed?: boolean; // false = مسودة. السجلات القديمة بدون الحقل تُعد مكتملة

  followup_actions?: string;
  notes?: string;
  last_updated_at: string;
}

export interface RiskRegisterItem {
  id: string;
  institution_id: string;
  risk_title: string;
  category: 'Strategic' | 'Financial' | 'Operational' | 'Legal' | 'Shariah';
  probability: number; // 1-5
  impact: number; // 1-5
  mitigation_plan: string;
  status: 'Open' | 'Mitigated' | 'Closed';
  owner?: string;
  due_date?: string;
  library_id?: string; // إذا أُضيف من مكتبة مخاطر الأوقاف
}

export interface ImprovementItem {
  id: string;
  evaluation_id: string;
  indicator_id: string;
  priority: 'High' | 'Medium' | 'Low';
  issue_summary: string;
  recommended_action: string;
  owner: string;
  due_date: string;
  status: 'ToDo' | 'Doing' | 'Done';
  notes?: string;
  evidence_doc?: InstitutionDocument; // Added for attachment in Done column
}

// Helper types for charts
export interface ChartData {
  name: string;
  value: number;
  fill?: string;
}

export interface InstitutionAccount {
  institution_id: string;
  login_code: string;
  password: string;
}

export type FeedbackCategory = 'اقتراح تطوير' | 'صعوبة استخدام' | 'خطأ تقني' | 'ملاحظة على الأسئلة' | 'أخرى';

export interface SystemFeedback {
  id: string;
  institution_id: string;
  institution_name: string;
  category: FeedbackCategory;
  page: string;
  text: string;
  image?: string;
  submitted_at: string;
  is_read?: boolean;
  status?: FeedbackStatus;   // حالة المعالجة لدى الوزارة
  admin_reply?: string;      // رد الوزارة
  replied_at?: string;
  reply_seen?: boolean;      // هل اطّلعت المؤسسة على الرد
}

export type FeedbackStatus = 'new' | 'in_progress' | 'done';