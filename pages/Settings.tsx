import React, { useState, useEffect } from 'react';
import { Save, Download, Upload, RefreshCw } from 'lucide-react';
import { getSettings, saveSettings, refreshData, exportBackup, importBackup } from '../services/db';
import { useUi } from '../contexts/UiContext';

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

  const [restoring, setRestoring] = useState(false);

  // تحديث البيانات من الخادم (بدلاً من أدوات تنظيف الذاكرة القديمة)
  const handleRefresh = async () => {
      try { await refreshData(); showToast('تم تحديث البيانات من الخادم', 'success'); }
      catch (e: any) { showToast(e?.message || 'تعذر التحديث', 'error'); }
  };

  // نسخة احتياطية كاملة من قاعدة البيانات في الخادم
  const exportData = async () => {
      try {
          const data = await exportBackup();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `waqf-backup-${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('تم تصدير النسخة الاحتياطية', 'success');
      } catch (e: any) { showToast(e?.message || 'تعذر التصدير', 'error'); }
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!window.confirm('ستُستبدل كل بيانات النظام الحالية بمحتوى هذا الملف. هل تريد المتابعة؟')) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
          setRestoring(true);
          try {
              const data = JSON.parse(evt.target?.result as string);
              const r = await importBackup(data);
              showToast('تم استعادة البيانات بنجاح', 'success');
              if (r?.new_accounts?.length) {
                  window.dispatchEvent(new CustomEvent('showCredentials', { detail: { title: 'حسابات جديدة للمؤسسات المستعادة', accounts: r.new_accounts } }));
              }
          } catch (err: any) {
              showToast(err?.message || 'خطأ في الملف', 'error');
          } finally { setRestoring(false); }
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

      {/* Data refresh */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex-1">
                <p className="font-bold text-teal-900 mb-1 flex items-center gap-2"><RefreshCw size={18}/> تحديث البيانات</p>
                <p className="text-sm text-gray-600">يجلب آخر ما أدخلته المؤسسات من الخادم دون إعادة تحميل الصفحة.</p>
            </div>
            <button type="button" onClick={handleRefresh} className="bg-teal-600 text-white px-6 py-3 rounded-xl hover:bg-teal-700 shadow-md flex items-center gap-2 font-bold whitespace-nowrap">
                <RefreshCw size={18} /> تحديث الآن
            </button>
        </div>
      </div>

      {/* Backup Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-lg mb-2 text-blue-600">النسخ الاحتياطي واستعادة البيانات</h3>
            <p className="text-gray-500 text-sm">تنزيل نسخة من كل بيانات النظام في الخادم، أو استعادتها. (كلمات المرور لا تدخل في النسخة)</p>
        </div>
        <div className="p-6 flex gap-4">
            <button onClick={exportData} className="border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 flex items-center gap-2 transition-colors font-medium">
                <Download size={18} /> تصدير قاعدة البيانات (JSON)
            </button>
            <label className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer transition-colors shadow-md font-medium">
                <Upload size={18} /> {restoring ? 'جاري الاستعادة...' : 'استيراد قاعدة البيانات'}
                <input type="file" accept=".json" className="hidden" disabled={restoring} onChange={importData} />
            </label>
        </div>
      </div>
    </div>
  );
};

export default Settings;