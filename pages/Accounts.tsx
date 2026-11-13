import React, { useState, useEffect } from 'react';
import { fetchAccounts, resetAccountPassword, resetAllPasswords, getInstitutions, resetInstitution, AccountSummary } from '../services/db';
import { useUi } from '../contexts/UiContext';
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

  const handleReset = async (instId: string) => {
    try { await resetInstitution(instId); } catch (e: any) { showToast(e?.message || 'تعذرت الإعادة', 'error'); return; }
    setInstitutions(getInstitutions());
    setConfirmResetId(null);
    setResetDone(instId);
    setTimeout(() => setResetDone(null), 2500);
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto" dir="rtl">
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
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">#</th>
                  <th className="px-4 py-3 text-right font-bold">اسم المؤسسة</th>
                  <th className="px-4 py-3 text-center font-bold">رمز الدخول</th>
                  <th className="px-4 py-3 text-center font-bold">كلمة المرور</th>
                  <th className="px-4 py-3 text-center font-bold">إعادة التعيين</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((acc, idx) => (
                  <tr key={acc.institution_id} className={`hover:bg-gray-50 transition-colors ${resetDone === acc.institution_id ? 'bg-green-50' : ''}`}>
                    <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-navy-900 max-w-xs truncate">{getInstName(acc.institution_id)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-navy-900 font-bold">{acc.login_code}</span>
                        <button onClick={() => copyText(acc.login_code, `code-${acc.institution_id}`)} className="text-gray-400 hover:text-teal-600 transition-colors">
                          {copied === `code-${acc.institution_id}` ? <CheckCircle size={14} className="text-teal-600" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${acc.must_change ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
                          {acc.must_change ? 'مؤقتة (يجب تغييرها)' : 'فعّالة'}
                        </span>
                        <button disabled={busy} onClick={() => handleNewPassword(acc.institution_id)} className="text-xs font-bold text-navy-800 border border-navy-200 bg-white hover:bg-navy-50 px-2 py-1 rounded-lg disabled:opacity-50">
                          كلمة مرور جديدة
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {resetDone === acc.institution_id ? (
                        <span className="flex items-center justify-center gap-1 text-green-600 text-xs font-bold">
                          <CheckCircle size={14} /> تم الإعادة
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmResetId(acc.institution_id)}
                          title="إعادة تعيين بيانات المؤسسة"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors"
                        >
                          <RotateCcw size={13} /> إعادة تعيين
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* نافذة تأكيد الإعادة */}
          {confirmResetId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmResetId(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" dir="rtl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={24} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">تأكيد إعادة التعيين</h3>
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
                </ul>
                <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-5">
                  ستتمكن المؤسسة من تجربة النظام من البداية. هذا الإجراء لا يمكن التراجع عنه.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReset(confirmResetId)}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={16} /> نعم، إعادة التعيين
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
    </div>
  );
};

export default Accounts;
