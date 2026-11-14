import React, { useState, useEffect } from 'react';
import { getFeedback, markFeedbackRead, replyToFeedback } from '../services/db';
import { SystemFeedback, FeedbackStatus } from '../types';
import { useUi } from '../contexts/UiContext';
import { MessageSquare, Eye, Filter, Send } from 'lucide-react';

export const FEEDBACK_STATUS: Record<FeedbackStatus, { label: string; cls: string }> = {
  new: { label: 'جديدة', cls: 'bg-sky-100 text-sky-800' },
  in_progress: { label: 'قيد المعالجة', cls: 'bg-amber-100 text-amber-800' },
  done: { label: 'تمت', cls: 'bg-emerald-100 text-emerald-800' },
};

const CATEGORY_COLORS: Record<string, string> = {
  'اقتراح تطوير': 'bg-blue-100 text-blue-700',
  'صعوبة استخدام': 'bg-orange-100 text-orange-700',
  'خطأ تقني': 'bg-red-100 text-red-700',
  'ملاحظة على الأسئلة': 'bg-purple-100 text-purple-700',
  'أخرى': 'bg-gray-100 text-gray-600',
};

const SystemFeedbackPage: React.FC = () => {
  const [feedbackList, setFeedbackList] = useState<SystemFeedback[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState('الكل');
  const [filterStatus, setFilterStatus] = useState<'all' | FeedbackStatus>('all');
  const [drafts, setDrafts] = useState<Record<string, { status: FeedbackStatus; reply: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const { showToast } = useUi();

  useEffect(() => {
    setFeedbackList([...getFeedback()].reverse());
  }, []);

  const handleRead = (id: string) => {
    markFeedbackRead(id);
    setFeedbackList(prev => prev.map(f => f.id === id ? { ...f, is_read: true } : f));
  };

  const categories = ['الكل', 'اقتراح تطوير', 'صعوبة استخدام', 'خطأ تقني', 'ملاحظة على الأسئلة', 'أخرى'];
  const statusOf = (f: SystemFeedback): FeedbackStatus => f.status || 'new';
  const filtered = feedbackList
    .filter(f => filterCat === 'الكل' || f.category === filterCat)
    .filter(f => filterStatus === 'all' || statusOf(f) === filterStatus);
  const draftOf = (f: SystemFeedback) => drafts[f.id] || { status: statusOf(f), reply: f.admin_reply || '' };
  const setDraft = (f: SystemFeedback, patch: Partial<{ status: FeedbackStatus; reply: string }>) =>
    setDrafts(d => ({ ...d, [f.id]: { ...draftOf(f), ...patch } }));
  const saveReply = async (f: SystemFeedback) => {
    const d = draftOf(f);
    setSavingId(f.id);
    try {
      await replyToFeedback(f.id, d.status, d.reply);
      setFeedbackList([...getFeedback()].reverse());
      setDrafts(x => { const c = { ...x }; delete c[f.id]; return c; });
      showToast(d.reply.trim() ? 'تم حفظ الرد وإرساله للمؤسسة' : 'تم تحديث الحالة', 'success');
    } catch { /* الخطأ يظهر تلقائياً */ }
    finally { setSavingId(null); }
  };
  const unread = feedbackList.filter(f => !f.is_read).length;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-navy-100 rounded-xl">
          <MessageSquare size={28} className="text-navy-800" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-navy-900">ملاحظات النظام</h1>
        </div>
        {unread > 0 && (
          <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{unread}</span>
        )}
      </div>
      <div>
          <div className="flex flex-wrap gap-2 mb-3 items-center" role="group" aria-label="تصفية حسب الحالة">
            <span className="text-xs font-bold text-gray-500 ml-1">الحالة:</span>
            {([['all', 'الكل'], ['new', 'جديدة'], ['in_progress', 'قيد المعالجة'], ['done', 'تمت']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilterStatus(k)} aria-pressed={filterStatus === k}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filterStatus === k ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-600 border-gray-300 hover:border-navy-400'}`}>
                {label} ({k === 'all' ? feedbackList.length : feedbackList.filter(f => statusOf(f) === k).length})
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <Filter size={16} className="text-gray-400" />
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCat(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${filterCat === cat ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-600 border-gray-300 hover:border-navy-400'}`}
              >
                {cat}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-bold">لا توجد ملاحظات بعد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(f => (
                <div
                  key={f.id}
                  className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${!f.is_read ? 'border-teal-300 border-r-4' : 'border-gray-200'}`}
                >
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {!f.is_read && <div className="w-2 h-2 bg-teal-500 rounded-full mt-1.5 shrink-0 animate-pulse" />}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[f.category] ?? 'bg-gray-100 text-gray-600'}`}>
                              {f.category}
                            </span>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{f.page}</span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${FEEDBACK_STATUS[statusOf(f)].cls}`}>{FEEDBACK_STATUS[statusOf(f)].label}</span>
                            {f.admin_reply && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">تم الرد</span>}
                          </div>
                          <p className="font-bold text-navy-900 text-sm truncate">{f.institution_name}</p>
                          <p className="text-gray-500 text-sm line-clamp-1 mt-0.5">{f.text}</p>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <p className="text-xs text-gray-400">{new Date(f.submitted_at).toLocaleDateString('ar-OM')}</p>
                        <p className="text-xs text-gray-400">{new Date(f.submitted_at).toLocaleTimeString('ar-OM', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  </div>
                  {expanded === f.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                      <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap mb-3">{f.text}</p>
                      {f.image && (
                        <img src={f.image} alt="مرفق" className="max-h-48 rounded-lg border border-gray-200 shadow-sm mb-3" />
                      )}
                      {!f.is_read && (
                        <button
                          onClick={() => handleRead(f.id)}
                          className="flex items-center gap-2 text-xs text-teal-600 hover:text-teal-800 font-bold transition-colors mb-3"
                        >
                          <Eye size={14} /> تحديد كمقروء
                        </button>
                      )}
                      <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="حالة الملاحظة">
                          <span className="text-xs font-bold text-gray-600">الحالة:</span>
                          {(Object.keys(FEEDBACK_STATUS) as FeedbackStatus[]).map(st => (
                            <button key={st} type="button" onClick={() => setDraft(f, { status: st })} aria-pressed={draftOf(f).status === st}
                              className={`min-h-[36px] px-3 rounded-lg text-xs font-bold border ${draftOf(f).status === st ? 'bg-navy-800 text-white border-navy-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'}`}>
                              {FEEDBACK_STATUS[st].label}
                            </button>
                          ))}
                        </div>
                        <div>
                          <label htmlFor={`reply-${f.id}`} className="block text-xs font-bold text-gray-600 mb-1">الرد على المؤسسة (يظهر لها في صفحة الملاحظات)</label>
                          <textarea id={`reply-${f.id}`} rows={3} value={draftOf(f).reply} onChange={e => setDraft(f, { reply: e.target.value })}
                            placeholder="مثال: شكراً لملاحظتك، تم إصلاح المشكلة في التحديث الأخير."
                            className="w-full rounded-lg border border-gray-300 p-2.5 text-sm resize-y focus:ring-2 focus:ring-teal-500 outline-none" />
                          {f.replied_at && <p className="text-[11px] text-gray-400 mt-1">آخر رد: {new Date(f.replied_at).toLocaleString('ar-OM')}{f.reply_seen ? ' · اطّلعت عليه المؤسسة' : ' · لم تطّلع عليه المؤسسة بعد'}</p>}
                        </div>
                        <button type="button" disabled={savingId === f.id} onClick={() => saveReply(f)}
                          className="inline-flex items-center gap-2 min-h-[40px] px-4 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-bold">
                          <Send size={14} /> {savingId === f.id ? 'جاري الحفظ...' : 'حفظ الحالة والرد'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
};

export default SystemFeedbackPage;
