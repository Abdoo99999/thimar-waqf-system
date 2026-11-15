import React from 'react';
import { Link } from 'react-router-dom';
import { Check, Lock, ArrowLeft, ArrowRight } from 'lucide-react';
import { useUi } from '../contexts/UiContext';
import { JOURNEY_STEPS, getInstitutionJourney } from '../utils/institutionJourney';

// شريط الخطوات أعلى صفحات المؤسسة: أين أنا، وما المنجز، وما المقفل
export const StepBar: React.FC<{ step: number }> = ({ step }) => {
  const { role, currentWaqfId } = useUi();
  if (role !== 'user' || !currentWaqfId) return null;
  const j = getInstitutionJourney(currentWaqfId);
  return (
    <nav aria-label="خطوات التقييم" className="no-print -mt-2 mb-6">
      <p className="mb-2 text-sm font-bold text-slate-600">الخطوة {step + 1} من {JOURNEY_STEPS.length}</p>
      <ol className="m-0 grid list-none grid-cols-6 gap-1.5 p-0">
        {JOURNEY_STEPS.map((s, i) => {
          const current = i === step;
          const done = j.completed[i];
          const locked = j.locked[i] && !current;
          const cls = current ? 'bg-navy-900 text-white' : done ? 'bg-teal-50 text-teal-800 hover:bg-teal-100' : locked ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-700 hover:bg-slate-50';
          const body = (
            <>
              <span className={`h-1.5 rounded-full ${current ? 'bg-amber-400' : done ? 'bg-teal-600' : 'bg-slate-200'}`} />
              <span className="flex items-center gap-1.5 text-[13px] font-bold leading-5">
                {done && !current ? <Check size={14} aria-hidden="true" className="shrink-0" /> : locked ? <Lock size={12} aria-hidden="true" className="shrink-0" /> : <span className="shrink-0 text-xs opacity-70">{i + 1}</span>}
                <span className="hidden truncate md:inline">{s.title}</span>
              </span>
            </>
          );
          const base = `flex min-h-[44px] flex-col justify-center gap-1.5 rounded-xl border border-slate-200 px-2.5 py-2 ${cls}`;
          return (
            <li key={s.path} title={s.title}>
              {locked || current
                ? <div aria-current={current ? 'step' : undefined} className={base}>{body}<span className="sr-only">{s.title}{locked ? ' (مقفلة)' : ''}</span></div>
                : <Link to={s.path} className={base}>{body}<span className="sr-only md:hidden">{s.title}</span></Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

// شريط الأزرار الموحد أسفل صفحات المؤسسة: رجوع يميناً، والإجراء الرئيسي يساراً
export const StepFooter: React.FC<{
  step: number;
  primaryLabel?: string;            // افتراضياً: «التالي: ...»
  onPrimary?: () => void;           // إن لم يُمرَّر يكون الزر رابطاً للخطوة التالية
  primaryType?: 'button' | 'submit';
  disabled?: boolean;
  hint?: string;                    // سطر صغير يوضح سبب التعطيل
  secondary?: React.ReactNode;      // زر إضافي (مثل حفظ كمسودة)
}> = ({ step, primaryLabel, onPrimary, primaryType = 'button', disabled, hint, secondary }) => {
  const { role } = useUi();
  if (role !== 'user') return null;
  const prev = JOURNEY_STEPS[step - 1];
  const next = JOURNEY_STEPS[step + 1];
  const label = primaryLabel || (next ? `التالي: ${next.title}` : '');
  const primaryCls = 'inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-teal-700 px-6 text-[15px] font-bold text-white shadow-md transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="no-print sticky bottom-0 z-20 -mx-4 mt-8 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        {prev ? (
          <Link to={prev.path} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
            <ArrowRight size={18} aria-hidden="true" /> رجوع: {prev.title}
          </Link>
        ) : <span />}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {hint && <span className="text-xs text-slate-500">{hint}</span>}
          {secondary}
          {label && (onPrimary || primaryType === 'submit'
            ? <button type={primaryType} onClick={onPrimary} disabled={disabled} className={primaryCls}>{label} <ArrowLeft size={18} aria-hidden="true" /></button>
            : next && <Link to={next.path} aria-disabled={disabled} className={`${primaryCls} ${disabled ? 'pointer-events-none opacity-50' : ''}`}>{label} <ArrowLeft size={18} aria-hidden="true" /></Link>)}
        </div>
      </div>
    </div>
  );
};
