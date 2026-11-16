import { Institution, Indicator, Evaluation, Response, ComplianceRecord, ImprovementItem, RiskRegisterItem, FinancialRecord, InstitutionAccount, SystemFeedback, InstitutionDocument } from '../types';
import { DEFAULT_INDICATORS, CURRENT_YEAR, setCycleYear } from '../constants';

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
  role?: 'admin' | 'user' | 'approver' | 'viewer';
  name?: string;
  title?: string;
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
                  size: (file.size / 1024).toFixed(1) + ' KB', upload_date: new Date().toLocaleDateString('ar-OM-u-nu-latn') });
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

// الحفظ: يحدّث الذاكرة ثم يرسل للخادم. إذا رفض الخادم يعود السجل لحالته السابقة،
// وإذا عدّل الخادم حقولاً (تواريخ، رقم مرجع) تُؤخذ نسخته
const upsert = <T extends { id: string }>(key: string, item: T) => {
  const list = data<T>(key);
  const i = list.findIndex(x => x.id === item.id);
  const prev = i >= 0 ? list[i] : undefined;
  if (i >= 0) list[i] = item; else list.push(item);
  return enqueue(() => request('PUT', `/records/${key}/${encodeURIComponent(item.id)}`, item)).then(r => {
    const l = data<T>(key); const j = l.findIndex(x => x.id === item.id);
    if (r?.item && j >= 0 && l[j] === item) l[j] = r.item;
    return r;
  }, e => {
    const l = data<T>(key); const j = l.findIndex(x => x.id === item.id);
    if (j >= 0 && l[j] === item) { if (prev) l[j] = prev; else l.splice(j, 1); }
    window.dispatchEvent(new Event('dataRolledBack'));
    throw e;
  });
};

const remove = (key: string, id: string) => {
  const before = data<any>(key);
  const prev = before.find(x => x.id === id);
  cache[key] = before.filter(x => x.id !== id);
  return enqueue(() => request('DELETE', `/records/${key}/${encodeURIComponent(id)}`)).catch(e => {
    if (prev && !data<any>(key).some(x => x.id === id)) data<any>(key).push(prev);
    window.dispatchEvent(new Event('dataRolledBack'));
    throw e;
  });
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
  setCycleYear(Number(settingsCache?.current_cycle) || latestCycle());
};
// إن لم تُضبط الدورة في الإعدادات: أحدث دورة فيها تقييمات (لا تتغير بتغير السنة)
const latestCycle = () => {
  const ys = data<Evaluation>(DB_KEYS.EVALUATIONS).map(e => e.cycle_year).filter(Number.isInteger);
  return ys.length ? Math.max(...ys) : new Date().getFullYear();
};
export const getCycleYears = (): number[] => {
  const ys = new Set<number>(data<Evaluation>(DB_KEYS.EVALUATIONS).map(e => e.cycle_year).filter(Number.isInteger));
  ys.add(CURRENT_YEAR);
  return [...ys].sort((a, b) => b - a);
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
  const nums = ['total_assets', 'total_liabilities', 'total_revenues', 'total_expenses', 'admin_general_expenses'] as const;
  if (nums.some(k => !Number.isFinite(Number(record[k])) || Number(record[k]) < 0)) errors.push('القيم المالية لا تكون سالبة.');
  if (!(Number(record.total_assets) > 0)) errors.push('أدخل إجمالي الأصول كما في القوائم المالية.');
  if (!record.unaudited && !(record.auditor_name || '').trim()) errors.push('اكتب اسم مكتب التدقيق، أو اختر «غير مدققة».');
  if (record.admin_general_expenses > record.total_expenses && record.total_expenses > 0) errors.push('المصاريف الإدارية أكبر من إجمالي المصروفات.');
  if (record.total_expenses > 0 && ((record.admin_general_expenses / record.total_expenses) * 100 > 20)) flags.push('المصاريف الإدارية أعلى من 20% من المصروفات.');
  if (record.total_expenses > record.total_revenues) flags.push('عجز في السنة: المصروفات أكبر من الإيرادات.');
  if (record.net_waqf_assets < 0) flags.push('صافي أصول الوقف سالب (الالتزامات أكبر من الأصول).');
  if (record.beneficiary_distributions !== undefined && record.beneficiary_distributions !== null && record.beneficiary_distributions > record.total_expenses && record.total_expenses > 0) {
    flags.push('المصروف على الموقوف عليهم أكبر من إجمالي المصروفات؛ تأكد من طريقة عرضه في القوائم.');
  }
  return { isValid: errors.length === 0, status: flags.length > 0 ? 'Flagged' : 'Submitted' as const, flags, errors };
};
export const saveFinancialRecord = (record: FinancialRecord) => upsert(DB_KEYS.FINANCIALS, record);
// قاعدة واحدة لكل الصفحات: قوائم سنة الدورة، وإلا قوائم السنة التي قبلها
export const getCycleFinancial = (instId: string, cycleYear: number): FinancialRecord | undefined => {
  const fins = getFinancialRecords(instId);
  return fins.find(f => f.fiscal_year === cycleYear) || fins.find(f => f.fiscal_year === cycleYear - 1);
};
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
// نفس منطق صفحة طلبات الاعتماد: التقييمات المرفوعة لمؤسسات موجودة فعلاً
export const getPendingEvaluationsCount = () => {
  const ids = new Set(getInstitutions().map(i => i.id));
  return getEvaluations().filter(e => e.workflow_status === 'submitted' && ids.has(e.institution_id)).length;
};
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
  const prev = settingsCache;
  settingsCache = { ...s, id: 'main' };
  if (settingsCache.current_cycle) setCycleYear(Number(settingsCache.current_cycle));
  window.dispatchEvent(new Event('settingsChanged'));
  return enqueue(() => request('PUT', `/records/${DB_KEYS.SETTINGS}/main`, settingsCache)).catch(e => {
    settingsCache = prev;
    setCycleYear(Number(prev?.current_cycle) || latestCycle());
    window.dispatchEvent(new Event('settingsChanged'));
    throw e;
  });
};

// ─── حسابات المؤسسات (للمدير فقط) ───────────────────────────────────────────
export interface AccountSummary { institution_id: string; login_code: string; must_change: boolean; updated_at: string; }
export const fetchAccounts = (): Promise<AccountSummary[]> => request('GET', '/admin/accounts');
// ─── مستخدمو الوزارة (المعتمِد والمطّلع) ─────────────────────────────────────
export interface StaffUser { username: string; display_name: string; title: string; role: 'approver' | 'viewer'; active: boolean; must_change: boolean; created_at: string }
export const fetchStaff = (): Promise<StaffUser[]> => request('GET', '/admin/staff');
export const createStaff = (u: { username: string; display_name: string; title: string; role: string; password: string }) => request('POST', '/admin/staff', u);
export const updateStaff = (username: string, patch: Partial<StaffUser> & { password?: string }) => request('PUT', `/admin/staff/${encodeURIComponent(username)}`, patch);
export const deleteStaff = (username: string) => request('DELETE', `/admin/staff/${encodeURIComponent(username)}`);

export const setAccountPassword = (institutionId: string, password: string): Promise<{ ok: true }> =>
  request('POST', `/admin/accounts/${encodeURIComponent(institutionId)}/set-password`, { password });
export const resetAccountPassword = (institutionId: string): Promise<InstitutionAccount> =>
  request('POST', `/admin/accounts/${encodeURIComponent(institutionId)}/reset-password`);
export const resetAllPasswords = (): Promise<InstitutionAccount[]> => request('POST', '/admin/accounts/reset-all');

// ─── سجل العمليات (للمدير) ───────────────────────────────────────────────────
export interface AuditEntry { id: number; at: string; actor_role: string; actor_id: string; actor_name: string; action: string; institution_id: string | null; collection: string | null; record_id: string | null; detail: any }
export const fetchAudit = (q: { institution_id?: string; action?: string; before?: number; limit?: number } = {}): Promise<AuditEntry[]> => {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== '') p.set(k, String(v)); });
  return request('GET', `/admin/audit?${p.toString()}`);
};

// ─── الملاحظات ──────────────────────────────────────────────────────────────
export const getFeedback = (): SystemFeedback[] => data<SystemFeedback>(DB_KEYS.FEEDBACK);
export const saveFeedback = (f: SystemFeedback) => upsert(DB_KEYS.FEEDBACK, f);
export const markFeedbackRead = (id: string) => {
  const f = getFeedback().find(x => x.id === id);
  if (f) upsert(DB_KEYS.FEEDBACK, { ...f, is_read: true });
  window.dispatchEvent(new Event('badgesChanged'));
};
export const deleteFeedback = (id: string) => {
  remove(DB_KEYS.FEEDBACK, id);
  window.dispatchEvent(new Event('badgesChanged'));
};
export const getUnreadFeedbackCount = () => getFeedback().filter(f => !f.is_read).length;
// للمؤسسة: ردود الوزارة التي لم تطّلع عليها بعد
export const getUnseenRepliesCount = () => getFeedback().filter(f => f.admin_reply && !f.reply_seen).length;
export const markRepliesSeen = () => {
  getFeedback().filter(f => f.admin_reply && !f.reply_seen).forEach(f => upsert(DB_KEYS.FEEDBACK, { ...f, reply_seen: true }));
};
export const replyToFeedback = (id: string, status: SystemFeedback['status'], reply: string) => {
  const f = getFeedback().find(x => x.id === id);
  if (!f) return Promise.resolve();
  const text = reply.trim();
  const changedReply = text !== (f.admin_reply || '');
  const saved = upsert(DB_KEYS.FEEDBACK, {
    ...f, status, is_read: true, admin_reply: text || undefined,
    replied_at: changedReply ? (text ? new Date().toISOString() : undefined) : f.replied_at,
    reply_seen: changedReply ? false : f.reply_seen,
  });
  window.dispatchEvent(new Event('badgesChanged'));
  return saved;
};

// ─── إعادة مؤسسة للوضع الأولي (للمدير) ──────────────────────────────────────
export const resetInstitution = async (id: string, withFeedback = false) => {
  await writeQueue;
  await request('POST', `/admin/institutions/${encodeURIComponent(id)}/reset${withFeedback ? '?feedback=1' : ''}`);
  await loadData();
  window.dispatchEvent(new Event('badgesChanged'));
};

// ─── النسخ الاحتياطي (للمدير) ───────────────────────────────────────────────
export const exportBackup = async (withFiles = false) => {
  await writeQueue;
  return request('GET', `/admin/export${withFiles ? '?files=1' : ''}`);
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
  const f = getCycleFinancial(id, CURRENT_YEAR);
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
