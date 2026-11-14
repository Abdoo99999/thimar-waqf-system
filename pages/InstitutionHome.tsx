import React, { useEffect, useState } from 'react';
import DeadlineNotice from '../components/DeadlineNotice';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  LockKeyhole,
  MapPin,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { CURRENT_YEAR } from '../constants';
import { getInstitutions } from '../services/db';
import { useUi } from '../contexts/UiContext';
import type { Institution } from '../types';
import {
  getInstitutionJourney,
  JOURNEY_STEPS,
  WORKFLOW_STATUS_META,
} from '../utils/institutionJourney';

const InstitutionHome: React.FC = () => {
  const { currentWaqfId } = useUi();
  const navigate = useNavigate();
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [journey, setJourney] = useState<ReturnType<typeof getInstitutionJourney> | null>(null);

  useEffect(() => {
    try {
      const found = getInstitutions().find(item => item.id === currentWaqfId) || null;
      setInstitution(found);
      setJourney(found ? getInstitutionJourney(found.id) : null);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [currentWaqfId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl animate-pulse space-y-6" dir="rtl">
        <div className="h-44 rounded-3xl bg-slate-200/70" />
        <div className="h-28 rounded-2xl bg-slate-200/70" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-28 rounded-2xl bg-slate-200/70" />)}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-900" dir="rtl">
        <p className="font-bold">تعذر تحميل بيانات المؤسسة</p>
        <button onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-900 px-4 py-2 text-sm font-bold text-white">
          <RotateCcw size={16} /> إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!institution || !journey) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-dashed border-teal-300 bg-teal-50/70 p-10 text-center" dir="rtl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-800"><Building2 /></div>
        <h2 className="text-xl font-bold text-slate-900">لم يتم العثور على بيانات المؤسسة</h2>
        <p className="mt-2 text-sm text-slate-600">يرجى فتح بيانات المؤسسة للتأكد من الملف التعريفي.</p>
        <button onClick={() => navigate('/institutions')} className="mt-6 rounded-xl bg-[#173d45] px-5 py-3 font-bold text-white transition hover:bg-[#102f36]">
          فتح بيانات المؤسسة
        </button>
      </div>
    );
  }

  const status = WORKFLOW_STATUS_META[journey.workflowStatus];
  const stepCount = journey.completed.length;

  return (
    <main className="mx-auto max-w-6xl space-y-7 pb-10" dir="rtl">
      <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#173d45] px-6 py-8 text-white shadow-lg sm:px-9 sm:py-10">
        <div className="absolute -left-16 -top-20 -z-10 h-64 w-64 rounded-full border-[38px] border-white/[0.06]" />
        <div className="absolute -bottom-28 right-1/3 -z-10 h-64 w-64 rounded-full bg-[#c8a86a]/10 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-100">
              <Sparkles size={14} /> بوابة تقييم المؤسسات الوقفية · {CURRENT_YEAR}
            </div>
            <p className="mb-2 text-sm text-teal-100/80">مرحباً بكم في مساحة مؤسستكم</p>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl">{institution.name}</h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/75">
              <span className="inline-flex items-center gap-2"><Building2 size={16} />{institution.type}</span>
              <span className="inline-flex items-center gap-2"><MapPin size={16} />{[institution.governorate, institution.wilayat].filter(Boolean).join(' · ') || 'الموقع غير محدد'}</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/institutions')}
            className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-[#e3c78d] px-5 py-3 text-sm font-extrabold text-[#263b38] shadow-sm transition hover:bg-[#f0d8a5] active:scale-[.98] md:self-auto"
          >
            <FileText size={17} /> تعديل البيانات
          </button>
        </div>
      </section>

      <DeadlineNotice done={journey.workflowStatus === 'submitted' || journey.workflowStatus === 'approved'} />

      <section className={`rounded-2xl border p-5 sm:p-6 ${status.className}`} aria-live="polite">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/75">
              {journey.workflowStatus === 'approved' ? <CheckCircle2 size={21} /> :
                journey.workflowStatus === 'returned' ? <RotateCcw size={20} /> :
                  journey.workflowStatus === 'submitted' ? <ClipboardCheck size={20} /> : <FileText size={20} />}
            </span>
            <div>
              <p className="text-xs font-bold opacity-70">حالة طلب التقييم · {CURRENT_YEAR}</p>
              <h2 className="mt-1 text-lg font-extrabold">{status.label}</h2>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start rounded-xl bg-white/60 px-4 py-2.5 sm:self-auto">
            <span className="text-xs font-semibold opacity-75">نسبة الإنجاز</span>
            <span className="font-mono text-xl font-bold">{journey.completionPercent}%</span>
          </div>
        </div>
        {journey.workflowStatus === 'returned' && (
          <div className="mt-5 rounded-xl border border-orange-300/70 bg-white/75 p-4">
            <p className="mb-1 text-xs font-extrabold">ملاحظات الوزارة</p>
            <p className="whitespace-pre-wrap text-sm leading-7">{journey.adminFeedback || 'لا توجد تفاصيل إضافية مرفقة.'}</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-[#dce7e4] bg-[#fbfdfb] shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[#e7eeeb] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#7b948c]">مسار العمل</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#193b3e]">خطوات تقييم المؤسسة</h2>
          </div>
          <div className="flex items-center gap-3 sm:min-w-56">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e5eeeb]">
              <div className="h-full rounded-full bg-[#3d8274] transition-[width] duration-500" style={{ width: `${journey.completionPercent}%` }} />
            </div>
            <span className="whitespace-nowrap text-xs font-bold text-[#486762]">{journey.completedCount} من {stepCount} مكتملة</span>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
          {JOURNEY_STEPS.map((step, index) => {
            const done = journey.completed[index];
            const locked = journey.locked[index];
            const current = !done && !locked && index === journey.currentIndex;
            return (
              <article
                key={step.path}
                className={`relative flex min-h-40 flex-col justify-between rounded-2xl border p-4 transition-transform duration-200 hover:-translate-y-0.5 ${
                  done ? 'border-emerald-200 bg-emerald-50/65' :
                    current ? 'border-[#80aaa0] bg-[#eff7f4] shadow-[0_8px_24px_-18px_rgba(24,70,65,.45)]' :
                      'border-slate-200 bg-slate-50/80'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${
                      done ? 'bg-emerald-700 text-white' : current ? 'bg-[#245a5c] text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {index + 1}
                    </span>
                    <div>
                      <h3 className={`font-extrabold ${locked ? 'text-slate-400' : 'text-[#213e40]'}`}>{step.title}</h3>
                      <p className={`mt-1 inline-flex items-center gap-1.5 text-xs font-bold ${
                        done ? 'text-emerald-800' : current ? 'text-[#28665b]' : 'text-slate-400'
                      }`}>
                        {done ? <><CheckCircle2 size={14} /> مكتملة</> :
                          current ? <><Circle size={12} /> الحالية</> :
                            <><LockKeyhole size={13} /> مقفلة</>}
                      </p>
                    </div>
                  </div>
                  {done && <CheckCircle2 className="text-emerald-700" size={18} />}
                </div>
                <button
                  onClick={() => navigate(step.path)}
                  disabled={locked}
                  className={`mt-5 inline-flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold transition ${
                    locked ? 'cursor-not-allowed bg-slate-100 text-slate-400' :
                      current ? 'bg-[#245a5c] text-white hover:bg-[#173f43]' :
                        'bg-white text-[#315a56] ring-1 ring-[#d4e4de] hover:bg-[#edf6f2]'
                  }`}
                >
                  {locked ? 'غير متاحة بعد' : 'الانتقال'} {!locked && <ArrowLeft size={14} />}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
};

export default InstitutionHome;
