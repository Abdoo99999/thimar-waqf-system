import React, { useEffect, useMemo, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { fetchAudit, getInstitutions, AuditEntry } from '../services/db';
import { useUi } from '../contexts/UiContext';

// سجل العمليات: من فعل ماذا ومتى (يكتبه الخادم، ولا يُعدَّل ولا يُحذف)
const ACTIONS: Record<string, string> = {
  login: 'تسجيل دخول', login_failed: 'محاولة دخول فاشلة', logout: 'تسجيل خروج', change_password: 'تغيير كلمة المرور',
  submit: 'رفع التقييم', approve: 'اعتماد التقييم', return: 'إعادة التقييم للتعديل',
  create: 'إضافة', update: 'تعديل', delete: 'حذف',
  file_upload: 'رفع ملف', file_delete: 'حذف ملف',
  password_reset: 'إصدار كلمة مرور', password_set: 'تعيين كلمة مرور', password_reset_all: 'إصدار كلمات مرور لكل المؤسسات',
  staff_create: 'إضافة مستخدم وزارة', staff_update: 'تعديل مستخدم وزارة', staff_delete: 'حذف مستخدم وزارة',
  institution_reset: 'مسح بيانات مؤسسة', backup_export: 'تنزيل نسخة احتياطية', backup_import: 'استعادة نسخة احتياطية',
};
const COLLECTION: Record<string, string> = {
  waqf_institutions: 'بيانات المؤسسة', waqf_financials: 'القوائم المالية', waqf_evaluations: 'التقييم',
  waqf_compliance: 'الامتثال', waqf_risks: 'المخاطر', waqf_improvements: 'خطة التحسين', waqf_feedback: 'ملاحظة على النظام',
  waqf_indicators: 'المؤشرات', waqf_settings: 'الإعدادات',
};
const ROLE: Record<string, string> = { admin: 'المدير', approver: 'معتمِد', viewer: 'مطّلع', user: 'مؤسسة', guest: '—' };
const FILTERS = [
  { v: '', l: 'كل العمليات' },
  { v: 'submit', l: 'رفع التقييم' }, { v: 'approve', l: 'الاعتماد' }, { v: 'return', l: 'الإعادة' },
  { v: 'delete', l: 'الحذف' }, { v: 'file_delete', l: 'حذف الملفات' },
  { v: 'login_failed', l: 'محاولات دخول فاشلة' }, { v: 'institution_reset', l: 'مسح بيانات مؤسسة' },
];

const fmt = (iso: string) => new Date(iso).toLocaleString('ar-OM-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const AuditLog: React.FC = () => {
  const { showToast } = useUi();
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState('');
  const [inst, setInst] = useState('');
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const institutions = useMemo(() => [...getInstitutions()].sort((a, b) => a.name.localeCompare(b.name, 'ar')), []);
  const instName = useMemo(() => new Map(institutions.map(i => [i.id, i.name] as const)), [institutions]);

  const load = async (append = false) => {
    setLoading(true);
    try {
      const before = append && rows.length ? rows[rows.length - 1].id : undefined;
      const r = await fetchAudit({ action, institution_id: inst, before, limit: 100 });
      setRows(prev => (append ? [...prev, ...r] : r));
      setMore(r.length === 100);
    } catch (e: any) { showToast(e?.message || 'تعذر تحميل السجل', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [action, inst]);

  const describe = (r: AuditEntry) => {
    const parts: string[] = [];
    if (r.collection) parts.push(COLLECTION[r.collection] || r.collection);
    if (r.detail?.report_ref) parts.push(`رقم المرجع ${r.detail.report_ref}`);
    if (r.detail?.name) parts.push(r.detail.name);
    if (r.detail?.code) parts.push(`الرمز ${r.detail.code}`);
    if (r.detail?.username) parts.push(`المستخدم ${r.detail.username}`);
    return parts.join(' · ');
  };

  const sel = 'min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold';
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-16" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-2xl font-bold text-navy-900"><History className="text-teal-700" aria-hidden="true" /> سجل العمليات</h2>
        <button type="button" onClick={() => load()} disabled={loading} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200">
          <RefreshCw size={16} aria-hidden="true" className={loading ? 'animate-spin' : ''} /> تحديث
        </button>
      </div>
      <p className="-mt-2 text-sm text-slate-600">كل دخول وتعديل واعتماد وحذف يُسجَّل هنا تلقائياً باسم من قام به ووقته. لا يمكن تعديل السجل أو حذفه.</p>

      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">العملية
          <select value={action} onChange={e => setAction(e.target.value)} className={sel}>
            {FILTERS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-bold text-slate-700">المؤسسة
          <select value={inst} onChange={e => setInst(e.target.value)} className={`${sel} max-w-[260px]`}>
            <option value="">كل المؤسسات</option>
            {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-slate-500">{loading ? 'جاري التحميل…' : 'لا توجد عمليات مسجلة'}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(r => (
              <li key={r.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
                <span className="w-40 shrink-0 text-xs text-slate-500">{fmt(r.at)}</span>
                <span className={`w-44 shrink-0 font-bold ${r.action === 'login_failed' || r.action.includes('delete') || r.action === 'institution_reset' ? 'text-red-700' : r.action === 'approve' ? 'text-emerald-700' : 'text-navy-900'}`}>
                  {ACTIONS[r.action] || r.action}
                </span>
                <span className="min-w-0 flex-1 text-sm text-slate-700">
                  <span className="font-bold">{r.actor_name || r.actor_id || '—'}</span>
                  <span className="text-slate-500"> ({ROLE[r.actor_role] || r.actor_role})</span>
                  {r.institution_id && r.actor_role !== 'user' && instName.get(r.institution_id) ? <span> ← {instName.get(r.institution_id)}</span> : null}
                  {describe(r) ? <span className="text-slate-500"> · {describe(r)}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {more && (
        <button type="button" onClick={() => load(true)} disabled={loading} className="mx-auto min-h-[44px] rounded-lg border border-slate-300 bg-white px-6 font-bold text-slate-700 hover:bg-slate-50">
          عرض المزيد
        </button>
      )}
    </div>
  );
};

export default AuditLog;
