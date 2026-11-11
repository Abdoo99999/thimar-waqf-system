
import React, { useState, useEffect, useMemo } from 'react';
import { getInstitutions, getIndicators, saveIndicators, getEvaluationByInstAndYear, saveEvaluation, getResponses, saveResponse, generateId, getInstitutionProgress, uploadFile, deleteFile } from '../services/db';
import AttachmentLink, { ATTACHMENT_ACCEPT } from '../components/AttachmentLink';
import { Institution, Indicator, Evaluation, Response, InstitutionDocument } from '../types';
import { CURRENT_YEAR, RATING_COLORS } from '../constants';
import { Upload, Save, ChevronDown, ChevronUp, Paperclip, FileText, X, PlusCircle, PieChart as PieIcon, Trash2, MinusCircle, Building, SaveAll, Lock, CheckCircle2, Circle, Scale, Briefcase, ShieldCheck, Lightbulb, Globe, Layout, ChevronRight } from 'lucide-react';
import { useUi } from '../contexts/UiContext';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

declare const XLSX: any; // SheetJS global

// Map Axis names to Icons
const AXIS_ICONS: Record<string, any> = {
    'الشرعي': Scale,
    'الإجراءات الإدارية والمالية': Briefcase,
    'الحوكمة': ShieldCheck,
    'الابتكار والتطوير': Lightbulb,
    'الاستدامة': Globe,
    'default': Layout
};

const EvaluationPage: React.FC = () => {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const { showToast, currentWaqfId, role } = useUi();
  
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [responses, setResponses] = useState<Record<string, Response>>({});
  
  // Locking State
  const [isLocked, setIsLocked] = useState(false);

  // UI State
  const [openAxis, setOpenAxis] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(false);

  // Modals State
  const [showAddInd, setShowAddInd] = useState(false);
  const [newIndAxis, setNewIndAxis] = useState('');
  const [customAxis, setCustomAxis] = useState('');
  const [newIndText, setNewIndText] = useState('');
  
  const [showDeleteInd, setShowDeleteInd] = useState(false);
  const [deleteAxis, setDeleteAxis] = useState('');
  const [deleteIndId, setDeleteIndId] = useState('');


  useEffect(() => {
    setInstitutions(getInstitutions());
    const inds = getIndicators();
    setIndicators(inds);
    // Open first axis by default if exists
    if (inds.length > 0) {
        setOpenAxis(inds[0].axis);
    }
  }, []);

  useEffect(() => {
    if (currentWaqfId && indicators.length > 0) {
      const progress = getInstitutionProgress(currentWaqfId);
      setIsLocked(progress.isLocked);

      let ev = getEvaluationByInstAndYear(currentWaqfId, CURRENT_YEAR);
      if (!ev) {
        ev = {
          id: generateId(),
          institution_id: currentWaqfId,
          cycle_year: CURRENT_YEAR,
          cycle_date: new Date().toISOString(),
          status: 'draft',
          workflow_status: 'draft',
          attachments: [],
          created_at: new Date().toISOString()
        };
        saveEvaluation(ev);
      }
      setEvaluation(ev);
      
      const resps = getResponses(ev.id);
      const respMap: Record<string, Response> = {};
      resps.forEach(r => respMap[r.indicator_id] = r);
      setResponses(respMap);
    } else {
      setEvaluation(null);
    }
  }, [currentWaqfId, indicators.length]);

  const handleScore = (indicatorId: string, score: number) => {
    if (!evaluation || isLocked) return;
    const existingResp = responses[indicatorId];
    const newResp: Response = {
      id: existingResp?.id || generateId(),
      evaluation_id: evaluation.id,
      indicator_id: indicatorId,
      score,
      evidence_doc: existingResp?.evidence_doc,
      updated_at: new Date().toISOString()
    };
    
    setResponses(prev => ({ ...prev, [indicatorId]: newResp }));
    saveResponse(newResp);
  };

  // --- CRUD Handlers (Add/Delete/Import) same as before ---
  const handleAddIndicator = () => {
      const finalAxis = newIndAxis === 'NEW_AXIS_CUSTOM_VALUE' ? customAxis : newIndAxis;
      if(!newIndText || !finalAxis) { showToast('يرجى تعبئة جميع الحقول', 'error'); return; }
      const indicator: Indicator = { id: `IND-MANUAL-${generateId().substring(0,6)}`, axis: finalAxis, text: newIndText, weight: 1, active: true };
      const updatedList = [...indicators, indicator];
      setIndicators(updatedList);
      saveIndicators(updatedList);
      setShowAddInd(false); setNewIndAxis(''); setCustomAxis(''); setNewIndText('');
      showToast('تم إضافة المؤشر الجديد بنجاح', 'success');
  };

  const handleDeleteIndicator = () => {
      if (!deleteIndId) { showToast('يرجى اختيار المؤشر للحذف', 'error'); return; }
      if(confirm('هل أنت متأكد من حذف هذا المؤشر؟')) {
          const updatedList = indicators.filter(i => i.id !== deleteIndId);
          setIndicators(updatedList);
          saveIndicators(updatedList);
          setShowDeleteInd(false); setDeleteIndId(''); setDeleteAxis('');
          showToast('تم حذف المؤشر', 'info');
      }
  };

  const handleEvidenceUpload = async (indicatorId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      if (isLocked || !evaluation) return;
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          try {
          const newDoc = await uploadFile(file, currentWaqfId);
          
          const existingResp = responses[indicatorId] || {
              id: generateId(),
              evaluation_id: evaluation.id,
              indicator_id: indicatorId,
              score: 0,
              updated_at: new Date().toISOString()
          };

          const newResp: Response = {
              ...existingResp,
              evidence_doc: newDoc,
              updated_at: new Date().toISOString()
          };
          
          await saveResponse(newResp);
          setResponses(prev => ({ ...prev, [indicatorId]: newResp }));
          showToast('تم إرفاق الدليل بنجاح', 'success');
          } catch (err: any) {
              showToast(err.message, 'error');
          }
      }
  };

  const removeEvidence = async (indicatorId: string) => {
      if (isLocked || !evaluation) return;
      const existingResp = responses[indicatorId];
      if (!existingResp) return;
      try {
      if (existingResp.evidence_doc?.file_id) await deleteFile(existingResp.evidence_doc.file_id);

      const newResp: Response = {
          ...existingResp,
          evidence_doc: undefined,
          updated_at: new Date().toISOString()
      };
      
      await saveResponse(newResp);
      setResponses(prev => ({ ...prev, [indicatorId]: newResp }));
      showToast('تم حذف المرفق', 'info');
      } catch (err: any) {
          showToast(err.message, 'error');
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isLocked) return;
      if (e.target.files && e.target.files[0] && evaluation) {
          const file = e.target.files[0];
          try {
          const newDoc = await uploadFile(file, currentWaqfId);
          const updatedEval = { ...evaluation, attachments: [...(evaluation.attachments || []), newDoc] };
          await saveEvaluation(updatedEval);
          setEvaluation(updatedEval);
          showToast('تم إرفاق الدليل بنجاح', 'success');
          } catch (err: any) {
              showToast(err.message, 'error');
          }
      }
  };

  const removeAttachment = async (docId: string) => {
      if (!evaluation || isLocked) return;
      try {
      const doc = evaluation.attachments?.find(d => d.id === docId);
      if (doc?.file_id) await deleteFile(doc.file_id);
      const updatedEval = { ...evaluation, attachments: evaluation.attachments?.filter(d => d.id !== docId) || [] };
      await saveEvaluation(updatedEval);
      setEvaluation(updatedEval);
      showToast('تم حذف المرفق', 'info');
      } catch (err: any) {
          showToast(err.message, 'error');
      }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data: any[] = XLSX.utils.sheet_to_json(ws);
      if (confirm('سيتم استبدال المؤشرات الحالية بالمؤشرات الجديدة. هل أنت متأكد؟')) {
          const newIndicators: Indicator[] = data.map((row, idx) => ({
            id: `IND-${idx + 1}`,
            axis: row['المحور'] || 'عام',
            text: row['وصف التقييم'] || row['Indicator'] || 'بدون نص',
            weight: 1,
            active: true
          })).filter(i => i.text !== 'بدون نص');
          if(newIndicators.length > 0) {
              saveIndicators(newIndicators);
              setIndicators(newIndicators);
              showToast(`تم استيراد ${newIndicators.length} مؤشر بنجاح`, 'success');
          } else { showToast('لم يتم العثور على بيانات صالحة.', 'error'); }
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleFinalSave = () => {
      if (isLocked) return;
      const missingIndicators = indicators.filter(ind => !responses[ind.id]);
      if (missingIndicators.length > 0) {
          showToast(`عذراً، يجب إكمال تقييم ${missingIndicators.length} مؤشر متبقي.`, 'error');
          return;
      }

      const missingEvidence = indicators.filter(ind => {
          const score = responses[ind.id]?.score;
          return (score === 4 || score === 5) && !responses[ind.id]?.evidence_doc;
      });

      if (missingEvidence.length > 0) {
          showToast(`عذراً، يجب إرفاق دليل للمؤشرات الحاصلة على تقييم 4 أو 5 (${missingEvidence.length} مؤشر متبقي).`, 'error');
          return;
      }

      if (evaluation) {
          const updatedEval = { ...evaluation, status: 'final' as const };
          setEvaluation(updatedEval);
          saveEvaluation(updatedEval);
          showToast('تم اعتماد الأداء المؤسسي النهائي بنجاح', 'success');
      }
  };

  // --- Grouping & Calculations ---
  const grouped = useMemo(() => {
    return indicators.reduce((acc, curr) => {
        if (!acc[curr.axis]) acc[curr.axis] = [];
        acc[curr.axis].push(curr);
        return acc;
    }, {} as Record<string, Indicator[]>);
  }, [indicators]);
  
  const availableAxes = Object.keys(grouped);

  const responseValues = Object.values(responses) as Response[];
  const performanceData = [
      { name: 'منخفض (1-2)', value: responseValues.filter(r => r.score <= 2).length, fill: '#ef4444' },
      { name: 'متوسط (3)', value: responseValues.filter(r => r.score === 3).length, fill: '#f59e0b' },
      { name: 'مرتفع (4-5)', value: responseValues.filter(r => r.score >= 4).length, fill: '#10b981' },
  ].filter(d => d.value > 0);

  const currentInstitutionName = institutions.find(i => i.id === currentWaqfId)?.name;
  
  // Toggle All Logic
  const handleToggleAll = () => {
      setExpandAll(!expandAll);
      setOpenAxis(expandAll ? null : 'ALL');
  };

  return (
    <div className="space-y-8 relative pb-24">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-navy-900">الأداء المؤسسي</h2>
            {isLocked && <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Lock size={12}/> للقراءة فقط</span>}
        </div>
        
        {/* Admin Tools */}
        {role === 'admin' && !isLocked && (
          <div className="flex gap-2">
              <button onClick={() => { setNewIndAxis(availableAxes[0] || 'عام'); setShowAddInd(true); }} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50 shadow-sm transition-transform hover:scale-105 active:scale-95 text-sm font-bold">
                  <PlusCircle size={16} /> إضافة مؤشر
              </button>
              <button onClick={() => { setDeleteAxis(''); setDeleteIndId(''); setShowDeleteInd(true); }} className="bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-50 shadow-sm transition-transform hover:scale-105 active:scale-95 text-sm font-bold">
                  <MinusCircle size={16} /> حذف مؤشر
              </button>
              <label className="bg-navy-800 text-white px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 hover:bg-navy-900 shadow-md transition-transform hover:scale-105 active:scale-95 text-sm font-bold">
                  <Upload size={16} /> استيراد (Excel)
                  <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelImport} />
              </label>
          </div>
        )}
      </div>

      {/* INSTITUTION BANNER */}
      {currentWaqfId ? (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between text-blue-900 animate-fadeIn transition-all hover:shadow-md">
              <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg"><Building size={20} className="text-blue-700"/></div>
                  <div>
                      <div className="text-xs text-blue-600 uppercase font-bold tracking-wider">جاري تقييم:</div>
                      <div className="text-lg font-bold">{currentInstitutionName} ({CURRENT_YEAR})</div>
                  </div>
              </div>
              <button 
                onClick={handleToggleAll} 
                className="text-sm font-bold text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                  {expandAll ? 'طي الكل' : 'توسيع الكل'}
              </button>
          </div>
      ) : (
          <div className="bg-orange-50 border border-orange-200 p-6 rounded-xl text-center">
              <p className="text-orange-800 font-bold mb-2">لم يتم اختيار مؤسسة</p>
              <p className="text-sm text-orange-600">يرجى اختيار المؤسسة لبدء تقييم الأداء المؤسسي.</p>
          </div>
      )}
      
      {/* MODALS (Add/Delete) - Preserved */}
      {showAddInd && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl animate-scaleIn">
                  <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold">إضافة مؤشر جديد</h3><button onClick={() => setShowAddInd(false)}><X size={20}/></button></div>
                  <div className="space-y-4">
                      <div><label className="block text-sm font-medium mb-1">المحور</label><select className="w-full border p-2 rounded" value={newIndAxis} onChange={e => setNewIndAxis(e.target.value)}>{availableAxes.map(a => <option key={a} value={a}>{a}</option>)}<option value="NEW_AXIS_CUSTOM_VALUE">محور جديد</option></select>{newIndAxis === 'NEW_AXIS_CUSTOM_VALUE' && <input type="text" placeholder="اسم المحور" className="w-full border p-2 rounded mt-2" value={customAxis} onChange={e => setCustomAxis(e.target.value)} />}</div>
                      <div><label className="block text-sm font-medium mb-1">نص المؤشر</label><textarea className="w-full border p-2 rounded h-24" value={newIndText} onChange={e => setNewIndText(e.target.value)}></textarea></div>
                  </div>
                  <div className="flex justify-end gap-2 mt-6"><button onClick={() => setShowAddInd(false)} className="px-4 py-2 bg-gray-100 rounded">إلغاء</button><button onClick={handleAddIndicator} className="px-4 py-2 bg-navy-800 text-white rounded">إضافة</button></div>
              </div>
          </div>
      )}
      {showDeleteInd && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl animate-scaleIn">
                  <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold text-red-600">حذف مؤشر</h3><button onClick={() => setShowDeleteInd(false)}><X size={20}/></button></div>
                  <div className="space-y-4">
                      <div><label className="block text-sm font-medium mb-1">المحور</label><select className="w-full border p-2 rounded" value={deleteAxis} onChange={e => { setDeleteAxis(e.target.value); setDeleteIndId(''); }}><option value="">-- اختر --</option>{availableAxes.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
                      {deleteAxis && <div><label className="block text-sm font-medium mb-1">اختر المؤشر</label><select className="w-full border p-2 rounded" value={deleteIndId} onChange={e => setDeleteIndId(e.target.value)}><option value="">-- اختر --</option>{grouped[deleteAxis]?.map(ind => <option key={ind.id} value={ind.id}>{ind.text.substring(0, 60)}...</option>)}</select></div>}
                  </div>
                  <div className="flex justify-end gap-2 mt-6"><button onClick={() => setShowDeleteInd(false)} className="px-4 py-2 bg-gray-100 rounded">إلغاء</button><button onClick={handleDeleteIndicator} disabled={!deleteIndId} className={`px-4 py-2 text-white rounded ${!deleteIndId ? 'bg-gray-300' : 'bg-red-600'}`}>حذف</button></div>
              </div>
          </div>
      )}

      {/* MAIN CONTENT: AXES LIST */}
      {currentWaqfId && indicators.length > 0 && (
        <div className="space-y-6 animate-fadeIn">
          {Object.keys(grouped).map((axis, idx) => {
            const axisIndicators = grouped[axis];
            const completedCount = axisIndicators.filter(i => responses[i.id]).length;
            const totalCount = axisIndicators.length;
            const progressPercent = Math.round((completedCount / totalCount) * 100);
            const isAxisComplete = completedCount === totalCount && totalCount > 0;
            const isOpen = openAxis === axis || openAxis === 'ALL';
            
            const AxisIcon = AXIS_ICONS[axis] || AXIS_ICONS['default'];

            return (
                <div key={axis} className={`bg-white rounded-2xl border transition-all duration-300 shadow-sm overflow-hidden ${isAxisComplete ? 'border-teal-200' : 'border-gray-200 hover:shadow-md'}`}>
                    
                    {/* AXIS HEADER */}
                    <button 
                        onClick={() => setOpenAxis(isOpen && openAxis !== 'ALL' ? null : axis)}
                        className={`w-full flex flex-col md:flex-row md:items-center justify-between p-5 transition-colors ${isOpen ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'}`}
                    >
                        {/* Title Section */}
                        <div className="flex items-center gap-4 mb-3 md:mb-0">
                            {/* Number Badge */}
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-sm ${isAxisComplete ? 'bg-teal-100 text-teal-700' : 'bg-navy-900 text-white'}`}>
                                {idx + 1}
                            </div>
                            
                            <div className="text-right">
                                <h3 className={`text-lg font-bold flex items-center gap-2 ${isAxisComplete ? 'text-teal-800' : 'text-navy-900'}`}>
                                    <AxisIcon size={20} className="opacity-80"/>
                                    {axis}
                                </h3>
                                <p className="text-xs text-gray-500 font-medium mt-0.5 flex items-center gap-2">
                                    {totalCount} مؤشرات قياس
                                    {isAxisComplete && <span className="text-teal-600 flex items-center gap-1 font-bold"><CheckCircle2 size={12}/> مكتمل بالكامل</span>}
                                </p>
                            </div>
                        </div>

                        {/* Progress Section */}
                        <div className="flex items-center gap-6 w-full md:w-auto">
                            <div className="flex-1 md:w-48">
                                <div className="flex justify-between text-xs mb-1 font-bold">
                                    <span className={isAxisComplete ? 'text-teal-600' : 'text-gray-500'}>{progressPercent}% إنجاز</span>
                                    <span className="text-gray-400">{completedCount} من {totalCount}</span>
                                </div>
                                <div className="h-2.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-1000 ${isAxisComplete ? 'bg-teal-500' : 'bg-blue-500'}`} 
                                        style={{ width: `${progressPercent}%` }}
                                    ></div>
                                </div>
                            </div>
                            <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                                <ChevronDown className="text-gray-400" />
                            </div>
                        </div>
                    </button>

                    {/* INDICATORS LIST */}
                    {isOpen && (
                        <div className="border-t border-gray-100 bg-white">
                            {axisIndicators.map((ind, i) => {
                                const globalIndex = indicators.findIndex(x => x.id === ind.id) + 1;
                                const currentScore = responses[ind.id]?.score;

                                return (
                                    <div key={ind.id} className={`p-6 border-b border-gray-100 last:border-0 transition-colors ${currentScore ? 'bg-blue-50/20' : 'hover:bg-gray-50'}`}>
                                        <div className="flex flex-col md:flex-row gap-6">
                                            {/* Question Text */}
                                            <div className="flex-1">
                                                <div className="flex gap-3">
                                                    <span className="text-teal-600 font-black text-lg min-w-[30px]">{globalIndex}.</span>
                                                    <div>
                                                        <p className="text-gray-900 font-bold text-lg leading-relaxed">{ind.text}</p>
                                                        {currentScore && <span className="inline-block mt-2 text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full animate-fadeIn">تم التقييم: {currentScore} / 5</span>}
                                                        
                                                        {/* Evidence Upload Section */}
                                                        {(currentScore === 4 || currentScore === 5 || responses[ind.id]?.evidence_doc) && (
                                                            <div className="mt-4 bg-orange-50 border border-orange-200 p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
                                                                <div className="flex items-center gap-2 text-orange-800">
                                                                    <Paperclip size={16} />
                                                                    <span className="text-sm font-bold">مرفق إلزامي (دليل الأداء المؤسسي)</span>
                                                                </div>
                                                                {responses[ind.id]?.evidence_doc ? (
                                                                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-md border border-orange-200">
                                                                        <FileText size={14} className="text-gray-500" />
                                                                        <AttachmentLink doc={responses[ind.id].evidence_doc!} />
                                                                        {!isLocked && (
                                                                            <button onClick={() => removeEvidence(ind.id)} className="text-red-500 hover:text-red-700 mr-2">
                                                                                <X size={14} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <label className={`cursor-pointer bg-white border border-orange-300 text-orange-700 hover:bg-orange-100 px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                                        إرفاق ملف
                                                                        <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => handleEvidenceUpload(ind.id, e)} disabled={isLocked} />
                                                                    </label>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Rating Buttons */}
                                            <div className="flex items-center justify-center md:justify-end gap-3 shrink-0 py-2">
                                                {[1, 2, 3, 4, 5].map(score => (
                                                    <button
                                                        key={score}
                                                        onClick={() => handleScore(ind.id, score)}
                                                        disabled={isLocked}
                                                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold border-2 transition-all duration-200 transform ${
                                                            responses[ind.id]?.score === score
                                                                ? `${RATING_COLORS[score]} scale-110 shadow-lg ring-2 ring-offset-2 ring-gray-200`
                                                                : 'bg-white text-gray-400 border-gray-200 ' + (isLocked ? 'cursor-not-allowed opacity-50' : 'hover:border-gray-400 hover:text-gray-600 hover:scale-105')
                                                        }`}
                                                    >
                                                        {score}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
          })}
        </div>
      )}

      {/* FIXED FOOTER BAR */}
      <div className="fixed bottom-0 left-0 right-0 lg:right-64 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-40 px-6 py-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 max-w-6xl mx-auto">
             
             {/* Left: Stats */}
             <div className="flex items-center gap-6 w-full md:w-auto">
                 <div className="hidden md:flex items-center gap-3 pr-4 border-r border-gray-200">
                    <div className="w-10 h-10">
                        <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={performanceData} dataKey="value" innerRadius={12} outerRadius={20} stroke="none">{performanceData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie></PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 font-bold block">مؤشر الإجابات</span>
                        <div className="text-[10px] text-gray-400 flex gap-1">
                            {performanceData.map(d => <span key={d.name} style={{color: d.fill}}>● {d.value}</span>)}
                        </div>
                    </div>
                 </div>

                 <div className="flex-1">
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-sm font-bold text-navy-900">التقدم الكلي</span>
                        <span className="text-sm font-bold text-teal-600">{Object.keys(responses).length} / {indicators.length}</span>
                    </div>
                    <div className="w-full md:w-64 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-navy-800 transition-all duration-500" style={{ width: `${(Object.keys(responses).length / indicators.length) * 100}%` }}></div>
                    </div>
                 </div>
             </div>

             {/* Right: Actions */}
             <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                 <label className={`cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold transition-all ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                     <Paperclip size={18} /> <span className="hidden sm:inline">أدلة</span>
                     <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleFileUpload} disabled={isLocked} />
                 </label>

                 {!isLocked && (
                    <button onClick={() => showToast('تم حفظ التغييرات كمسودة', 'info')} className="bg-gray-100 hover:bg-gray-200 text-navy-800 px-4 py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm transition-all">
                        <SaveAll size={18} /> <span className="hidden sm:inline">مسودة</span>
                    </button>
                 )}

                 {!isLocked && (
                    <button onClick={handleFinalSave} className="bg-gradient-to-r from-teal-600 to-teal-700 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 hover:shadow-lg hover:-translate-y-0.5 transition-all font-bold text-sm">
                        <Save size={18} /> حفظ واعتماد
                    </button>
                 )}
             </div>
          </div>
          
          {/* Attachments Mini-View */}
          {evaluation?.attachments && evaluation.attachments.length > 0 && (
             <div className="absolute bottom-full left-0 right-0 bg-gray-50 border-t border-gray-200 p-2 px-6 flex items-center gap-4 overflow-x-auto">
                 <span className="text-xs font-bold text-gray-500 flex items-center gap-1 shrink-0"><Paperclip size={12}/> المرفقات:</span>
                 {evaluation.attachments.map(doc => (
                     <div key={doc.id} className="bg-white border border-gray-200 px-2 py-1 rounded text-xs flex items-center gap-2 shrink-0 shadow-sm">
                         <AttachmentLink doc={doc} />
                         <button onClick={() => removeAttachment(doc.id)} disabled={isLocked} className="text-red-400 hover:text-red-600"><X size={12}/></button>
                     </div>
                 ))}
             </div>
          )}
      </div>

    </div>
  );
};

export default EvaluationPage;
