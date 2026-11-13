
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInstitutions, saveInstitution, deleteInstitution, generateId, getInstitutionProgress, uploadFile, deleteFile } from '../services/db';
import AttachmentLink, { ATTACHMENT_ACCEPT } from '../components/AttachmentLink';
import { Institution, InstitutionType, InstitutionDocument } from '../types';
import { GOVERNORATES, OMAN_LOCATIONS } from '../constants';
import { Plus, Search, Edit2, Trash2, X, FileText, UploadCloud, Calendar, Hash, User, CheckCircle2, Phone, AlertCircle, Building, AlertTriangle, Briefcase, MapPin, Mail, DollarSign, Users, LayoutGrid, ChevronLeft, ChevronRight, Lock, Eye } from 'lucide-react';
import { useUi } from '../contexts/UiContext';

// توسيع الواجهة محلياً لتشمل تاريخ الانتهاء للعرض فقط
interface ExtendedFormData extends Partial<Institution> {
  expiry_date?: string;
}

const ITEMS_PER_PAGE = 10;

const Institutions: React.FC = () => {
  const [list, setList] = useState<Institution[]>([]);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<ExtendedFormData>({});
  const { showToast, role, currentWaqfId, setWaqfContext } = useUi();
  const navigate = useNavigate();

  // Calculate Lock Status for the form
  const isFormLocked = useMemo(() => {
      if (!formData.id) return false; // New Institution is never locked
      const progress = getInstitutionProgress(formData.id);
      return progress.isLocked; 
  }, [formData.id]);

  useEffect(() => {
    setList(getInstitutions());
  }, []);

  // Check if current user profile is incomplete
  const isCurrentProfileIncomplete = currentWaqfId && list.find(i => i.id === currentWaqfId)?.profile_completed !== true;

  // دالة حساب تاريخ الانتهاء (3 سنوات) تلقائياً
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const estDate = e.target.value;
    let expiryDate = '';

    if (estDate) {
      const date = new Date(estDate);
      if (!isNaN(date.getTime())) {
        date.setFullYear(date.getFullYear() + 3);
        expiryDate = date.toISOString().split('T')[0];
      }
    }

    setFormData(prev => ({
      ...prev,
      establishment_date: estDate,
      expiry_date: expiryDate
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isFormLocked) {
        showToast('عذراً، لا يمكن تعديل البيانات لأن الملف قيد المراجعة أو معتمد.', 'error');
        return;
    }

    const isNew = !formData.id;

    if (role === 'admin') {
      // للأدمن: يكفي اسم المؤسسة فقط — المؤسسة ستكمل بياناتها بنفسها
      if (!formData.name?.trim()) {
        showToast('يرجى إدخال اسم المؤسسة على الأقل.', 'error');
        return;
      }
    } else {
      // للمؤسسة: التحقق الصارم من جميع الحقول
      if (
          !formData.name || 
          !formData.type || 
          formData.capital_omr === undefined || 
          !formData.contact_phone || 
          !formData.email || 
          !formData.governorate || 
          !formData.wilayat || 
          !formData.establishment_date || 
          !formData.license_number || 
          !formData.manager_name
      ) {
          showToast('عذراً، جميع الحقول إجبارية بما فيها رقم الهاتف وتاريخ المجلس.', 'error');
          return;
      }
    }

    const newInst: Institution = {
      id: formData.id || generateId(),
      name: formData.name!,
      type: (formData.type as InstitutionType) || 'وقفية عامة',
      capital_omr: Number(formData.capital_omr) || 0,
      employees_omani: Number(formData.employees_omani) || 0,
      employees_non_omani: Number(formData.employees_non_omani) || 0,
      employees_seconded: Number(formData.employees_seconded) || 0,
      contact_phone: formData.contact_phone || '',
      email: formData.email || '',
      governorate: formData.governorate || '',
      wilayat: formData.wilayat || '',
      establishment_date: formData.establishment_date || '',
      license_number: formData.license_number || '',
      manager_name: formData.manager_name || '',
      declaration_date: formData.declaration_date,
      commercial_record_number: formData.commercial_record_number,
      establishment_decision_doc: formData.establishment_decision_doc,
      // الأدمن يضيف المؤسسة كـ"غير مكتملة" — المؤسسة ستكملها بنفسها
      profile_completed: role === 'admin' ? false : true,
      documents: formData.documents || [],
      created_at: formData.created_at || new Date().toISOString(),
    };

    let newAccount = null;
    try {
      newAccount = await saveInstitution(newInst);
    } catch {
      return; // رسالة الخطأ تظهر تلقائياً
    }

    // إذا أضاف الأدمن مؤسسة جديدة، ينشئ الخادم رمز دخول وكلمة مرور عشوائية تظهر مرة واحدة
    if (role === 'admin' && isNew) {
      if (newAccount) {
        window.dispatchEvent(new CustomEvent('showCredentials', { detail: { title: 'تمت إضافة المؤسسة', accounts: [{ ...newAccount, name: newInst.name }] } }));
      } else {
        showToast('تم إضافة المؤسسة بنجاح وسيظهر رمز دخولها في قائمة الحسابات.', 'success');
      }
    }

    setList(getInstitutions());
    setShowForm(false);
    setFormData({});
    
    // تحديث السياق وإعطاء صلاحية الدخول للمؤسسة
    if (role === 'user') {
        setWaqfContext(newInst.id);
        if (isCurrentProfileIncomplete) {
            showToast('تم حفظ البيانات. جاري الانتقال للخطوة التالية...', 'success');
            setTimeout(() => {
                navigate('/financial-reports');
            }, 1000);
        } else {
            showToast('تم حفظ بيانات المؤسسة بنجاح', 'success');
        }
    } else if (role !== 'admin' || !isNew) {
        showToast('تم حفظ بيانات المؤسسة بنجاح', 'success');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isFormLocked) return;
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          try {
          const newDoc = await uploadFile(file, role === 'admin' ? formData.id : currentWaqfId);
          setFormData(prev => ({
              ...prev,
              documents: [...(prev.documents || []), newDoc]
          }));
          showToast('تم إرفاق الملف بنجاح', 'info');
          } catch (err: any) {
              showToast(err.message, 'error');
          }
      }
  };

  const handleDecisionDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isFormLocked) return;
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          try {
          const newDoc = await uploadFile(file, role === 'admin' ? formData.id : currentWaqfId);
          setFormData(prev => ({
              ...prev,
              establishment_decision_doc: newDoc
          }));
          showToast('تم إرفاق قرار التأسيس بنجاح', 'info');
          } catch (err: any) {
              showToast(err.message, 'error');
          }
      }
  };

  const removeDocument = async (doc: InstitutionDocument, decision = false) => {
      if (isFormLocked) return;
      try {
          if (doc.file_id) await deleteFile(doc.file_id);
          setFormData(prev => decision
              ? { ...prev, establishment_decision_doc: undefined }
              : { ...prev, documents: prev.documents?.filter(d => d.id !== doc.id) });
      } catch (err: any) {
          showToast(err.message, 'error');
      }
  };

  const handleDelete = (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذه المؤسسة؟')) {
      deleteInstitution(id);
      setList(getInstitutions());
      if (currentWaqfId === id) setWaqfContext('');
      showToast('تم حذف المؤسسة', 'info');
    }
  };
  
  const handleSelectContext = (id: string) => {
      setWaqfContext(id);
      showToast('تم اختيار المؤسسة للعمل عليها', 'success');
  };

  // --- Filtering & Pagination Logic ---
  const filtered = useMemo(() => {
    return list.filter(i => {
        if (!i.name.includes(search)) return false;
        if (currentWaqfId) {
            return i.id === currentWaqfId;
        }
        return true;
    });
  }, [list, search, currentWaqfId]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  
  const paginatedData = useMemo(() => {
      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const goToPage = (page: number) => {
      if (page >= 1 && page <= totalPages) {
          setCurrentPage(page);
      }
  };

  const availableWilayats = formData.governorate && OMAN_LOCATIONS[formData.governorate] 
    ? OMAN_LOCATIONS[formData.governorate] 
    : [];

  const currentInstitutionName = list.find(i => i.id === currentWaqfId)?.name;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-navy-900 dark:text-white">بيانات المؤسسات</h2>
        {role === 'admin' && (
            <button 
            onClick={() => { setFormData({}); setShowForm(true); }}
            className="bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-navy-900 transition-all duration-300 hover:scale-105 active:scale-95 shadow-md"
            >
            <Plus size={18} /> إضافة مؤسسة
            </button>
        )}
      </div>

      {/* WARNING BANNER IF PROFILE INCOMPLETE */}
      {isCurrentProfileIncomplete && role === 'user' && (
           <div className="bg-red-50 border-r-4 border-red-500 p-4 rounded-lg shadow-sm animate-pulse">
               <div className="flex items-start gap-3">
                   <AlertTriangle className="text-red-500 mt-0.5" size={24} />
                   <div>
                       <h3 className="font-bold text-red-800 text-lg">إجراء مطلوب: تحديث البيانات</h3>
                       <p className="text-red-700 text-sm">
                           لم تقم بتأكيد بيانات المؤسسة بعد. يجب عليك الضغط على زر التعديل <Edit2 size={12} className="inline"/>، مراجعة البيانات، ثم الضغط على "حفظ" لتفعيل باقي صفحات النظام.
                       </p>
                   </div>
               </div>
           </div>
      )}

      {/* Context Banner for Admins */}
      {currentWaqfId && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between text-blue-900 animate-fadeIn transition-transform hover:scale-[1.01] duration-300">
              <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg"><Building size={20} className="text-blue-700"/></div>
                  <div>
                      <div className="text-xs text-blue-600 uppercase font-bold tracking-wider">تصفية العرض حسب:</div>
                      <div className="text-lg font-bold">{currentInstitutionName}</div>
                  </div>
              </div>
              {role === 'admin' && (
                  <button 
                    onClick={() => { setWaqfContext(''); setCurrentPage(1); }}
                    className="text-xs bg-white border border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-blue-700 transition-colors"
                  >
                      عرض الكل
                  </button>
              )}
          </div>
      )}

      <div className="relative">
        <input
          type="text"
          placeholder="بحث عن مؤسسة..."
          className="w-full md:w-1/3 p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-800 outline-none transition-shadow focus:shadow-md"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
        />
        <Search className="absolute top-3.5 right-3 text-gray-400" size={18} />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-right min-w-[600px]">
          <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
            <tr>
              <th className="p-4">المؤسسة</th>
              <th className="p-4">النوع</th>
              <th className="p-4">رقم القرار</th>
              <th className="p-4">تأسيس المجلس</th>
              <th className="p-4">المحافظة</th>
              <th className="p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {paginatedData.length > 0 ? (
                paginatedData.map(inst => (
                <tr key={inst.id} className={`transition-colors duration-200 ${currentWaqfId === inst.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-blue-50/50 dark:hover:bg-gray-700/50'}`}>
                    <td className="p-4 font-medium text-navy-900 dark:text-gray-200">
                        <div className="flex items-center gap-2">
                            {currentWaqfId === inst.id && <CheckCircle2 size={16} className="text-teal-500" />}
                            <div>
                                <div>{inst.name}</div>
                                <div className="text-xs text-gray-400 font-normal">{inst.contact_phone}</div>
                            </div>
                        </div>
                    </td>
                    <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs ${inst.type === 'وقفية عامة' ? 'bg-teal-100 text-teal-800' : 'bg-gold-100 text-gold-800'}`}>
                        {inst.type}
                    </span>
                    </td>
                    <td className="p-4 font-mono dark:text-gray-300">{inst.license_number}</td>
                    <td className="p-4 text-sm dark:text-gray-300">{inst.establishment_date}</td>
                    <td className="p-4">
                        <div className="text-sm dark:text-gray-300">{inst.governorate}</div>
                        <div className="text-xs text-gray-500">{inst.wilayat}</div>
                    </td>
                    <td className="p-4 flex gap-2 items-center">
                    {role === 'user' && currentWaqfId !== inst.id && (
                        <button onClick={() => handleSelectContext(inst.id)} className="text-xs bg-navy-100 text-navy-800 px-2 py-1 rounded hover:bg-navy-200 transition-colors">
                            اختيار
                        </button>
                    )}
                    <button onClick={() => { 
                        let expDate = '';
                        if (inst.establishment_date) {
                            const d = new Date(inst.establishment_date);
                            d.setFullYear(d.getFullYear() + 3);
                            expDate = d.toISOString().split('T')[0];
                        }
                        setFormData({...inst, expiry_date: expDate}); 
                        setShowForm(true); 
                        }} 
                        className={`text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-transform hover:scale-110 ${!inst.profile_completed && role === 'user' ? 'animate-bounce font-bold' : ''}`}
                    >
                        {getInstitutionProgress(inst.id).isLocked ? <Eye size={18} /> : <Edit2 size={18} />}
                        {(!inst.profile_completed && role === 'user') ? 'تعديل وتفعيل' : ''}
                    </button>
                    {role === 'admin' && (
                        <button onClick={() => handleDelete(inst.id)} className="text-red-600 hover:text-red-800 transition-transform hover:scale-110">
                            <Trash2 size={18} />
                        </button>
                    )}
                    </td>
                </tr>
                ))
            ) : (
                <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                        لا توجد مؤسسات تطابق معايير البحث أو التصفية الحالية.
                        {currentWaqfId && role === 'admin' && (
                             <div className="mt-2">
                                 <button onClick={() => setWaqfContext('')} className="text-blue-600 underline text-sm">عرض جميع المؤسسات</button>
                             </div>
                        )}
                    </td>
                </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-4 text-sm">
            <button 
                onClick={() => goToPage(currentPage - 1)} 
                disabled={currentPage === 1}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border border-gray-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
                <ChevronRight size={16} /> السابق
            </button>
            
            <div className="flex items-center gap-2">
                <span className="font-bold text-navy-900">صفحة {currentPage} من {totalPages}</span>
                <span className="text-gray-500">({filtered.length} مؤسسة)</span>
            </div>

            <button 
                onClick={() => goToPage(currentPage + 1)} 
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-4 py-2 rounded-lg border border-gray-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
                التالي <ChevronLeft size={16} />
            </button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-navy-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto animate-scaleIn shadow-2xl relative border-4 border-white">
            
            {/* STYLISH HEADER */}
            <div className="relative bg-navy-900 p-5 sm:p-8 overflow-hidden rounded-t-[16px] sm:rounded-t-[20px]">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-teal-500/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>
                
                <div className="relative z-10 flex justify-between items-start gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h3 className="text-xl sm:text-3xl font-bold text-white flex items-center gap-2">
                                <Building className="text-gold-500 shrink-0" size={24} />
                                {formData.id ? (isFormLocked ? 'عرض بيانات المؤسسة' : 'تعديل بيانات المؤسسة') : 'تسجيل مؤسسة جديدة'}
                            </h3>
                            {isFormLocked && (
                                <span className="bg-red-500/20 text-red-200 border border-red-500/50 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Lock size={10} /> للعرض فقط
                                </span>
                            )}
                        </div>
                        <p className="text-blue-200 text-xs sm:text-sm">يرجى تعبئة كافة البيانات بدقة لضمان سير عملية التقييم.</p>
                    </div>
                    <button onClick={() => setShowForm(false)} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors shrink-0">
                        <X size={22} />
                    </button>
                </div>
            </div>

            {/* Content Container */}
            <div className="p-4 sm:p-8">
                {isFormLocked ? (
                    <div className="bg-blue-50 border-r-4 border-blue-500 p-4 rounded-lg mb-8 flex gap-3 shadow-sm">
                        <Lock className="w-6 h-6 text-blue-600 shrink-0" />
                        <p className="text-sm text-blue-800 font-medium">تم إرسال الملف للاعتماد. لا يمكن تعديل البيانات في هذه المرحلة حتى تكتمل المراجعة.</p>
                    </div>
                ) : (
                    <div className="bg-amber-50 border-r-4 border-amber-500 p-4 rounded-lg mb-8 flex gap-3 shadow-sm">
                        <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                        <p className="text-sm text-amber-800 font-medium">تنبيه: لن تتمكن من الدخول إلى صفحة "الأداء المؤسسي" إلا بعد تعبئة وحفظ كافة البيانات في هذا النموذج.</p>
                    </div>
                )}

                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                
                {/* SECTION 1: BASIC INFO */}
                <div className="lg:col-span-3">
                    <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shadow-sm">
                            <FileText size={20} />
                        </div>
                        <h4 className="text-xl font-bold text-navy-900">البيانات الأساسية</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         {/* Name */}
                        <div className="md:col-span-2 group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">اسم المؤسسة *</label>
                            <div className="relative">
                                <Briefcase className="absolute top-3 right-3 text-gray-400 group-focus-within:text-teal-600 transition-colors" size={18} />
                                <input required 
                                    disabled={isFormLocked}
                                    className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" 
                                    value={formData.name || ''} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                    placeholder="مثال: مؤسسة مسقط الوقفية"
                                />
                            </div>
                        </div>

                         {/* Type */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">نوع المؤسسة *</label>
                            <div className="relative">
                                <LayoutGrid className="absolute top-3 right-3 text-gray-400 group-focus-within:text-teal-600 transition-colors" size={18} />
                                <select 
                                    disabled={isFormLocked}
                                    className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all appearance-none bg-white disabled:bg-gray-100 disabled:text-gray-500" 
                                    value={formData.type || 'وقفية عامة'} 
                                    onChange={e => setFormData({...formData, type: e.target.value as any})}
                                >
                                    <option value="وقفية عامة">وقفية عامة</option>
                                    <option value="وقفية خاصة">وقفية خاصة</option>
                                </select>
                            </div>
                        </div>

                         {/* License */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">رقم القرار *</label>
                            <div className="relative">
                                <Hash className="absolute top-3 right-3 text-gray-400 group-focus-within:text-teal-600 transition-colors" size={18} />
                                <input required={role !== 'admin'} type="text" disabled={isFormLocked} placeholder="مثال: 1234/2018" className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.license_number || ''} onChange={e => setFormData({...formData, license_number: e.target.value})} />
                            </div>
                        </div>

                         {/* Declaration Date */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">تاريخ الإشهار</label>
                            <div className="relative">
                                <Calendar className="absolute top-3 right-3 text-gray-400 group-focus-within:text-teal-600 transition-colors" size={18} />
                                <input type="date" disabled={isFormLocked} className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.declaration_date || ''} onChange={e => setFormData({...formData, declaration_date: e.target.value})} />
                            </div>
                        </div>

                         {/* Commercial Record Number */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">رقم السجل التجاري</label>
                            <div className="relative">
                                <Hash className="absolute top-3 right-3 text-gray-400 group-focus-within:text-teal-600 transition-colors" size={18} />
                                <input type="text" disabled={isFormLocked} placeholder="مثال: 1234567" className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.commercial_record_number || ''} onChange={e => setFormData({...formData, commercial_record_number: e.target.value})} />
                            </div>
                        </div>

                         {/* Est Date */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">تاريخ تأسيس المجلس *</label>
                            <div className="relative">
                                <Calendar className="absolute top-3 right-3 text-gray-400 group-focus-within:text-teal-600 transition-colors" size={18} />
                                <input required={role !== 'admin'} type="date" disabled={isFormLocked} className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.establishment_date || ''} onChange={handleDateChange} />
                            </div>
                        </div>

                         {/* Expiry Date */}
                        <div>
                            <label className="block text-sm font-bold text-red-600 mb-2">تاريخ انتهاء المجلس (تلقائي)</label>
                            <div className="relative">
                                <Calendar className="absolute top-3 right-3 text-red-300" size={18} />
                                <input disabled type="date" className="w-full p-3 pr-10 border border-red-100 bg-red-50 text-red-600 font-bold rounded-xl cursor-not-allowed" value={formData.expiry_date || ''} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 2: MANAGEMENT & LOCATION */}
                <div className="lg:col-span-3 mt-4">
                    <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
                            <User size={20} />
                        </div>
                        <h4 className="text-xl font-bold text-navy-900">الإدارة والموقع</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Manager */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">مدير المؤسسة *</label>
                            <div className="relative">
                                <User className="absolute top-3 right-3 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                                <input required={role !== 'admin'} type="text" disabled={isFormLocked} placeholder="مثال: أحمد بن سالم الهنائي" className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.manager_name || ''} onChange={e => setFormData({...formData, manager_name: e.target.value})} />
                            </div>
                        </div>
                        
                        {/* Phone */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">رقم الهاتف *</label>
                            <div className="relative">
                                <Phone className="absolute top-3 right-3 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                                <input required={role !== 'admin'} type="tel" disabled={isFormLocked} placeholder="9xxxxxxx" className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.contact_phone || ''} onChange={e => setFormData({...formData, contact_phone: e.target.value})} />
                            </div>
                        </div>

                        {/* Email */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">البريد الإلكتروني *</label>
                            <div className="relative">
                                <Mail className="absolute top-3 right-3 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                                <input required={role !== 'admin'} type="email" disabled={isFormLocked} placeholder="مثال: info@waqf.om" className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </div>
                        </div>

                        {/* Governorate */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">المحافظة *</label>
                            <div className="relative">
                                <MapPin className="absolute top-3 right-3 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                                <select required={role !== 'admin'} disabled={isFormLocked} className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none bg-white disabled:bg-gray-100 disabled:text-gray-500" value={formData.governorate || ''} onChange={e => setFormData({...formData, governorate: e.target.value, wilayat: ''})}>
                                    <option value="">اختر...</option>
                                    {GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Wilayat */}
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">الولاية *</label>
                            <div className="relative">
                                <MapPin className="absolute top-3 right-3 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                                <select 
                                    required={role !== 'admin'}
                                    className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none bg-white disabled:bg-gray-100 disabled:text-gray-500" 
                                    value={formData.wilayat || ''} 
                                    onChange={e => setFormData({...formData, wilayat: e.target.value})} 
                                    disabled={!formData.governorate || isFormLocked}
                                >
                                    <option value="">اختر...</option>
                                    {availableWilayats.map(w => <option key={w} value={w}>{w}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 3: FINANCIALS */}
                <div className="lg:col-span-3 mt-4">
                     <div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100">
                        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-sm">
                            <DollarSign size={20} />
                        </div>
                        <h4 className="text-xl font-bold text-navy-900">البيانات المالية والبشرية</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">رأس المال (ر.ع) *</label>
                            <div className="relative">
                                <DollarSign className="absolute top-3 right-3 text-gray-400 group-focus-within:text-purple-600 transition-colors" size={18} />
                                <input type="number" required={role !== 'admin'} disabled={isFormLocked} placeholder="مثال: 250000" className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.capital_omr || ''} onChange={e => setFormData({...formData, capital_omr: Number(e.target.value)})} />
                            </div>
                        </div>
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">الموظفين العمانيين</label>
                             <div className="relative">
                                <Users className="absolute top-3 right-3 text-gray-400 group-focus-within:text-purple-600 transition-colors" size={18} />
                                 <input type="number" disabled={isFormLocked} placeholder="مثال: 12" className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.employees_omani || ''} onChange={e => setFormData({...formData, employees_omani: Number(e.target.value)})} />
                            </div>
                        </div>
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">الموظفين غير العمانيين</label>
                            <div className="relative">
                                <Users className="absolute top-3 right-3 text-gray-400 group-focus-within:text-purple-600 transition-colors" size={18} />
                                 <input type="number" disabled={isFormLocked} placeholder="مثال: 3" className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.employees_non_omani || ''} onChange={e => setFormData({...formData, employees_non_omani: Number(e.target.value)})} />
                            </div>
                        </div>
                        <div className="group">
                            <label className="block text-sm font-bold text-gray-700 mb-2">الموظفين المفرغين</label>
                            <div className="relative">
                                <Users className="absolute top-3 right-3 text-gray-400 group-focus-within:text-purple-600 transition-colors" size={18} />
                                 <input type="number" disabled={isFormLocked} placeholder="مثال: 2" className="w-full p-3 pr-10 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition-all disabled:bg-gray-100 disabled:text-gray-500" value={formData.employees_seconded || ''} onChange={e => setFormData({...formData, employees_seconded: Number(e.target.value)})} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* SECTION 4: FILES */}
                <div className="lg:col-span-3 mt-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                    <h4 className="font-bold text-sm mb-4 text-gray-700">ملفات المؤسسة</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {/* Decision Doc Upload */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">مرفقات قرار التأسيس</label>
                            {formData.establishment_decision_doc ? (
                                <div className="flex justify-between items-center bg-white p-3 rounded-lg border shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-teal-50 p-1.5 rounded text-teal-500"><FileText size={16} /></div>
                                        <div className="flex flex-col">
                                            <AttachmentLink doc={formData.establishment_decision_doc} />
                                            <span className="text-[10px] text-gray-400">{formData.establishment_decision_doc.size}</span>
                                        </div>
                                    </div>
                                    {!isFormLocked && (
                                        <button type="button" onClick={() => removeDocument(formData.establishment_decision_doc!, true)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors">
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <label className={`cursor-pointer bg-white border-2 border-dashed border-gray-300 hover:border-teal-500 hover:bg-teal-50/50 text-gray-500 hover:text-teal-700 p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all group ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    <UploadCloud size={20} className="text-gray-400 group-hover:text-teal-600" />
                                    <span className="font-bold text-xs">إرفاق قرار التأسيس</span>
                                    <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleDecisionDocUpload} disabled={isFormLocked} />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 mb-4">
                        {formData.documents && formData.documents.length > 0 && formData.documents.map((doc, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border shadow-sm min-w-[200px]">
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-50 p-1.5 rounded text-blue-500"><FileText size={16} /></div>
                                    <div className="flex flex-col">
                                        <AttachmentLink doc={doc} />
                                        <span className="text-[10px] text-gray-400">{doc.size}</span>
                                    </div>
                                </div>
                                {!isFormLocked && (
                                    <button type="button" onClick={() => removeDocument(doc)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    <label className={`cursor-pointer bg-white border-2 border-dashed border-gray-300 hover:border-navy-500 hover:bg-blue-50/50 text-gray-500 hover:text-navy-700 p-8 rounded-xl flex flex-col items-center justify-center gap-2 transition-all group ${isFormLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <div className="bg-gray-100 group-hover:bg-white p-3 rounded-full transition-colors">
                            <UploadCloud size={24} className="text-gray-400 group-hover:text-navy-600" />
                        </div>
                        <span className="font-bold text-sm">إرفاق الخطة السنوية للمؤسسة</span>
                        <span className="text-xs opacity-70">المستندات، السجل التجاري، التراخيص</span>
                        <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleFileUpload} disabled={isFormLocked} />
                    </label>
                </div>

                {/* FOOTER ACTIONS */}
                <div className="lg:col-span-3 flex justify-end gap-4 pt-6 mt-4 border-t border-gray-100 sticky bottom-0 bg-white/80 backdrop-blur-sm p-4 -mx-4 -mb-4">
                    <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-bold transition-colors">إغلاق</button>
                    {!isFormLocked && (
                        <button type="submit" className="px-8 py-3 bg-gradient-to-r from-navy-800 to-navy-700 text-white rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 font-bold flex items-center gap-2">
                            <CheckCircle2 size={20} /> حفظ واعتماد البيانات
                        </button>
                    )}
                </div>

                </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Institutions;
