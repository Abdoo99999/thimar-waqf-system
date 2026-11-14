
import React, { useState, useEffect, useCallback } from 'react';
import { summarizeCompliance, getAutoChecks } from '../utils/compliance';
import { 
    getInstitutions, getEvaluations, getResponses, getIndicators, 
    getImprovements, saveImprovement, deleteImprovement, 
    getRisks, getComplianceByInstAndYear, generateId, uploadFile, deleteFile
} from '../services/db';
import AttachmentLink, { ATTACHMENT_ACCEPT } from '../components/AttachmentLink';
import { Institution, ImprovementItem, InstitutionDocument } from '../types';
import { CURRENT_YEAR } from '../constants';
import { 
    Clock, CheckCircle, AlertTriangle, Building, 
    ArrowRight, ArrowLeft, Trash2, Layout, Activity, ShieldAlert, Scale,
    Save, Download, RefreshCw, Paperclip, FileText, X, GripVertical
} from 'lucide-react';
import { useUi } from '../contexts/UiContext';

// Declare html2pdf for TypeScript
declare const html2pdf: any;

type ColumnType = 'ToDo' | 'Doing' | 'Done';

const Improvements: React.FC = () => {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const { currentWaqfId, showToast } = useUi();
  const institutionName = getInstitutions().find(i => i.id === currentWaqfId)?.name || '';
  
  // Drag and Drop State
  const [draggedItem, setDraggedItem] = useState<ImprovementItem | null>(null);
  
  // بعد رفع التقييم: تحديث التنفيذ فقط (الحالة والأدلة)، بدون إضافة أو حذف بنود
  const currentEval = currentWaqfId ? getEvaluations().find(e => e.institution_id === currentWaqfId && e.cycle_year === CURRENT_YEAR) : undefined;
  const planLocked = currentEval?.workflow_status === 'submitted' || currentEval?.workflow_status === 'approved';

  // Kanban State
  const [columns, setColumns] = useState<{ [key in ColumnType]: ImprovementItem[] }>({
      ToDo: [],
      Doing: [],
      Done: []
  });

  useEffect(() => {
    setInstitutions(getInstitutions());
  }, []);

  const loadImprovements = useCallback(() => {
      if (!currentWaqfId) {
          setColumns({ ToDo: [], Doing: [], Done: [] });
          return [];
      }
      
      const ev = getEvaluations().find(e => e.institution_id === currentWaqfId && e.cycle_year === CURRENT_YEAR);
      const evalId = ev?.id || `TEMP_EVAL_${currentWaqfId}`;
      const items = getImprovements(evalId);
      
      setColumns({
          ToDo: items.filter(i => i.status === 'ToDo'),
          Doing: items.filter(i => i.status === 'Doing'),
          Done: items.filter(i => i.status === 'Done'),
      });
      
      return items;
  }, [currentWaqfId]);

  // Sync Logic
  const syncWithSources = useCallback((manual = false) => {
    if (!currentWaqfId) return;

    const inst = getInstitutions().find(i => i.id === currentWaqfId);

    const ev = getEvaluations().find(e => e.institution_id === currentWaqfId && e.cycle_year === CURRENT_YEAR);
    const evalId = ev?.id || `TEMP_EVAL_${currentWaqfId}`;
    
    // Get currently existing items to prevent duplicates
    const existingItems = getImprovements(evalId);
    const newItems: ImprovementItem[] = [];
    const indicators = getIndicators();

    // Helper: Check if item exists based on Source ID
    const exists = (sourceId: string) => existingItems.some(i => i.indicator_id === sourceId) || newItems.some(i => i.indicator_id === sourceId);

    // 1. Source: Performance Weaknesses (Score < 3)
    if (ev) {
        const responses = getResponses(ev.id);
        responses.filter(r => r.score < 3).forEach(r => {
            const compositeId = `PERF-${r.indicator_id}`; // Stable ID linking to source
            if (!exists(compositeId)) {
                // Find index to show "Indicator Number X"
                const indIndex = indicators.findIndex(i => i.id === r.indicator_id);
                const ind = indicators[indIndex];
                
                if (ind) {
                    const globalIndNum = indIndex + 1; // 1-based index
                    newItems.push({
                        id: generateId(),
                        evaluation_id: evalId,
                        indicator_id: compositeId,
                        priority: 'Medium',
                        issue_summary: `ضعف الأداء: ${ind.text.substring(0, 50)}...`,
                        recommended_action: `مرتبط بمؤشر رقم ${globalIndNum}`,
                        owner: 'مدير العمليات',
                        due_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
                        status: 'ToDo',
                        notes: `الدرجة الحالية: ${r.score}`
                    });
                }
            }
        });
    }

    // 2. Source: High Risks (Score >= 15)
    const risks = getRisks(currentWaqfId);
    risks.filter(r => (r.probability * r.impact) >= 15).forEach(r => {
        const compositeId = `RISK-${r.id}`;
        if (!exists(compositeId)) {
            newItems.push({
                id: generateId(),
                evaluation_id: evalId,
                indicator_id: compositeId,
                priority: 'High',
                issue_summary: `خطر حرج: ${r.risk_title}`,
                recommended_action: r.mitigation_plan || 'تفعيل خطة طوارئ عاجلة.',
                owner: 'لجنة المخاطر',
                due_date: new Date(new Date().setDate(new Date().getDate() + 14)).toISOString().split('T')[0],
                status: 'ToDo',
                notes: `شدة الخطر: ${r.probability * r.impact}`
            });
        }
    });

    // 3. Source: Compliance Gaps
    const comp = getComplianceByInstAndYear(currentWaqfId, CURRENT_YEAR);
    if (comp) {
        // فجوات الامتثال من المنطق الموحّد (نفس مفاتيح COMP- السابقة حتى لا تتكرر البنود)
        const gaps = summarizeCompliance(comp, getAutoChecks(currentWaqfId)).gaps;

        gaps.forEach(gap => {
            const compositeId = `COMP-${gap.key}`;
            if (!exists(compositeId)) {
                newItems.push({
                    id: generateId(),
                    evaluation_id: evalId,
                    indicator_id: compositeId,
                    priority: 'High',
                    issue_summary: `قصور امتثال: ${gap.label}`,
                    recommended_action: (gap.note || '').trim() || 'استيفاء المتطلب النظامي فوراً.',
                    owner: 'أمين السر / المدير',
                    due_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
                    status: 'ToDo',
                    notes: 'مطلب قانوني إلزامي'
                });
            }
        });
    }

    if (newItems.length > 0) {
        newItems.forEach(saveImprovement);
        loadImprovements(); // Refresh UI
        showToast(manual ? `تم استيراد ${newItems.length} مهام جديدة` : `تم إنشاء ${newItems.length} مهام تلقائياً`, 'success');
    } else if (manual) {
        showToast('جميع المهام محدثة، لا يوجد عناصر جديدة للاستيراد', 'info');
    }
  }, [currentWaqfId, loadImprovements, showToast]);

  // Initial Load & Auto-Sync if empty
  useEffect(() => {
    if (currentWaqfId) {
        const items = loadImprovements();
        // Only auto-sync if list is completely empty (and the plan is still editable)
        if (items.length === 0 && !planLocked) {
            syncWithSources(false);
        }
    }
  }, [currentWaqfId, loadImprovements, syncWithSources, planLocked]);

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, item: ImprovementItem) => {
      setDraggedItem(item);
      // Optional: Set drag image or data
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); // Necessary to allow dropping
  };

  const handleDrop = (e: React.DragEvent, targetStatus: ColumnType) => {
      e.preventDefault();
      
      if (!draggedItem || draggedItem.status === targetStatus) {
          setDraggedItem(null);
          return;
      }

      // --- Strict Sequential Workflow Enforcement ---
      // 1. Prevent ToDo -> Done directly
      if (draggedItem.status === 'ToDo' && targetStatus === 'Done') {
          showToast('عذراً، يجب نقل المهمة إلى "جاري المعالجة" أولاً قبل إتمامها (التسلسل إلزامي).', 'error');
          setDraggedItem(null);
          return;
      }

      // 2. Prevent Done -> ToDo directly (Optional but consistent with flow)
      if (draggedItem.status === 'Done' && targetStatus === 'ToDo') {
          showToast('عذراً، لا يمكن نقل المهمة المنجزة إلى مهام جديدة مباشرة. يرجى نقلها إلى "جاري المعالجة" أولاً.', 'error');
          setDraggedItem(null);
          return;
      }
      // ----------------------------------------------

      // Update Item logic similar to moveItem
      const updatedItem = { ...draggedItem, status: targetStatus };
      saveImprovement(updatedItem); // Persist

      // Optimistic UI Update
      setColumns(prev => {
          // Remove from old column (using the status from draggedItem before update)
          const sourceList = prev[draggedItem.status as ColumnType].filter(i => i.id !== draggedItem.id);
          // Add to new column
          const targetList = [updatedItem, ...prev[targetStatus]];
          return { ...prev, [draggedItem.status as ColumnType]: sourceList, [targetStatus]: targetList };
      });
      
      setDraggedItem(null);
  };

  // Actions
  const moveItem = (item: ImprovementItem, direction: 'forward' | 'backward') => {
      let newStatus: ColumnType = item.status;
      
      if (direction === 'forward') {
          if (item.status === 'ToDo') newStatus = 'Doing';
          else if (item.status === 'Doing') newStatus = 'Done';
      } else {
          if (item.status === 'Done') newStatus = 'Doing';
          else if (item.status === 'Doing') newStatus = 'ToDo';
      }

      if (newStatus !== item.status) {
          const updatedItem = { ...item, status: newStatus };
          saveImprovement(updatedItem); // Persist
          
          // Optimistic UI Update
          setColumns(prev => {
              const sourceList = prev[item.status].filter(i => i.id !== item.id);
              const targetList = [updatedItem, ...prev[newStatus]];
              return { ...prev, [item.status as ColumnType]: sourceList, [newStatus]: targetList };
          });
      }
  };

  const handleDelete = async (id: string, status: ColumnType) => {
      if(confirm('هل أنت متأكد من حذف هذه المهمة؟')) {
          try {
          const doc = columns[status].find(i => i.id === id)?.evidence_doc;
          if (doc?.file_id) await deleteFile(doc.file_id);
          await deleteImprovement(id);
          setColumns(prev => ({
              ...prev,
              [status]: prev[status].filter(i => i.id !== id)
          }));
          showToast('تم حذف المهمة', 'info');
          } catch (err: any) {
              showToast(err.message, 'error');
          }
      }
  };
  
  // Attach Evidence Logic
  const handleAttachEvidence = async (item: ImprovementItem, file: File) => {
      try {
      const newDoc = await uploadFile(file, currentWaqfId);
      
      const updatedItem = { ...item, evidence_doc: newDoc };
      await saveImprovement(updatedItem);
      
      // Update UI
      setColumns(prev => ({
          ...prev,
          Done: prev.Done.map(i => i.id === item.id ? updatedItem : i)
      }));
      
      showToast('تم إرفاق دليل الإنجاز بنجاح', 'success');
      } catch (err: any) {
          showToast(err.message, 'error');
      }
  };

  const handleRemoveEvidence = async (item: ImprovementItem) => {
      if(confirm('هل أنت متأكد من حذف دليل الإنجاز؟')) {
          try {
          if (item.evidence_doc?.file_id) await deleteFile(item.evidence_doc.file_id);
          const updatedItem = { ...item, evidence_doc: undefined };
          await saveImprovement(updatedItem);
          
          setColumns(prev => ({
              ...prev,
              Done: prev.Done.map(i => i.id === item.id ? updatedItem : i)
          }));
          showToast('تم حذف الدليل', 'info');
          } catch (err: any) {
              showToast(err.message, 'error');
          }
      }
  };
  
  const handleDownloadPDF = () => {
      const element = document.getElementById('kanban-board');
      if (!element) return;
      
      const opt = {
        margin:       5,
        filename:     `Improvement-Plan-${institutionName}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' } // Landscape for Kanban
      };
      
      html2pdf().from(element).set(opt).save();
  };

  const getSourceBadge = (indicatorId: string) => {
      if (indicatorId.startsWith('RISK-')) return { label: 'مخاطر', color: 'bg-red-100 text-red-800', icon: ShieldAlert };
      if (indicatorId.startsWith('COMP-')) return { label: 'امتثال', color: 'bg-purple-100 text-purple-800', icon: Scale };
      if (indicatorId.startsWith('PERF-')) return { label: 'أداء', color: 'bg-orange-100 text-orange-800', icon: Activity };
      return { label: 'يدوي', color: 'bg-gray-100 text-gray-800', icon: Activity };
  };

  return (
    <div className="space-y-6 min-h-screen">
      <div className="flex justify-between items-center no-print">
        <h2 className="text-2xl font-bold text-navy-900 dark:text-white flex items-center gap-2">
            <Layout className="text-teal-600"/> لوحة متابعة التحسين
        </h2>
        {currentWaqfId && (
            <div className="flex gap-2">
 {!planLocked && (
                <button 
                    onClick={() => syncWithSources(true)} 
                    className="bg-white border border-teal-600 text-teal-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-teal-50 shadow-sm transition-all duration-300 hover:scale-105 active:scale-95 font-bold text-sm"
                    title="سحب المهام الجديدة من الأداء المؤسسي والمخاطر والامتثال"
                >
                    <RefreshCw size={18} /> تحديث من المصادر
                </button>
                )}
                <button 
                    onClick={handleDownloadPDF} 
                    className="bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-navy-900 shadow-md transition-all duration-300 hover:scale-105 active:scale-95 font-bold text-sm"
                >
                    <Download size={18} /> تصدير PDF
                </button>
            </div>
        )}
      </div>

       {/* Banner */}
      {currentWaqfId ? (<>
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between text-blue-900 animate-fadeIn no-print mb-8 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg"><Building size={20} className="text-blue-700"/></div>
                  <div>
                      <div className="text-xs text-blue-600 uppercase font-bold tracking-wider">خطة المؤسسة:</div>
                      <div className="text-lg font-bold">{institutionName}</div>
                  </div>
              </div>
              <span className="text-xs font-bold text-blue-700 bg-white/70 rounded-full px-3 py-1">يُحفظ تلقائياً</span>
          </div>
          {planLocked && (
              <div className="no-print -mt-4 mb-6 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                  التقييم مرفوع للوزارة: يمكنك تحديث حالة تنفيذ البنود وإرفاق أدلة الإنجاز طوال السنة، دون إضافة بنود أو حذفها.
              </div>
          )}
      </>) : (
          <div className="bg-orange-50 border border-orange-200 p-6 rounded-xl text-center no-print">
              <p className="text-orange-800 font-bold mb-2">لم يتم اختيار مؤسسة</p>
              <p className="text-sm text-orange-600">يرجى اختيار مؤسسة لعرض مهام التحسين الخاصة بها.</p>
          </div>
      )}

      {currentWaqfId && (
        <div id="kanban-board" className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full items-start overflow-x-auto pb-10 bg-white/50 p-4 rounded-xl">
            {/* Column 1: To Do */}
            <KanbanColumn 
                title="مهام جديدة" 
                count={columns.ToDo.length} 
                color="border-red-400 bg-red-50 dark:bg-red-900/10"
                icon={<AlertTriangle size={18} className="text-red-600"/>}
                status="ToDo"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                {columns.ToDo.map(item => (
                    <KanbanCard 
                        key={item.id} 
                        item={item} 
                        onMoveForward={() => moveItem(item, 'forward')}
                        onDelete={planLocked ? undefined : () => handleDelete(item.id, 'ToDo')}
                        onDragStart={handleDragStart}
                        badge={getSourceBadge(item.indicator_id)}
                    />
                ))}
            </KanbanColumn>

            {/* Column 2: Doing */}
            <KanbanColumn 
                title="جاري المعالجة" 
                count={columns.Doing.length} 
                color="border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10"
                icon={<Clock size={18} className="text-yellow-600"/>}
                status="Doing"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                {columns.Doing.map(item => (
                    <KanbanCard 
                        key={item.id} 
                        item={item} 
                        onMoveBack={() => moveItem(item, 'backward')}
                        onMoveForward={() => moveItem(item, 'forward')}
                        onDelete={planLocked ? undefined : () => handleDelete(item.id, 'Doing')}
                        onDragStart={handleDragStart}
                        badge={getSourceBadge(item.indicator_id)}
                    />
                ))}
            </KanbanColumn>

            {/* Column 3: Done */}
            <KanbanColumn 
                title="تم الإنجاز" 
                count={columns.Done.length} 
                color="border-green-400 bg-green-50 dark:bg-green-900/10"
                icon={<CheckCircle size={18} className="text-green-600"/>}
                status="Done"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                {columns.Done.map(item => (
                    <KanbanCard 
                        key={item.id} 
                        item={item} 
                        onMoveBack={() => moveItem(item, 'backward')}
                        onDelete={planLocked ? undefined : () => handleDelete(item.id, 'Done')}
                        onAttachEvidence={handleAttachEvidence}
                        onRemoveEvidence={handleRemoveEvidence}
                        onDragStart={handleDragStart}
                        badge={getSourceBadge(item.indicator_id)}
                        isDone
                    />
                ))}
            </KanbanColumn>
        </div>
      )}
    </div>
  );
};

// --- Sub Components ---

const KanbanColumn = ({ title, count, children, color, icon, onDrop, onDragOver, status }: any) => (
    <div 
        className={`flex flex-col h-full min-h-[500px] rounded-xl border-t-4 ${color} bg-gray-50/50 dark:bg-gray-800 shadow-sm transition-all hover:shadow-md`}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, status)}
    >
        <div className="p-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-xl">
            <h3 className="font-bold text-navy-900 dark:text-white flex items-center gap-2">{icon} {title}</h3>
            <span className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs px-2 py-1 rounded-full font-bold">{count}</span>
        </div>
        <div className="p-3 space-y-3 flex-1 transition-colors hover:bg-opacity-50 hover:bg-gray-100/50">
            {children}
            {count === 0 && <div className="text-center py-10 text-gray-400 text-sm italic border-2 border-dashed border-gray-200 rounded-lg m-2">اسحب المهام هنا</div>}
        </div>
    </div>
);

const KanbanCard = ({ item, onMoveBack, onMoveForward, onDelete, onAttachEvidence, onRemoveEvidence, onDragStart, badge, isDone }: any) => {
    const Icon = badge.icon;
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && onAttachEvidence) {
            onAttachEvidence(item, e.target.files[0]);
        }
    };

    return (
        <div 
            draggable={true}
            onDragStart={(e) => onDragStart(e, item)}
            className={`bg-white dark:bg-gray-700 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-600 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:scale-[1.02] relative group cursor-grab active:cursor-grabbing ${isDone ? 'opacity-90 hover:opacity-100' : ''}`}
        >
            {/* Delete Button (Hidden until hover) */}
            {onDelete && (
            <button 
                onClick={onDelete} aria-label="حذف المهمة"
                className="absolute top-2 left-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity no-print hover:scale-110"
            >
                <Trash2 size={16} />
            </button>
            )}

            {/* Badge & Drag Handle */}
            <div className="flex justify-between items-start mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${badge.color}`}>
                    <Icon size={12} /> {badge.label}
                </span>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${item.priority === 'High' ? 'text-red-600 border-red-200 bg-red-50' : 'text-gray-500 border-gray-200'}`}>
                        {item.priority === 'High' ? 'أولوية قصوى' : 'عادية'}
                    </span>
                    {/* Visual Grip Handle */}
                    <GripVertical size={14} className="text-gray-300 cursor-grab active:cursor-grabbing" />
                </div>
            </div>

            {/* Content */}
            <h4 className={`font-bold text-sm text-navy-900 dark:text-white mb-2 ${isDone ? 'text-gray-500 line-through decoration-2 decoration-gray-400' : ''}`}>
                {item.issue_summary}
            </h4>
            <p className={`text-xs text-gray-500 dark:text-gray-300 mb-3 leading-relaxed bg-gray-50 dark:bg-gray-800 p-2 rounded ${isDone ? 'line-through opacity-75' : ''}`}>
                {item.recommended_action}
            </p>
            
            <div className="flex justify-between items-center text-xs text-gray-400 border-t border-gray-100 dark:border-gray-600 pt-2 mb-3">
                <span>{item.owner}</span>
                <span>{item.due_date}</span>
            </div>

            {/* Evidence Attachment (Only for Done items) */}
            {isDone && (
                <div className="mb-3">
                    {item.evidence_doc ? (
                        <div className="flex justify-between items-center bg-green-50 border border-green-100 p-2 rounded-lg text-xs text-green-800">
                            <span className="flex items-center gap-1 truncate font-medium">
                                <FileText size={12}/> <AttachmentLink doc={item.evidence_doc} />
                            </span>
                            <button 
                                onClick={() => onRemoveEvidence(item)} 
                                className="text-gray-400 hover:text-red-500 transition-transform hover:scale-110"
                                title="حذف الدليل"
                            >
                                <X size={12}/>
                            </button>
                        </div>
                    ) : (
                        <label className="cursor-pointer border border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 p-2 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-all hover:scale-105 active:scale-95">
                            <Paperclip size={14} /> إرفاق دليل الإنجاز
                            <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleFileChange} />
                        </label>
                    )}
                </div>
            )}

            {/* Controls */}
            <div className="flex justify-between items-center gap-2 no-print">
                {onMoveForward ? (
                    <button onClick={onMoveForward} className="flex-1 bg-navy-50 text-navy-800 hover:bg-navy-100 dark:bg-navy-900 dark:text-blue-200 dark:hover:bg-navy-800 py-1.5 rounded text-xs font-bold flex justify-center items-center gap-1 transition-colors hover:shadow-sm">
                        نقل للمرحلة التالية <ArrowLeft size={14} />
                    </button>
                ) : <div className="flex-1"></div>}
                
                {onMoveBack && (
                     <button onClick={onMoveBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-500 transition-colors hover:scale-110" title="عودة للسابق">
                         <ArrowRight size={16} />
                     </button>
                )}
            </div>
        </div>
    );
};

export default Improvements;
