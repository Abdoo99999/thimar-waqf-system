import React from 'react';
import { ReportModel, Tone, formatDate } from '../utils/report';

const TONE: Record<Tone, { label: string; text: string; bg: string; dot: string }> = {
  good: { label: 'جيد', text: 'text-green-700', bg: 'bg-green-50', dot: 'bg-green-700' },
  warn: { label: 'يحتاج متابعة', text: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-700' },
  bad: { label: 'حرج', text: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-700' },
  info: { label: 'للعلم', text: 'text-slate-700', bg: 'bg-slate-100', dot: 'bg-slate-500' },
};

const H2: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <h2 className="m-0 border-b border-slate-200 pb-2 text-lg font-extrabold text-navy-900">{n}. {children}</h2>
);

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th scope="col" className="px-3 py-2.5 text-right font-bold">{children}</th>
);

// التقرير الرسمي للمؤسسة الوقفية (قابل للطباعة)
const OfficialReport: React.FC<{ model: ReportModel; draft?: boolean }> = ({ model: m, draft }) => {
  const ev = m.evaluation;
  const diff = m.overall - m.benchmark.overall;
  const hasBenchmark = m.benchmark.institutions > 1;

  return (
    <article id="report-content" dir="rtl" className="print-content relative mx-auto flex max-w-[820px] flex-col gap-7 overflow-hidden bg-white px-6 py-8 text-navy-900 sm:px-14 sm:py-12">
      {draft && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[600px] -rotate-[24deg] select-none text-center text-[120px] font-extrabold text-red-700/[0.08] sm:text-[150px]">مسودة</div>
      )}

      <header className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-6">
          <img src="/logo.png" alt="شعار وزارة الأوقاف والشؤون الدينية" className="h-16 w-auto sm:h-20" />
          <div className="flex flex-col gap-1 text-left text-xs text-slate-700 sm:text-sm">
            <span>رقم المرجع: <strong className="text-navy-900">{draft ? '—' : (ev.report_ref || '—')}</strong></span>
            <span>تاريخ الإصدار: <strong className="text-navy-900">{draft ? '—' : formatDate(ev.approved_at)}</strong></span>
            <span>دورة التقييم: <strong className="text-navy-900">{m.year}</strong></span>
          </div>
        </div>
        <div className="h-[3px] bg-yellow-700" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-2xl font-extrabold sm:text-[28px]">تقرير تقييم المؤسسة الوقفية</h1>
            <p className="m-0 text-lg font-bold text-teal-700">{m.institutionName}</p>
          </div>
          {draft
            ? <span className="rounded-lg border-2 border-red-700 px-3.5 py-1.5 text-sm font-extrabold text-red-700">مسودة – غير معتمد</span>
            : <span className="rounded-lg border-2 border-green-700 px-3.5 py-1.5 text-sm font-extrabold text-green-700">معتمد من الوزارة</span>}
        </div>
      </header>

      <section aria-label="الملخص التنفيذي" className="flex flex-col gap-4">
        <H2 n={1}>الملخص التنفيذي</H2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5 rounded-xl bg-navy-900 p-4 text-white">
            <span className="text-sm text-slate-300">الدرجة العامة</span>
            <span className="text-4xl font-extrabold leading-tight">{m.overall}%</span>
            <span className="text-sm font-bold text-teal-300">مستوى: {m.level}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-slate-200 p-4">
            <span className="text-sm text-slate-600">متوسط المؤسسات</span>
            <span className="text-4xl font-extrabold leading-tight">{hasBenchmark ? `${m.benchmark.overall}%` : '—'}</span>
            <span className={`text-sm font-bold ${!hasBenchmark ? 'text-slate-500' : diff >= 0 ? 'text-green-700' : 'text-amber-700'}`}>
              {!hasBenchmark ? 'لا يتوفر عدد كافٍ للمقارنة' : diff === 0 ? 'مساوٍ للمتوسط' : diff > 0 ? `أعلى من المتوسط بـ ${diff} نقطة` : `أقل من المتوسط بـ ${-diff} نقطة`}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-xl border border-slate-200 p-4">
            <span className="text-sm text-slate-600">نسبة الامتثال</span>
            <span className="text-4xl font-extrabold leading-tight">{m.compliance.pct}%</span>
            <span className={`text-sm font-bold ${m.compliance.missing.length ? 'text-amber-700' : 'text-green-700'}`}>
              {m.compliance.missing.length ? `${m.compliance.missing.length} بنود غير مستوفاة` : 'جميع البنود مستوفاة'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl bg-green-50 p-4">
            <h3 className="m-0 text-[15px] font-extrabold text-green-800">أبرز نقاط القوة</h3>
            {m.strengths.length
              ? <ul className="m-0 flex list-disc flex-col gap-1 ps-5 text-sm leading-7 text-green-900">{m.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              : <p className="m-0 text-sm text-green-900">—</p>}
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-orange-50 p-4">
            <h3 className="m-0 text-[15px] font-extrabold text-orange-800">أولويات التحسين</h3>
            {m.priorities.length
              ? <ul className="m-0 flex list-disc flex-col gap-1 ps-5 text-sm leading-7 text-orange-900">{m.priorities.map((s, i) => <li key={i}>{s}</li>)}</ul>
              : <p className="m-0 text-sm text-orange-900">—</p>}
          </div>
        </div>
      </section>

      <section aria-label="الأداء حسب المحاور" className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <h2 className="m-0 text-lg font-extrabold">2. الأداء حسب المحاور</h2>
          <div className="flex gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-sm bg-teal-700" />المؤسسة</span>
            {hasBenchmark && <span className="flex items-center gap-1.5"><span className="h-2.5 w-3.5 rounded-sm bg-slate-400" />متوسط المؤسسات</span>}
          </div>
        </div>
        {m.pillars.length ? m.pillars.map(p => (
          <div key={p.name} className="grid grid-cols-[110px_minmax(0,1fr)_48px] items-center gap-3 sm:grid-cols-[190px_minmax(0,1fr)_56px]">
            <span className="text-sm font-bold">{p.name}</span>
            <div className="flex flex-col gap-1">
              <div className="h-3 rounded-md bg-slate-100"><div className="h-3 rounded-md bg-teal-700" style={{ width: `${p.inst}%` }} /></div>
              {hasBenchmark && p.avg !== undefined && (
                <div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-slate-400" style={{ width: `${p.avg}%` }} /></div>
              )}
            </div>
            <span className="text-left text-sm font-extrabold">{p.inst}%</span>
          </div>
        )) : <p className="m-0 text-sm text-slate-500">لا توجد إجابات تقييم.</p>}
      </section>

      <section aria-label="المؤشرات المالية" className="flex flex-col gap-3.5">
        <H2 n={3}>المؤشرات المالية{m.financial ? ` – السنة المالية ${m.financial.year}` : ''}</H2>
        {m.financial ? (
          <>
            <p className="m-0 text-sm text-slate-600">نوع القوائم: <strong className={m.financial.unaudited ? 'text-amber-700' : 'text-green-700'}>{m.financial.unaudited ? 'غير مدققة (معدّة من الإدارة)' : 'مدققة'}</strong></p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead><tr className="bg-slate-50 text-slate-700"><Th>المؤشر</Th><Th>القيمة</Th><Th>المعيار</Th><Th>التقييم</Th></tr></thead>
                <tbody>
                  {m.financial.rows.map(r => (
                    <tr key={r.name} className="border-t border-slate-200">
                      <td className="px-3 py-2.5 font-bold">{r.name}</td>
                      <td className="px-3 py-2.5">{r.value}</td>
                      <td className="px-3 py-2.5 text-slate-600">{r.rule}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[r.tone].text} ${TONE[r.tone].bg}`}>
                          <span className={`h-2 w-2 rounded-full ${TONE[r.tone].dot}`} />{TONE[r.tone].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="m-0 text-sm text-slate-500">لم تُرفع القوائم المالية.</p>}
      </section>

      <section aria-label="الامتثال والمخاطر" className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <H2 n={4}>الامتثال</H2>
          <div className="flex items-center gap-3.5">
            <span className="text-3xl font-extrabold text-teal-700">{m.compliance.pct}%</span>
            <span className="text-sm text-slate-600">{m.compliance.met} من {m.compliance.applicable} بنداً مستوفى</span>
          </div>
          {m.compliance.missing.length > 0 && (
            <>
              <p className="m-0 text-sm font-bold">بنود غير مستوفاة:</p>
              <ul className="m-0 list-disc ps-5 text-sm leading-7 text-slate-700">
                {m.compliance.missing.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}
                {m.compliance.missing.length > 6 && <li className="list-none text-slate-500">و{m.compliance.missing.length - 6} بنود أخرى</li>}
              </ul>
            </>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <H2 n={5}>أبرز المخاطر</H2>
          {m.risks.length ? m.risks.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <span className="text-sm font-semibold leading-6">{r.title}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE[r.tone].text} ${TONE[r.tone].bg}`}>{r.level}</span>
            </div>
          )) : <p className="m-0 text-sm text-slate-500">لا توجد مخاطر قائمة مسجلة.</p>}
          {m.riskTotal > m.risks.length && <p className="m-0 text-xs text-slate-500">من أصل {m.riskTotal} مخاطر مسجلة</p>}
        </div>
      </section>

      <section aria-label="خطة التحسين" className="flex flex-col gap-3.5">
        <H2 n={6}>خطة التحسين</H2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-700">
          <span>إجمالي البنود: <strong className="text-navy-900">{m.plan.total}</strong></span>
          <span>منجز: <strong className="text-green-700">{m.plan.done}</strong></span>
          <span>جارٍ: <strong className="text-amber-700">{m.plan.doing}</strong></span>
          <span>لم يبدأ: <strong className="text-red-700">{m.plan.todo}</strong></span>
        </div>
        {m.plan.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead><tr className="bg-slate-50 text-slate-700"><Th>البند</Th><Th>المسؤول</Th><Th>الموعد</Th><Th>الحالة</Th></tr></thead>
              <tbody>
                {m.plan.items.map((it, i) => (
                  <tr key={i} className="border-t border-slate-200">
                    <td className="px-3 py-2.5 font-semibold">{it.title}</td>
                    <td className="px-3 py-2.5 text-slate-600">{it.owner}</td>
                    <td className="px-3 py-2.5 text-slate-600">{it.due}</td>
                    <td className={`px-3 py-2.5 font-bold ${TONE[it.tone].text}`}>{it.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="ملاحظات الوزارة" className="flex flex-col gap-3">
        <H2 n={7}>ملاحظات الوزارة</H2>
        <div className="whitespace-pre-line rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm leading-8 text-yellow-950">
          {ev.ministry_notes?.trim() || (draft ? 'تُكتب عند الاعتماد.' : 'لا توجد ملاحظات.')}
        </div>
      </section>

      <footer className="flex flex-col gap-5 pt-2">
        <div className="grid grid-cols-2 gap-5 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-slate-600">اعتمده</span>
            <strong>{ev.approver_name?.trim() || 'وزارة الأوقاف والشؤون الدينية'}</strong>
            {ev.approver_title?.trim() && <span className="text-slate-600">{ev.approver_title}</span>}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-slate-600">تاريخ الاعتماد</span>
            <strong>{draft ? '—' : formatDate(ev.approved_at)}</strong>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2.5 text-xs text-slate-500">
          <span>صدر هذا التقرير من نظام تقييم المؤسسات الوقفية – وزارة الأوقاف والشؤون الدينية</span>
          {hasBenchmark && <span>المتوسط محسوب من {m.benchmark.institutions} مؤسسة</span>}
        </div>
      </footer>
    </article>
  );
};

export default OfficialReport;
