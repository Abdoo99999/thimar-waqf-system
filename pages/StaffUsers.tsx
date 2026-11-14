import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Trash2, KeyRound } from 'lucide-react';
import { fetchStaff, createStaff, updateStaff, deleteStaff, StaffUser } from '../services/db';
import { useUi } from '../contexts/UiContext';

const ROLES = [
  { v: 'approver', l: 'معتمِد', d: 'يطّلع على كل المؤسسات ويعتمد التقييمات المرفوعة أو يعيدها بملاحظات' },
  { v: 'viewer', l: 'مطّلع', d: 'يطّلع على لوحة القيادة والمتابعة والتقارير دون أي تعديل' },
] as const;

const empty = { username: '', display_name: '', title: '', role: 'approver', password: '' };

// إدارة حسابات مستخدمي الوزارة (المعتمِد والمطّلع) — للمدير فقط
const StaffUsers: React.FC = () => {
  const { showToast } = useUi();
  const [list, setList] = useState<StaffUser[]>([]);
  const [form, setForm] = useState<typeof empty | null>(null);
  const [pwFor, setPwFor] = useState<StaffUser | null>(null);
  const [pw, setPw] = useState('');
  const [delFor, setDelFor] = useState<StaffUser | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => fetchStaff().then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try { await fn(); showToast(ok, 'success'); await load(); return true; }
    catch (e: any) { showToast(e?.message || 'تعذر الحفظ', 'error'); return false; }
    finally { setBusy(false); }
  };

  const field = 'mt-1 w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-16" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="flex items-center gap-3 text-2xl font-bold text-navy-900"><Users className="text-teal-700" aria-hidden="true" /> مستخدمو الوزارة</h2>
        <button type="button" onClick={() => setForm({ ...empty })} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-navy-900 px-4 font-bold text-white hover:bg-navy-800">
          <UserPlus size={18} aria-hidden="true" /> إضافة مستخدم
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ROLES.map(r => (
          <div key={r.v} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-extrabold text-navy-900">{r.l}</p>
            <p className="mt-1 text-sm text-slate-600">{r.d}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {list.length === 0 ? (
          <p className="p-10 text-center text-slate-500">لا يوجد مستخدمون بعد</p>
        ) : list.map(u => (
          <div key={u.username} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-b-0">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-bold text-navy-900">{u.display_name}{u.title ? <span className="font-normal text-slate-600"> · {u.title}</span> : null}</span>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono font-bold" dir="ltr">{u.username}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${u.role === 'approver' ? 'bg-green-50 text-green-800' : 'bg-sky-50 text-sky-800'}`}>{u.role === 'approver' ? 'معتمِد' : 'مطّلع'}</span>
                {!u.active && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">موقوف</span>}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold">
                الصلاحية
                <select value={u.role} disabled={busy} onChange={e => run(() => updateStaff(u.username, { role: e.target.value as StaffUser['role'] }), 'تم تغيير الصلاحية')} className="bg-transparent font-bold">
                  {ROLES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy} onClick={() => run(() => updateStaff(u.username, { active: !u.active }), u.active ? 'تم إيقاف الحساب' : 'تم تفعيل الحساب')}
                className="min-h-[44px] rounded-lg border border-slate-200 px-3 text-sm font-bold hover:bg-slate-50">{u.active ? 'إيقاف' : 'تفعيل'}</button>
              <button type="button" disabled={busy} onClick={() => { setPwFor(u); setPw(''); }} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-bold hover:bg-slate-50">
                <KeyRound size={15} aria-hidden="true" /> كلمة المرور
              </button>
              <button type="button" disabled={busy} onClick={() => setDelFor(u)} aria-label={`حذف ${u.display_name}`} className="inline-flex min-h-[44px] items-center rounded-lg border border-red-200 px-3 text-red-700 hover:bg-red-50">
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="staff-new">
          <form onSubmit={async e => { e.preventDefault(); if (await run(() => createStaff(form), 'تمت إضافة المستخدم')) setForm(null); }}
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="staff-new" className="text-lg font-extrabold text-navy-900">إضافة مستخدم</h3>
            <div className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-bold text-gray-700">الاسم كما يظهر في التقارير
                <input required value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} className={field} />
              </label>
              <label className="text-sm font-bold text-gray-700">المسمى الوظيفي
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="مثال: مدير دائرة الأوقاف" className={field} />
              </label>
              <label className="text-sm font-bold text-gray-700">اسم المستخدم للدخول (بالإنجليزي)
                <input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} dir="ltr" autoComplete="off" placeholder="awqaf.director" className={`${field} font-mono`} />
              </label>
              <label className="text-sm font-bold text-gray-700">كلمة المرور
                <input required minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} dir="ltr" autoComplete="off" className={`${field} font-mono`} />
              </label>
              <fieldset>
                <legend className="text-sm font-bold text-gray-700">الصلاحية</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {ROLES.map(r => (
                    <label key={r.v} className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-3 font-bold ${form.role === r.v ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300'}`}>
                      <input type="radio" name="role" className="sr-only" checked={form.role === r.v} onChange={() => setForm({ ...form, role: r.v })} />{r.l}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="submit" disabled={busy} className="min-h-[44px] flex-1 rounded-xl bg-teal-700 font-bold text-white disabled:opacity-50">حفظ</button>
              <button type="button" onClick={() => setForm(null)} className="min-h-[44px] flex-1 rounded-xl bg-gray-100 font-bold text-gray-700">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {pwFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="staff-pw">
          <form onSubmit={async e => { e.preventDefault(); if (await run(() => updateStaff(pwFor.username, { password: pw }), 'تم تعيين كلمة المرور')) setPwFor(null); }}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="staff-pw" className="text-lg font-extrabold text-navy-900">كلمة مرور جديدة</h3>
            <p className="mt-1 text-sm text-gray-600">{pwFor.display_name} · <span dir="ltr">{pwFor.username}</span></p>
            <input aria-label="كلمة المرور" required minLength={6} autoFocus value={pw} onChange={e => setPw(e.target.value)} dir="ltr" autoComplete="off" className={`${field} font-mono text-lg`} />
            <div className="mt-5 flex gap-3">
              <button type="submit" disabled={busy || pw.trim().length < 6} className="min-h-[44px] flex-1 rounded-xl bg-teal-700 font-bold text-white disabled:opacity-50">حفظ</button>
              <button type="button" onClick={() => setPwFor(null)} className="min-h-[44px] flex-1 rounded-xl bg-gray-100 font-bold text-gray-700">إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {delFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="staff-del">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="staff-del" className="text-lg font-extrabold text-navy-900">حذف {delFor.display_name}؟</h3>
            <p className="mt-2 text-sm text-gray-600">لن يتمكن من الدخول بعد الحذف. الاعتمادات السابقة تبقى باسمه في التقارير.</p>
            <div className="mt-5 flex gap-3">
              <button type="button" disabled={busy} onClick={async () => { if (await run(() => deleteStaff(delFor.username), 'تم الحذف')) setDelFor(null); }} className="min-h-[44px] flex-1 rounded-xl bg-red-600 font-bold text-white">حذف</button>
              <button type="button" onClick={() => setDelFor(null)} className="min-h-[44px] flex-1 rounded-xl bg-gray-100 font-bold text-gray-700">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffUsers;
