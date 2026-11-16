
import React, { useState, useEffect, useCallback } from 'react';
import { summarizeCompliance, getAutoChecks } from '../utils/compliance';
import { 
    getInstitutions, getEvaluations, getResponses, getIndicators, 
    getImprovements, saveImprovement, deleteImprovement, 
    getRisks, getComplianceByInstAndYear, generateId, uploadFile, deleteFile, saveEvaluation
} from '../services/db';
import Modal from '../components/Modal';
import { useNavigate } from 'react-router-dom';
import AttachmentLink, { ATTACHMENT_ACCEPT } from '../components/AttachmentLink';
import { Institution, ImprovementItem, InstitutionDocument } from '../types';
import { CURRENT_YEAR } from '../constants';
import { 
    Clock, CheckCircle, AlertTriangle, Building, 
    ArrowRight, ArrowLeft, Trash2, Layout, Activity, ShieldAlert, Scale,
    Save, Download, RefreshCw, Paperclip, FileText, X, GripVertical, Pencil, Plus
} from 'lucide-react';
import { useUi } from '../contexts/UiContext';
import { StepBar, StepFooter } from '../components/StepNav';
import { isImprovementComplete } from '../utils/institutionJourney';

// Declare html2pdf for TypeScript
declare const html2pdf: any;

type ColumnType = 'ToDo' | 'Doing' | 'Done';

const Improvements: React.FC = () => {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const { currentWaqfId, showToast, role } = useUi();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<ImprovementItem | null>(null);
  const [, setEvTick] = useState(0);
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
  const totalItems = columns.ToDo.length + columns.Doing.length + columns.Done.length;

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
    if (!ev) return; // البنود مرتبطة بتقييم السنة؛ لا يُنشأ شيء قبل وجوده
    const evalId = ev.id;
    
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
                    // الإجراء والمسؤول تكتبهما المؤسسة (لا نصوص آلية تُرفع كما هي)
                    newItems.push({
                        id: generateId(),
                        evaluation_id: evalId,
                        indicator_id: compositeId,
                        priority: r.score <= 1 ? 'High' : 'Medium',
                        issue_summary: `ضعف الأداء: ${ind.text}`,
                        recommended_action: '',
                        owner: '',
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
    risks.filter(r => r.status !== 'Closed' && (r.probability * r.impact) >= 15).forEach(r => {
        const compositeId = `RISK-${r.id}`;
        if (!exists(compositeId)) {
            newItems.push({
                id: generateId(),
                evaluation_id: evalId,
                indicator_id: compositeId,
                priority: 'High',
                issue_summary: `خطر حرج: ${r.risk_title}`,
                recommended_action: (r.mitigation_plan || '').trim(),
                owner: (r.owner || '').trim(),
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
                    recommended_action: (gap.note || '').trim(),
                    owner: '',
                    due_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
                    status: 'ToDo',
                    notes: 'مطلب قانوني إلزامي'
                });
            }
        });
    }

    if (newItems.length > 0) {
        newItems.forEach(saveImprovement);
        if (ev.no_improvements) saveEvaluation({ ...ev, no_improvements: false }).catch(() => {});
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
  
  // بند يحتاج إكمال: الإجراء والمسؤول والموعد إلزامية
  const allItems = [...columns.ToDo, ...columns.Doing, ...columns.Done];
  const incomplete = allItems.filter(i => !isImprovementComplete(i));
  const noItemsDeclared = !!currentEval?.no_improvements;

  const saveEdit = async (item: ImprovementItem) => {
      const isNew = !allItems.some(i => i.id === item.id);
      try {
          await saveImprovement(item);
          if (isNew && currentEval?.no_improvements) await saveEvaluation({ ...currentEval, no_improvements: false });
      } catch { return; }
      loadImprovements();
      setEditing(null);
      showToast(isNew ? 'تمت إضافة البند' : 'تم حفظ البند', 'success');
  };

  const newItem = (): ImprovementItem | null => currentEval ? ({
      id: generateId(), evaluation_id: currentEval.id, indicator_id: `MAN-${generateId().slice(0, 8)}`,
      priority: 'Medium', issue_summary: '', recommended_action: '', owner: '', due_date: '', status: 'ToDo',
  }) : null;

  const toggleNoItems = async (checked: boolean) => {
      if (!currentEval) return;
      try { await saveEvaluation({ ...currentEval, no_improvements: checked }); setEvTick(t => t + 1); }
      catch { /* رسالة الخطأ تظهر تلقائياً */ }
  };

  const finishPlan = () => {
      if (incomplete.length) {
          showToast(`أكمل الإجراء والمسؤول والموعد في ${incomplete.length} من البنود (زر التعديل على كل بند)`, 'error');
          return;
      }
      navigate('/review-submit');
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
      <StepBar step={4} />
      <div className="flex justify-between items-center no-print">
        <h2 className="text-2xl font-bold text-navy-900 dark:text-white flex items-center gap-2">
            <Layout className="text-teal-600"/> لوحة متابعة التحسين
        </h2>
        {currentWaqfId && (
            <div className="flex flex-wrap gap-2">
                {!planLocked && currentEval && (
                <button type="button" onClick={() => setEditing(newItem())}
                    className="bg-teal-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-teal-800 shadow-sm font-bold text-sm">
                    <Plus size={18} aria-hidden="true" /> إضافة بند
                </button>
                )}
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
          {!planLocked && totalItems === 0 && currentEval && (
              <label className="no-print -mt-4 mb-6 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-4">
                  <input type="checkbox" checked={noItemsDeclared} onChange={e => toggleNoItems(e.target.checked)} className="mt-1 h-5 w-5 accent-teal-600" />
                  <span className="text-sm leading-relaxed text-gray-800">
                      <strong>لا توجد بنود تحسين لهذه الدورة.</strong> أقر بأن نتائج الأداء والامتثال والمخاطر لا تستدعي إجراءات تحسين.
                  </span>
              </label>
          )}
          {!planLocked && incomplete.length > 0 && (
              <p role="status" className="no-print -mt-4 mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {incomplete.length} من البنود تحتاج تحديد الإجراء والمسؤول والموعد. اضغط «تعديل» على البند لإكماله.
              </p>
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
                        onEdit={planLocked ? undefined : () => setEditing(item)}
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
                        onEdit={planLocked ? undefined : () => setEditing(item)}
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
                        onEdit={planLocked ? undefined : () => setEditing(item)}
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
      {planLocked
        ? <StepFooter step={4} />
        : <StepFooter step={4} primaryLabel="إنهاء الخطة والانتقال إلى: المراجعة والإرسال" onPrimary={finishPlan}
            disabled={totalItems === 0 && !noItemsDeclared}
            hint={totalItems === 0 && !noItemsDeclared ? 'أضف بنداً، أو أقرّ بعدم وجود بنود' : undefined} />}
      {editing && <ItemEditor item={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />}
    </div>
  );
};

const ItemEditor: React.FC<{ item: ImprovementItem; onCancel: () => void; onSave: (i: ImprovementItem) => void }> = ({ item, onCancel, onSave }) => {
  const clean = /^مرتبط بمؤشر رقم/.test(item.recommended_action || '') ? '' : (item.recommended_action || '');
  const [f, setF] = useState({ ...item, recommended_action: clean });
  const [tried, setTried] = useState(false);
  const missing = { issue: !f.issue_summary.trim(), action: !f.recommended_action.trim(), owner: !f.owner.trim(), due: !f.due_date };
  const invalid = Object.values(missing).some(Boolean);
  const field = 'min-h-[44px] w-full rounded-lg border px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-teal-500';
  const err = (bad: boolean) => (tried && bad ? 'border-red-400 bg-red-50' : 'border-gray-300');
  return (
    <Modal onClose={onCancel} labelledBy="item-editor-title" className="max-w-lg">
      <h3 id="item-editor-title" className="mb-4 text-lg font-bold text-navy-900">{item.issue_summary ? 'تعديل بند التحسين' : 'بند تحسين جديد'}</h3>
      <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); setTried(true); if (!invalid) onSave({ ...f, issue_summary: f.issue_summary.trim(), recommended_action: f.recommended_action.trim(), owner: f.owner.trim() }); }}>
        <label className="flex flex-col gap-1 text-sm font-bold text-gray-700">الفجوة أو المشكلة
          <textarea value={f.issue_summary} onChange={e => setF({ ...f, issue_summary: e.target.value })} rows={2} className={`${field} py-2 ${err(missing.issue)}`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold text-gray-700">الإجراء المطلوب
          <textarea value={f.recommended_action} onChange={e => setF({ ...f, recommended_action: e.target.value })} rows={3} placeholder="ما الذي ستفعله المؤسسة لمعالجة الفجوة؟" className={`${field} py-2 ${err(missing.action)}`} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-bold text-gray-700">المسؤول
            <input value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} placeholder="مثال: المدير التنفيذي" className={`${field} ${err(missing.owner)}`} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold text-gray-700">الموعد المستهدف
            <input type="date" value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} className={`${field} ${err(missing.due)}`} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-bold text-gray-700">الأولوية
          <select value={f.priority} onChange={e => setF({ ...f, priority: e.target.value as ImprovementItem['priority'] })} className={`${field} border-gray-300 bg-white`}>
            <option value="High">عالية</option><option value="Medium">متوسطة</option><option value="Low">منخفضة</option>
          </select>
        </label>
        {tried && invalid && <p role="alert" className="text-sm font-bold text-red-600">أكمل الحقول المظللة</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg px-4 font-bold text-gray-600 hover:bg-gray-100">إلغاء</button>
          <button type="submit" className="min-h-[44px] rounded-lg bg-teal-700 px-6 font-bold text-white hover:bg-teal-800">حفظ</button>
        </div>
      </form>
    </Modal>
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

const KanbanCard = ({ item, onMoveBack, onMoveForward, onDelete, onEdit, onAttachEvidence, onRemoveEvidence, onDragStart, badge, isDone }: any) => {
    const action = /^مرتبط بمؤشر رقم/.test(item.recommended_action || '') ? '' : (item.recommended_action || '').trim();
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
                <Trash2 size={16} aria-hidden="true" />
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
            <p className={`text-xs mb-3 leading-relaxed p-2 rounded ${action ? 'text-gray-500 dark:text-gray-300 bg-gray-50 dark:bg-gray-800' : 'text-amber-800 bg-amber-50 font-bold'} ${isDone ? 'line-through opacity-75' : ''}`}>
                {action || 'لم يُحدد الإجراء بعد'}
            </p>
            
            <div className="flex justify-between items-center text-xs text-gray-500 border-t border-gray-100 dark:border-gray-600 pt-2 mb-3">
                <span className={item.owner ? '' : 'font-bold text-amber-700'}>{item.owner || 'المسؤول؟'}</span>
                <span className={item.due_date ? '' : 'font-bold text-amber-700'}>{item.due_date || 'الموعد؟'}</span>
            </div>
            {onEdit && (
                <button type="button" onClick={onEdit} className="no-print mb-3 flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 text-xs font-bold text-teal-700 hover:bg-teal-50">
                    <Pencil size={13} aria-hidden="true" /> تعديل
                </button>
            )}

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
                                title="حذف الدليل" aria-label="حذف الدليل"
                            >
                                <X size={12} aria-hidden="true"/>
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
                     <button onClick={onMoveBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-500 transition-colors hover:scale-110" title="عودة للسابق" aria-label="إعادة للمرحلة السابقة">
                         <ArrowRight size={16} aria-hidden="true" />
                     </button>
                )}
            </div>
        </div>
    );
};

export default Improvements;
