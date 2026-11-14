
import React, { useState, useEffect } from 'react';
import { useUi } from '../contexts/UiContext';
import { saveFeedback, generateId, getInstitutions, getFeedback, markRepliesSeen } from '../services/db';
import { SystemFeedback, FeedbackStatus } from '../types';
import { MessageSquarePlus, Send, Image, X, CheckCircle, Reply } from 'lucide-react';

const STATUS_UI: Record<FeedbackStatus, { label: string; cls: string }> = {
  new: { label: 'مُستلمة', cls: 'bg-sky-100 text-sky-800' },
  in_progress: { label: 'قيد المعالجة', cls: 'bg-amber-100 text-amber-800' },
  done: { label: 'تمت المعالجة', cls: 'bg-emerald-100 text-emerald-800' },
};

// ملاحظات المؤسسة السابقة وردود الوزارة عليها
const MyFeedback: React.FC<{ items: SystemFeedback[]; newReplies: Set<string> }> = ({ items, newReplies }) => {
  if (items.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="my-feedback-title">
      <h2 id="my-feedback-title" className="text-lg font-bold text-navy-900 mb-3">ملاحظاتي السابقة ({items.length})</h2>
      <div className="space-y-3">
        {items.map(f => {
          const st = STATUS_UI[f.status || 'new'];
          return (
            <div key={f.id} className={`bg-white rounded-xl border p-4 ${newReplies.has(f.id) ? 'border-teal-400 ring-2 ring-teal-100' : 'border-gray-200'}`}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{f.page}</span>
                <span className="text-xs text-gray-400">{new Date(f.submitted_at).toLocaleDateString('ar-OM')}</span>
                {newReplies.has(f.id) && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-600 text-white">رد جديد</span>}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{f.text}</p>
              {f.admin_reply && (
                <div className="mt-3 rounded-lg bg-teal-50 border border-teal-200 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-teal-800 mb-1">
                    <Reply size={14} aria-hidden="true" /> رد الوزارة{f.replied_at ? ` · ${new Date(f.replied_at).toLocaleDateString('ar-OM')}` : ''}
                  </p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{f.admin_reply}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

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
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState<SystemFeedback[]>([]);
  const [newReplies, setNewReplies] = useState<Set<string>>(new Set());

  useEffect(() => {
    const list = [...getFeedback()].filter(f => !currentWaqfId || f.institution_id === currentWaqfId)
      .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''));
    setMine(list);
    // نعلّم الردود الجديدة كمقروءة، ونبقي تمييزها ظاهراً في هذه الزيارة
    setNewReplies(new Set(list.filter(f => f.admin_reply && !f.reply_seen).map(f => f.id)));
    markRepliesSeen();
    window.dispatchEvent(new Event('feedbackRepliesSeen'));
  }, [currentWaqfId, submitted]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('حجم الصورة يجب أن يكون أقل من 2 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
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
      text: text.trim(),
      image,
      submitted_at: new Date().toISOString(),
      is_read: false,
    };

    saveFeedback(feedback);

    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 500);
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 animate-fadeIn" dir="rtl">
        <div className="bg-teal-50 p-6 rounded-full mb-6">
          <CheckCircle size={56} className="text-teal-600" />
        </div>
        <h2 className="text-2xl font-bold text-navy-900 mb-3">شكراً لك!</h2>
        <p className="text-gray-500 max-w-md mb-6">
          تم إرسال ملاحظتك بنجاح إلى إدارة النظام. سنأخذها بعين الاعتبار في التحسينات القادمة.
        </p>
        <button
          onClick={() => { setSubmitted(false); setText(''); setImage(undefined); setPage(PAGES[0]); }}
          className="bg-teal-600 text-white px-6 py-2 rounded-lg hover:bg-teal-700 font-bold transition-colors"
        >
          إرسال ملاحظة أخرى
        </button>
        <div className="w-full max-w-2xl text-right"><MyFeedback items={mine} newReplies={newReplies} /></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 lg:p-8" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-teal-100 rounded-xl">
          <MessageSquarePlus size={28} className="text-teal-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-navy-900">إبداء ملاحظة على النظام</h1>
          <p className="text-gray-500 text-sm mt-1">ملاحظاتك تساعدنا على تحسين النظام — شكراً لمشاركتنا رأيك</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800 font-medium">
        جميع الملاحظات تصل مباشرة إلى فريق إدارة النظام فقط، ولن تؤثر على بيانات مؤسستك.
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">الصفحة أو النافذة المتعلقة *</label>
          <select
            value={page}
            onChange={e => setPage(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
          >
            {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">نص الملاحظة *</label>
          <textarea
            rows={6}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="اكتب ملاحظتك أو اقتراحك بالتفصيل هنا..."
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">صورة توضيحية (اختياري)</label>
          {image ? (
            <div className="relative inline-block">
              <img src={image} alt="المرفق" className="max-h-40 rounded-lg border border-gray-200 shadow-sm" />
              <button
                type="button"
                onClick={() => setImage(undefined)}
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
          disabled={submitting || !text.trim()}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg shadow flex items-center justify-center gap-2 transition-colors active:scale-95"
        >
          {submitting ? (
            <span className="animate-pulse">جاري الإرسال...</span>
          ) : (
            <><Send size={18} /> إرسال الملاحظة</>
          )}
        </button>
      </form>
      <MyFeedback items={mine} newReplies={newReplies} />
    </div>
  );
};

export default Feedback;
