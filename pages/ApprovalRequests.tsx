
import React, { useState, useEffect, useCallback } from 'react';
import { getInstitutions, getEvaluations, getResponses, clearCache, resetInstitution, getAccounts } from '../services/db';
import { Institution, Evaluation } from '../types';
import { CURRENT_YEAR } from '../constants';
import { Eye, Clock, RefreshCw, RotateCcw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useUi } from '../contexts/UiContext';
import { useNavigate } from 'react-router-dom';

const ApprovalRequests: React.FC = () => {
  const [requests, setRequests] = useState<{inst: Institution, eval: Evaluation, score: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);
  const { setWaqfContext, showToast } = useUi();
  const navigate = useNavigate();

  const loadRequests = useCallback(() => {
    setLoading(true);
    // مسح الكاش لضمان قراءة أحدث بيانات من localStorage
    clearCache();
    const evals = getEvaluations(CURRENT_YEAR).filter(e => e.workflow_status === 'submitted');
    const allInsts = getInstitutions();

    const result = evals.map(e => {
        const inst = allInsts.find(i => i.id === e.institution_id);
        const responses = getResponses(e.id);
        const avg = responses.length > 0
          ? (responses.reduce((a, b) => a + b.score, 0) / responses.length).toFixed(1)
          : "0.0";
        return inst ? { inst, eval: e, score: avg } : null;
    }).filter(Boolean) as {inst: Institution, eval: Evaluation, score: string}[];

    setRequests(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleView = (id: string) => {
    setWaqfContext(id);
    showToast('تم الانتقال للمؤسسة للمراجعة', 'info');
    navigate('/reports');
  };

  const handleReset = (instId: string) => {
    resetInstitution(instId);
    clearCache();
    setConfirmResetId(null);
    setResetDone(instId);
    setTimeout(() => {
      setResetDone(null);
      loadRequests();
    }, 2000);
  };

  const getInstName = (instId: string) =>
    requests.find(r => r.inst.id === instId)?.inst.name ?? 'المؤسسة';

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-navy-900">طلبات الاعتماد الواردة</h2>
          <p className="text-sm text-gray-500 mt-1">طلبات المؤسسات التي أرسلت تقييمها للمراجعة</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-bold">
            {requests.length} طلب معلق
          </span>
          <button
            onClick={loadRequests}
            disabled={loading}
            title="تحديث القائمة"
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-bold transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
            <tr>
              <th className="p-4">المؤسسة</th>
              <th className="p-4">تاريخ الإرسال</th>
              <th className="p-4">النتيجة الأولية</th>
              <th className="p-4">المراجعة</th>
              <th className="p-4 text-center">إعادة التعيين</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.length > 0 ? (
              requests.map((req) => (
                <tr key={req.eval.id} className={`hover:bg-blue-50 transition-colors ${resetDone === req.inst.id ? 'bg-green-50' : ''}`}>
                  <td className="p-4 font-bold text-navy-900">{req.inst.name}</td>
                  <td className="p-4 text-gray-500 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      {new Date(req.eval.submission_date!).toLocaleDateString('ar-OM')}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-sm font-bold ${Number(req.score) >= 4 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {req.score} / 5.0
                    </span>
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => handleView(req.inst.id)}
                      className="flex items-center gap-2 text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-bold text-sm transition-colors"
                    >
                      <Eye size={16} /> معاينة ومراجعة
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    {resetDone === req.inst.id ? (
                      <span className="flex items-center justify-center gap-1 text-green-600 text-xs font-bold">
                        <CheckCircle size={14} /> تم الإعادة
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmResetId(req.inst.id)}
                        title="إعادة تعيين بيانات المؤسسة للبداية"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors"
                      >
                        <RotateCcw size={13} /> إعادة تعيين
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-400">
                  {loading ? 'جاري التحميل...' : 'لا توجد طلبات اعتماد معلقة حالياً'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* نافذة تأكيد إعادة التعيين */}
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
            <p className="text-gray-700 text-sm mb-2 leading-relaxed">سيتم مسح جميع بيانات هذه المؤسسة بشكل كامل:</p>
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
  );
};

export default ApprovalRequests;
