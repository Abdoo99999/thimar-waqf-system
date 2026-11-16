
import React, { useState, useEffect, useCallback } from 'react';
import { getInstitutions, getEvaluations, getResponses, getIndicators, refreshData } from '../services/db';
import { Institution, Evaluation } from '../types';
import { scoreResponses, formatScore } from '../utils/score';
import { Eye, Clock, RefreshCw } from 'lucide-react';
import { useUi } from '../contexts/UiContext';
import { useNavigate } from 'react-router-dom';

const ApprovalRequests: React.FC = () => {
  const [requests, setRequests] = useState<{inst: Institution, eval: Evaluation, score: string, good: boolean}[]>([]);
  const [loading, setLoading] = useState(false);
  const { setWaqfContext, showToast } = useUi();
  const navigate = useNavigate();

  // كل الطلبات المرفوعة بانتظار الاعتماد، من أي دورة (لا تختفي طلبات دورة سابقة)
  const buildList = useCallback(() => {
    const allInsts = getInstitutions();
    const axis = new Map(getIndicators().map(i => [i.id, i.axis] as const));
    const result = getEvaluations().filter(e => e.workflow_status === 'submitted').map(e => {
        const inst = allInsts.find(i => i.id === e.institution_id);
        const sc = scoreResponses(getResponses(e.id), id => axis.get(id));
        return inst ? { inst, eval: e, score: formatScore(sc), good: sc.avg >= 4 } : null;
    }).filter(Boolean) as {inst: Institution, eval: Evaluation, score: string, good: boolean}[];
    result.sort((a, b) => (a.eval.submission_date || '').localeCompare(b.eval.submission_date || ''));
    setRequests(result);
  }, []);

  // زر التحديث يجلب أحدث البيانات من الخادم فعلاً
  const loadRequests = useCallback(async () => {
    setLoading(true);
    try { await refreshData(); window.dispatchEvent(new Event('badgesChanged')); }
    catch { showToast('تعذر تحديث البيانات، تحقق من الاتصال', 'error'); }
    buildList();
    setLoading(false);
  }, [buildList]);

  useEffect(() => {
    buildList();
    loadRequests();
  }, [buildList, loadRequests]);

  const handleView = (id: string) => {
    setWaqfContext(id);
    showToast('تم الانتقال للمؤسسة للمراجعة', 'info');
    navigate('/reports');
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-navy-900">طلبات الاعتماد الواردة</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-bold whitespace-nowrap">
            {requests.length} طلب معلق
          </span>
          <button
            onClick={loadRequests}
            disabled={loading}
            title="تحديث القائمة"
            aria-label="تحديث القائمة"
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-bold transition-colors"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
        </div>
      </div>

      {/* الجوال: بطاقات بدل الجدول */}
      <div className="md:hidden space-y-3">
        {requests.length > 0 ? requests.map(req => (
          <div key={req.eval.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="font-bold text-navy-900">{req.inst.name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-gray-500"><Clock size={14} />{req.eval.submission_date ? new Date(req.eval.submission_date).toLocaleDateString('ar-OM-u-nu-latn') : '—'}</span>
              <span className={`px-2 py-0.5 rounded font-bold ${req.good ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{req.score}</span>
              <span className="text-xs text-gray-500">دورة {req.eval.cycle_year}</span>
            </div>
            <button onClick={() => handleView(req.inst.id)} className="mt-3 w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm">
              <Eye size={16} /> معاينة ومراجعة
            </button>
          </div>
        )) : (
          <p className="rounded-xl bg-white p-8 text-center text-sm text-gray-400">{loading ? 'جاري التحميل...' : 'لا توجد طلبات اعتماد معلقة حالياً'}</p>
        )}
      </div>

      <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-right min-w-[480px]">
          <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
            <tr>
              <th className="p-4">المؤسسة</th>
              <th className="p-4">تاريخ الإرسال</th>
              <th className="p-4">النتيجة الأولية</th>
              <th className="p-4">المراجعة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {requests.length > 0 ? (
              requests.map((req) => (
                <tr key={req.eval.id} className="hover:bg-blue-50 transition-colors">
                  <td className="p-4 font-bold text-navy-900">{req.inst.name}<span className="mr-2 text-xs font-normal text-gray-500">دورة {req.eval.cycle_year}</span></td>
                  <td className="p-4 text-gray-500 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      {req.eval.submission_date ? new Date(req.eval.submission_date).toLocaleDateString('ar-OM-u-nu-latn') : '—'}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-sm font-bold ${req.good ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {req.score}
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
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="p-10 text-center text-gray-400">
                  {loading ? 'جاري التحميل...' : 'لا توجد طلبات اعتماد معلقة حالياً'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

    </div>
  );
};

export default ApprovalRequests;
