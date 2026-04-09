
import React, { useState, useEffect } from 'react';
import { useUi } from '../contexts/UiContext';
import { getInstitutionProgress, getEvaluationByInstAndYear, saveEvaluation } from '../services/db';
import { CURRENT_YEAR } from '../constants';
import { CheckCircle2, Circle, AlertCircle, Send, Lock, ArrowRight, FileText, Scale, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ReviewSubmit: React.FC = () => {
  const { currentWaqfId, showToast } = useUi();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (currentWaqfId) {
      const prog = getInstitutionProgress(currentWaqfId);
      setProgress(prog);
      const ev = getEvaluationByInstAndYear(currentWaqfId, CURRENT_YEAR);
      setEvaluation(ev);
    }
  }, [currentWaqfId]);

  const handleSubmit = () => {
    if (!evaluation) return;
    
    const updatedEval = {
      ...evaluation,
      workflow_status: 'submitted',
      submission_date: new Date().toISOString()
    };
    
    saveEvaluation(updatedEval);
    setShowConfirm(false);
    showToast('تم إرسال الأداء المؤسسي النهائي للوزارة بنجاح', 'success');
    
    // Refresh local state
    setProgress(getInstitutionProgress(currentWaqfId));
    setEvaluation(updatedEval);
  };

  if (!currentWaqfId) return <div className="p-8 text-center text-gray-500">يرجى اختيار مؤسسة</div>;
  if (!progress) return <div className="p-8">جاري التحميل...</div>;

  const isReady = progress.dataComplete && progress.evalFinalized && progress.complianceDone;
  const isSubmitted = evaluation?.workflow_status === 'submitted';
  const isApproved = evaluation?.workflow_status === 'approved';
  const isReturned = evaluation?.workflow_status === 'returned';

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold text-navy-900">المراجعة والإرسال</h2>
      </div>

      {/* Status Banner */}
      <div className={`p-6 rounded-xl border ${
          isApproved ? 'bg-green-50 border-green-200 text-green-800' :
          isSubmitted ? 'bg-blue-50 border-blue-200 text-blue-800' :
          isReturned ? 'bg-red-50 border-red-200 text-red-800' :
          'bg-gray-50 border-gray-200 text-gray-800'
      }`}>
          <div className="flex items-start gap-4">
             <div className="p-2 bg-white rounded-full shadow-sm shrink-0">
                 {isApproved ? <CheckCircle2 size={24} className="text-green-600"/> :
                  isSubmitted ? <Lock size={24} className="text-blue-600"/> :
                  isReturned ? <AlertCircle size={24} className="text-red-600"/> :
                  <Activity size={24} className="text-gray-400"/>
                 }
             </div>
             <div>
                 <h3 className="text-lg font-bold mb-1">
                     {isApproved ? 'تم اعتماد الأداء المؤسسي النهائي' :
                      isSubmitted ? 'الملف قيد المراجعة لدى الوزارة' :
                      isReturned ? 'تم إعادة الملف للتعديل' :
                      'مسودة - جاهز للمراجعة'}
                 </h3>
                 <p className="text-sm opacity-80">
                     {isApproved ? 'تهانينا، تم اعتماد تقييم المؤسسة لهذا العام بنجاح.' :
                      isSubmitted ? 'لا يمكن تعديل البيانات حالياً حتى تكتمل عملية المراجعة.' :
                      isReturned ? `سبب الإعادة: ${evaluation?.admin_feedback || 'يرجى مراجعة البيانات'}` :
                      'يرجى التأكد من اكتمال كافة الأقسام أدناه قبل الإرسال النهائي.'}
                 </p>
             </div>
          </div>
      </div>

      {/* Checklist */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 bg-gray-50 border-b font-bold text-gray-700">قائمة التحقق قبل الإرسال</div>
          <div className="divide-y divide-gray-100">
              <CheckItem 
                label="بيانات المؤسسة" 
                sub="اكتمال الملف التعريفي والوثائق" 
                isDone={progress.dataComplete} 
                icon={FileText}
                link="/institutions"
              />
              <CheckItem 
                label="الأداء المؤسسي الذاتي" 
                sub="الإجابة على جميع المؤشرات والاعتماد المبدئي" 
                isDone={progress.evalFinalized} 
                icon={Activity}
                link="/evaluation"
              />
              <CheckItem 
                label="الامتثال والمخاطر" 
                sub="تعبئة سجل الامتثال وسجل المخاطر" 
                isDone={progress.complianceDone} 
                icon={Scale}
                link="/compliance"
              />
          </div>
      </div>

      {/* Actions */}
      {!isSubmitted && !isApproved && (
          <div className="flex justify-end pt-4">
              <button 
                disabled={!isReady}
                onClick={() => setShowConfirm(true)}
                className={`flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-transform active:scale-95 ${
                    isReady ? 'bg-navy-800 text-white hover:bg-navy-900' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                  <Send size={20} /> إرسال الأداء المؤسسي النهائي للوزارة
              </button>
          </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-8 max-w-md w-full animate-scaleIn text-center">
                  <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6">
                      <AlertCircle size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-navy-900 mb-2">تأكيد الإرسال النهائي</h3>
                  <p className="text-gray-600 mb-8 leading-relaxed">
                      هل أنت متأكد؟ عند الإرسال سيتم اعتماد البيانات وإغلاق إمكانية التعديل وانتقال الملف للمراجعة من قبل الوزارة.
                  </p>
                  <div className="flex gap-3">
                      <button onClick={() => setShowConfirm(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">إلغاء</button>
                      <button onClick={handleSubmit} className="flex-1 py-3 bg-navy-800 text-white rounded-xl font-bold hover:bg-navy-900">نعم، إرسال</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

const CheckItem = ({ label, sub, isDone, icon: Icon, link }: any) => {
    const navigate = useNavigate();
    return (
        <div className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg ${isDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    <Icon size={20} />
                </div>
                <div>
                    <h4 className={`font-bold ${isDone ? 'text-gray-900' : 'text-gray-500'}`}>{label}</h4>
                    <p className="text-xs text-gray-500">{sub}</p>
                </div>
            </div>
            <div className="flex items-center gap-4">
                {isDone ? 
                    <div className="flex items-center gap-1 text-green-600 text-sm font-bold bg-green-50 px-3 py-1 rounded-full">
                        <CheckCircle2 size={16} /> مكتمل
                    </div> 
                    : 
                    <button onClick={() => navigate(link)} className="flex items-center gap-1 text-blue-600 text-sm font-bold hover:underline">
                        إكمال <ArrowRight size={14} />
                    </button>
                }
            </div>
        </div>
    );
};

export default ReviewSubmit;
