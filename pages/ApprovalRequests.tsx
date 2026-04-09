
import React, { useState, useEffect } from 'react';
import { getInstitutions, getEvaluations, getResponses } from '../services/db';
import { Institution, Evaluation } from '../types';
import { CURRENT_YEAR } from '../constants';
import { Eye, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUi } from '../contexts/UiContext';
import { useNavigate } from 'react-router-dom';

const ApprovalRequests: React.FC = () => {
  const [requests, setRequests] = useState<{inst: Institution, eval: Evaluation, score: string}[]>([]);
  const { setWaqfContext, showToast } = useUi();
  const navigate = useNavigate();

  useEffect(() => {
    const evals = getEvaluations(CURRENT_YEAR).filter(e => e.workflow_status === 'submitted');
    const allInsts = getInstitutions();
    const allResponses = getResponses(''); // This needs optimization in real app, but works for mock

    const data = evals.map(e => {
        const inst = allInsts.find(i => i.id === e.institution_id);
        // Calc Score
        const responses = getResponses(e.id);
        const avg = responses.length > 0 ? (responses.reduce((a,b)=>a+b.score,0) / responses.length).toFixed(1) : "0.0";
        
        return inst ? { inst, eval: e, score: avg } : null;
    }).filter(Boolean) as {inst: Institution, eval: Evaluation, score: string}[];

    setRequests(data);
  }, []);

  const handleView = (id: string) => {
      setWaqfContext(id);
      showToast('تم الانتقال للمؤسسة للمراجعة', 'info');
      navigate('/reports'); // Direct to report summary
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-navy-900">طلبات الاعتماد الواردة</h2>
        <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-bold">{requests.length} طلب معلق</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-right">
            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                <tr>
                    <th className="p-4">المؤسسة</th>
                    <th className="p-4">تاريخ الإرسال</th>
                    <th className="p-4">النتيجة الأولية</th>
                    <th className="p-4">الإجراء</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {requests.length > 0 ? (
                    requests.map((req) => (
                        <tr key={req.eval.id} className="hover:bg-blue-50 transition-colors">
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
                        </tr>
                    ))
                ) : (
                    <tr>
                        <td colSpan={4} className="p-10 text-center text-gray-400">لا توجد طلبات اعتماد معلقة حالياً</td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
};

export default ApprovalRequests;
