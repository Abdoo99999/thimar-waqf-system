
import React, { useState, useEffect } from 'react';
import { getFeedback, markFeedbackRead, getAccounts, getInstitutions, resetInstitution } from '../services/db';
import { SystemFeedback, InstitutionAccount, Institution } from '../types';
import { MessageSquare, Eye, KeyRound, Copy, CheckCircle, Filter, RotateCcw, AlertTriangle } from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  'اقتراح تطوير': 'bg-blue-100 text-blue-700',
  'صعوبة استخدام': 'bg-orange-100 text-orange-700',
  'خطأ تقني': 'bg-red-100 text-red-700',
  'ملاحظة على الأسئلة': 'bg-purple-100 text-purple-700',
  'أخرى': 'bg-gray-100 text-gray-600',
};

const SystemFeedbackPage: React.FC = () => {
  const [tab, setTab] = useState<'feedback' | 'accounts'>('feedback');
  const [feedbackList, setFeedbackList] = useState<SystemFeedback[]>([]);
  const [accounts, setAccounts] = useState<InstitutionAccount[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState('الكل');
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);

  useEffect(() => {
    setFeedbackList([...getFeedback()].reverse());
    setAccounts(getAccounts());
    setInstitutions(getInstitutions());
  }, [tab]);

  const handleRead = (id: string) => {
    markFeedbackRead(id);
    setFeedbackList(prev => prev.map(f => f.id === id ? { ...f, is_read: true } : f));
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const getInstName = (instId: string) => institutions.find(i => i.id === instId)?.name ?? 'غير محدد';

  const handleReset = (instId: string) => {
    resetInstitution(instId);
    setInstitutions(getInstitutions());
    setConfirmResetId(null);
    setResetDone(instId);
    setTimeout(() => setResetDone(null), 2500);
  };

  const categories = ['الكل', 'اقتراح تطوير', 'صعوبة استخدام', 'خطأ تقني', 'ملاحظة على الأسئلة', 'أخرى'];
  const filtered = filterCat === 'الكل' ? feedbackList : feedbackList.filter(f => f.category === filterCat);
  const unread = feedbackList.filter(f => !f.is_read).length;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-navy-100 rounded-xl">
          <MessageSquare size={28} className="text-navy-800" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-navy-900">ملاحظات النظام وإدارة الحسابات</h1>
          <p className="text-gray-500 text-sm">استعرض ملاحظات المؤسسات وإدر بيانات دخولها</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab('feedback')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${tab === 'feedback' ? 'border-navy-800 text-navy-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          <MessageSquare size={16} />
          الملاحظات الواردة
          {unread > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{unread}</span>
          )}
        </button>
        <button
          onClick={() => setTab('accounts')}
          className={`px-5 py-3 font-bold text-sm border-b-2 transition-all flex items-center gap-2 ${tab === 'accounts' ? 'border-navy-800 text-navy-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          <KeyRound size={16} />
          حسابات المؤسسات
          <span className="bg-gray-200 text-gray-600 text-xs rounded-full px-1.5 py-0.5">{accounts.length}</span>
        </button>
      </div>

      {tab === 'feedback' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <Filter size={16} className="text-gray-400" />
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filterCat === cat ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-600 border-gray-300 hover:border-navy-400'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-bold">لا توجد ملاحظات بعد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(f => (
                <div
                  key={f.id}
                  className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${!f.is_read ? 'border-teal-300 border-r-4' : 'border-gray-200'}`}
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {!f.is_read && <div className="w-2 h-2 bg-teal-500 rounded-full mt-1.5 shrink-0 animate-pulse" />}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[f.category] ?? 'bg-gray-100 text-gray-600'}`}>
                              {f.category}
                            </span>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{f.page}</span>
                          </div>
                          <p className="font-bold text-navy-900 text-sm truncate">{f.institution_name}</p>
                          <p className="text-gray-500 text-sm line-clamp-1 mt-0.5">{f.text}</p>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <p className="text-xs text-gray-400">{new Date(f.submitted_at).toLocaleDateString('ar-OM')}</p>
                        <p className="text-xs text-gray-400">{new Date(f.submitted_at).toLocaleTimeString('ar-OM', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  </div>

                  {expanded === f.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                      <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap mb-3">{f.text}</p>
                      {f.image && (
                        <img src={f.image} alt="مرفق" className="max-h-48 rounded-lg border border-gray-200 shadow-sm mb-3" />
                      )}
                      {!f.is_read && (
                        <button
                          onClick={() => handleRead(f.id)}
                          className="flex items-center gap-2 text-xs text-teal-600 hover:text-teal-800 font-bold transition-colors"
                        >
                          <Eye size={14} /> تحديد كمقروء
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'accounts' && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
            هذه بيانات الدخول التجريبية لكل مؤسسة. أرسل رمز الدخول وكلمة المرور للمؤسسة عبر قناة آمنة.
          </div>
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
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-navy-900">{acc.password}</span>
                        <button onClick={() => copyText(acc.password, `pass-${acc.institution_id}`)} className="text-gray-400 hover:text-teal-600 transition-colors">
                          {copied === `pass-${acc.institution_id}` ? <CheckCircle size={14} className="text-teal-600" /> : <Copy size={14} />}
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
      )}
    </div>
  );
};

export default SystemFeedbackPage;
