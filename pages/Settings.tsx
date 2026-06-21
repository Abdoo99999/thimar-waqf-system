import React, { useState, useEffect } from 'react';
import { Save, Download, Upload, Activity, User, Calendar, FileText, Zap, RefreshCw, Trash2, RotateCcw } from 'lucide-react';
import { getSettings, saveSettings, clearSystemCache, performSmartCleanup } from '../services/db';
import { useUi } from '../contexts/UiContext';

// Mock Data for Audit Log
const MOCK_AUDIT_LOGS = [
    { id: 1, user: 'مدير النظام', action: 'تحديث الإعدادات العامة', date: '2024-05-20 10:30 ص' },
    { id: 2, user: 'مؤسسة الإمام جابر', action: 'تحديث بيانات المؤسسة', date: '2024-05-20 09:15 ص' },
    { id: 3, user: 'مؤسسة البريمي', action: 'إضافة تقييم جديد', date: '2024-05-19 02:20 م' },
    { id: 4, user: 'مدير النظام', action: 'إنشاء نسخة احتياطية', date: '2024-05-18 04:45 م' },
    { id: 5, user: 'مؤسسة مسقط', action: 'رفع مستندات الامتثال', date: '2024-05-18 11:10 ص' },
];

const Settings: React.FC = () => {
  const [formData, setFormData] = useState<any>({
      managerName: '',
      orgName: ''
  });
  const { showToast } = useUi();

  useEffect(() => {
      const settings = getSettings();
      setFormData({
          managerName: settings.managerName || '',
          orgName: settings.orgName || ''
      });
      document.documentElement.classList.remove('dark');
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
      saveSettings({ ...formData, darkMode: false });
      showToast('تم حفظ الإعدادات بنجاح', 'success');
  };

  // --- (تعديل هام) دوال التنظيف تعمل مباشرة بدون رسائل تأكيد لأن المتصفح يمنعها ---
  
  const handleSmartCleanup = () => {
      // تم إزالة window.confirm لتجاوز الحظر الأمني
      performSmartCleanup();
  };

  const handleFactoryReset = () => {
      // تم إزالة window.confirm لتجاوز الحظر الأمني
      clearSystemCache();
  };

  const exportData = () => {
      const data = { ...localStorage };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waqf-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      showToast('تم تصدير النسخة الاحتياطية', 'success');
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const data = JSON.parse(evt.target?.result as string);
              Object.keys(data).forEach(key => {
                  localStorage.setItem(key, data[key]);
              });
              showToast('تم استعادة البيانات بنجاح', 'success');
              setTimeout(() => window.location.reload(), 2000);
          } catch (err) {
              showToast('خطأ في الملف', 'error');
          }
      };
      reader.readAsText(file);
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold text-navy-900">إعدادات النظام</h2>
      </div>

      {/* General Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-lg mb-2 text-navy-900">الإعدادات العامة</h3>
            <p className="text-gray-500 text-sm">تخصيص بيانات النظام الأساسية</p>
        </div>
        <div className="p-6 space-y-4 max-w-2xl">
            <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">اسم الجهة المشرفة</label>
                <input 
                    name="orgName" type="text" 
                    className="w-full p-2 border rounded-lg bg-gray-50 text-gray-900 border-gray-200 outline-none focus:ring-2 focus:ring-navy-800 transition-all" 
                    value={formData.orgName} onChange={handleChange}
                />
            </div>
        </div>
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
            <button onClick={handleSave} className="bg-navy-800 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-navy-900 transition-colors shadow-md font-medium">
                <Save size={18} /> حفظ التغييرات
            </button>
        </div>
      </div>

      {/* Performance & Maintenance */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
             <div>
                <h3 className="font-bold text-lg mb-2 text-teal-700 flex items-center gap-2">
                    <Zap size={20}/> صيانة النظام والأداء (Memory & Cache)
                </h3>
                <p className="text-gray-500 text-sm">أدوات لتحسين سرعة النظام وحل مشاكل البطء</p>
             </div>
        </div>
        <div className="p-6 bg-teal-50/30">
             <div className="flex flex-col gap-6">
                 {/* Option 1: Smart Speed Up */}
                 <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-teal-100 pb-6">
                     <div className="flex-1">
                         <p className="font-bold text-teal-900 mb-1 flex items-center gap-2"><RefreshCw size={18}/> بدء التسريع (موصى به)</p>
                         <p className="text-sm text-gray-600">
                             استخدم هذا الخيار إذا كان النظام بطيئاً. سيقوم بحذف البيانات الزائدة وإبقاء أهم 5 مؤسسات فقط للعمل عليها.
                         </p>
                     </div>
                     <button 
                       type="button"
                       onClick={handleSmartCleanup}
                       className="bg-teal-600 text-white px-6 py-3 rounded-xl hover:bg-teal-700 shadow-md flex items-center gap-2 font-bold whitespace-nowrap transition-transform hover:scale-105 active:scale-95"
                     >
                         <Zap size={18} /> تطبيق التسريع الآن
                     </button>
                 </div>

                 {/* Option 2: Factory Reset */}
                 <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                     <div className="flex-1">
                         <p className="font-bold text-red-800 mb-1 flex items-center gap-2"><Trash2 size={18}/> إعادة تعيين كاملة (Factory Reset)</p>
                         <p className="text-sm text-gray-600">
                             إذا واجهت أخطاء برمجية أو توقف للنظام، استخدم هذا الخيار لمسح الذاكرة تماماً وإعادة تحميل البيانات الافتراضية.
                         </p>
                     </div>
                     <button 
                       type="button"
                       onClick={handleFactoryReset}
                       className="bg-white border border-red-300 text-red-600 px-6 py-3 rounded-xl hover:bg-red-50 hover:text-red-700 flex items-center gap-2 font-bold whitespace-nowrap transition-colors"
                     >
                         <RotateCcw size={18} /> إعادة ضبط المصنع
                     </button>
                 </div>
             </div>
        </div>
      </div>

      {/* Backup Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-lg mb-2 text-blue-600">النسخ الاحتياطي واستعادة البيانات</h3>
            <p className="text-gray-500 text-sm">حفظ نسخة من جميع البيانات محلياً</p>
        </div>
        <div className="p-6 flex gap-4">
            <button onClick={exportData} className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 flex items-center gap-2 transition-colors font-medium">
                <Download size={18} /> تصدير قاعدة البيانات (JSON)
            </button>
            <label className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer transition-colors shadow-md font-medium">
                <Upload size={18} /> استيراد قاعدة البيانات
                <input type="file" accept=".json" className="hidden" onChange={importData} />
            </label>
        </div>
      </div>
      
      {/* Audit Log Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <div>
                <h3 className="font-bold text-lg mb-2 text-navy-900 flex items-center gap-2"><Activity size={20} className="text-teal-600"/> سجل التدقيق</h3>
                <p className="text-gray-500 text-sm">آخر الأنشطة والإجراءات التي تمت على النظام</p>
            </div>
            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded border border-gray-200">آخر 5 عمليات</span>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
                <thead className="bg-gray-50 text-gray-600 border-b border-gray-100">
                    <tr><th className="p-4 font-bold">المستخدم</th><th className="p-4 font-bold">الإجراء</th><th className="p-4 font-bold">التاريخ</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {MOCK_AUDIT_LOGS.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 flex items-center gap-2 text-navy-900 font-medium"><div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><User size={14} /></div>{log.user}</td>
                            <td className="p-4 text-gray-600"><span className="inline-flex items-center gap-2"><FileText size={14} className="text-gray-400" />{log.action}</span></td>
                            <td className="p-4 text-gray-500 font-mono text-xs"><span className="inline-flex items-center gap-2 bg-gray-50 px-2 py-1 rounded"><Calendar size={12} />{log.date}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default Settings;