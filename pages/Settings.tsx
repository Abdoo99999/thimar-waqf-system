import React, { useState, useEffect } from 'react';
import DeadlineNotice from '../components/DeadlineNotice';
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

  const [deadline, setDeadline] = useState<string>(getSettings().evaluation_deadline || '');
  const saveDeadline = (value: string) => {
      setDeadline(value);
      saveSettings({ ...getSettings(), evaluation_deadline: value || undefined });
      showToast(value ? 'تم حفظ الموعد النهائي وسيظهر للمؤسسات' : 'تم إلغاء الموعد النهائي', 'success');
  };

  const handleSave = () => {
      // نحافظ على باقي الإعدادات (مثل وضع العرض والموعد النهائي) عند الحفظ
      saveSettings({ ...getSettings(), ...formData, darkMode: false });
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

  // نسخة كاملة مع الملفات: تُنزَّل مباشرة من الخادم لأنها قد تكون كبيرة
  const exportFull = () => {
      const a = document.createElement('a');
      a.href = '/api/admin/export?files=1';
      a.click();
      showToast('بدأ تنزيل النسخة الكاملة (قد يستغرق وقتاً حسب حجم الملفات)', 'info');
  };

  const [pendingImport, setPendingImport] = useState<{ data: any; name: string; files: number | null } | null>(null);

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          try {
              const data = JSON.parse(evt.target?.result as string);
              if (!data || data.version !== 2 || !Array.isArray(data.records)) throw new Error('bad');
              setPendingImport({ data, name: file.name, files: Array.isArray(data.files) ? data.files.length : null });
          } catch {
              showToast('ملف النسخة الاحتياطية غير صالح', 'error');
          }
      };
      reader.readAsText(file);
  };

  const confirmImport = async () => {
      if (!pendingImport) return;
      setRestoring(true);
      try {
          const r = await importBackup(pendingImport.data);
          showToast(r?.files_restored != null ? `تم استعادة البيانات و${r.files_restored} ملف` : 'تم استعادة البيانات (الملفات الحالية بقيت كما هي)', 'success');
          if (r?.new_accounts?.length) {
              window.dispatchEvent(new CustomEvent('showCredentials', { detail: { title: 'حسابات جديدة للمؤسسات المستعادة', accounts: r.new_accounts } }));
          }
      } catch (err: any) {
          showToast(err?.message || 'تعذر الاستعادة', 'error');
      } finally { setRestoring(false); setPendingImport(null); }
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

      {/* Evaluation deadline */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-lg mb-2 text-navy-900">الموعد النهائي لرفع التقييم</h3>
            <p className="text-gray-500 text-sm">يظهر للمؤسسات في صفحتها الرئيسية وصفحة المراجعة والإرسال مع عدّاد للأيام الباقية. لا يمنع الرفع بعد انتهائه.</p>
        </div>
        <div className="p-6 flex flex-col sm:flex-row sm:items-end gap-4">
            <div>
                <label htmlFor="deadline" className="block text-sm font-medium mb-1 text-gray-700">التاريخ</label>
                <input id="deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                    className="min-h-[44px] p-2 border rounded-lg bg-gray-50 text-gray-900 border-gray-200 outline-none focus:ring-2 focus:ring-navy-800" />
            </div>
            <div className="flex gap-2">
                <button type="button" onClick={() => saveDeadline(deadline)} disabled={!deadline}
                    className="min-h-[44px] bg-navy-800 text-white px-5 rounded-lg flex items-center gap-2 hover:bg-navy-900 disabled:opacity-50 font-medium">
                    <Save size={18} /> حفظ الموعد
                </button>
                {getSettings().evaluation_deadline && (
                    <button type="button" onClick={() => saveDeadline('')}
                        className="min-h-[44px] px-4 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium">
                        إلغاء الموعد
                    </button>
                )}
            </div>
        </div>
        <div className="px-6 pb-6"><DeadlineNotice compact /></div>
      </div>

      {/* Data refresh */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex-1">
                <p className="font-bold text-teal-900 mb-1 flex items-center gap-2"><RefreshCw size={18}/> تحديث البيانات</p>
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
            <p className="text-gray-500 text-sm">تنزيل نسخة من بيانات النظام في الخادم، أو استعادتها. كلمات المرور لا تدخل في النسخة.</p>
        </div>
        <div className="p-6 flex flex-wrap gap-3">
            <button onClick={exportData} className="min-h-[44px] border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 flex items-center gap-2 transition-colors font-medium">
                <Download size={18} /> البيانات فقط (ملف صغير)
            </button>
            <button onClick={exportFull} className="min-h-[44px] border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 flex items-center gap-2 transition-colors font-medium">
                <Download size={18} /> نسخة كاملة مع الملفات المرفقة
            </button>
            <label className="min-h-[44px] bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer transition-colors shadow-md font-medium">
                <Upload size={18} /> {restoring ? 'جاري الاستعادة...' : 'استعادة من نسخة احتياطية'}
                <input type="file" accept=".json" className="hidden" disabled={restoring} onChange={importData} />
            </label>
        </div>
        {pendingImport && (
            <div className="mx-6 mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 space-y-3" role="alert">
                <p className="font-bold">تأكيد الاستعادة من: {pendingImport.name}</p>
                <p>ستُستبدل <strong>كل بيانات النظام الحالية</strong> بمحتوى هذا الملف ({pendingImport.data.records.length} سجل).
                   {pendingImport.files != null
                     ? ` والملفات المرفقة الحالية ستُستبدل بالملفات الموجودة في النسخة (${pendingImport.files} ملف).`
                     : ' هذه النسخة بدون ملفات، فالملفات المرفقة الحالية ستبقى كما هي.'}
                   {' '}يُنصح بتنزيل نسخة كاملة من الوضع الحالي قبل المتابعة.</p>
                <div className="flex gap-2">
                    <button type="button" onClick={confirmImport} disabled={restoring} className="min-h-[44px] px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-60">{restoring ? 'جاري الاستعادة...' : 'نعم، استعد'}</button>
                    <button type="button" onClick={() => setPendingImport(null)} disabled={restoring} className="min-h-[44px] px-4 rounded-lg bg-white border border-gray-300 font-bold">إلغاء</button>
                </div>
            </div>
        )}
        <p className="px-6 pb-6 text-xs text-gray-500">النسخ الاحتياطية تحتوي بيانات المؤسسات وملفاتها؛ احفظها في مكان آمن ولا ترسلها عبر قنوات غير رسمية.</p>
      </div>
    </div>
  );
};

export default Settings;