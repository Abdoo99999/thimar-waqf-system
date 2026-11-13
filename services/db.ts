import { Institution, Indicator, Evaluation, Response, ComplianceRecord, ImprovementItem, RiskRegisterItem, FinancialRecord, InstitutionAccount, SystemFeedback, InstitutionDocument } from '../types';
import { DEFAULT_INDICATORS, CURRENT_YEAR } from '../constants';

// ─────────────────────────────────────────────────────────────────────────────
// طبقة البيانات
// - الخادم هو المرجع الوحيد للبيانات والصلاحيات (لا شيء يُحفظ في localStorage)
// - كل حفظ يرسل سجلاً واحداً فقط، فلا يكتب مستخدم فوق بيانات غيره
// - عمليات الكتابة تُرسل بالترتيب (طابور) حتى يصل التقييم قبل إجاباته
// ─────────────────────────────────────────────────────────────────────────────

const DB_KEYS = {
  INSTITUTIONS: 'waqf_institutions',
  INDICATORS: 'waqf_indicators',
  EVALUATIONS: 'waqf_evaluations',
  RESPONSES: 'waqf_responses',
  COMPLIANCE: 'waqf_compliance',
  IMPROVEMENTS: 'waqf_improvements',
  RISKS: 'waqf_risks',
  FINANCIALS: 'waqf_financials',
  SETTINGS: 'waqf_settings',
  FEEDBACK: 'waqf_feedback',
};

const API = '/api';
const DEFAULT_SETTINGS = { darkMode: false, orgName: 'وزارة الأوقاف والشؤون الدينية' };

export interface SessionInfo {
  authenticated: boolean;
  role?: 'admin' | 'user';
  name?: string;
  institution_id?: string | null;
  must_change_password?: boolean;
}

const cache: Record<string, any[]> = {};
let settingsCache: any = null;
let session: SessionInfo = { authenticated: false };

export const getSession = () => session;

export const uploadFile = (file: File, institutionId?: string | null): Promise<InstitutionDocument> =>
  new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) return reject(new Error('حجم الملف أكبر من 10 ميغابايت'));
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = String(reader.result).split(',')[1] || '';
        const r = await request('POST', '/files', { name: file.name, data, institution_id: institutionId || undefined });
        resolve({ id: generateId(), file_id: r.id, name: file.name, type: file.type,
                  size: (file.size / 1024).toFixed(1) + ' KB', upload_date: new Date().toLocaleDateString('ar-OM') });
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.readAsDataURL(file);
  });

export const fileUrl = (fileId: string, download = false) =>
  `/api/files/${encodeURIComponent(fileId)}${download ? '?download=1' : ''}`;

export const deleteFile = (fileId: string) =>
  request('DELETE', `/files/${encodeURIComponent(fileId)}`);

export const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '');
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

// ─── الاتصال بالخادم ────────────────────────────────────────────────────────
const notifyError = (message: string) => window.dispatchEvent(new CustomEvent('dbError', { detail: message }));

const request = async (method: string, url: string, body?: any) => {
  const res = await fetch(`${API}${url}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let payload: any = null;
  try { payload = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    if (res.status === 401 && session.authenticated) {
      // انتهت الجلسة: نعيد المستخدم لصفحة الدخول
      session = { authenticated: false };
      window.dispatchEvent(new Event('sessionExpired'));
    }
    const err: any = new Error(payload?.error || `خطأ ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return payload;
};

let writeQueue: Promise<any> = Promise.resolve();
let pendingWrites = 0;
const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
  pendingWrites++;
  const p = writeQueue.then(fn);
  writeQueue = p.catch(() => undefined).finally(() => { pendingWrites--; });
  p.catch(e => notifyError(`لم يتم الحفظ: ${e.message}`));
  return p;
};
export const hasPendingWrites = () => pendingWrites > 0;
window.addEventListener('beforeunload', (e) => {
  if (pendingWrites > 0) { e.preventDefault(); e.returnValue = ''; }
});

const data = <T>(key: string): T[] => {
  if (!cache[key]) cache[key] = [];
  return cache[key] as T[];
};

const upsert = <T extends { id: string }>(key: string, item: T) => {
  const list = data<T>(key);
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
  return enqueue(() => request('PUT', `/records/${key}/${encodeURIComponent(item.id)}`, item));
};

const remove = (key: string, id: string) => {
  cache[key] = data<any>(key).filter(x => x.id !== id);
  return enqueue(() => request('DELETE', `/records/${key}/${encodeURIComponent(id)}`));
};

// ─── التحميل والدخول ───────────────────────────────────────────────────────
const resetCache = () => {
  Object.keys(cache).forEach(k => delete cache[k]);
  settingsCache = null;
};

export const loadData = async () => {
  const d = await request('GET', '/data');
  resetCache();
  Object.values(DB_KEYS).forEach(k => {
    if (k === DB_KEYS.SETTINGS) settingsCache = d[k] || null;
    else cache[k] = Array.isArray(d[k]) ? d[k] : [];
  });
};

export const refreshData = async () => {
  await writeQueue;
  await loadData();
};

export const dbReady: Promise<void> = (async () => {
  try {
    session = await request('GET', '/auth/me');
    if (session.authenticated) await loadData();
  } catch (e) {
    console.warn('[DB] تعذر الاتصال بالخادم:', e);
    session = { authenticated: false };
  }
})();

export const loginInstitution = async (code: string, password: string) => {
  const r = await request('POST', '/auth/login', { code, password });
  session = { authenticated: true, ...r };
  await loadData();
  return session;
};

export const loginAdmin = async (username: string, password: string) => {
  const r = await request('POST', '/auth/admin-login', { username, password });
  session = { authenticated: true, ...r };
  await loadData();
  return session;
};

export const logoutServer = async () => {
  try { await writeQueue; await request('POST', '/auth/logout'); } catch { /* ignore */ }
  session = { authenticated: false };
  resetCache();
  // تنظيف أي بيانات قديمة من النسخة السابقة
  try {
    ['waqf_institutions', 'institutions', 'waqf_indicators', 'waqf_evaluations', 'waqf_responses', 'waqf_compliance',
     'waqf_improvements', 'waqf_risks', 'waqf_financials', 'waqf_settings', 'waqf_accounts', 'waqf_feedback',
     'waqf_user', 'waqf_role'].forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
};

export const changePassword = async (current: string, next: string) => {
  await request('POST', '/auth/change-password', { current, next });
  session = { ...session, must_change_password: false };
};

// كان يُستخدم لإعادة القراءة من localStorage — البيانات الآن في الذاكرة ومحدّثة
export const clearCache = (..._keys: string[]) => { /* no-op */ };

// ─── المؤسسات ───────────────────────────────────────────────────────────────
export const getInstitutions = (): Institution[] => data<Institution>(DB_KEYS.INSTITUTIONS);

// يعيد بيانات الدخول إذا أضاف المدير مؤسسة جديدة
export const saveInstitution = async (inst: Institution): Promise<InstitutionAccount | null> => {
  const r = await upsert(DB_KEYS.INSTITUTIONS, inst);
  return r?.account || null;
};
export const deleteInstitution = (id: string) => {
  Object.keys(cache).forEach(k => { if (k !== DB_KEYS.INSTITUTIONS) cache[k] = cache[k].filter((x: any) => x.institution_id !== id); });
  return remove(DB_KEYS.INSTITUTIONS, id);
};

// ─── القوائم المالية ────────────────────────────────────────────────────────
export const getFinancialRecords = (instId?: string): FinancialRecord[] => {
  const all = data<FinancialRecord>(DB_KEYS.FINANCIALS);
  return instId ? all.filter(f => f.institution_id === instId) : all;
};
export const analyzeFinancialHealth = (record: FinancialRecord) => {
  const flags: string[] = [], errors: string[] = [];
  const calculatedNet = record.total_assets - record.total_liabilities;
  const diff = Math.abs(calculatedNet - record.net_waqf_assets);
  if (diff > 1) errors.push(`خطأ محاسبي: المعادلة غير متزنة.`);
  if (record.total_expenses > 0 && ((record.admin_general_expenses / record.total_expenses) * 100 > 20)) flags.push(`تنبيه: المصاريف الإدارية مرتفعة.`);
  if (record.total_expenses > record.total_revenues) flags.push('تنبيه: عجز تشغيلي.');
  if (record.net_waqf_assets < 0) flags.push('خطر حرج: تآكل رأس المال.');
  return { isValid: errors.length === 0, status: flags.length > 0 ? 'Flagged' : 'Submitted' as const, flags, errors };
};
export const saveFinancialRecord = (record: FinancialRecord) => upsert(DB_KEYS.FINANCIALS, record);
export const deleteFinancialRecord = (id: string) => remove(DB_KEYS.FINANCIALS, id);

// ─── المؤشرات ───────────────────────────────────────────────────────────────
export const getIndicators = (): Indicator[] => {
  const s = data<Indicator>(DB_KEYS.INDICATORS);
  if (s.length) return s;
  if (session.role === 'admin') {
    DEFAULT_INDICATORS.forEach(i => upsert(DB_KEYS.INDICATORS, i));
    return data<Indicator>(DB_KEYS.INDICATORS);
  }
  return DEFAULT_INDICATORS;
};
export const saveIndicators = (list: Indicator[]) => {
  const keep = new Set(list.map(i => i.id));
  data<Indicator>(DB_KEYS.INDICATORS).filter(i => !keep.has(i.id)).forEach(i => remove(DB_KEYS.INDICATORS, i.id));
  list.forEach(i => upsert(DB_KEYS.INDICATORS, i));
};

// ─── التقييمات والإجابات ────────────────────────────────────────────────────
export const getEvaluations = (y?: number) => { const e = data<Evaluation>(DB_KEYS.EVALUATIONS); return y ? e.filter(x => x.cycle_year === y) : e; };
export const getEvaluationByInstAndYear = (id: string, y: number) => getEvaluations().find(e => e.institution_id === id && e.cycle_year === y);
export const saveEvaluation = (e: Evaluation) => upsert(DB_KEYS.EVALUATIONS, e);
export const getPendingEvaluationsCount = () => getEvaluations(CURRENT_YEAR).filter(e => e.workflow_status === 'submitted').length;
export const getResponses = (id: string) => data<Response>(DB_KEYS.RESPONSES).filter(r => r.evaluation_id === id);
export const getAllResponses = () => data<Response>(DB_KEYS.RESPONSES);
export const saveResponse = (r: Response) => {
  const existing = data<Response>(DB_KEYS.RESPONSES).find(x => x.evaluation_id === r.evaluation_id && x.indicator_id === r.indicator_id);
  const merged = existing ? { ...existing, ...r, id: existing.id } : { ...r, id: r.id || generateId() };
  return upsert(DB_KEYS.RESPONSES, merged);
};

// ─── الامتثال والمخاطر والتحسين ─────────────────────────────────────────────
export const getComplianceRecords = (y?: number) => { const r = data<ComplianceRecord>(DB_KEYS.COMPLIANCE); return y ? r.filter(x => x.cycle_year === y) : r; };
export const getComplianceByInstAndYear = (id: string, y: number) => getComplianceRecords(y).find(r => r.institution_id === id);
export const saveComplianceRecord = (r: ComplianceRecord) => upsert(DB_KEYS.COMPLIANCE, r);
export const getRisks = (id?: string) => { const a = data<RiskRegisterItem>(DB_KEYS.RISKS); return id ? a.filter(r => r.institution_id === id) : a; };
export const saveRisk = (r: RiskRegisterItem) => upsert(DB_KEYS.RISKS, r);
export const deleteRisk = (id: string) => remove(DB_KEYS.RISKS, id);
export const getImprovements = (id: string) => data<ImprovementItem>(DB_KEYS.IMPROVEMENTS).filter(i => i.evaluation_id === id);
export const saveImprovement = (i: ImprovementItem) => upsert(DB_KEYS.IMPROVEMENTS, i);
export const deleteImprovement = (id: string) => remove(DB_KEYS.IMPROVEMENTS, id);

// ─── الإعدادات ──────────────────────────────────────────────────────────────
export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...(settingsCache || {}) });
export const saveSettings = (s: any) => {
  settingsCache = { ...s, id: 'main' };
  enqueue(() => request('PUT', `/records/${DB_KEYS.SETTINGS}/main`, settingsCache));
  window.dispatchEvent(new Event('settingsChanged'));
};

// ─── حسابات المؤسسات (للمدير فقط) ───────────────────────────────────────────
export interface AccountSummary { institution_id: string; login_code: string; must_change: boolean; updated_at: string; }
export const fetchAccounts = (): Promise<AccountSummary[]> => request('GET', '/admin/accounts');
export const resetAccountPassword = (institutionId: string): Promise<InstitutionAccount> =>
  request('POST', `/admin/accounts/${encodeURIComponent(institutionId)}/reset-password`);
export const resetAllPasswords = (): Promise<InstitutionAccount[]> => request('POST', '/admin/accounts/reset-all');

// ─── الملاحظات ──────────────────────────────────────────────────────────────
export const getFeedback = (): SystemFeedback[] => data<SystemFeedback>(DB_KEYS.FEEDBACK);
export const saveFeedback = (f: SystemFeedback) => upsert(DB_KEYS.FEEDBACK, f);
export const markFeedbackRead = (id: string) => {
  const f = getFeedback().find(x => x.id === id);
  if (f) upsert(DB_KEYS.FEEDBACK, { ...f, is_read: true });
};
export const getUnreadFeedbackCount = () => getFeedback().filter(f => !f.is_read).length;

// ─── إعادة مؤسسة للوضع الأولي (للمدير) ──────────────────────────────────────
export const resetInstitution = async (id: string) => {
  await writeQueue;
  await request('POST', `/admin/institutions/${encodeURIComponent(id)}/reset`);
  await loadData();
};

// ─── النسخ الاحتياطي (للمدير) ───────────────────────────────────────────────
export const exportBackup = async () => {
  await writeQueue;
  return request('GET', '/admin/export');
};
export const importBackup = async (backup: any) => {
  await writeQueue;
  const r = await request('POST', '/admin/import', backup);
  await loadData();
  return r;
};

// ─── تقدم المؤسسة في خطوات العمل ────────────────────────────────────────────
export const getInstitutionProgress = (id: string | null) => {
  if (!id) return { dataComplete: false, financialsDone: false, evalFinalized: false, complianceDone: false, workflowStatus: 'draft' as const, isLocked: false };
  const i = getInstitutions().find(x => x.id === id);
  const e = getEvaluations().find(x => x.institution_id === id && x.cycle_year === CURRENT_YEAR);
  const c = getComplianceRecords().find(x => x.institution_id === id && x.cycle_year === CURRENT_YEAR);
  const f = getFinancialRecords(id).find(r => r.fiscal_year === CURRENT_YEAR || r.fiscal_year === CURRENT_YEAR - 1);
  const isFinancialsSubmitted = !!f && (f.status === 'Submitted' || f.status === 'Approved' || f.status === 'Flagged');
  return {
      dataComplete: !!(i?.profile_completed),
      financialsDone: isFinancialsSubmitted,
      evalFinalized: !!(e?.status === 'final'),
      complianceDone: !!c && c.completed !== false && getRisks(id).length > 0,
      workflowStatus: e?.workflow_status || 'draft',
      isLocked: e?.workflow_status === 'submitted' || e?.workflow_status === 'approved'
  };
};
