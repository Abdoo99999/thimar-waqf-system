import React, { useState, useEffect } from 'react';
import { fetchAccounts, resetAccountPassword, setAccountPassword, resetAllPasswords, getInstitutions, resetInstitution, AccountSummary, getEvaluations, getFinancialRecords, getComplianceRecords, getRisks } from '../services/db';
import { getInstitutionJourney, JOURNEY_STEPS } from '../utils/institutionJourney';
import { useUi } from '../contexts/UiContext';
import { useEscape } from '../components/Modal';
import { Institution } from '../types';
import { KeyRound, Copy, CheckCircle, RotateCcw, AlertTriangle } from 'lucide-react';

const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const { showToast } = useUi();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);
  const [pwFor, setPwFor] = useState<string | null>(null);
  useEscape(!!pwFor || !!confirmResetId, () => { setPwFor(null); setConfirmResetId(null); });
  const [pwValue, setPwValue] = useState('');

  const handleSetPassword = async () => {
    if (!pwFor) return;
    setBusy(true);
    try {
      await setAccountPassword(pwFor, pwValue);
      showToast(`تم تعيين كلمة المرور لـ ${getInstName(pwFor)}`, 'success');
      setPwFor(null); setPwValue('');
      setAccounts(await fetchAccounts());
    } catch (e: any) { showToast(e?.message || 'تعذر تعيين كلمة المرور', 'error'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    setInstitutions(getInstitutions());
    fetchAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const withNames = (rows: { institution_id: string; login_code: string; password: string }[]) =>
    rows.map(r => ({ ...r, name: getInstName(r.institution_id) }));

  const handleNewPassword = async (instId: string) => {
    setBusy(true);
    try {
      const r = await resetAccountPassword(instId);
      window.dispatchEvent(new CustomEvent('showCredentials', { detail: { title: 'كلمة مرور جديدة', accounts: withNames([r]) } }));
      setAccounts(await fetchAccounts());
    } catch (e: any) { showToast(e?.message || 'تعذر إصدار كلمة المرور', 'error'); }
    finally { setBusy(false); }
  };

  const handleAllPasswords = async () => {
    setBusy(true);
    setConfirmAll(false);
    try {
      const rows = await resetAllPasswords();
      window.dispatchEvent(new CustomEvent('showCredentials', { detail: { title: `كلمات مرور جديدة لـ ${rows.length} مؤسسة`, accounts: withNames(rows) } }));
      setAccounts(await fetchAccounts());
    } catch (e: any) { showToast(e?.message || 'تعذر إصدار كلمات المرور', 'error'); }
    finally { setBusy(false); }
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const getInstName = (instId: string) => institutions.find(i => i.id === instId)?.name ?? 'غير محدد';
  const [onlyFilled, setOnlyFilled] = useState(false);

  // هل عبّأت المؤسسة شيئاً؟ (لتحديد من يحتاج مسح بيانات التجربة)
  const dataInfo = (instId: string) => {
    const inst = institutions.find(i => i.id === instId);
    // ما أدخله المدير عند إنشاء المؤسسة لا يُحسب؛ المعتبر ما حفظته المؤسسة نفسها
    const has = !!inst?.profile_completed
      || getEvaluations().some(e => e.institution_id === instId) || getFinancialRecords(instId).length > 0
      || getComplianceRecords().some(c => c.institution_id === instId) || getRisks(instId).length > 0;
    if (!has) return { has, label: 'فارغة', cls: 'bg-gray-100 text-gray-500' };
    const j = getInstitutionJourney(instId);
    if (j.workflowStatus === 'approved') return { has, label: 'معتمدة', cls: 'bg-green-100 text-green-800' };
    if (j.workflowStatus === 'submitted') return { has, label: 'مرفوعة', cls: 'bg-sky-100 text-sky-800' };
    if (j.workflowStatus === 'returned') return { has, label: 'معادة', cls: 'bg-orange-100 text-orange-800' };
    return { has, label: j.completedCount ? `${j.completedCount} من ${JOURNEY_STEPS.length} خطوات` : 'بدأت التعبئة', cls: 'bg-amber-100 text-amber-800' };
  };
  const filledCount = accounts.filter(a => dataInfo(a.institution_id).has).length;
  const shown = onlyFilled ? accounts.filter(a => dataInfo(a.institution_id).has) : accounts;

  const [resetFeedback, setResetFeedback] = useState(true);
  const handleReset = async (instId: string) => {
    try { await resetInstitution(instId, resetFeedback); } catch (e: any) { showToast(e?.message || 'تعذر مسح البيانات', 'error'); return; }
    setInstitutions(getInstitutions());
    setConfirmResetId(null);
    setResetDone(instId);
    showToast(`تم مسح بيانات ${getInstName(instId)}`, 'success');
    setTimeout(() => setResetDone(null), 2500);
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-navy-100 rounded-xl"><KeyRound size={28} className="text-navy-800" /></div>
        <h1 className="text-2xl font-bold text-navy-900">حسابات المؤسسات</h1>
      </div>
      <div>
          <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
            <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
              كلمات المرور محفوظة مشفّرة ولا يمكن عرضها. عند إصدار كلمة مرور جديدة تظهر لك مرة واحدة، فانسخها وسلّمها للمؤسسة عبر قناة آمنة. وتُلزم المؤسسة بتغييرها عند أول دخول.
            </div>
            <button
              disabled={busy}
              onClick={() => setConfirmAll(true)}
              className="bg-navy-900 hover:bg-navy-800 disabled:opacity-60 text-white font-bold px-4 py-3 rounded-xl flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <KeyRound size={16} /> إصدار كلمات مرور لكل المؤسسات
            </button>
          </div>
          {confirmAll && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-800 flex flex-col md:flex-row md:items-center gap-3">
              <p className="flex-1">سيتم إلغاء كلمات المرور الحالية لكل المؤسسات وإصدار كلمات جديدة، وتُسجَّل المؤسسات المتصلة خروجاً. هل تريد المتابعة؟</p>
              <div className="flex gap-2">
                <button onClick={handleAllPasswords} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg">نعم، أصدر</button>
                <button onClick={() => setConfirmAll(false)} className="bg-white border border-gray-300 font-bold px-4 py-2 rounded-lg">إلغاء</button>
              </div>
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-amber-50 px-3 py-1 font-bold text-amber-800">فيها بيانات: {filledCount}</span>
            <span className="rounded-full bg-gray-100 px-3 py-1 font-bold text-gray-600">فارغة: {accounts.length - filledCount}</span>
            <label className="mr-auto flex min-h-[44px] cursor-pointer items-center gap-2 font-bold text-navy-800">
              <input type="checkbox" checked={onlyFilled} onChange={e => setOnlyFilled(e.target.checked)} className="h-5 w-5 accent-teal-600" />
              عرض المؤسسات التي فيها بيانات فقط
            </label>
          </div>
          {/* الجوال: بطاقات بدل الجدول */}
          <div className="grid gap-3 md:grid-cols-2 xl:hidden">
            {shown.map(acc => { const di = dataInfo(acc.institution_id); return (
              <div key={acc.institution_id} className={`rounded-xl border bg-white p-4 shadow-sm ${resetDone === acc.institution_id ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-navy-900">{getInstName(acc.institution_id)}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${di.cls}`}>{di.label}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded text-navy-900 font-bold">{acc.login_code}</span>
                  <button onClick={() => copyText(acc.login_code, `code-${acc.institution_id}`)} aria-label="نسخ رمز الدخول" className="p-2 text-gray-400 hover:text-teal-600">
                    {copied === `code-${acc.institution_id}` ? <CheckCircle size={16} className="text-teal-600" /> : <Copy size={16} />}
                  </button>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${acc.must_change ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
                    {acc.must_change ? 'مؤقتة (يجب تغييرها)' : 'فعّالة'}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button disabled={busy} onClick={() => handleNewPassword(acc.institution_id)} className="min-h-[44px] flex-1 rounded-lg border border-navy-200 bg-white px-1 text-navy-800 text-[13px] font-bold whitespace-nowrap disabled:opacity-50">كلمة عشوائية</button>
                  <button disabled={busy} onClick={() => { setPwFor(acc.institution_id); setPwValue(''); }} className="min-h-[44px] flex-1 rounded-lg border border-navy-200 bg-white px-1 text-navy-800 text-[13px] font-bold whitespace-nowrap disabled:opacity-50">تعيين كلمة</button>
                  {resetDone === acc.institution_id ? (
                    <span className="min-h-[44px] flex-1 flex items-center justify-center gap-1 text-green-600 text-sm font-bold"><CheckCircle size={14} /> تم المسح</span>
                  ) : (
                    <button disabled={!di.has} onClick={() => setConfirmResetId(acc.institution_id)} className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-1 text-[13px] font-bold whitespace-nowrap text-orange-600 bg-orange-50 border border-orange-200 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400">
                      <RotateCcw size={14} /> مسح البيانات
                    </button>
                  )}
                </div>
              </div>
            ); })}
          </div>

          <div className="hidden xl:block bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="px-3 py-3 text-right font-bold">اسم المؤسسة</th>
                  <th className="px-3 py-3 text-center font-bold">رمز الدخول</th>
                  <th className="px-3 py-3 text-center font-bold">كلمة المرور</th>
                  <th className="px-3 py-3 text-center font-bold">البيانات المعبأة</th>
                  <th className="px-3 py-3 text-center font-bold whitespace-nowrap">مسح البيانات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map(acc => { const di = dataInfo(acc.institution_id); return (
                  <tr key={acc.institution_id} className={`hover:bg-gray-50 transition-colors ${resetDone === acc.institution_id ? 'bg-green-50' : ''}`}>
                    <td className="px-3 py-3 font-medium text-navy-900 max-w-xs truncate">{getInstName(acc.institution_id)}</td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-navy-900 font-bold">{acc.login_code}</span>
                        <button onClick={() => copyText(acc.login_code, `code-${acc.institution_id}`)} className="text-gray-400 hover:text-teal-600 transition-colors">
                          {copied === `code-${acc.institution_id}` ? <CheckCircle size={14} className="text-teal-600" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${acc.must_change ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
                          {acc.must_change ? 'مؤقتة (يجب تغييرها)' : 'فعّالة'}
                        </span>
                        <button disabled={busy} onClick={() => handleNewPassword(acc.institution_id)} className="whitespace-nowrap text-xs font-bold text-navy-800 border border-navy-200 bg-white hover:bg-navy-50 px-2 py-1 rounded-lg disabled:opacity-50">
                          كلمة عشوائية
                        </button>
                        <button disabled={busy} onClick={() => { setPwFor(acc.institution_id); setPwValue(''); }} className="whitespace-nowrap text-xs font-bold text-navy-800 border border-navy-200 bg-white hover:bg-navy-50 px-2 py-1 rounded-lg disabled:opacity-50">
                          تعيين كلمة
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${di.cls}`}>{di.label}</span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {resetDone === acc.institution_id ? (
                        <span className="flex items-center justify-center gap-1 text-green-600 text-xs font-bold">
                          <CheckCircle size={14} /> تم المسح
                        </span>
                      ) : (
                        <button
                          disabled={!di.has}
                          onClick={() => setConfirmResetId(acc.institution_id)}
                          title={di.has ? 'مسح كل ما عبّأته المؤسسة' : 'لا توجد بيانات لمسحها'}
                          className="inline-flex whitespace-nowrap items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          <RotateCcw size={13} /> مسح البيانات
                        </button>
                      )}
                    </td>
                  </tr>
                ); })}
              </tbody>
            </table>
            </div>
          </div>

          {/* نافذة تأكيد الإعادة */}
          {confirmResetId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="مسح بيانات المؤسسة" onClick={() => setConfirmResetId(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" dir="rtl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={24} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">مسح كل بيانات المؤسسة؟</h3>
                    <p className="text-sm text-gray-500">{getInstName(confirmResetId)}</p>
                  </div>
                </div>
                <p className="text-gray-700 text-sm mb-2 leading-relaxed">
                  سيتم مسح جميع بيانات هذه المؤسسة بشكل كامل:
                </p>
                <ul className="text-sm text-gray-600 mb-5 space-y-1 pr-4 list-disc">
                  <li>بيانات الملف التعريفي</li>
                  <li>القوائم المالية</li>
                  <li>الأداء المؤسسي والاستجابات</li>
                  <li>الامتثال وسجل المخاطر</li>
                  <li>خطة التحسين والمرفقات والاعتماد والتقرير</li>
                </ul>
                <label className="mb-4 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-bold text-gray-700">
                  <input type="checkbox" checked={resetFeedback} onChange={e => setResetFeedback(e.target.checked)} className="h-5 w-5 accent-orange-500" />
                  حذف ملاحظاتها على النظام أيضاً
                </label>
                <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-5">
                  يبقى اسم المؤسسة ورمز الدخول وكلمة المرور كما هي، وتجد المؤسسة ملفها فارغاً وتبدأ من الخطوة الأولى. لا يمكن التراجع عن المسح.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReset(confirmResetId)}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={16} /> نعم، امسح البيانات
                  </button>
                  <button
                    onClick={() => setConfirmResetId(null)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
      {pwFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="setpw-title">
          <form onSubmit={e => { e.preventDefault(); handleSetPassword(); }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 id="setpw-title" className="text-lg font-extrabold text-navy-900">تعيين كلمة مرور</h3>
            <p className="mt-1 text-sm text-gray-600">{getInstName(pwFor)} · {accounts.find(a => a.institution_id === pwFor)?.login_code}</p>
            <label htmlFor="setpw" className="mt-4 block text-sm font-bold text-gray-700">كلمة المرور</label>
            <input id="setpw" type="text" autoComplete="off" autoFocus value={pwValue} onChange={e => setPwValue(e.target.value)} dir="ltr"
              className="mt-1 w-full rounded-lg border border-gray-300 p-3 font-mono text-lg outline-none focus:ring-2 focus:ring-teal-500" />
            <p className="mt-2 text-xs text-gray-500">من 4 أحرف على الأقل. لن يُطلب من المؤسسة تغييرها.</p>
            <div className="mt-5 flex gap-3">
              <button type="submit" disabled={busy || pwValue.trim().length < 4} className="min-h-[44px] flex-1 rounded-xl bg-teal-700 font-bold text-white disabled:opacity-50">حفظ</button>
              <button type="button" onClick={() => setPwFor(null)} className="min-h-[44px] flex-1 rounded-xl bg-gray-100 font-bold text-gray-700">إلغاء</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Accounts;
