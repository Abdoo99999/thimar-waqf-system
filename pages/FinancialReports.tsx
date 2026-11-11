
import React, { useState, useEffect } from 'react';
import { useUi } from '../contexts/UiContext';
import { getInstitutions, saveFinancialRecord, getFinancialRecords, analyzeFinancialHealth, generateId, getInstitutionProgress, uploadFile, deleteFile } from '../services/db';
import AttachmentLink, { ATTACHMENT_ACCEPT } from '../components/AttachmentLink';
import { FinancialRecord, InstitutionDocument } from '../types';
import { CURRENT_YEAR } from '../constants';
import { 
    TrendingUp, TrendingDown, UploadCloud, Save, AlertTriangle, 
    FileText, CheckCircle2, XCircle, Landmark, Briefcase, Scale,
    Banknote, ArrowRightLeft, Paperclip, ShieldCheck, Lock
} from 'lucide-react';

const FinancialReports: React.FC = () => {
  const { currentWaqfId, showToast, currentYear } = useUi();
  const [loading, setLoading] = useState(false);
  const [institutions, setInstitutions] = useState<any[]>([]);
  
  // Lock state
  const [isLocked, setIsLocked] = useState(false);

  // Form State
  const [record, setRecord] = useState<Partial<FinancialRecord>>({
      fiscal_year: currentYear,
      auditor_name: '',
      total_assets: 0,
      total_liabilities: 0,
      net_waqf_assets: 0,
      total_revenues: 0,
      total_expenses: 0,
      admin_general_expenses: 0,
      surplus_deficit: 0,
      operating_cash_flow: 0,
      investing_cash_flow: 0,
      financing_cash_flow: 0,
      cash_end_period: 0
  });

  const [pdfFile, setPdfFile] = useState<InstitutionDocument | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{isValid: boolean, status: string, flags: string[], errors: string[]} | null>(null);

  useEffect(() => {
      setInstitutions(getInstitutions());
  }, []);

  useEffect(() => {
      if (currentWaqfId) {
          // Check lock status
          const progress = getInstitutionProgress(currentWaqfId);
          setIsLocked(progress.isLocked);

          const records = getFinancialRecords(currentWaqfId);
          // Use global currentYear to find record
          const existing = records.find(r => r.fiscal_year === currentYear);
          if (existing) {
              setRecord(existing);
              setPdfFile(existing.audit_report_pdf || null);
              setAnalysisResult(analyzeFinancialHealth(existing));
              setIsConfirmed(true); // If loaded, assume confirmed previously
          } else {
              setRecord({
                  fiscal_year: currentYear, // Use global currentYear
                  auditor_name: '',
                  total_assets: 0,
                  total_liabilities: 0,
                  net_waqf_assets: 0,
                  total_revenues: 0,
                  total_expenses: 0,
                  admin_general_expenses: 0,
                  surplus_deficit: 0,
                  operating_cash_flow: 0,
                  investing_cash_flow: 0,
                  financing_cash_flow: 0,
                  cash_end_period: 0
              });
              setPdfFile(null);
              setAnalysisResult(null);
              setIsConfirmed(false);
          }
      }
  }, [currentWaqfId, currentYear]);

  // Auto-calculate Surplus/Deficit
  useEffect(() => {
      const revenue = Number(record.total_revenues) || 0;
      const expenses = Number(record.total_expenses) || 0;
      const computedSurplus = revenue - expenses;
      
      if (computedSurplus !== record.surplus_deficit) {
          setRecord(prev => ({ ...prev, surplus_deficit: computedSurplus }));
      }
  }, [record.total_revenues, record.total_expenses]);

  // Sync Operating Cash Flow with Surplus (Logical Default)
  useEffect(() => {
      if (isLocked) return;
      // We set operating cash flow to match surplus by default as a starting point
      const surplus = Number(record.surplus_deficit) || 0;
      setRecord(prev => ({ ...prev, operating_cash_flow: surplus }));
  }, [record.surplus_deficit, isLocked]);

  // Auto-calculate Net Assets (Assets - Liabilities)
  useEffect(() => {
      const assets = Number(record.total_assets) || 0;
      const liabilities = Number(record.total_liabilities) || 0;
      const computedNet = assets - liabilities;
      
      if (computedNet !== record.net_waqf_assets) {
          setRecord(prev => ({ ...prev, net_waqf_assets: computedNet }));
      }
  }, [record.total_assets, record.total_liabilities]);

  // Auto-calculate Cash End of Period (Sum of Flows)
  useEffect(() => {
      const op = Number(record.operating_cash_flow) || 0;
      const inv = Number(record.investing_cash_flow) || 0;
      const fin = Number(record.financing_cash_flow) || 0;
      const totalCash = op + inv + fin;

      if (totalCash !== record.cash_end_period) {
          setRecord(prev => ({ ...prev, cash_end_period: totalCash }));
      }
  }, [record.operating_cash_flow, record.investing_cash_flow, record.financing_cash_flow]);

  const handleInputChange = (field: keyof FinancialRecord, value: any) => {
      if (isLocked) return;
      setRecord(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isLocked) return;
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          try {
          const newDoc = await uploadFile(file, currentWaqfId);
          setPdfFile(newDoc);
          showToast('تم إرفاق التقرير المالي', 'success');
          } catch (err: any) {
              showToast(err.message, 'error');
          }
      }
  };

  const removeReportFile = async () => {
      if (isLocked || !pdfFile) return;
      try {
          if (pdfFile.file_id) await deleteFile(pdfFile.file_id);
          setPdfFile(null);
      } catch (err: any) {
          showToast(err.message, 'error');
      }
  };

  const handleSubmit = () => {
      if (!currentWaqfId || isLocked) return;
      if (!isConfirmed) {
          showToast('يرجى الإقرار بصحة البيانات قبل الحفظ', 'error');
          return;
      }

      setLoading(true);

      const fullRecord: FinancialRecord = {
          ...record as FinancialRecord,
          id: record.id || generateId(),
          institution_id: currentWaqfId,
          audit_report_pdf: pdfFile || undefined,
          submission_date: new Date().toISOString(),
          status: 'Submitted',
          flags: []
      };

      const analysis = analyzeFinancialHealth(fullRecord);
      fullRecord.status = analysis.status as any;
      fullRecord.flags = analysis.flags;

      saveFinancialRecord(fullRecord);
      setAnalysisResult(analysis);
      setLoading(false);
      
      showToast('تم حفظ البيانات المالية بنجاح', 'success');
  };

  const currentInstitutionName = institutions.find(i => i.id === currentWaqfId)?.name;

  if (!currentWaqfId) return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-xl shadow-sm border border-gray-100 mt-10">
          <div className="bg-blue-50 p-6 rounded-full mb-6 text-blue-600"><Landmark size={48} /></div>
          <h2 className="text-2xl font-bold text-navy-900 mb-2">التقارير المالية</h2>
          <p className="text-gray-500">يرجى اختيار مؤسسة من القائمة العلوية لإدخال البيانات المالية</p>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-fadeIn">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-6">
          <div className="flex items-center gap-3">
              <div>
                <h2 className="text-2xl font-bold text-navy-900 flex items-center gap-2">
                    <Landmark className="text-teal-600"/> القوائم المالية والحوكمة ({currentYear})
                </h2>
                <p className="text-gray-500 mt-1">إدخال البيانات المالية لـ: <span className="font-bold text-navy-800">{currentInstitutionName}</span></p>
              </div>
              {isLocked && <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Lock size={12}/> للقراءة فقط</span>}
          </div>
          <div className="flex gap-4">
              <div className="min-w-[250px]">
                  <label className="block text-xs font-bold text-gray-500 mb-1">مكتب التدقيق الخارجي</label>
                  <input 
                    type="text" 
                    disabled={isLocked}
                    placeholder="اسم المكتب / المدقق"
                    className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100 disabled:text-gray-500"
                    value={record.auditor_name}
                    onChange={(e) => handleInputChange('auditor_name', e.target.value)}
                  />
              </div>
          </div>
      </div>

      {/* Analysis Feedback Area */}
      {analysisResult && (
          <div className={`p-4 rounded-xl border-l-4 shadow-sm animate-scaleIn ${analysisResult.status === 'Flagged' || !analysisResult.isValid ? 'bg-red-50 border-red-500' : 'bg-green-50 border-green-500'}`}>
              <div className="flex items-start gap-3">
                  {analysisResult.isValid && analysisResult.status === 'Submitted' ? (
                      <CheckCircle2 className="text-green-600 mt-1" />
                  ) : (
                      <AlertTriangle className="text-red-600 mt-1" />
                  )}
                  <div>
                      <h4 className={`font-bold ${analysisResult.status === 'Flagged' ? 'text-red-800' : 'text-green-800'}`}>
                          {analysisResult.status === 'Flagged' ? 'تم رصد ملاحظات حوكمة' : (!analysisResult.isValid ? 'خطأ في البيانات' : 'البيانات سليمة')}
                      </h4>
                      <ul className="mt-2 space-y-1 text-sm list-disc list-inside">
                          {analysisResult.errors.map((err, i) => <li key={`e-${i}`} className="text-red-700 font-bold">{err}</li>)}
                          {analysisResult.flags.map((flag, i) => <li key={`f-${i}`} className="text-red-600">{flag}</li>)}
                          {analysisResult.isValid && analysisResult.flags.length === 0 && (
                              <li className="text-green-700">المعادلة المحاسبية متزنة والمصروفات الإدارية في الحدود المسموحة.</li>
                          )}
                      </ul>
                  </div>
              </div>
          </div>
      )}

      {/* Main Form Grid (4 Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          
          {/* Card A: Financial Position */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="bg-gradient-to-r from-blue-900 to-navy-900 p-4 text-white flex justify-between items-center">
                  <h3 className="font-bold flex items-center gap-2"><Briefcase size={18}/> المركز المالي</h3>
              </div>
              <div className="p-4 space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">إجمالي الأصول</label>
                      <input type="number" disabled={isLocked} className="w-full p-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                          value={record.total_assets || ''} onChange={(e) => handleInputChange('total_assets', Number(e.target.value))} />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">إجمالي الالتزامات</label>
                      <input type="number" disabled={isLocked} className="w-full p-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                          value={record.total_liabilities || ''} onChange={(e) => handleInputChange('total_liabilities', Number(e.target.value))} />
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                      <label className="block text-xs font-bold text-navy-900 mb-1">صافي الأصول (المال الوقفي)</label>
                      <input 
                        type="number" 
                        readOnly
                        className="w-full p-2 border border-gray-300 rounded-lg font-bold bg-gray-100 text-navy-900 outline-none"
                        value={record.net_waqf_assets || 0} 
                      />
                      <p className="text-[10px] text-gray-400 mt-1">يتم الاحتساب تلقائياً: (الأصول - الالتزامات)</p>
                  </div>
              </div>
          </div>

          {/* Card B: Performance */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="bg-gradient-to-r from-teal-700 to-teal-900 p-4 text-white flex justify-between items-center">
                  <h3 className="font-bold flex items-center gap-2"><TrendingUp size={18}/> الأداء المالي</h3>
              </div>
              <div className="p-4 space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">إجمالي الإيرادات</label>
                      <input type="number" disabled={isLocked} className="w-full p-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-teal-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                          value={record.total_revenues || ''} onChange={(e) => handleInputChange('total_revenues', Number(e.target.value))} />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">إجمالي المصروفات</label>
                      <input type="number" disabled={isLocked} className="w-full p-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-teal-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                          value={record.total_expenses || ''} onChange={(e) => handleInputChange('total_expenses', Number(e.target.value))} />
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                      <label className="block text-xs font-bold text-navy-900 mb-1">الفائض / العجز</label>
                      <input disabled type="text" className={`w-full p-2 border rounded-lg font-bold bg-gray-100 ${(record.surplus_deficit || 0) < 0 ? 'text-red-600' : 'text-green-600'}`} 
                          value={record.surplus_deficit?.toLocaleString() || '0'} />
                  </div>
              </div>
          </div>

          {/* Card C: Cash Flows */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="bg-gradient-to-r from-orange-700 to-red-900 p-4 text-white flex justify-between items-center">
                  <h3 className="font-bold flex items-center gap-2"><ArrowRightLeft size={18}/> التدفقات النقدية</h3>
                  <span className="text-xs bg-white/20 px-2 py-1 rounded">السيولة</span>
              </div>
              <div className="p-4 space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">صافي النقد التشغيلي</label>
                      <input type="number" disabled={isLocked} className="w-full p-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-orange-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                          value={record.operating_cash_flow || ''} onChange={(e) => handleInputChange('operating_cash_flow', Number(e.target.value))} />
                      <p className="text-[9px] text-gray-400 mt-0.5">يُقترح مطابقته للفائض (قابل للتعديل)</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">الاستثماري</label>
                        <input type="number" disabled={isLocked} className="w-full p-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-orange-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                            value={record.investing_cash_flow || ''} onChange={(e) => handleInputChange('investing_cash_flow', Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">التمويلي</label>
                        <input type="number" disabled={isLocked} className="w-full p-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-orange-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                            value={record.financing_cash_flow || ''} onChange={(e) => handleInputChange('financing_cash_flow', Number(e.target.value))} />
                      </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                      <label className="block text-xs font-bold text-navy-900 mb-1 flex items-center gap-1"><Banknote size={14}/> صافي النقد (نهاية السنة)</label>
                      <input type="number" readOnly className="w-full p-2 border border-gray-300 rounded-lg font-bold bg-gray-100 text-orange-900 outline-none"
                          value={record.cash_end_period || 0} />
                      <p className="text-[10px] text-gray-400 mt-1">يتم الاحتساب تلقائياً: (تشغيلي + استثماري + تمويلي)</p>
                  </div>
              </div>
          </div>

          {/* Card D: Governance (Simplified) */}
          <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow">
              <div className="bg-gradient-to-r from-purple-800 to-indigo-900 p-4 text-white flex justify-between items-center">
                  <h3 className="font-bold flex items-center gap-2"><Scale size={18}/> الحوكمة المالية</h3>
              </div>
              <div className="p-4 space-y-4 h-full">
                  <div>
                      <label className="block text-xs font-bold text-gray-600 mb-1">المصروفات الإدارية والرواتب</label>
                      <input type="number" disabled={isLocked} className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-purple-500 outline-none disabled:bg-gray-100 disabled:text-gray-500" 
                          value={record.admin_general_expenses || ''} onChange={(e) => handleInputChange('admin_general_expenses', Number(e.target.value))} />
                      
                      {(record.total_expenses || 0) > 0 && (
                          <div className={`mt-2 p-2 rounded text-xs font-bold text-center ${((record.admin_general_expenses || 0) / (record.total_expenses || 1) * 100) > 20 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-600 border border-green-200'}`}>
                              نسبة الإدارية: {((record.admin_general_expenses || 0) / (record.total_expenses || 1) * 100).toFixed(1)}% <br/>
                              (الحد الأقصى المسموح 20%)
                          </div>
                      )}
                  </div>
                  
                  {/* Placeholder for visual balance */}
                  <div className="pt-2 border-t border-gray-100 text-center text-gray-400 text-xs">
                      <ShieldCheck size={48} className="mx-auto mb-2 opacity-20" />
                      <p>مؤشر الالتزام بضوابط الصرف</p>
                  </div>
              </div>
          </div>
      </div>

      {/* NEW: Attachments & Declaration Section (Full Width) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 p-4 border-b border-gray-200 flex items-center gap-2">
              <Paperclip size={20} className="text-navy-900"/>
              <h3 className="font-bold text-navy-900">المرفقات والإقرار</h3>
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column: Upload */}
              <div>
                  <label className="block text-sm font-bold text-gray-700 mb-3">إرفاق تقرير المدقق المالي (PDF)</label>
                  {pdfFile ? (
                      <div className="flex items-center justify-between bg-blue-50 p-4 rounded-xl border border-blue-200 text-blue-900">
                          <div className="flex items-center gap-3">
                              <div className="bg-white p-2 rounded-lg text-red-500 shadow-sm"><FileText size={24}/></div>
                              <div>
                                  <AttachmentLink doc={pdfFile} />
                                  <span className="text-xs opacity-70">{pdfFile.size} - تم الرفع</span>
                              </div>
                          </div>
                          {!isLocked && <button onClick={removeReportFile} className="text-red-500 hover:bg-red-100 p-2 rounded-full transition-colors"><XCircle size={20}/></button>}
                      </div>
                  ) : (
                      <label className={`flex flex-col items-center justify-center gap-3 w-full h-32 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 text-gray-500 cursor-pointer hover:bg-gray-100 hover:border-blue-400 transition-all group ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          <div className="p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                              <UploadCloud size={24} className="text-blue-500" />
                          </div>
                          <span className="text-sm font-medium">اضغط هنا لرفع ملف التقرير</span>
                          <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleFileUpload} disabled={isLocked} />
                      </label>
                  )}
                  <p className="text-xs text-gray-400 mt-2">يجب أن يكون الملف بصيغة PDF وموقعاً من مكتب التدقيق المعتمد.</p>
              </div>

              {/* Right Column: Declaration */}
              <div className="bg-amber-50 rounded-xl p-5 border border-amber-100 flex flex-col justify-center">
                  <h4 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                      <ShieldCheck size={18}/> إقرار صحة البيانات
                  </h4>
                  <p className="text-sm text-amber-800 mb-4 leading-relaxed opacity-90">
                      بصفتي مخولاً عن المؤسسة الوقفية، أقر بأن جميع البيانات المالية المدخلة أعلاه صحيحة ومطابقة تماماً لتقرير المدقق المالي المرفق، وأتحمل المسؤولية القانونية في حال ثبوت خلاف ذلك.
                  </p>
                  <label className="flex items-center gap-3 cursor-pointer bg-white p-3 rounded-lg border border-amber-200 shadow-sm hover:border-amber-400 transition-colors">
                      <input type="checkbox" disabled={isLocked} className="w-5 h-5 text-navy-900 rounded focus:ring-navy-900 disabled:opacity-50" 
                          checked={isConfirmed} onChange={(e) => setIsConfirmed(e.target.checked)} />
                      <span className="text-sm font-bold text-navy-900">
                          نعم، أقر بصحة البيانات ومطابقتها.
                      </span>
                  </label>
              </div>
          </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
          {!isLocked && (
            <button 
                disabled={loading || !isConfirmed}
                onClick={handleSubmit}
                className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 ${loading || !isConfirmed ? 'bg-gray-400 cursor-not-allowed' : 'bg-navy-800 hover:bg-navy-900'}`}
            >
                <Save size={20} /> {loading ? 'جاري الحفظ...' : 'حفظ وإرسال البيانات المالية'}
            </button>
          )}
      </div>

    </div>
  );
};

export default FinancialReports;
