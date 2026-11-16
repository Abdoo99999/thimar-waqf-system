import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Download, Clock, FileText, ShieldAlert } from 'lucide-react';
import { useUi, isMinistryRole } from '../contexts/UiContext';
import { getEvaluations } from '../services/db';
import { CURRENT_YEAR } from '../constants';
import { buildReport, formatDate, ReportModel } from '../utils/report';
import OfficialReport from '../components/OfficialReport';

declare const html2pdf: any;

const Reports: React.FC = () => {
  const { currentWaqfId, role } = useUi();
  const isAdmin = isMinistryRole(role); // المدير والمعتمِد والمطّلع يرون المسودة قبل الاعتماد
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener('evaluationChanged', bump);
    return () => window.removeEventListener('evaluationChanged', bump);
  }, []);
  // الدورات التي فيها تقييم لهذه المؤسسة (الحالية أولاً، ثم السابقة)
  const evals = currentWaqfId ? getEvaluations().filter(e => e.institution_id === currentWaqfId) : [];
  const years = Array.from(new Set([CURRENT_YEAR, ...evals.map(e => e.cycle_year)])).sort((a, b) => b - a);
  const [year, setYear] = useState(CURRENT_YEAR);
  useEffect(() => { setYear(CURRENT_YEAR); }, [currentWaqfId]);
  const ev = evals.find(e => e.cycle_year === year);
  const approved = ev?.workflow_status === 'approved';
  // التقرير المعتمد يُعرض من النسخة المحفوظة لحظة الاعتماد فلا يتغيّر بعدها.
  // قبل الاعتماد: الوزارة ترى مسودة محسوبة من البيانات الحالية، والمؤسسة لا ترى شيئاً
  const model: ReportModel | null = useMemo(() => {
    if (!currentWaqfId || !ev) return null;
    if (approved && ev.report_snapshot) return { ...(ev.report_snapshot as ReportModel), evaluation: ev, approved: true, year };
    return isAdmin || approved ? buildReport(currentWaqfId, year, isAdmin && !approved) : null;
  }, [currentWaqfId, isAdmin, approved, ev, year, tick]);

  const downloadPdf = () => {
    const el = document.getElementById('report-content');
    if (!el || typeof html2pdf === 'undefined') return window.print();
    html2pdf().from(el).set({
      margin: 5,
      filename: `تقرير-التقييم-${model?.institutionName || ''}-${year}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).save();
  };

  const title = isAdmin ? 'النتائج والتقارير' : `تقرير التقييم ${year}`;
  const yearPicker = years.length > 1 && (
    <label className="no-print flex items-center gap-2 text-sm font-bold text-slate-700">
      الدورة
      <select value={year} onChange={e => setYear(Number(e.target.value))} className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 font-bold">
        {years.map(y => <option key={y} value={y}>{y}{y === CURRENT_YEAR ? ' (الحالية)' : ''}</option>)}
      </select>
    </label>
  );

  // المؤسسة: قبل الاعتماد
  if (!isAdmin && !approved) {
    const submitted = ev?.workflow_status === 'submitted';
    return (
      <div className="flex flex-col gap-5 pb-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-navy-900">{title}</h2>
          {yearPicker}
        </div>
        <div className="flex flex-col items-center gap-3.5 rounded-2xl border border-gray-200 bg-white px-6 py-14 text-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-sky-100 text-sky-700">
            {submitted ? <Clock size={34} aria-hidden="true" /> : <FileText size={34} aria-hidden="true" />}
          </div>
          <h3 className="text-xl font-extrabold text-navy-900">{submitted ? 'التقرير قيد المراجعة' : 'لم يصدر التقرير بعد'}</h3>
          <p className="max-w-md text-[15px] leading-8 text-slate-600">
            {submitted
              ? `رُفع تقييمكم بتاريخ ${formatDate(ev?.submission_date)}. سيظهر التقرير الرسمي هنا بعد اعتماده من الوزارة.`
              : 'يصدر التقرير بعد رفع التقييم للوزارة واعتماده.'}
          </p>
          <Link to={submitted ? '/improvements' : '/review-submit'} className="mt-1.5 inline-flex min-h-[44px] items-center rounded-xl bg-navy-900 px-5 text-[15px] font-bold text-white hover:bg-navy-800">
            {submitted ? 'متابعة خطة التحسين' : 'المراجعة والإرسال'}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-20">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-navy-900">{title}</h2>
        {(model || yearPicker) && (
          <div className="flex flex-wrap items-center gap-2">
            {yearPicker}
            {model && <>
            <button type="button" onClick={() => window.print()} className="flex min-h-[44px] items-center gap-2 rounded-lg bg-navy-800 px-4 font-bold text-white hover:bg-navy-900">
              <Printer size={18} aria-hidden="true" /> طباعة
            </button>
            <button type="button" onClick={downloadPdf} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-navy-800 bg-white px-4 font-bold text-navy-800 hover:bg-gray-50">
              <Download size={18} aria-hidden="true" /> PDF
            </button>
            </>}
          </div>
        )}
      </div>

      {isAdmin && model && !approved && (
        <p role="status" className="no-print rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {ev?.workflow_status === 'submitted'
            ? 'مسودة: يظهر التقرير للمؤسسة برقم مرجع وتاريخ إصدار بعد الاعتماد.'
            : 'مسودة: المؤسسة لم ترفع تقييمها بعد.'}
        </p>
      )}

      {!currentWaqfId ? (
        <div className="flex flex-col items-center rounded-xl border border-orange-200 bg-orange-50 p-8 text-center">
          <div className="mb-4 rounded-full bg-orange-100 p-4 text-orange-600"><ShieldAlert size={32} aria-hidden="true" /></div>
          <p className="mb-2 text-lg font-bold text-orange-900">لم يتم اختيار مؤسسة</p>
          <p className="text-sm text-orange-700">اختر المؤسسة من لوحة القيادة أو صفحة بيانات المؤسسات.</p>
        </div>
      ) : model ? (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <OfficialReport model={model} draft={!approved} />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-500">
          لا يوجد تقييم لهذه المؤسسة في دورة {year}
        </div>
      )}
    </div>
  );
};

export default Reports;
