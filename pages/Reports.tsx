import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Printer, Download, Clock, FileText, ShieldAlert } from 'lucide-react';
import { useUi } from '../contexts/UiContext';
import { getEvaluations } from '../services/db';
import { CURRENT_YEAR } from '../constants';
import { buildReport, formatDate } from '../utils/report';
import OfficialReport from '../components/OfficialReport';

declare const html2pdf: any;

const Reports: React.FC = () => {
  const { currentWaqfId, role } = useUi();
  const isAdmin = role === 'admin';
  const ev = currentWaqfId ? getEvaluations(CURRENT_YEAR).find(e => e.institution_id === currentWaqfId) : undefined;
  const approved = ev?.workflow_status === 'approved';
  // المدير يرى مسودة التقرير قبل الاعتماد (بالمتوسط الحالي)، والمؤسسة لا ترى إلا المعتمد
  const model = useMemo(
    () => (currentWaqfId && (isAdmin || approved) ? buildReport(currentWaqfId, CURRENT_YEAR, isAdmin && !approved) : null),
    [currentWaqfId, isAdmin, approved, ev?.workflow_status],
  );

  const downloadPdf = () => {
    const el = document.getElementById('report-content');
    if (!el || typeof html2pdf === 'undefined') return window.print();
    html2pdf().from(el).set({
      margin: 5,
      filename: `تقرير-التقييم-${model?.institutionName || ''}-${CURRENT_YEAR}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).save();
  };

  const title = isAdmin ? 'النتائج والتقارير' : `تقرير التقييم ${CURRENT_YEAR}`;

  // المؤسسة: قبل الاعتماد
  if (!isAdmin && !approved) {
    const submitted = ev?.workflow_status === 'submitted';
    return (
      <div className="flex flex-col gap-5 pb-20">
        <h2 className="text-2xl font-bold text-navy-900">{title}</h2>
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
        {model && (
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="flex min-h-[44px] items-center gap-2 rounded-lg bg-navy-800 px-4 font-bold text-white hover:bg-navy-900">
              <Printer size={18} aria-hidden="true" /> طباعة
            </button>
            <button type="button" onClick={downloadPdf} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-navy-800 bg-white px-4 font-bold text-navy-800 hover:bg-gray-50">
              <Download size={18} aria-hidden="true" /> PDF
            </button>
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
          لا يوجد تقييم لهذه المؤسسة في دورة {CURRENT_YEAR}
        </div>
      )}
    </div>
  );
};

export default Reports;
