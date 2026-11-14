// بيانات لوحة القيادة الجديدة: تُحسب كلها من بيانات النظام (أو من البيانات التوضيحية في وضع العرض)
import type { Institution, Evaluation, Response, FinancialRecord, RiskRegisterItem, Indicator, ComplianceRecord } from '../types';
import { summarizeCompliance, getAutoChecks, riskLevel, RISK_CATEGORY_LABEL } from './compliance';
import { getInstitutionProgressSummary } from './institutionJourney';
import { scoreLevel } from './report';

export interface DashSource {
  institutions: Institution[];
  evaluations: Evaluation[];   // كل التقييمات (بما فيها المسودات)
  responses: Response[];
  financials: FinancialRecord[];
  risks: RiskRegisterItem[];
  indicators: Indicator[];
  compliance: ComplianceRecord[];
  demo: boolean;
}

export type Stage = 'approved' | 'submitted' | 'returned' | 'in-progress' | 'not-started';
export const STAGES: { key: Stage; label: string; color: string }[] = [
  { key: 'approved', label: 'معتمدة', color: '#15803d' },
  { key: 'submitted', label: 'قيد المراجعة', color: '#0369a1' },
  { key: 'returned', label: 'معادة للتعديل', color: '#ea580c' },
  { key: 'in-progress', label: 'قيد الإعداد', color: '#94a3b8' },
  { key: 'not-started', label: 'لم تبدأ', color: '#e2e8f0' },
];

export const LEVELS = [
  { label: 'ممتاز', color: '#15803d' },
  { label: 'جيد جداً', color: '#0f766e' },
  { label: 'جيد', color: '#0369a1' },
  { label: 'مقبول', color: '#f59e0b' },
  { label: 'ضعيف', color: '#b91c1c' },
];

export const BRACKETS = [
  { label: 'أقل من مليون', min: 0, max: 1_000_000, color: '#94a3b8' },
  { label: '1–5 ملايين', min: 1_000_000, max: 5_000_000, color: '#0f766e' },
  { label: '5–20 مليوناً', min: 5_000_000, max: 20_000_000, color: '#0a1929' },
  { label: 'أكثر من 20 مليوناً', min: 20_000_000, max: Infinity, color: '#d97706' },
];

const hash = (s: string) => Array.from(s).reduce((v, c) => (v * 31 + c.charCodeAt(0)) >>> 0, 7);
const pctOf = (avg: number) => Math.round((avg / 5) * 100);
const DAY = 86400000;

export interface AttentionItem { id: string; name: string; tags: { text: string; tone: 'bad' | 'warn' | 'info' }[]; weight: number }

export const buildDashboard = (src: DashSource, year: number, instId: string | null, deadline: string | null) => {
  const insts = instId ? src.institutions.filter(i => i.id === instId) : src.institutions;
  const ids = new Set(insts.map(i => i.id));
  const yearEvals = src.evaluations.filter(e => e.cycle_year === year && ids.has(e.institution_id));
  const evalOf = (id: string) => yearEvals.find(e => e.institution_id === id);

  // ── 1. حجم القطاع ──
  const capital = insts.reduce((a, i) => a + (Number(i.capital_omr) || 0), 0);
  const publicCount = insts.filter(i => i.type === 'وقفية عامة').length;
  const privateCount = insts.length - publicCount;
  const omani = insts.reduce((a, i) => a + (Number(i.employees_omani) || 0), 0);
  const nonOmani = insts.reduce((a, i) => a + (Number(i.employees_non_omani) || 0), 0);
  const employees = omani + nonOmani;
  const omanization = employees ? Math.round((omani / employees) * 1000) / 10 : 0;

  const openRisks = src.risks.filter(r => ids.has(r.institution_id) && r.status !== 'Closed');
  const riskLv = { high: 0, mid: 0, low: 0 };
  const matrix: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0)); // [احتمالية-1][أثر-1]
  const cats: Record<string, { n: number; high: number }> = {};
  openRisks.forEach(r => {
    const p = Math.min(5, Math.max(1, Number(r.probability) || 1));
    const i = Math.min(5, Math.max(1, Number(r.impact) || 1));
    const lv = riskLevel(p * i);
    riskLv[lv]++;
    matrix[p - 1][i - 1]++;
    const c = RISK_CATEGORY_LABEL[r.category] || r.category || 'أخرى';
    (cats[c] ||= { n: 0, high: 0 }).n++;
    if (lv === 'high') cats[c].high++;
  });
  const categories = Object.entries(cats).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.n - a.n);

  const brackets = BRACKETS.map(b => ({ ...b, n: insts.filter(i => (Number(i.capital_omr) || 0) >= b.min && (Number(i.capital_omr) || 0) < b.max).length }));

  const govMap: Record<string, { n: number; cap: number }> = {};
  insts.forEach(i => { const g = i.governorate || 'غير محدد'; (govMap[g] ||= { n: 0, cap: 0 }); govMap[g].n++; govMap[g].cap += Number(i.capital_omr) || 0; });
  const govSorted = Object.entries(govMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.n - a.n || b.cap - a.cap);
  const governorates = govSorted.length > 6
    ? [...govSorted.slice(0, 5), govSorted.slice(5).reduce((a, g) => ({ name: a.name, n: a.n + g.n, cap: a.cap + g.cap }), { name: `محافظات أخرى (${govSorted.length - 5})`, n: 0, cap: 0 })]
    : govSorted;

  // ── 2. سير الدورة ──
  const stageOf = (inst: Institution): Stage => {
    if (src.demo) {
      const h = hash(inst.id) % 20;
      return h < 8 ? 'approved' : h < 12 ? 'submitted' : h < 13 ? 'returned' : h < 18 ? 'in-progress' : 'not-started';
    }
    const s = getInstitutionProgressSummary(inst).summaryStatus;
    return s as Stage;
  };
  const stageByInst = new Map(insts.map(i => [i.id, stageOf(i)] as const));
  const stages = STAGES.map(s => ({ ...s, n: [...stageByInst.values()].filter(v => v === s.key).length }));
  const submittedCount = stages.filter(s => s.key === 'approved' || s.key === 'submitted').reduce((a, s) => a + s.n, 0);

  // منحنى التقدم: تراكمي أسبوعي من بداية الدورة حتى الموعد النهائي
  const end = deadline ? new Date(`${deadline}T23:59:59`) : new Date(`${year}-12-31T23:59:59`);
  const today = new Date();
  const datesSub: number[] = [], datesApp: number[] = [];
  insts.forEach(inst => {
    const st = stageByInst.get(inst.id);
    if (st !== 'approved' && st !== 'submitted') return;
    if (src.demo) {
      const h = hash(inst.id);
      const sub = Math.min(today.getTime(), end.getTime()) - (h % 60) * DAY;
      datesSub.push(sub);
      if (st === 'approved') datesApp.push(sub + (3 + (h % 9)) * DAY);
      return;
    }
    const ev = evalOf(inst.id);
    const sub = ev?.submission_date ? new Date(ev.submission_date).getTime() : NaN;
    if (!isNaN(sub)) datesSub.push(sub);
    if (st === 'approved') {
      const app = ev?.approved_at ? new Date(ev.approved_at).getTime() : sub;
      if (!isNaN(app)) datesApp.push(app);
    }
  });
  const created = yearEvals.map(e => new Date(e.created_at || e.cycle_date || '').getTime()).filter(t => !isNaN(t));
  // البداية: قبل أول رفع بثلاثة أسابيع (أو بداية إنشاء التقييمات إن لم يُرفع شيء)، وبحد أدنى 4 أسابيع قبل الموعد
  let start = datesSub.length ? Math.min(...datesSub) - 21 * DAY : (created.length ? Math.min(...created) : end.getTime() - 90 * DAY);
  start = Math.min(start, end.getTime() - 28 * DAY);
  const weeks = Math.max(4, Math.ceil((end.getTime() - start) / (7 * DAY)));
  const nowWeek = Math.min(weeks, Math.max(0, (today.getTime() - start) / (7 * DAY)));
  const cum = (dates: number[]) => {
    const pts: { w: number; v: number }[] = [];
    for (let w = 0; w <= Math.floor(nowWeek); w++) pts.push({ w, v: dates.filter(d => d <= start + w * 7 * DAY).length });
    if (nowWeek % 1 > 0.05) pts.push({ w: nowWeek, v: dates.filter(d => d <= today.getTime()).length });
    return pts;
  };
  const curve = {
    weeks, nowWeek, total: insts.length,
    submitted: cum(datesSub), approved: cum(datesApp),
    startLabel: new Date(start).toLocaleDateString('ar-OM-u-nu-latn', { day: 'numeric', month: 'long' }),
    endLabel: end.toLocaleDateString('ar-OM-u-nu-latn', { day: 'numeric', month: 'long' }),
    midLabel: new Date((start + end.getTime()) / 2).toLocaleDateString('ar-OM-u-nu-latn', { day: 'numeric', month: 'long' }),
    hasDeadline: !!deadline,
  };

  // ── 3. النتائج (المرفوعة والمعتمدة فقط) ──
  const counted = yearEvals.filter(e => src.demo || e.workflow_status === 'submitted' || e.workflow_status === 'approved');
  const respByEval = new Map<string, Response[]>();
  src.responses.forEach(r => { if (r.score > 0) { const a = respByEval.get(r.evaluation_id) || []; a.push(r); respByEval.set(r.evaluation_id, a); } });
  const indById = new Map(src.indicators.map(i => [i.id, i] as const));
  const scores = counted.map(e => {
    const rs = respByEval.get(e.id) || [];
    const axes: Record<string, { t: number; n: number }> = {};
    rs.forEach(r => { const ax = indById.get(r.indicator_id)?.axis; if (!ax) return; (axes[ax] ||= { t: 0, n: 0 }); axes[ax].t += r.score; axes[ax].n++; });
    return { inst: e.institution_id, n: rs.length, overall: rs.length ? pctOf(rs.reduce((a, r) => a + r.score, 0) / rs.length) : 0,
      axes: Object.fromEntries(Object.entries(axes).map(([k, v]) => [k, pctOf(v.t / v.n)])) as Record<string, number> };
  }).filter(s => s.n > 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const overall = avg(scores.map(s => s.overall));
  const levels = LEVELS.map(l => ({ ...l, n: scores.filter(s => scoreLevel(s.overall) === l.label).length }));
  const axisNames = Array.from(new Set(src.indicators.map(i => i.axis)));
  const axes = axisNames.map(name => ({ name, v: avg(scores.map(s => s.axes[name]).filter(v => v !== undefined)) }));
  const compByInst = new Map<string, number>();
  scores.forEach(s => {
    if (src.demo) { compByInst.set(s.inst, 60 + (hash(s.inst) % 40)); return; }
    const rec = src.compliance.find(c => c.institution_id === s.inst && c.cycle_year === year);
    compByInst.set(s.inst, summarizeCompliance(rec, getAutoChecks(s.inst)).pct);
  });
  const compliance = avg([...compByInst.values()]);

  // ── 4. المالية ──
  const fins = src.financials.filter(f => f.fiscal_year === year && ids.has(f.institution_id));
  const sum = (k: keyof FinancialRecord) => fins.reduce((a, f) => a + (Number(f[k]) || 0), 0);
  const withBenef = fins.filter(f => f.beneficiary_distributions !== undefined && f.beneficiary_distributions !== null);
  const benef = withBenef.reduce((a, f) => a + (Number(f.beneficiary_distributions) || 0), 0);
  const benefExp = withBenef.reduce((a, f) => a + (Number(f.total_expenses) || 0), 0);
  const ratios = fins.filter(f => f.total_expenses > 0).map(f => (f.admin_general_expenses / f.total_expenses) * 100);
  const finance = {
    count: fins.length,
    assets: sum('total_assets'), revenues: sum('total_revenues'), expenses: sum('total_expenses'),
    benef, benefShare: benefExp ? Math.round((benef / benefExp) * 100) : null, benefCount: withBenef.length,
    adminAvg: ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 10) / 10 : 0,
    adminOver: ratios.filter(r => r > 20).length,
    unaudited: fins.filter(f => f.unaudited).length,
  };

  // ── مؤسسات تحتاج متابعة ──
  const daysLeft = deadline ? Math.ceil((end.getTime() - today.getTime()) / DAY) : null;
  const attention: AttentionItem[] = insts.map(inst => {
    const tags: AttentionItem['tags'] = [];
    let weight = 0;
    const sc = scores.find(s => s.inst === inst.id);
    if (sc && sc.overall < 50) { tags.push({ text: `أداء ${sc.overall}% – ضعيف`, tone: 'bad' }); weight += 3; }
    const high = openRisks.filter(r => r.institution_id === inst.id && riskLevel(r.probability * r.impact) === 'high').length;
    if (high) { tags.push({ text: high === 1 ? 'خطر مرتفع' : high === 2 ? 'خطران مرتفعان' : `${high} مخاطر مرتفعة`, tone: 'bad' }); weight += 2 + high; }
    const f = fins.find(x => x.institution_id === inst.id);
    if (f && f.surplus_deficit < 0) { tags.push({ text: 'عجز مالي', tone: 'bad' }); weight += 2; }
    if (f && f.total_expenses > 0 && f.admin_general_expenses / f.total_expenses > 0.2) { tags.push({ text: `مصاريف إدارية ${Math.round((f.admin_general_expenses / f.total_expenses) * 100)}%`, tone: 'warn' }); weight += 1; }
    if (f?.unaudited) { tags.push({ text: 'قوائم غير مدققة', tone: 'warn' }); weight += 1; }
    const cp = compByInst.get(inst.id);
    if (cp !== undefined && cp < 60) { tags.push({ text: `امتثال ${cp}%`, tone: 'warn' }); weight += 1; }
    const st = stageByInst.get(inst.id);
    if (st === 'returned') {
      const ev = evalOf(inst.id);
      const d = ev?.returned_at ? Math.floor((today.getTime() - new Date(ev.returned_at).getTime()) / DAY) : null;
      tags.push({ text: d !== null && d > 0 ? `معادة للتعديل منذ ${d} يوماً` : 'معادة للتعديل', tone: 'warn' }); weight += 1;
    }
    if (st === 'not-started' && daysLeft !== null && daysLeft <= 30) {
      tags.push({ text: daysLeft < 0 ? 'لم تبدأ – انتهى الموعد' : `لم تبدأ – باقي ${daysLeft} يوماً`, tone: daysLeft < 0 ? 'bad' : 'info' }); weight += daysLeft < 0 ? 3 : 1;
    }
    return { id: inst.id, name: inst.name, tags, weight };
  }).filter(a => a.tags.length).sort((a, b) => b.weight - a.weight).slice(0, 6);

  return {
    count: insts.length, capital, publicCount, privateCount, omani, nonOmani, employees, omanization,
    risksOpen: openRisks.length, riskLv, matrix, categories, brackets, governorates,
    stages, submittedCount, curve, daysLeft,
    counted: scores.length, overall, overallLevel: scoreLevel(overall), levels, axes, compliance,
    finance, attention,
  };
};

export type DashboardModel = ReturnType<typeof buildDashboard>;
