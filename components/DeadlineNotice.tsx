import React from 'react';
import { CalendarClock } from 'lucide-react';
import { getDeadline, DEADLINE_STYLE, submittedOnTime } from '../utils/deadline';

// شريط الموعد النهائي. done = المؤسسة رفعت تقييمها (يظهر بلون هادئ بلا استعجال)
const DeadlineNotice: React.FC<{ done?: boolean; compact?: boolean; submittedAt?: string }> = ({ done, compact, submittedAt }) => {
  const d = getDeadline();
  if (!d) return null;
  const style = done ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : DEADLINE_STYLE[d.tone];
  return (
    <div role="status" className={`flex flex-wrap items-center gap-3 rounded-2xl border ${compact ? 'px-4 py-3' : 'p-4 sm:p-5'} ${style}`}>
      <CalendarClock size={compact ? 20 : 26} aria-hidden="true" className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-bold">الموعد النهائي لرفع التقييم: {d.dateLabel}</span>
        {!compact && (
          <span className="text-xs opacity-80">
            {done
              ? (submittedOnTime(submittedAt) ? 'تم رفع التقييم، شكراً لالتزامكم بالموعد.' : 'تم رفع التقييم بعد الموعد النهائي.')
              : d.tone === 'passed' ? 'انتهى الموعد. يرجى التواصل مع الوزارة إذا لم يُرفع التقييم بعد.' : 'أكمل الخطوات وارفع التقييم قبل نهاية يوم الموعد المذكور.'}
          </span>
        )}
      </div>
      {!done && <span className="whitespace-nowrap rounded-full bg-white/70 px-3 py-1 text-sm font-extrabold">{d.label}</span>}
    </div>
  );
};

export default DeadlineNotice;
