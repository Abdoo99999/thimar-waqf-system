
import React, { useState, useEffect } from 'react';
import { getInstitutions, getComplianceRecords, saveComplianceRecord, generateId, getComplianceByInstAndYear, getRisks, saveRisk, deleteRisk, getInstitutionProgress } from '../services/db';
import { Institution, ComplianceRecord, RiskRegisterItem, CustomRequirement } from '../types';
import { CURRENT_YEAR, calculateRiskScore } from '../constants';
import { Save, AlertTriangle, CheckCircle, Info, ShieldAlert, Plus, Trash2, Scale, X, Building, Settings, Lock, Edit2, CheckSquare, AlertCircle, ArrowDown, Paperclip, FileText } from 'lucide-react';
import { useUi } from '../contexts/UiContext';

const CORE_REQUIREMENTS = [
    { key: 'has_executive_management', label: 'هل توجد إدارة تنفيذية أو مدير؟' },
    { key: 'has_auditor_company', label: 'هل تم تعيين شركة تدقيق؟' },
    { key: 'has_minutes_prev_year', label: 'هل توجد محاضر اجتماعات للعام الماضي؟' },
    { key: 'has_financial_report_prev_year', label: 'هل يوجد تقرير مالي معتمد للعام الماضي؟' },
];

const CompliancePage: React.FC = () => {
  // Removed ActiveTab state - Single Page View
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const { showToast, currentWaqfId, role } = useUi();
  
  // Compliance State
  const [record, setRecord] = useState<Partial<ComplianceRecord>>({});
  const [newReqText, setNewReqText] = useState('');
  
  // Locking State
  const [isLocked, setIsLocked] = useState(false);

  // Admin Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Risk Register State
  const [instRisks, setInstRisks] = useState<RiskRegisterItem[]>([]);
  const [newRisk, setNewRisk] = useState<Partial<RiskRegisterItem>>({});
  const [showRiskForm, setShowRiskForm] = useState(false);

  // Real-time calculated risk based on compliance form
  const complianceRisk = calculateRiskScore(record);

  useEffect(() => {
    setInstitutions(getInstitutions());
  }, []);

  useEffect(() => {
    if (currentWaqfId) {
        // Check Lock Status
        const progress = getInstitutionProgress(currentWaqfId);
        setIsLocked(progress.isLocked);

        // Load Compliance
        const existing = getComplianceByInstAndYear(currentWaqfId, CURRENT_YEAR);
        if (existing) {
            setRecord(existing);
        } else {
            setRecord({
                institution_id: currentWaqfId,
                cycle_year: CURRENT_YEAR,
                institution_status: 'فاعلة',
                board_status: 'قائم',
                has_executive_management: false,
                has_auditor_company: false,
                has_minutes_prev_year: false,
                has_financial_report_prev_year: false,
                custom_requirements: [],
                hidden_core_requirements: [],
                renamed_core_requirements: {},
                notes: ''
            });
        }

        // Load Risks
        setInstRisks(getRisks(currentWaqfId));
    } else {
        setRecord({});
        setInstRisks([]);
    }
    // Reset edit mode when changing institution
    setIsEditMode(false);
  }, [currentWaqfId]);

  const handleSaveAll = () => {
      if (!currentWaqfId || isLocked) return;

      // 1. VALIDATION: Check Risks
      if (instRisks.length === 0) {
          showToast('عذراً، لا يمكن الحفظ. يجب تسجيل خطر واحد على الأقل في سجل المخاطر بالأسفل.', 'error');
          // Scroll to risk section
          const riskSection = document.getElementById('risk-register-section');
          if (riskSection) {
              riskSection.scrollIntoView({ behavior: 'smooth' });
              riskSection.classList.add('ring-4', 'ring-red-300'); // Highlight effect
              setTimeout(() => riskSection.classList.remove('ring-4', 'ring-red-300'), 2000);
          }
          return;
      }

      // VALIDATION: Check Evidence for Core Requirements
      const missingCoreEvidence = CORE_REQUIREMENTS.filter(req => {
          if (record.hidden_core_requirements?.includes(req.key)) return false;
          const isChecked = !!(record as any)[req.key];
          const hasEvidence = !!record.core_evidence?.[req.key];
          return isChecked && !hasEvidence;
      });

      if (missingCoreEvidence.length > 0) {
          showToast(`عذراً، يجب إرفاق دليل داعم لجميع المعايير الأساسية المجاب عليها بالإيجاب. (${missingCoreEvidence.length} معيار متبقي)`, 'error');
          return;
      }

      // VALIDATION: Check Evidence for Custom Requirements
      const missingCustomEvidence = (record.custom_requirements || []).filter(req => req.met && !req.evidence_doc);
      if (missingCustomEvidence.length > 0) {
          showToast(`عذراً، يجب إرفاق دليل داعم لجميع المعايير الإضافية المجاب عليها بالإيجاب. (${missingCustomEvidence.length} معيار متبقي)`, 'error');
          return;
      }
      
      // Ensure ID exists or generate new one
      const recordId = record.id || generateId();
      
      const toSave: ComplianceRecord = {
          ...record as ComplianceRecord,
          id: recordId,
          institution_id: currentWaqfId,
          cycle_year: CURRENT_YEAR,
          last_updated_at: new Date().toISOString()
      };
      
      saveComplianceRecord(toSave);
      setRecord(toSave); 
      setIsEditMode(false); // Exit edit mode on save
      showToast('تم حفظ سجل الامتثال والمخاطر بنجاح', 'success');
  };

  // --- CUSTOM REQUIREMENTS HANDLERS ---
  const handleAddRequirement = () => {
      if (!newReqText || isLocked) return;
      const newReq: CustomRequirement = {
          id: generateId(),
          text: newReqText,
          met: false
      };
      setRecord(prev => ({
          ...prev,
          custom_requirements: [...(prev.custom_requirements || []), newReq]
      }));
      setNewReqText('');
      showToast('تم إضافة المعيار الجديد', 'success');
  };

  const handleRemoveRequirement = (id: string) => {
      if(isLocked) return;
      if(confirm('هل أنت متأكد من حذف هذا المعيار؟')) {
        setRecord(prev => ({
            ...prev,
            custom_requirements: prev.custom_requirements?.filter(r => r.id !== id)
        }));
      }
  };

  const toggleCustomRequirement = (id: string) => {
      if (isEditMode || isLocked) return; // Disable toggling in edit mode
      setRecord(prev => ({
          ...prev,
          custom_requirements: prev.custom_requirements?.map(r => r.id === id ? { ...r, met: !r.met } : r)
      }));
  };

  // --- CORE REQUIREMENTS EDIT HANDLERS ---
  const handleRemoveCoreReq = (key: string) => {
      if(isLocked) return;
      if(confirm('حذف هذا المعيار الأساسي؟ سيتم إخفاؤه من القائمة ولن يدخل في حساب المخاطر.')) {
          const currentHidden = record.hidden_core_requirements || [];
          setRecord(prev => ({
              ...prev,
              hidden_core_requirements: [...currentHidden, key]
          }));
      }
  };

  const handleRenameCoreReq = (key: string, newText: string) => {
      if(isLocked) return;
      const currentRenamed = record.renamed_core_requirements || {};
      setRecord(prev => ({
          ...prev,
          renamed_core_requirements: { ...currentRenamed, [key]: newText }
      }));
  };

  const handleCoreEvidenceUpload = (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
      if (isLocked) return;
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const newDoc: InstitutionDocument = { id: generateId(), name: file.name, type: file.type, size: (file.size / 1024).toFixed(1) + ' KB', upload_date: new Date().toLocaleDateString('ar-OM') };
          setRecord(prev => ({
              ...prev,
              core_evidence: {
                  ...(prev.core_evidence || {}),
                  [key]: newDoc
              }
          }));
          showToast('تم إرفاق الدليل بنجاح', 'success');
      }
  };

  const removeCoreEvidence = (key: string) => {
      if (isLocked) return;
      setRecord(prev => {
          const newEvidence = { ...prev.core_evidence };
          delete newEvidence[key];
          return { ...prev, core_evidence: newEvidence };
      });
      showToast('تم حذف المرفق', 'info');
  };

  const handleCustomEvidenceUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
      if (isLocked) return;
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const newDoc: InstitutionDocument = { id: generateId(), name: file.name, type: file.type, size: (file.size / 1024).toFixed(1) + ' KB', upload_date: new Date().toLocaleDateString('ar-OM') };
          setRecord(prev => ({
              ...prev,
              custom_requirements: prev.custom_requirements?.map(r => r.id === id ? { ...r, evidence_doc: newDoc } : r)
          }));
          showToast('تم إرفاق الدليل بنجاح', 'success');
      }
  };

  const removeCustomEvidence = (id: string) => {
      if (isLocked) return;
      setRecord(prev => ({
          ...prev,
          custom_requirements: prev.custom_requirements?.map(r => r.id === id ? { ...r, evidence_doc: undefined } : r)
      }));
      showToast('تم حذف المرفق', 'info');
  };

  // --- RISK HANDLERS ---
  const handleSaveRisk = () => {
      if (!currentWaqfId || !newRisk.risk_title || isLocked) {
          if(!newRisk.risk_title) showToast('يرجى إدخال عنوان الخطر', 'error');
          return;
      }

      // Check if we are updating (id exists) or creating new
      const riskId = newRisk.id || generateId();
      const isUpdate = !!newRisk.id;

      const riskToSave: RiskRegisterItem = {
          id: riskId,
          institution_id: currentWaqfId,
          risk_title: newRisk.risk_title!,
          category: newRisk.category || 'Operational',
          probability: Number(newRisk.probability) || 1,
          impact: Number(newRisk.impact) || 1,
          mitigation_plan: newRisk.mitigation_plan || '',
          status: newRisk.status || 'Open'
      };
      
      saveRisk(riskToSave);
      setInstRisks(getRisks(currentWaqfId));
      setShowRiskForm(false);
      setNewRisk({});
      
      showToast(isUpdate ? 'تم حفظ التعديلات على الخطر' : 'تم إضافة الخطر بنجاح', 'success');
  };

  const handleEditRisk = (risk: RiskRegisterItem) => {
      if(isLocked) return;
      setNewRisk(risk);
      setShowRiskForm(true);
      // Scroll to form inside risk section
      setTimeout(() => {
          document.getElementById('risk-form-container')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
  };

  const handleDeleteRisk = (id: string) => {
      if(isLocked) return;
      if(confirm('هل أنت متأكد من حذف هذا الخطر؟')) {
          deleteRisk(id);
          setInstRisks(getRisks(currentWaqfId));
          showToast('تم حذف الخطر', 'info');
      }
  };

  const updateComplianceField = (field: keyof ComplianceRecord, value: any) => {
      if (isEditMode || isLocked) return; // Prevent changing values while editing structure
      setRecord(prev => ({ ...prev, [field]: value }));
  };
  
  const currentInstitutionName = institutions.find(i => i.id === currentWaqfId)?.name;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-navy-900 dark:text-white">الامتثال والمخاطر ({CURRENT_YEAR})</h2>
            {isLocked && <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Lock size={12}/> للقراءة فقط</span>}
        </div>
      </div>
      
      {/* Currently Viewing Banner */}
      {currentWaqfId ? (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between text-blue-900 animate-fadeIn">
              <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg"><Building size={20} className="text-blue-700"/></div>
                  <div>
                      <div className="text-xs text-blue-600 uppercase font-bold tracking-wider">جاري إدارة امتثال:</div>
                      <div className="text-lg font-bold">{currentInstitutionName}</div>
                  </div>
              </div>
          </div>
      ) : (
          <div className="bg-orange-50 border border-orange-200 p-6 rounded-xl text-center">
              <p className="text-orange-800 font-bold mb-2">لم يتم اختيار مؤسسة</p>
              <p className="text-sm text-orange-600">يرجى الذهاب إلى لوحة القيادة (Dashboard) أو صفحة المؤسسات لاختيار المؤسسة التي تود العمل عليها.</p>
          </div>
      )}

      {currentWaqfId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
              
              {/* --- LEFT COLUMN: MAIN FORMS --- */}
              <div className="lg:col-span-2 space-y-8">
                  
                  {/* SECTION 1: COMPLIANCE */}
                  <div className="space-y-6">
                      <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
                          <Scale className="text-navy-800" size={24} />
                          <h3 className="text-xl font-bold text-navy-900">أولاً: الامتثال النظامي</h3>
                      </div>

                      {/* Status Card */}
                      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                          <h3 className="font-bold text-navy-900 dark:text-white mb-4 flex items-center gap-2">
                              <Info size={20} className="text-teal-600" /> الحالة الأساسية
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">حالة المؤسسة</label>
                                  <select 
                                      disabled={isEditMode || isLocked}
                                      className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50" 
                                      value={record.institution_status || 'فاعلة'} 
                                      onChange={(e) => updateComplianceField('institution_status', e.target.value)}
                                  >
                                      <option value="فاعلة">فاعلة</option>
                                      <option value="غير فاعلة">غير فاعلة</option>
                                      <option value="قيد التصفية">قيد التصفية</option>
                                      <option value="متوقفة">متوقفة</option>
                                      <option value="أخرى">أخرى</option>
                                  </select>
                              </div>
                              <div>
                                  <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">حالة مجلس الإدارة</label>
                                  <select 
                                      disabled={isEditMode || isLocked}
                                      className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50" 
                                      value={record.board_status || 'قائم'} 
                                      onChange={(e) => updateComplianceField('board_status', e.target.value)}
                                  >
                                      <option value="قائم">قائم</option>
                                      <option value="منتهي">منتهي الصلاحية</option>
                                      <option value="غير موجود">غير موجود</option>
                                  </select>
                              </div>
                          </div>
                      </div>

                      {/* Requirements Checklist */}
                      <div className={`bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border transition-all ${isEditMode ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-100 dark:border-gray-700'}`}>
                          <div className="flex justify-between items-center mb-6">
                              <h3 className="font-bold text-navy-900 dark:text-white flex items-center gap-2">
                                  <CheckCircle size={20} className="text-teal-600" /> المتطلبات النظامية
                              </h3>
                              
                              {role === 'admin' && !isLocked && (
                                  <button 
                                      onClick={() => setIsEditMode(!isEditMode)}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${isEditMode ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                  >
                                      {isEditMode ? (
                                          <> <CheckSquare size={16}/> إنهاء التعديل </>
                                      ) : (
                                          <> <Settings size={16}/> تعديل المعايير </>
                                      )}
                                  </button>
                              )}
                          </div>
                          
                          {/* Core Requirements */}
                          <div className="space-y-4 mb-6">
                              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">المعايير الأساسية</h4>
                              {CORE_REQUIREMENTS.map((req) => {
                                  if (record.hidden_core_requirements?.includes(req.key)) return null;
                                  const displayLabel = record.renamed_core_requirements?.[req.key] || req.label;

                                  return (
                                      <div key={req.key} className="flex items-center gap-3 relative animate-fadeIn">
                                          {isEditMode ? (
                                              <div className="flex-1 flex gap-2 items-center bg-gray-50 border border-gray-200 p-2 rounded-lg">
                                                  <input 
                                                      type="text" 
                                                      className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                                      value={displayLabel}
                                                      onChange={(e) => handleRenameCoreReq(req.key, e.target.value)}
                                                  />
                                                  <button onClick={() => handleRemoveCoreReq(req.key)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={18} /></button>
                                              </div>
                                          ) : (
                                              <div className="flex-1 flex flex-col gap-2">
                                                  <ToggleItem 
                                                      label={displayLabel} 
                                                      checked={!!(record as any)[req.key]} 
                                                      onChange={() => updateComplianceField(req.key as keyof ComplianceRecord, !(record as any)[req.key])} 
                                                      className={`flex-1`}
                                                      disabled={isLocked}
                                                  />
                                                  {!!(record as any)[req.key] && (
                                                      <div className="mr-4 bg-orange-50 border border-orange-200 p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
                                                          <div className="flex items-center gap-2 text-orange-800">
                                                              <Paperclip size={16} />
                                                              <span className="text-sm font-bold">مرفق إلزامي (دليل داعم)</span>
                                                          </div>
                                                          {record.core_evidence?.[req.key] ? (
                                                              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-md border border-orange-200">
                                                                  <FileText size={14} className="text-gray-500" />
                                                                  <span className="text-xs text-gray-700 truncate max-w-[150px]">{record.core_evidence[req.key].name}</span>
                                                                  {!isLocked && (
                                                                      <button onClick={() => removeCoreEvidence(req.key)} className="text-red-500 hover:text-red-700 mr-2">
                                                                          <X size={14} />
                                                                      </button>
                                                                  )}
                                                              </div>
                                                          ) : (
                                                              <label className={`cursor-pointer bg-white border border-orange-300 text-orange-700 hover:bg-orange-100 px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                                  إرفاق ملف
                                                                  <input type="file" className="hidden" onChange={(e) => handleCoreEvidenceUpload(req.key, e)} disabled={isLocked} />
                                                              </label>
                                                          )}
                                                      </div>
                                                  )}
                                              </div>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>

                          {/* Custom Requirements */}
                          <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                              <div className="flex justify-between items-center mb-4">
                                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">المعايير الإضافية</h4>
                              </div>
                              <div className="space-y-2">
                                  {record.custom_requirements?.map(req => (
                                      <div key={req.id} className="flex items-center gap-2 animate-fadeIn">
                                          {isEditMode ? (
                                              <div className="flex-1 flex gap-2 items-center bg-amber-50 border border-amber-200 p-2 rounded-lg">
                                                  <span className="flex-1 text-sm text-gray-700 px-2">{req.text}</span>
                                                  <button onClick={() => handleRemoveRequirement(req.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={18} /></button>
                                              </div>
                                          ) : (
                                              <div className="flex-1 flex flex-col gap-2">
                                                  <ToggleItem 
                                                      label={req.text} 
                                                      checked={req.met} 
                                                      onChange={() => toggleCustomRequirement(req.id)} 
                                                      className="flex-1"
                                                      disabled={isLocked}
                                                  />
                                                  {req.met && (
                                                      <div className="mr-4 bg-orange-50 border border-orange-200 p-3 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
                                                          <div className="flex items-center gap-2 text-orange-800">
                                                              <Paperclip size={16} />
                                                              <span className="text-sm font-bold">مرفق إلزامي (دليل داعم)</span>
                                                          </div>
                                                          {req.evidence_doc ? (
                                                              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-md border border-orange-200">
                                                                  <FileText size={14} className="text-gray-500" />
                                                                  <span className="text-xs text-gray-700 truncate max-w-[150px]">{req.evidence_doc.name}</span>
                                                                  {!isLocked && (
                                                                      <button onClick={() => removeCustomEvidence(req.id)} className="text-red-500 hover:text-red-700 mr-2">
                                                                          <X size={14} />
                                                                      </button>
                                                                  )}
                                                              </div>
                                                          ) : (
                                                              <label className={`cursor-pointer bg-white border border-orange-300 text-orange-700 hover:bg-orange-100 px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                                                  إرفاق ملف
                                                                  <input type="file" className="hidden" onChange={(e) => handleCustomEvidenceUpload(req.id, e)} disabled={isLocked} />
                                                              </label>
                                                          )}
                                                      </div>
                                                  )}
                                              </div>
                                          )}
                                      </div>
                                  ))}
                                  {(!record.custom_requirements || record.custom_requirements.length === 0) && (
                                      <p className="text-xs text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">لا توجد معايير إضافية</p>
                                  )}
                              </div>
                          </div>
                          
                          {/* Add New Section */}
                          {isEditMode && (
                              <div className="mt-6 pt-6 border-t border-amber-200 animate-slideIn">
                                  <h4 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2"><Plus size={16}/> إضافة معيار جديد</h4>
                                  <div className="flex gap-2">
                                      <input type="text" className="flex-1 border border-amber-300 p-2.5 rounded-lg text-sm outline-none" placeholder="أدخل نص المعيار الجديد هنا..." value={newReqText} onChange={e => setNewReqText(e.target.value)} />
                                      <button onClick={handleAddRequirement} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold">إضافة</button>
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>

                  {/* SECTION 2: RISKS (Now visible directly) */}
                  <div id="risk-register-section" className="space-y-6 pt-6 border-t-4 border-gray-200">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div>
                              <div className="flex items-center gap-2 mb-1">
                                  <ShieldAlert className="text-red-600" size={24} />
                                  <h3 className="text-xl font-bold text-navy-900">ثانياً: سجل المخاطر</h3>
                              </div>
                              <p className="text-gray-500 text-sm">يجب رصد المخاطر المتوقعة لضمان سلامة الوقف.</p>
                          </div>
                          {!isLocked && (
                             <button 
                                onClick={() => { setNewRisk({}); setShowRiskForm(true); setTimeout(() => document.getElementById('risk-form-container')?.scrollIntoView({behavior: 'smooth'}), 100); }} 
                                className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-700 text-sm shadow-md transition-transform hover:scale-105"
                             >
                                 <Plus size={16} /> إضافة خطر جديد
                             </button>
                          )}
                      </div>

                      {/* Risk Input Form */}
                      {showRiskForm && (
                          <div id="risk-form-container" className="bg-red-50 dark:bg-gray-800 p-6 rounded-xl border border-red-200 dark:border-gray-700 animate-scaleIn shadow-inner">
                              <h4 className="font-bold mb-4 text-red-800 dark:text-white border-b border-red-200 pb-2">{newRisk.id ? 'تعديل بيانات الخطر' : 'تسجيل خطر جديد'}</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                  <div className="col-span-2">
                                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">وصف الخطر *</label>
                                      <input type="text" className="w-full p-3 border border-red-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-red-500" value={newRisk.risk_title || ''} onChange={e => setNewRisk({...newRisk, risk_title: e.target.value})} placeholder="مثال: نزاع قانوني على أصل وقفي" autoFocus />
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">التصنيف</label>
                                      <select className="w-full p-3 border border-red-200 rounded-lg bg-white outline-none" value={newRisk.category} onChange={e => setNewRisk({...newRisk, category: e.target.value as any})}>
                                          <option value="Operational">تشغيلي</option>
                                          <option value="Financial">مالي</option>
                                          <option value="Legal">قانوني</option>
                                          <option value="Strategic">استراتيجي</option>
                                      </select>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">الاحتمالية</label>
                                        <select className="w-full p-3 border border-red-200 rounded-lg bg-white outline-none" value={newRisk.probability || ''} onChange={e => setNewRisk({...newRisk, probability: Number(e.target.value)})}>
                                            <option value="">اختر...</option>
                                            <option value="1">1 - نادر جداً</option>
                                            <option value="2">2 - نادر</option>
                                            <option value="3">3 - متوسط</option>
                                            <option value="4">4 - محتمل</option>
                                            <option value="5">5 - مؤكد</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">الأثر</label>
                                        <select className="w-full p-3 border border-red-200 rounded-lg bg-white outline-none" value={newRisk.impact || ''} onChange={e => setNewRisk({...newRisk, impact: Number(e.target.value)})}>
                                            <option value="">اختر...</option>
                                            <option value="1">1 - غير مؤثر</option>
                                            <option value="2">2 - بسيط</option>
                                            <option value="3">3 - متوسط</option>
                                            <option value="4">4 - جسيم</option>
                                            <option value="5">5 - كارثي</option>
                                        </select>
                                    </div>
                                  </div>
                                  <div className="col-span-2">
                                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-400 mb-1">خطة المعالجة</label>
                                      <textarea className="w-full p-3 border border-red-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-red-500 h-20 resize-none" value={newRisk.mitigation_plan || ''} onChange={e => setNewRisk({...newRisk, mitigation_plan: e.target.value})} placeholder="ما هي الإجراءات المتخذة للحد من الخطر؟" />
                                  </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                  <button onClick={() => setShowRiskForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-bold">إلغاء</button>
                                  <button onClick={handleSaveRisk} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 shadow-md transition-transform active:scale-95">{newRisk.id ? 'حفظ التعديلات' : 'إضافة للقائمة'}</button>
                              </div>
                          </div>
                      )}

                      {/* Risk Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {instRisks.length > 0 ? (
                              instRisks.map(risk => {
                                  const score = risk.probability * risk.impact;
                                  let color = 'bg-green-50 border-green-200';
                                  if (score >= 15) color = 'bg-red-50 border-red-200';
                                  else if (score >= 8) color = 'bg-orange-50 border-orange-200';
                                  
                                  return (
                                      <div key={risk.id} className={`p-4 rounded-xl border ${color} relative group hover:shadow-md transition-all`}>
                                          <div className="flex justify-between items-start mb-2">
                                              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{risk.category}</span>
                                              <span className={`text-xs font-bold px-2 py-1 rounded-full ${score >= 15 ? 'bg-red-500 text-white' : (score >= 8 ? 'bg-orange-500 text-white' : 'bg-green-500 text-white')}`}>
                                                  {score} (شدة الخطر)
                                              </span>
                                          </div>
                                          <h4 className="font-bold text-navy-900 mb-2">{risk.risk_title}</h4>
                                          <p className="text-sm text-gray-600 mb-3">{risk.mitigation_plan || 'لا توجد خطة معالجة'}</p>
                                          
                                          {!isLocked && (
                                            <div className="flex gap-2 mt-2 pt-2 border-t border-gray-200/50">
                                                    <button onClick={() => handleEditRisk(risk)} className="flex-1 bg-white border border-gray-200 rounded py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-1 transition-colors"><Edit2 size={12}/> تعديل</button>
                                                    <button onClick={() => handleDeleteRisk(risk.id)} className="flex-1 bg-white border border-red-200 rounded py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center justify-center gap-1 transition-colors"><Trash2 size={12}/> حذف</button>
                                            </div>
                                          )}
                                      </div>
                                  )
                              })
                          ) : (
                              <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-red-200 bg-red-50/50 rounded-xl">
                                  <AlertCircle size={48} className="mb-2 text-red-300 opacity-50" />
                                  <p className="font-bold text-red-900 mb-1">سجل المخاطر فارغ!</p>
                                  <p className="text-sm text-red-700">مطلوب تسجيل خطر واحد على الأقل للحفظ والمتابعة.</p>
                              </div>
                          )}
                      </div>
                  </div>

                  {/* MAIN SAVE ACTION (Combines both sections validation) */}
                  {!isEditMode && !isLocked && (
                      <div className="pt-6 border-t border-gray-200 sticky bottom-0 bg-gray-50/90 backdrop-blur-sm p-4 rounded-xl shadow-lg -mx-2 -mb-2 border border-white">
                          <button 
                            onClick={handleSaveAll} 
                            className="w-full bg-gradient-to-r from-navy-900 to-navy-800 text-white p-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all active:scale-95 flex justify-center items-center gap-3"
                          >
                              <Save size={24} /> حفظ واعتماد بيانات الامتثال والمخاطر
                          </button>
                          <p className="text-center text-xs text-gray-500 mt-2 font-medium">سيتم التحقق من تعبئة كلا القسمين قبل الحفظ</p>
                      </div>
                  )}
                  
                  {isEditMode && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-center justify-between">
                            <span className="text-sm font-medium">أنت في وضع التعديل. قم بإضافة أو حذف أو تعديل المؤشرات ثم اضغط إنهاء.</span>
                            <button onClick={() => setIsEditMode(false)} className="bg-white border border-amber-300 px-4 py-2 rounded-lg text-sm font-bold hover:bg-amber-100">إنهاء التعديل</button>
                        </div>
                  )}
              </div>

              {/* --- RIGHT COLUMN: SIDEBAR (Analysis) --- */}
              <div className="lg:col-span-1">
                  <div className={`sticky top-6 p-6 rounded-xl border ${complianceRisk.score >= 6 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} shadow-sm`}>
                      <h3 className="text-lg font-bold text-navy-900 mb-2 flex items-center gap-2">
                          <ShieldAlert size={20}/> تحليل المخاطر (التلقائي)
                      </h3>
                      <p className="text-xs text-gray-500 mb-4 leading-relaxed">يتم حساب هذا المؤشر بناءً على إجاباتك في قسم الامتثال.</p>
                      
                      <div className="flex items-center gap-3 mb-6 bg-white/50 p-3 rounded-lg border border-gray-200/50">
                          <div className={`text-4xl font-black ${complianceRisk.score >= 6 ? 'text-red-600' : 'text-green-600'}`}>{complianceRisk.score}</div>
                          <div>
                              <div className="text-[10px] text-gray-500 uppercase font-bold">مجموع النقاط</div>
                              <div className={`font-bold text-sm ${complianceRisk.score >= 6 ? 'text-red-700' : 'text-green-700'}`}>{complianceRisk.label}</div>
                          </div>
                      </div>
                      
                      <div className="space-y-3">
                          <RiskIndicator label="مجلس الإدارة" active={record.board_status !== 'قائم'} points={3} />
                          {!record.hidden_core_requirements?.includes('has_executive_management') && (
                              <RiskIndicator label={record.renamed_core_requirements?.['has_executive_management'] || "الإدارة التنفيذية"} active={!record.has_executive_management} points={2} />
                          )}
                          {!record.hidden_core_requirements?.includes('has_auditor_company') && (
                              <RiskIndicator label={record.renamed_core_requirements?.['has_auditor_company'] || "شركة التدقيق"} active={!record.has_auditor_company} points={2} />
                          )}
                          {!record.hidden_core_requirements?.includes('has_financial_report_prev_year') && (
                              <RiskIndicator label={record.renamed_core_requirements?.['has_financial_report_prev_year'] || "التقرير المالي"} active={!record.has_financial_report_prev_year} points={2} />
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

// UI Components
const ToggleItem = ({ label, checked, onChange, className, disabled }: any) => (
    <div 
        className={`flex items-center justify-between p-3 rounded-lg border transition-all ${disabled ? 'cursor-not-allowed bg-gray-50' : 'cursor-pointer'} ${checked ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-200 hover:bg-gray-50'} ${className}`}
        onClick={!disabled ? onChange : undefined}
    >
        <span className={`font-medium ${checked ? 'text-teal-900' : 'text-gray-600'}`}>{label}</span>
        <div className={`w-12 h-6 rounded-full relative transition-colors ${checked ? 'bg-teal-600' : 'bg-gray-300'}`}>
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${checked ? 'left-1' : 'right-1'}`}></div>
        </div>
    </div>
);

const RiskIndicator = ({ label, active, points }: any) => (
    <div className={`flex justify-between items-center text-sm ${active ? 'opacity-100 font-bold' : 'opacity-50 grayscale'}`}>
        <span className="flex items-center gap-2">
            {active ? <AlertTriangle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-gray-400" />}
            {label}
        </span>
        <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-gray-200 shadow-sm">+{points}</span>
    </div>
);

export default CompliancePage;
