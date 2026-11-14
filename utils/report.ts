// بيانات التقرير الرسمي للمؤسسة: تُحسب من بيانات المؤسسة، والمقارنة بالمتوسط تُحفظ عند الاعتماد
import {
  getInstitutions, getEvaluations, getResponses, getIndicators, getRisks,
  getComplianceByInstAndYear, getImprovements, getFinancialRecords,
} from '../services/db';
import { summarizeCompliance, getAutoChecks, riskLevel, RISK_LEVEL_LABEL } from './compliance';
import { Evaluation, Indicator, ReportBenchmark } from '../types';

export type Tone = 'good' | 'warn' | 'bad' | 'info';

export const scoreLevel = (pct: number) =>
  pct >= 90 ? 'ممتاز' : pct >= 75 ? 'جيد جداً' : pct >= 60 ? 'جيد' : pct >= 50 ? 'مقبول' : 'ضعيف';

// نص المؤشر مكتوب كسؤال («هل توجد ...؟»)؛ في التقرير يُعرض كعبارة مع درجته
const asStatement = (text: string, score: number) =>
  `${text.trim().replace(/^(هل|ما)\s+/, '').replace(/[؟?]\s*$/, '')} (${score} من 5)`;

const toPct = (avg: number) => Math.round((avg / 5) * 100);

// درجة تقييم واحد: الإجمالي ولكل محور (نسبة مئوية من 5)
export const evaluationScores = (evaluationId: string, indicators: Indicator[]) => {
  const responses = getResponses(evaluationId).filter(r => r.score > 0);
  const axes: Record<string, { t: number; n: number }> = {};
  responses.forEach(r => {
    const ind = indicators.find(i => i.id === r.indicator_id);
    if (!ind) return;
    (axes[ind.axis] ||= { t: 0, n: 0 });
    axes[ind.axis].t += r.score; axes[ind.axis].n++;
  });
  const overall = responses.length ? toPct(responses.reduce((a, r) => a + r.score, 0) / responses.length) : 0;
  const pillars: Record<string, number> = {};
  Object.entries(axes).forEach(([k, v]) => { pillars[k] = toPct(v.t / v.n); });
  return { overall, pillars, count: responses.length };
};

// متوسط المؤسسات التي رفعت تقييمها في الدورة نفسها (يُحسب عند المدير فقط)
export const computeBenchmark = (year: number): ReportBenchmark => {
  const indicators = getIndicators();
  const scores = getEvaluations(year)
    .filter(e => e.workflow_status === 'submitted' || e.workflow_status === 'approved')
    .map(e => evaluationScores(e.id, indicators))
    .filter(s => s.count > 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const axes = Array.from(new Set(indicators.map(i => i.axis)));
  const pillars: Record<string, number> = {};
  axes.forEach(ax => {
    const vals = scores.map(s => s.pillars[ax]).filter(v => v !== undefined);
    if (vals.length) pillars[ax] = avg(vals);
  });
  return { overall: avg(scores.map(s => s.overall)), pillars, institutions: scores.length, computed_at: new Date().toISOString() };
};

// رقم المرجع: و.ش.د/ت.م/السنة/تسلسل
const REF_PREFIX = 'و.ش.د/ت.م';
export const nextReportRef = (year: number) => {
  const used = getEvaluations(year)
    .map(e => Number((e.report_ref || '').split('/').pop()))
    .filter(n => Number.isFinite(n));
  const seq = (used.length ? Math.max(...used) : 0) + 1;
  return `${REF_PREFIX}/${year}/${String(seq).padStart(4, '0')}`;
};

export const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('ar-OM', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} ر.ع`;

export interface ReportModel {
  institutionName: string;
  evaluation: Evaluation;
  year: number;
  approved: boolean;
  overall: number;
  level: string;
  benchmark: ReportBenchmark;
  strengths: string[];
  priorities: string[];
  pillars: { name: string; inst: number; avg?: number }[];
  financial: { year: number; unaudited: boolean; auditor: string; rows: { name: string; value: string; rule: string; tone: Tone }[] } | null;
  compliance: { pct: number; met: number; applicable: number; missing: string[] };
  risks: { title: string; level: string; tone: Tone }[];
  riskTotal: number;
  plan: { total: number; done: number; doing: number; todo: number; items: { title: string; owner: string; due: string; status: string; tone: Tone }[] };
}

export const buildReport = (institutionId: string, year: number, liveBenchmark?: boolean): ReportModel | null => {
  const inst = getInstitutions().find(i => i.id === institutionId);
  const ev = getEvaluations(year).find(e => e.institution_id === institutionId);
  if (!inst || !ev) return null;

  const indicators = getIndicators();
  const scores = evaluationScores(ev.id, indicators);
  const approved = ev.workflow_status === 'approved';
  const benchmark = (!liveBenchmark && ev.report_benchmark) || computeBenchmark(year);

  // نقاط القوة: أعلى المؤشرات درجة (4 فأعلى)
  const scored = getResponses(ev.id)
    .map(r => ({ r, ind: indicators.find(i => i.id === r.indicator_id) }))
    .filter(x => x.ind && x.r.score > 0) as { r: { score: number }; ind: Indicator }[];
  const strengths = [...scored].filter(x => x.r.score >= 4)
    .sort((a, b) => b.r.score - a.r.score || b.ind.weight - a.ind.weight)
    .slice(0, 3).map(x => asStatement(x.ind.text, x.r.score));

  // الأولويات: بنود خطة التحسين الأعلى أولوية، وإلا أضعف المؤشرات
  const improvements = getImprovements(ev.id);
  const PR = { High: 0, Medium: 1, Low: 2 } as const;
  let priorities = [...improvements].filter(i => i.status !== 'Done')
    .sort((a, b) => PR[a.priority] - PR[b.priority])
    .map(i => i.recommended_action || i.issue_summary).filter(Boolean).slice(0, 3);
  if (priorities.length < 3) {
    const weak = [...scored].filter(x => x.r.score <= 3).sort((a, b) => a.r.score - b.r.score || b.ind.weight - a.ind.weight)
      .map(x => asStatement(x.ind.text, x.r.score)).filter(t => !priorities.includes(t));
    priorities = [...priorities, ...weak].slice(0, 3);
  }

  const axes = Array.from(new Set(indicators.map(i => i.axis)));
  const pillars = axes.filter(ax => scores.pillars[ax] !== undefined)
    .map(ax => ({ name: ax, inst: scores.pillars[ax], avg: benchmark.pillars[ax] }));

  // المؤشرات المالية
  const fins = getFinancialRecords(institutionId);
  const f = fins.find(x => x.fiscal_year === year) || fins.find(x => x.fiscal_year === year - 1);
  let financial: ReportModel['financial'] = null;
  if (f) {
    const rows: NonNullable<ReportModel['financial']>['rows'] = [];
    rows.push({ name: 'صافي أصول الوقف', value: money(f.net_waqf_assets), rule: 'موجب', tone: f.net_waqf_assets > 0 ? 'good' : 'bad' });
    rows.push({ name: 'الفائض / العجز', value: money(f.surplus_deficit), rule: 'فائض', tone: f.surplus_deficit >= 0 ? 'good' : 'warn' });
    const adminRatio = f.total_expenses > 0 ? (f.admin_general_expenses / f.total_expenses) * 100 : 0;
    rows.push({ name: 'نسبة المصاريف الإدارية', value: `${adminRatio.toFixed(1)}%`, rule: '20% كحد أقصى', tone: adminRatio <= 20 ? 'good' : 'bad' });
    if (f.beneficiary_distributions !== undefined && f.beneficiary_distributions !== null) {
      const share = f.total_expenses > 0 ? (f.beneficiary_distributions / f.total_expenses) * 100 : 0;
      rows.push({ name: 'المصروف على الموقوف عليهم', value: `${money(f.beneficiary_distributions)} (${share.toFixed(1)}% من المصروفات)`, rule: 'متابعة سنوية', tone: f.beneficiary_distributions > 0 ? 'good' : 'warn' });
    }
    if (f.operating_cash_flow !== undefined && f.operating_cash_flow !== null) {
      rows.push({ name: 'صافي النقد التشغيلي', value: money(f.operating_cash_flow), rule: 'موجب', tone: f.operating_cash_flow >= 0 ? 'good' : 'warn' });
    }
    rows.push(f.unaudited
      ? { name: 'تدقيق القوائم', value: 'غير مدققة', rule: 'تدقيق خارجي', tone: 'warn' }
      : { name: 'تدقيق القوائم', value: f.auditor_name ? `مدققة – ${f.auditor_name}` : 'مدققة', rule: 'تدقيق خارجي', tone: 'good' });
    financial = { year: f.fiscal_year, unaudited: !!f.unaudited, auditor: f.auditor_name || '', rows };
  }

  const cs = summarizeCompliance(getComplianceByInstAndYear(institutionId, year), getAutoChecks(institutionId));

  const allRisks = getRisks(institutionId).filter(r => r.status !== 'Closed');
  const risks = [...allRisks].sort((a, b) => b.probability * b.impact - a.probability * a.impact).slice(0, 3).map(r => {
    const lv = riskLevel(r.probability * r.impact);
    return { title: r.risk_title || '—', level: RISK_LEVEL_LABEL[lv], tone: (lv === 'high' ? 'bad' : lv === 'mid' ? 'warn' : 'good') as Tone };
  });

  const ST = { Done: ['منجز', 'good'], Doing: ['جارٍ', 'warn'], ToDo: ['لم يبدأ', 'bad'] } as const;
  const ORDER = { Doing: 0, ToDo: 1, Done: 2 } as const;
  const items = [...improvements]
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || PR[a.priority] - PR[b.priority])
    .slice(0, 6)
    .map(i => ({
      title: i.recommended_action || i.issue_summary, owner: i.owner || '—',
      due: i.due_date ? formatDate(i.due_date) : '—', status: ST[i.status][0], tone: ST[i.status][1] as Tone,
    }));

  return {
    institutionName: inst.name, evaluation: ev, year, approved,
    overall: scores.overall, level: scoreLevel(scores.overall), benchmark,
    strengths, priorities, pillars, financial,
    compliance: { pct: cs.pct, met: cs.met, applicable: cs.applicable, missing: cs.missing },
    risks, riskTotal: allRisks.length,
    plan: {
      total: improvements.length,
      done: improvements.filter(i => i.status === 'Done').length,
      doing: improvements.filter(i => i.status === 'Doing').length,
      todo: improvements.filter(i => i.status === 'ToDo').length,
      items,
    },
  };
};
