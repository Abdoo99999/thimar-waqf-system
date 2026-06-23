
import React, { useState } from 'react';
import { useUi } from '../contexts/UiContext';
import { saveFeedback, generateId, getInstitutions } from '../services/db';
import { SystemFeedback } from '../types';
import { MessageSquarePlus, Send, Image, X, CheckCircle2 } from 'lucide-react';

const PAGES = [
  'بيانات المؤسسة',
  'القوائم المالية',
  'الأداء المؤسسي',
  'الامتثال والمخاطر',
  'خطة التحسين',
  'المراجعة والإرسال',
  'صفحة الدخول',
  'عام / أخرى',
];

const Feedback: React.FC = () => {
  const { currentWaqfId, user } = useUi();
  const [page, setPage] = useState(PAGES[0]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [images, setImages] = useState<Record<string, string | undefined>>({});
  const [sentPages, setSentPages] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const currentText = drafts[page] || '';
  const currentImage = images[page];
  const isSent = sentPages.has(page);

  const handlePageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPage(e.target.value);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDrafts(prev => ({ ...prev, [page]: e.target.value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الصورة يجب أن يكون أقل من 2 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImages(prev => ({ ...prev, [page]: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImages(prev => ({ ...prev, [page]: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentText.trim()) return;
    setSubmitting(true);

    const inst = currentWaqfId
      ? getInstitutions().find(i => i.id === currentWaqfId)
      : null;

    const feedback: SystemFeedback = {
      id: generateId(),
      institution_id: currentWaqfId ?? '',
      institution_name: inst?.name ?? user ?? 'غير محدد',
      category: 'أخرى',
      page,
      text: currentText.trim(),
      image: currentImage,
      submitted_at: new Date().toISOString(),
      is_read: false,
    };

    saveFeedback(feedback);

    setTimeout(() => {
      setSubmitting(false);
      setSentPages(prev => new Set([...prev, page]));
      setDrafts(prev => ({ ...prev, [page]: '' }));
      setImages(prev => ({ ...prev, [page]: undefined }));
    }, 500);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-8" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-teal-100 rounded-xl">
          <MessageSquarePlus size={28} className="text-teal-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-navy-900">إبداء ملاحظة على النظام</h1>
          <p className="text-gray-500 text-sm mt-1">
            يمكنك إرسال ملاحظة مستقلة لكل قسم من الأقسام
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800 font-medium">
        جميع الملاحظات تصل مباشرة إلى فريق إدارة النظام فقط، ولن تؤثر على بيانات مؤسستك.
      </div>

      {/* Sections status row */}
      {sentPages.size > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {[...sentPages].map(p => (
            <span key={p} className="flex items-center gap-1 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold px-3 py-1 rounded-full">
              <CheckCircle2 size={13} />
              {p}
            </span>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">

        {/* Page selector */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            القسم المتعلق بالملاحظة *
          </label>
          <div className="relative">
            <select
              value={page}
              onChange={handlePageChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white appearance-none"
            >
              {PAGES.map(p => (
                <option key={p} value={p}>
                  {p}{sentPages.has(p) ? ' ✓' : ''}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          {isSent && (
            <p className="mt-1 text-xs text-teal-600 font-medium flex items-center gap-1">
              <CheckCircle2 size={13} /> تم إرسال ملاحظة لهذا القسم — يمكنك كتابة ملاحظة جديدة
            </p>
          )}
        </div>

        {/* Text area */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">نص الملاحظة *</label>
          <textarea
            rows={6}
            value={currentText}
            onChange={handleTextChange}
            placeholder={`اكتب ملاحظتك حول "${page}" هنا...`}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none resize-none"
          />
        </div>

        {/* Image upload */}
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">صورة توضيحية (اختياري)</label>
          {currentImage ? (
            <div className="relative inline-block">
              <img src={currentImage} alt="المرفق" className="max-h-40 rounded-lg border border-gray-200 shadow-sm" />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="cursor-pointer flex items-center gap-3 p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-teal-400 hover:bg-teal-50/50 transition-all text-gray-500 hover:text-teal-700">
              <Image size={20} />
              <span className="text-sm font-medium">انقر لرفع صورة (بحد أقصى 2MB)</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !currentText.trim()}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg shadow flex items-center justify-center gap-2 transition-colors active:scale-95"
        >
          {submitting ? (
            <span className="animate-pulse">جاري الإرسال...</span>
          ) : (
            <><Send size={18} /> إرسال ملاحظة {page}</>
          )}
        </button>
      </form>
    </div>
  );
};

export default Feedback;
