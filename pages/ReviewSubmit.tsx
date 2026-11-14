import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DeadlineNotice from '../components/DeadlineNotice';
import { useUi } from '../contexts/UiContext';
import {
  getEvaluationByInstAndYear, saveEvaluation, getResponses, getComplianceByInstAndYear,
  getRisks, getImprovements, getFinancialRecords, getInstitutions,
} from '../services/db';
import { CURRENT_YEAR } from '../constants';
import { getInstitutionJourney, JOURNEY_STEPS } from '../utils/institutionJourney';
import { summarizeCompliance, getAutoChecks, riskLevel } from '../utils/compliance';
import { Evaluation } from '../types';
import { CheckCircle2, Circle, Lock, Send, AlertTriangle, ArrowLeft, Clock, RotateCcw, ShieldCheck } from 'lucide-react';

const STATUS_BANNER = {
  draft: { title: 'مسودة — لم يُرسل بعد', cls: 'bg-slate-50 border-slate-200 text-slate-800' },
  submitted: { title: 'مُرسل للوزارة — قيد المراجعة', cls: 'bg-sky-50 border-sky-200 text-sky-900' },
  returned: { title: 'مُعاد للتعديل', cls: 'bg-orange-50 border-orange-200 text-orange-900' },
  approved: { title: 'معتمد من الوزارة', cls: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
} as const;

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('ar-OM', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

const ReviewSubmit: React.FC = () => {
  const { currentWaqfId, showToast, role } = useUi();
  const navigate = useNavigate();
  const [evaluation, setEvaluation] = useState<Evaluation | undefined>();
  const [declared, setDeclared] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (currentWaqfId) setEvaluation(getEvaluationByInstAndYear(currentWaqfId, CURRENT_YEAR));
    setDeclared(false); setConfirming(false);
  }, [currentWaqfId, tick]);

  const data = useMemo(() => {
    if (!currentWaqfId) return null;
    const journey = getInstitutionJourney(currentWaqfId);
    const ev = getEvaluationByInstAndYear(currentWaqfId, CURRENT_YEAR);
    const responses = ev ? getResponses(ev.id) : [];
    const score = responses.length ? responses.reduce((a, r) => a + (Number(r.score) || 0), 0) / responses.length : null;
    const compliance = summarizeCompliance(getComplianceByInstAndYear(currentWaqfId, CURRENT_YEAR), getAutoChecks(currentWaqfId));
    const risks = getRisks(currentWaqfId);
    const highRisks = risks.filter(r => riskLevel(r.probability * r.impact) === 'high').length;
    const improvements = ev ? getImprovements(ev.id) : [];
    const fins = getFinancialRecords(currentWaqfId);
    const fin = fins.find(f => f.fiscal_year === CURRENT_YEAR) || fins.find(f => f.fiscal_year === CURRENT_YEAR - 1);

    // تنبيهات لا تمنع الإرسال لكنها تستحق المراجعة
    const warnings: { text: string; path: string }[] = [];
    if (compliance.missingEvidence > 0) warnings.push({ text: `${compliance.missingEvidence} التزامات "ملتزم" بدون دليل مرفق`, path: '/compliance' });
    if (fin && !fin.audit_report_pdf && !fin.unaudited) warnings.push({ text: 'لم يُرفق تقرير المدقق المالي', path: '/financial-reports' });
    if (fin && fin.flags?.length) warnings.push({ text: `القوائم المالية فيها ${fin.flags.length} ملاحظة`, path: '/financial-reports' });
    const noEvidence = responses.filter(r => (Number(r.score) || 0) >= 3 && !r.evidence_doc && !(r.evidence_text || '').trim()).length;
    if (noEvidence > 0) warnings.push({ text: `${noEvidence} مؤشرات أداء بدرجة 3 فأعلى بدون دليل`, path: '/evaluation' });

    const institution = getInstitutions().find(i => i.id === currentWaqfId);
    return { journey, score, compliance, risks, highRisks, improvements, warnings, institution };
  }, [currentWaqfId, evaluation, tick]);

  if (!currentWaqfId || !data) {
    return <div className="p-8 text-center text-gray-500">اختر مؤسسة من متابعة المؤسسات</div>;
  }

  const { journey } = data;
  const status = journey.workflowStatus;
  const banner = STATUS_BANNER[status];
  const prerequisitesDone = journey.completed.slice(0, 5).every(Boolean);
  const canSubmit = role === 'user' && (status === 'draft' || status === 'returned') && prerequisitesDone && !!evaluation;

  const handleSubmit = async () => {
    if (!evaluation || !declared || sending) return;
    setSending(true);
    const now = new Date().toISOString();
    const updated: Evaluation = { ...evaluation, workflow_status: 'submitted', submission_date: now, declaration_accepted_at: now };
    try {
      await saveEvaluation(updated);
      showToast('تم إرسال التقييم للوزارة بنجاح', 'success');
      setEvaluation(updated);
      setTick(t => t + 1);
    } catch { /* رسالة الخطأ تظهر تلقائياً */ }
    finally { setSending(false); setConfirming(false); }
  };

  const summary = [
    { label: 'نتيجة الأداء المؤسسي', value: data.score !== null ? `${data.score.toFixed(1)} / 5` : '—', path: '/evaluation' },
    { label: 'نسبة الامتثال', value: `${data.compliance.pct}%`, path: '/compliance' },
    { label: 'المخاطر المسجلة', value: `${data.risks.length}${data.highRisks ? ` (منها ${data.highRisks} عالية)` : ''}`, path: '/compliance' },
    { label: 'بنود خطة التحسين', value: `${data.improvements.length}`, path: '/improvements' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20" dir="rtl">
      <h2 className="text-2xl font-bold text-navy-900">المراجعة والإرسال</h2>

      <DeadlineNotice done={status === 'submitted' || status === 'approved'} />

      {/* الحالة */}
      <section className={`rounded-2xl border p-5 ${banner.cls}`} aria-live="polite">
        <div className="flex flex-wrap items-center gap-3">
          {status === 'approved' ? <ShieldCheck size={24} /> : status === 'returned' ? <RotateCcw size={22} /> : status === 'submitted' ? <Clock size={22} /> : <Circle size={22} />}
          <h3 className="text-lg font-extrabold">{banner.title}</h3>
          {evaluation?.submission_date && status !== 'draft' && (
            <span className="text-sm opacity-80">· أُرسل في {fmtDate(evaluation.submission_date)}</span>
          )}
        </div>
        {status === 'returned' && journey.adminFeedback && (
          <div className="mt-3 rounded-xl bg-white/70 p-3">
            <p className="text-xs font-bold mb-1">ملاحظات الوزارة:</p>
            <p className="text-sm whitespace-pre-wrap">{journey.adminFeedback}</p>
          </div>
        )}
        {status === 'submitted' && <p className="mt-2 text-sm">لا يمكن التعديل على البيانات أثناء المراجعة، ويمكن متابعة تنفيذ خطة التحسين.</p>}
      </section>

      {/* الخطوات الست */}
      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <h3 className="px-5 py-4 border-b border-gray-100 font-bold text-navy-900">قائمة التحقق قبل الإرسال</h3>
        <ol className="divide-y divide-gray-100">
          {JOURNEY_STEPS.slice(0, 5).map((step, i) => {
            const done = journey.completed[i];
            const locked = journey.locked[i];
            return (
              <li key={step.path} className="flex items-center gap-4 px-5 py-4">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${done ? 'bg-emerald-100 text-emerald-700' : locked ? 'bg-gray-100 text-gray-400' : 'bg-amber-100 text-amber-800'}`}>
                  {done ? <CheckCircle2 size={18} /> : locked ? <Lock size={16} /> : i + 1}
                </span>
                <span className={`flex-1 font-bold ${done ? 'text-gray-900' : 'text-gray-500'}`}>{step.title}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${done ? 'bg-emerald-50 text-emerald-700' : locked ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-800'}`}>
                  {done ? 'مكتمل' : locked ? 'مقفل' : 'غير مكتمل'}
                </span>
                {!locked && (
                  <button type="button" onClick={() => navigate(step.path)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 text-sm font-bold text-teal-700 hover:bg-teal-50">
                    {done ? 'عرض' : 'إكمال'} <ArrowLeft size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* ملخص ما سيُرسل */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="font-bold text-navy-900">ملخص ما سيُرسل{data.institution ? ` — ${data.institution.name}` : ''}</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {summary.map(s => (
            <button key={s.label} type="button" onClick={() => navigate(s.path)} className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-right hover:border-teal-300 hover:bg-white">
              <span className="block text-xs text-gray-500">{s.label}</span>
              <span className="block mt-1 text-xl font-extrabold text-navy-900">{s.value}</span>
            </button>
          ))}
        </div>
        {data.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900 mb-2"><AlertTriangle size={16} /> يُنصح بمراجعة ما يلي قبل الإرسال</p>
            <ul className="space-y-1.5">
              {data.warnings.map(w => (
                <li key={w.text} className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900">
                  <span>• {w.text}</span>
                  {status !== 'submitted' && status !== 'approved' && (
                    <button type="button" onClick={() => navigate(w.path)} className="text-xs font-bold text-teal-700 hover:underline">مراجعة</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* الإرسال */}
      {role === 'user' && (status === 'draft' || status === 'returned') && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          {!prerequisitesDone ? (
            <p className="flex items-center gap-2 text-sm font-bold text-gray-600"><Lock size={16} /> أكمل الخطوات أعلاه لتتمكن من الإرسال.</p>
          ) : (
            <>
              <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 cursor-pointer">
                <input type="checkbox" checked={declared} onChange={e => setDeclared(e.target.checked)} className="mt-1 h-5 w-5 accent-teal-600" />
                <span className="text-sm text-gray-800 leading-relaxed">
                  أقر بأن البيانات والمرفقات المقدمة صحيحة ومكتملة وفق علمي، وأنها تعكس واقع المؤسسة للسنة {CURRENT_YEAR}.
                </span>
              </label>
              {!confirming ? (
                <button type="button" disabled={!declared || !canSubmit} onClick={() => setConfirming(true)}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-navy-900 px-6 font-bold text-white hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Send size={18} /> {status === 'returned' ? 'إعادة الإرسال للوزارة' : 'إرسال التقييم للوزارة'}
                </button>
              ) : (
                <div className="rounded-xl border border-navy-200 bg-navy-50 p-4 space-y-3">
                  <p className="text-sm font-bold text-navy-900">بعد الإرسال لا يمكن تعديل البيانات حتى تنتهي مراجعة الوزارة. هل تريد المتابعة؟</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleSubmit} disabled={sending} className="min-h-[44px] rounded-lg bg-navy-900 px-5 font-bold text-white disabled:opacity-60">{sending ? 'جاري الإرسال...' : 'نعم، أرسل'}</button>
                    <button type="button" onClick={() => setConfirming(false)} disabled={sending} className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-5 font-bold">إلغاء</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
};

export default ReviewSubmit;
