import React, { useState, useEffect } from 'react';
import { getFeedback, markFeedbackRead } from '../services/db';
import { SystemFeedback } from '../types';
import { MessageSquare, Eye, Filter } from 'lucide-react';

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

  useEffect(() => {
    setFeedbackList([...getFeedback()].reverse());
  }, []);

  const handleRead = (id: string) => {
    markFeedbackRead(id);
    setFeedbackList(prev => prev.map(f => f.id === id ? { ...f, is_read: true } : f));
  };

  const categories = ['الكل', 'اقتراح تطوير', 'صعوبة استخدام', 'خطأ تقني', 'ملاحظة على الأسئلة', 'أخرى'];
  const filtered = filterCat === 'الكل' ? feedbackList : feedbackList.filter(f => f.category === filterCat);
  const unread = feedbackList.filter(f => !f.is_read).length;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-navy-100 rounded-xl">
          <MessageSquare size={28} className="text-navy-800" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-navy-900">ملاحظات النظام</h1>
          <p className="text-gray-500 text-sm">استعرض ملاحظات المؤسسات</p>
        </div>
        {unread > 0 && (
          <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{unread}</span>
        )}
      </div>
      <div>
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
                          className="flex items-center gap-2 text-xs text-teal-600 hover:text-teal-800 font-bold transition-colors"
                        >
                          <Eye size={14} /> تحديد كمقروء
                        </button>
                      )}
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
