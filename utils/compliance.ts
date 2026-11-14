// منطق الامتثال المشترك: تستخدمه صفحة الامتثال والتقارير وخطة التحسين،
// حتى تُحسب النسبة والفجوات بنفس الطريقة في كل مكان.
import { CURRENT_YEAR } from '../constants';
import { getInstitutions, getFinancialRecords } from '../services/db';
import type { ComplianceRecord, CustomRequirement, ObligationAnswer, RiskRegisterItem } from '../types';

// ─── الالتزامات النظامية (مسودة قابلة للتعديل وفق اللوائح) ───────────────────
export interface Obligation { id: string; label: string; hint: string; legacyKey?: string }
export interface ObligationGroup { title: string; items: Obligation[] }

export const OBLIGATION_GROUPS: ObligationGroup[] = [
  { title: 'الحوكمة والاجتماعات', items: [
    { id: 'board_meetings', label: 'عقد مجلس الإدارة اجتماعاته الدورية المقررة خلال العام', hint: 'الدليل: جدول الاجتماعات أو الدعوات' },
    // نفس متطلب "محاضر العام الماضي" في الصيغة السابقة
    { id: 'minutes', label: 'توثيق محاضر الاجتماعات واعتمادها وتوقيعها', hint: 'الدليل: محاضر العام الماضي', legacyKey: 'has_minutes_prev_year' },
    { id: 'conflict_of_interest', label: 'إفصاح أعضاء المجلس سنوياً عن تعارض المصالح', hint: 'الدليل: نماذج الإفصاح الموقعة' },
  ]},
  { title: 'التقارير والإفصاح للوزارة', items: [
    { id: 'annual_report', label: 'رفع التقرير السنوي للوزارة في موعده', hint: 'الدليل: نسخة التقرير وإشعار الاستلام' },
    { id: 'disclosure', label: 'الإفصاح عن القوائم المالية المدققة للجهات المعنية', hint: 'الدليل: ما يثبت الإفصاح' },
  ]},
  { title: 'الأصول الوقفية', items: [
    { id: 'asset_register', label: 'وجود سجل محدّث بجميع الأصول الوقفية', hint: 'الدليل: السجل أو تصديره' },
    { id: 'title_deeds', label: 'توثيق ملكية الأصول وتسجيلها رسمياً', hint: 'الدليل: الصكوك أو شهادات التسجيل' },
    { id: 'leases', label: 'عقود الإيجار موثقة وسارية', hint: 'الدليل: نماذج من العقود السارية' },
  ]},
  { title: 'السياسات واللوائح', items: [
    { id: 'financial_policy', label: 'لائحة مالية معتمدة من مجلس الإدارة', hint: 'الدليل: اللائحة وقرار اعتمادها' },
    { id: 'investment_policy', label: 'سياسة استثمار معتمدة متوافقة مع الضوابط الشرعية', hint: 'الدليل: السياسة وقرار اعتمادها' },
  ]},
];
export const ALL_OBLIGATIONS = OBLIGATION_GROUPS.flatMap(g => g.items);

// ─── مكتبة مخاطر الأوقاف ────────────────────────────────────────────────────
export interface LibraryRisk { id: string; title: string; category: RiskRegisterItem['category']; probability: number; impact: number; mitigation: string }
export const RISK_LIBRARY: LibraryRisk[] = [
  { id: 'encroachment', title: 'التعدي على أصل وقفي', category: 'Legal', probability: 2, impact: 5, mitigation: 'توثيق الملكية ومتابعة دورية للأصول' },
  { id: 'tenant_default', title: 'تعثر المستأجرين في السداد', category: 'Financial', probability: 4, impact: 3, mitigation: 'متابعة التحصيل وضمانات في العقود' },
  { id: 'board_expiry', title: 'انتهاء مدة مجلس الإدارة دون تجديد', category: 'Legal', probability: 4, impact: 4, mitigation: 'بدء إجراءات التجديد قبل انتهاء المدة' },
  { id: 'concentration', title: 'التركّز في نوع استثماري واحد', category: 'Strategic', probability: 3, impact: 4, mitigation: 'تنويع المحفظة وفق سياسة الاستثمار' },
  { id: 'liquidity', title: 'نقص السيولة لتغطية المصارف', category: 'Financial', probability: 3, impact: 3, mitigation: 'احتياطي نقدي وخطة تدفقات' },
  { id: 'waqf_condition', title: 'مخالفة شرط الواقف في الصرف', category: 'Shariah', probability: 1, impact: 5, mitigation: 'مراجعة شرعية للصرف قبل التنفيذ' },
  { id: 'asset_aging', title: 'تقادم الأصول وارتفاع كلفة الصيانة', category: 'Operational', probability: 4, impact: 2, mitigation: 'خطة صيانة وقائية سنوية' },
];

export const RISK_CATEGORY_LABEL: Record<RiskRegisterItem['category'], string> = {
  Strategic: 'استراتيجي', Financial: 'مالي', Operational: 'تشغيلي', Legal: 'قانوني', Shariah: 'شرعي',
};

export type RiskLevel = 'high' | 'mid' | 'low';
// نفس الحدود المستخدمة في التقارير وخطة التحسين: 15 فأعلى عالٍ، 8 فأعلى متوسط
export const riskLevel = (score: number): RiskLevel => (score >= 15 ? 'high' : score >= 8 ? 'mid' : 'low');
export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = { high: 'عالٍ', mid: 'متوسط', low: 'منخفض' };

// ─── الفحوص المستمدة تلقائياً من الخطوات السابقة ─────────────────────────────
export interface AutoCheck { key: 'exec' | 'audit' | 'finance' | 'board'; ok: boolean; warn?: boolean; title: string; detail: string; source: string; path: string }

const BOARD_TERM_YEARS = 3; // نفس مدة المجلس المستخدمة في صفحة بيانات المؤسسة

export const getBoardStatus = (establishmentDate?: string) => {
  if (!establishmentDate) return { status: 'غير موجود' as const, endDate: '', daysLeft: null as number | null };
  const end = new Date(establishmentDate);
  if (isNaN(end.getTime())) return { status: 'غير موجود' as const, endDate: '', daysLeft: null };
  end.setFullYear(end.getFullYear() + BOARD_TERM_YEARS);
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86400000);
  return { status: (daysLeft < 0 ? 'منتهي' : 'قائم') as 'منتهي' | 'قائم', endDate: end.toISOString().split('T')[0], daysLeft };
};

export const getAutoChecks = (institutionId: string): AutoCheck[] => {
  const inst = getInstitutions().find(i => i.id === institutionId);
  const fins = getFinancialRecords(institutionId);
  const fin = fins.find(f => f.fiscal_year === CURRENT_YEAR) || fins.find(f => f.fiscal_year === CURRENT_YEAR - 1);
  const finDone = !!fin && ['Submitted', 'Approved', 'Flagged'].includes(fin.status);
  const auditor = (fin?.auditor_name || '').trim();
  const board = getBoardStatus(inst?.establishment_date);
  const manager = (inst?.manager_name || '').trim();

  const boardCheck: AutoCheck = board.status === 'قائم'
    ? (board.daysLeft !== null && board.daysLeft <= 90
        ? { key: 'board', ok: true, warn: true, title: `مدة مجلس الإدارة تنتهي خلال ${board.daysLeft} يوماً`, detail: `تنتهي في ${board.endDate}`, source: 'بيانات المؤسسة', path: '/institutions' }
        : { key: 'board', ok: true, title: 'مجلس الإدارة قائم', detail: `تنتهي مدته في ${board.endDate}`, source: 'بيانات المؤسسة', path: '/institutions' })
    : { key: 'board', ok: false, title: board.status === 'منتهي' ? 'مدة مجلس الإدارة منتهية' : 'لا يوجد تاريخ تأسيس للمجلس', detail: board.endDate ? `انتهت في ${board.endDate}` : 'أكمل بيانات المؤسسة', source: 'بيانات المؤسسة', path: '/institutions' };

  return [
    manager
      ? { key: 'exec', ok: true, title: 'إدارة تنفيذية / مدير معيّن', detail: manager, source: 'بيانات المؤسسة', path: '/institutions' }
      : { key: 'exec', ok: false, title: 'لا يوجد مدير مسجّل للمؤسسة', detail: 'أضف اسم المدير في بيانات المؤسسة', source: 'بيانات المؤسسة', path: '/institutions' },
    fin?.unaudited
      ? { key: 'audit', ok: false, warn: true, title: 'القوائم المالية غير مدققة', detail: 'معدّة من الإدارة دون مكتب تدقيق خارجي', source: 'القوائم المالية', path: '/financial-reports' }
      : auditor
      ? { key: 'audit', ok: true, title: 'مكتب تدقيق خارجي معيّن', detail: auditor, source: 'القوائم المالية', path: '/financial-reports' }
      : { key: 'audit', ok: false, title: 'لم يُسجَّل مكتب تدقيق خارجي', detail: 'أضف اسم المدقق في القوائم المالية', source: 'القوائم المالية', path: '/financial-reports' },
    finDone
      ? { key: 'finance', ok: true, title: 'القوائم المالية مرفوعة ومعتمدة', detail: `السنة المالية ${fin!.fiscal_year}`, source: 'القوائم المالية', path: '/financial-reports' }
      : { key: 'finance', ok: false, title: 'القوائم المالية لم تُرفع بعد', detail: 'أكمل خطوة القوائم المالية', source: 'القوائم المالية', path: '/financial-reports' },
    boardCheck,
  ];
};

// ─── تحويل السجل القديم إلى الصيغة الجديدة عند الفتح ────────────────────────
export const normalizeRecord = (rec: Partial<ComplianceRecord>): Partial<ComplianceRecord> => {
  const obligations = { ...(rec.obligations || {}) };
  const evidence = { ...(rec.obligation_evidence || {}) };
  if (!rec.obligations) {
    // سجل بالصيغة القديمة: نحفظ إجابة المحاضر ودليلها
    if (rec.has_minutes_prev_year) obligations.minutes = 'yes';
    const legacyDoc = rec.core_evidence?.has_minutes_prev_year;
    if (legacyDoc && !evidence.minutes) evidence.minutes = legacyDoc;
  }
  const custom = (rec.custom_requirements || []).map(r =>
    r.answer ? r : { ...r, answer: r.met ? ('yes' as ObligationAnswer) : undefined });
  return { ...rec, obligations, obligation_evidence: evidence, obligation_notes: { ...(rec.obligation_notes || {}) }, custom_requirements: custom };
};

// تعبئة الحقول القديمة حتى تبقى أي صفحة تقرأها متوافقة
export const withLegacyFields = (rec: Partial<ComplianceRecord>, checks: AutoCheck[]): Partial<ComplianceRecord> => {
  const ok = (k: AutoCheck['key']) => !!checks.find(c => c.key === k)?.ok;
  const board = checks.find(c => c.key === 'board');
  return {
    ...rec,
    has_executive_management: ok('exec'),
    has_auditor_company: ok('audit'),
    has_financial_report_prev_year: ok('finance'),
    has_minutes_prev_year: rec.obligations?.minutes === 'yes',
    board_status: board?.ok ? 'قائم' : (board?.title.includes('منتهية') ? 'منتهي' : 'غير موجود'),
    hidden_core_requirements: [],
    custom_requirements: (rec.custom_requirements || []).map(r => ({ ...r, met: r.answer === 'yes' })),
  };
};

// ─── الملخص الموحّد: النسبة والفجوات ───────────────────────────────────────
export interface ComplianceGap { key: string; label: string; note?: string }
export interface ComplianceSummary {
  met: number; applicable: number; pct: number;
  yes: number; no: number; unanswered: number; missingEvidence: number; missingNotes: number;
  missing: string[]; gaps: ComplianceGap[];
}

const LEGACY_GAP_KEY: Record<AutoCheck['key'], string> = { exec: 'exec', audit: 'audit', finance: 'finance', board: 'board' };

export const summarizeCompliance = (rec: Partial<ComplianceRecord> | undefined, checks: AutoCheck[]): ComplianceSummary => {
  const s: ComplianceSummary = { met: 0, applicable: 0, pct: 0, yes: 0, no: 0, unanswered: 0, missingEvidence: 0, missingNotes: 0, missing: [], gaps: [] };
  if (!rec) {
    s.missing.push('لم يتم إنشاء سجل الامتثال لهذا العام');
    return s;
  }
  const r = normalizeRecord(rec);

  // حالة المؤسسة
  s.applicable++;
  if ((r.institution_status || 'فاعلة') === 'فاعلة') s.met++;
  else { s.missing.push(`حالة المؤسسة: ${r.institution_status}`); s.gaps.push({ key: 'status', label: 'حالة المؤسسة غير فاعلة' }); }

  // الفحوص التلقائية
  checks.forEach(c => {
    s.applicable++;
    if (c.ok) s.met++;
    else { s.missing.push(c.title); s.gaps.push({ key: LEGACY_GAP_KEY[c.key], label: c.title }); }
  });

  // الالتزامات والمتطلبات الإضافية
  const items: { key: string; label: string; answer?: ObligationAnswer; hasDoc: boolean; note?: string }[] = [
    ...ALL_OBLIGATIONS.map(o => ({
      key: o.id === 'minutes' ? 'minutes' : `obl_${o.id}`, label: o.label,
      answer: r.obligations?.[o.id], hasDoc: !!r.obligation_evidence?.[o.id], note: r.obligation_notes?.[o.id],
    })),
    ...(r.custom_requirements || []).map((c: CustomRequirement) => ({
      key: `custom_${c.id}`, label: `متطلب إضافي: ${c.text}`, answer: c.answer, hasDoc: !!c.evidence_doc, note: c.note,
    })),
  ];
  items.forEach(it => {
    if (it.answer === 'na') return;
    s.applicable++;
    if (it.answer === 'yes') { s.met++; s.yes++; if (!it.hasDoc) s.missingEvidence++; return; }
    if (it.answer === 'no') {
      s.no++;
      if (!(it.note || '').trim()) s.missingNotes++;
      s.missing.push(it.label);
      s.gaps.push({ key: it.key, label: it.label, note: it.note });
      return;
    }
    s.unanswered++;
    s.missing.push(`لم يُجب: ${it.label}`);
  });

  s.pct = s.applicable ? Math.round((s.met / s.applicable) * 100) : 0;
  return s;
};
