import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getInstitutions, saveComplianceRecord, generateId, getComplianceByInstAndYear,
  getRisks, saveRisk, deleteRisk, getInstitutionProgress, uploadFile,
} from '../services/db';
import AttachmentLink, { ATTACHMENT_ACCEPT } from '../components/AttachmentLink';
import { ComplianceRecord, RiskRegisterItem, CustomRequirement, ObligationAnswer, InstitutionDocument } from '../types';
import { CURRENT_YEAR } from '../constants';
import { useUi } from '../contexts/UiContext';
import {
  OBLIGATION_GROUPS, RISK_LIBRARY, RISK_CATEGORY_LABEL, RISK_LEVEL_LABEL, riskLevel,
  getAutoChecks, normalizeRecord, withLegacyFields, summarizeCompliance, AutoCheck, RiskLevel,
} from '../utils/compliance';
import { Lock, Upload, FileText, Plus, X, Building } from 'lucide-react';

// ─── ألوان التصميم المعتمد ──────────────────────────────────────────────────
const BTN = 'rounded-lg px-3.5 py-2 text-sm font-bold min-h-[44px] min-w-[88px] border transition-colors disabled:cursor-not-allowed';
const OPT_STYLE: Record<ObligationAnswer, string> = {
  yes: 'border-[#0f766e] bg-[#0f766e] text-white',
  no: 'border-[#c2410c] bg-[#c2410c] text-white',
  na: 'border-[#475569] bg-[#475569] text-white',
};
const OPT_OFF = 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
const LEVEL_BADGE: Record<RiskLevel, string> = {
  high: 'bg-[#fee2e2] text-[#991b1b]', mid: 'bg-[#fef3c7] text-[#92400e]', low: 'bg-[#d1fae5] text-[#065f46]',
};
const HEAT_BG: Record<RiskLevel, string> = { high: 'bg-[#fca5a5]', mid: 'bg-[#fde68a]', low: 'bg-[#d1fae5]' };
const OPTIONS: [ObligationAnswer, string][] = [['yes', 'ملتزم'], ['no', 'غير ملتزم'], ['na', 'لا ينطبق']];
const INSTITUTION_STATUSES: ComplianceRecord['institution_status'][] = ['فاعلة', 'غير فاعلة', 'قيد التصفية', 'متوقفة', 'أخرى'];

const cardBorder = (answer: ObligationAnswer | undefined, hasDoc: boolean) =>
  answer === 'yes' ? (hasDoc ? 'border-[#6ee7b7]' : 'border-[#fbbf24]')
  : answer === 'no' ? 'border-[#fdba74]'
  : answer === 'na' ? 'border-[#cbd5e1]'
  : 'border-[#e2e8f0]';

const emptyRisk = (): Partial<RiskRegisterItem> => ({ category: 'Operational', probability: 3, impact: 3, status: 'Open', owner: 'المدير التنفيذي' });

// ─── بطاقة التزام واحد (تُستخدم للالتزامات والمتطلبات الإضافية) ───────────────
const ObligationCard: React.FC<{
  domId: string; label: string; hint?: string;
  answer?: ObligationAnswer; doc?: InstitutionDocument; note?: string;
  locked: boolean; uploading: boolean; highlight: boolean;
  onAnswer: (a: ObligationAnswer) => void; onUpload: (f: File) => void; onRemoveDoc: () => void; onNote: (t: string) => void;
  onDelete?: () => void;
}> = ({ domId, label, hint, answer, doc, note, locked, uploading, highlight, onAnswer, onUpload, onRemoveDoc, onNote, onDelete }) => (
  <div id={domId} className={`rounded-xl border-2 bg-white p-4 flex flex-col gap-3 ${cardBorder(answer, !!doc)} ${highlight ? 'ring-4 ring-[#fdba74]/60' : ''}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-col gap-1 min-w-0" style={{ flex: '1 1 320px' }}>
        <span className="text-base font-bold text-[#0a1929]">{label}</span>
        {hint && <span className="text-[13px] text-slate-500">{hint}</span>}
      </div>
      <div role="group" aria-label="حالة الالتزام" className="flex flex-wrap gap-1.5">
        {OPTIONS.map(([val, text]) => (
          <button key={val} type="button" disabled={locked} aria-pressed={answer === val}
            onClick={() => onAnswer(val)}
            className={`${BTN} ${answer === val ? OPT_STYLE[val] : OPT_OFF}`}>{text}</button>
        ))}
        {onDelete && !locked && (
          <button type="button" onClick={onDelete} aria-label="حذف المتطلب" title="حذف المتطلب"
            className="rounded-lg min-h-[44px] px-2 text-red-700 hover:bg-red-50"><X size={18} /></button>
        )}
      </div>
    </div>

    {answer === 'yes' && (
      <div className="flex flex-wrap items-center gap-2.5 border-t border-dashed border-slate-300 pt-3">
        {doc ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
              <FileText size={16} className="text-[#0f766e]" aria-hidden="true" />
              <AttachmentLink doc={doc} />
            </span>
            {!locked && (
              <button type="button" onClick={onRemoveDoc} className="px-2 py-2 text-[13px] font-bold text-red-700 hover:underline">حذف</button>
            )}
          </>
        ) : locked ? (
          <span className="text-sm font-bold text-[#92400e]">لم يُرفق دليل</span>
        ) : (
          <label className={`inline-flex items-center gap-2 rounded-lg border border-dashed border-[#d97706] bg-[#fffbeb] px-3.5 py-2.5 text-sm font-bold text-[#92400e] min-h-[44px] ${uploading ? 'opacity-60' : 'cursor-pointer hover:bg-[#fef3c7]'}`}>
            <Upload size={16} aria-hidden="true" />
            {uploading ? 'جاري الرفع...' : 'إرفاق الدليل (مطلوب)'}
            <input type="file" accept={ATTACHMENT_ACCEPT} className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f); }} />
          </label>
        )}
      </div>
    )}

    {answer === 'no' && (
      <div className="flex flex-col gap-1.5 border-t border-dashed border-slate-300 pt-3">
        <label htmlFor={`${domId}-note`} className="text-[13px] font-bold text-[#9a3412]">سبب عدم الالتزام وخطة التصحيح (يُنقل لخطة التحسين)</label>
        <textarea id={`${domId}-note`} rows={2} disabled={locked} value={note || ''} onChange={e => onNote(e.target.value)}
          placeholder="مثال: لم يُعقد الاجتماع الثاني بسبب... وسيُعقد قبل 31 مارس"
          className="rounded-lg border border-[#fdba74] p-2.5 text-sm resize-y disabled:bg-slate-50" />
      </div>
    )}
  </div>
);

const CompliancePage: React.FC = () => {
  const { showToast, currentWaqfId, role } = useUi();
  const navigate = useNavigate();

  const [tab, setTab] = useState<'c' | 'r'>('c');
  const [record, setRecord] = useState<Partial<ComplianceRecord>>({});
  const [checks, setChecks] = useState<AutoCheck[]>([]);
  const [risks, setRisks] = useState<RiskRegisterItem[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [riskForm, setRiskForm] = useState<Partial<RiskRegisterItem> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newReqText, setNewReqText] = useState('');
  const riskFormRef = useRef<HTMLDivElement>(null);

  const institutionName = useMemo(() => getInstitutions().find(i => i.id === currentWaqfId)?.name || '', [currentWaqfId]);

  useEffect(() => {
    setTab('c'); setDirty(false); setRiskForm(null); setConfirmDelete(null); setHighlight(null);
    if (!currentWaqfId) { setRecord({}); setRisks([]); setChecks([]); return; }
    setIsLocked(getInstitutionProgress(currentWaqfId).isLocked);
    setChecks(getAutoChecks(currentWaqfId));
    const existing = getComplianceByInstAndYear(currentWaqfId, CURRENT_YEAR);
    setRecord(normalizeRecord(existing || {
      institution_id: currentWaqfId, cycle_year: CURRENT_YEAR, institution_status: 'فاعلة', board_status: 'قائم',
      has_executive_management: false, has_auditor_company: false, has_minutes_prev_year: false, has_financial_report_prev_year: false,
      custom_requirements: [], notes: '',
    }));
    setRisks(getRisks(currentWaqfId));
  }, [currentWaqfId]);

  const summary = useMemo(() => summarizeCompliance(record, checks), [record, checks]);
  const chosenLibrary = new Set(risks.map(r => r.library_id).filter(Boolean));
  const scoredRisks = useMemo(() => [...risks].sort((a, b) => b.probability * b.impact - a.probability * a.impact), [risks]);
  const highRisks = risks.filter(r => riskLevel(r.probability * r.impact) === 'high').length;

  // ─── تعديل السجل ─────────────────────────────────────────────────────────
  const update = (fn: (r: Partial<ComplianceRecord>) => Partial<ComplianceRecord>) => {
    if (isLocked) return;
    setRecord(prev => fn(prev));
    setDirty(true);
  };
  const setAnswer = (id: string, a: ObligationAnswer) =>
    update(r => { const o = { ...(r.obligations || {}) }; if (o[id] === a) delete o[id]; else o[id] = a; return { ...r, obligations: o }; });
  const setNote = (id: string, t: string) => update(r => ({ ...r, obligation_notes: { ...(r.obligation_notes || {}), [id]: t } }));
  const removeDoc = (id: string) => update(r => { const e = { ...(r.obligation_evidence || {}) }; delete e[id]; return { ...r, obligation_evidence: e }; });
  const upload = async (key: string, file: File, apply: (d: InstitutionDocument) => void) => {
    setUploadingKey(key);
    try { apply(await uploadFile(file, currentWaqfId)); showToast('تم إرفاق الدليل بنجاح', 'success'); }
    catch (err: any) { showToast(err?.message || 'تعذر رفع الملف', 'error'); }
    finally { setUploadingKey(null); }
  };

  const updateCustom = (id: string, patch: Partial<CustomRequirement>) =>
    update(r => ({ ...r, custom_requirements: (r.custom_requirements || []).map(c => c.id === id ? { ...c, ...patch } : c) }));
  const addCustom = () => {
    const text = newReqText.trim();
    if (!text) return;
    update(r => ({ ...r, custom_requirements: [...(r.custom_requirements || []), { id: generateId(), text, met: false }] }));
    setNewReqText('');
  };

  // ─── الحفظ ──────────────────────────────────────────────────────────────
  const persist = (completed: boolean) => {
    if (!currentWaqfId) return;
    const toSave = withLegacyFields({
      ...record, id: record.id || generateId(), institution_id: currentWaqfId, cycle_year: CURRENT_YEAR,
      completed, last_updated_at: new Date().toISOString(),
    }, checks) as ComplianceRecord;
    saveComplianceRecord(toSave);
    setRecord(normalizeRecord(toSave));
    setDirty(false);
  };

  const firstProblem = (): { msg: string; target?: string; riskTab?: boolean } | null => {
    for (const g of OBLIGATION_GROUPS) for (const o of g.items) {
      const a = record.obligations?.[o.id];
      if (!a) return { msg: `يرجى الإجابة على: ${o.label}`, target: `obl-${o.id}` };
      if (a === 'yes' && !record.obligation_evidence?.[o.id]) return { msg: `يرجى إرفاق دليل: ${o.label}`, target: `obl-${o.id}` };
      if (a === 'no' && !(record.obligation_notes?.[o.id] || '').trim()) return { msg: `يرجى كتابة سبب عدم الالتزام: ${o.label}`, target: `obl-${o.id}` };
    }
    for (const c of record.custom_requirements || []) {
      if (!c.answer) return { msg: `يرجى الإجابة على: ${c.text}`, target: `custom-${c.id}` };
      if (c.answer === 'yes' && !c.evidence_doc) return { msg: `يرجى إرفاق دليل: ${c.text}`, target: `custom-${c.id}` };
      if (c.answer === 'no' && !(c.note || '').trim()) return { msg: `يرجى كتابة سبب عدم الالتزام: ${c.text}`, target: `custom-${c.id}` };
    }
    if (risks.length === 0) return { msg: 'يرجى تسجيل خطر واحد على الأقل في سجل المخاطر', riskTab: true };
    return null;
  };

  const saveDraft = () => {
    if (isLocked) return;
    persist(false);
    showToast('تم حفظ المسودة', 'success');
  };

  const saveAndContinue = () => {
    if (isLocked || saving) return;
    const p = firstProblem();
    if (p) {
      showToast(p.msg, 'error');
      if (p.riskTab) { setTab('r'); return; }
      setTab('c');
      if (p.target) {
        setHighlight(p.target);
        setTimeout(() => document.getElementById(p.target!)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        setTimeout(() => setHighlight(null), 2500);
      }
      return;
    }
    setSaving(true);
    persist(true);
    showToast('تم حفظ الامتثال والمخاطر', 'success');
    setSaving(false);
    navigate('/improvements');
  };

  // ─── المخاطر (تُحفظ مباشرة مثل السابق) ──────────────────────────────────
  const refreshRisks = () => setRisks(getRisks(currentWaqfId!));
  const addFromLibrary = (id: string) => {
    if (isLocked || !currentWaqfId) return;
    const lib = RISK_LIBRARY.find(l => l.id === id)!;
    saveRisk({
      id: generateId(), institution_id: currentWaqfId, risk_title: lib.title, category: lib.category,
      probability: lib.probability, impact: lib.impact, mitigation_plan: lib.mitigation, status: 'Open',
      owner: 'المدير التنفيذي', library_id: lib.id,
    });
    refreshRisks();
  };
  const openRiskForm = (r?: RiskRegisterItem) => {
    if (isLocked) return;
    setRiskForm(r ? { ...r } : emptyRisk());
    setTimeout(() => riskFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };
  const submitRiskForm = () => {
    if (!riskForm || !currentWaqfId) return;
    if (!(riskForm.risk_title || '').trim()) { showToast('يرجى كتابة وصف الخطر', 'error'); return; }
    const isUpdate = !!riskForm.id;
    saveRisk({
      id: riskForm.id || generateId(), institution_id: currentWaqfId, risk_title: riskForm.risk_title!.trim(),
      category: riskForm.category || 'Operational', probability: Number(riskForm.probability) || 1, impact: Number(riskForm.impact) || 1,
      mitigation_plan: riskForm.mitigation_plan || '', status: riskForm.status || 'Open',
      owner: riskForm.owner || '', due_date: riskForm.due_date || '', library_id: riskForm.library_id,
    });
    refreshRisks(); setRiskForm(null);
    showToast(isUpdate ? 'تم حفظ التعديلات على الخطر' : 'تم إضافة الخطر', 'success');
  };
  const removeRisk = (id: string) => { deleteRisk(id); refreshRisks(); setConfirmDelete(null); showToast('تم حذف الخطر', 'info'); };

  // ─── مصفوفة المخاطر ──────────────────────────────────────────────────────
  const heatCount = (p: number, i: number) => risks.filter(r => r.probability === p && r.impact === i).length;

  if (!currentWaqfId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-10 text-center">
        <Building size={40} className="text-amber-500" aria-hidden="true" />
        <h2 className="text-lg font-bold text-[#0a1929]">لم يتم اختيار مؤسسة</h2>
        <p className="text-sm text-slate-600">اختر مؤسسة من صفحة متابعة المؤسسات لعرض الامتثال والمخاطر.</p>
      </div>
    );
  }

  const unansweredTotal = summary.unanswered;
  const footerText = isLocked ? 'التقييم مرفوع — الصفحة للقراءة فقط'
    : unansweredTotal ? `باقي ${unansweredTotal} التزامات بدون إجابة، و${summary.missingEvidence} أدلة ناقصة`
    : summary.missingEvidence ? `كل الالتزامات مُجابة، باقي ${summary.missingEvidence} أدلة ناقصة`
    : risks.length === 0 ? 'باقي تسجيل خطر واحد على الأقل'
    : 'جاهز للحفظ';
  const ring = 276.46;
  const tabClass = (on: boolean) => `rounded-[9px] px-5 py-2.5 text-[15px] min-h-[44px] ${on ? 'bg-white text-[#0a1929] font-extrabold shadow' : 'bg-transparent text-slate-600 font-bold hover:text-[#0a1929]'}`;

  return (
    <div className="flex flex-col gap-6 text-[#0a1929]" dir="rtl">
      {/* العنوان والتبويبات */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-bold text-[#0f766e]">الخطوة 4 من 6{institutionName ? ` · ${institutionName}` : ''}</p>
          <h1 className="flex flex-wrap items-center gap-3 text-[30px] font-extrabold leading-tight">
            الامتثال والمخاطر {CURRENT_YEAR}
            {isLocked && <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700"><Lock size={12} aria-hidden="true" /> للقراءة فقط</span>}
          </h1>
          <p className="text-[15px] text-slate-600">التزامات نظامية بدليل، وسجل للمخاطر التي تهدد الأصول الوقفية.</p>
        </div>
        <div className="flex gap-2 rounded-xl bg-slate-200 p-1" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'c'} onClick={() => setTab('c')} className={tabClass(tab === 'c')}>الامتثال</button>
          <button type="button" role="tab" aria-selected={tab === 'r'} onClick={() => setTab('r')} className={tabClass(tab === 'r')}>المخاطر</button>
        </div>
      </header>

      {/* الملخص */}
      <section aria-label="ملخص" className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div className="flex items-center gap-4 rounded-2xl bg-[#0a1929] p-5 text-white max-sm:col-span-2">
          <svg width="96" height="96" viewBox="0 0 100 100" role="img" aria-label={`نسبة الامتثال ${summary.pct}%`}>
            <circle cx="50" cy="50" r="44" fill="none" stroke="#1e3a5f" strokeWidth="10" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="#2dd4bf" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${(summary.pct * ring / 100).toFixed(1)} ${ring}`} transform="rotate(-90 50 50)" />
            <text x="50" y="57" textAnchor="middle" fill="#ffffff" fontSize="22" fontWeight="800">{summary.pct}%</text>
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-slate-300">نسبة الامتثال</span>
            <span className="text-[13px] text-slate-400">من الالتزامات المنطبقة</span>
          </div>
        </div>
        {[
          { n: summary.met, label: 'ملتزم', color: 'text-[#0f766e]' },
          { n: summary.no, label: 'غير ملتزم', color: 'text-[#c2410c]' },
          { n: summary.missingEvidence, label: 'أدلة ناقصة', color: 'text-[#b45309]' },
          { n: highRisks, label: 'مخاطر عالية', color: 'text-[#b91c1c]' },
        ].map(c => (
          <div key={c.label} className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-5">
            <span className={`text-[32px] font-extrabold leading-none ${c.color}`}>{c.n}</span>
            <span className="text-sm text-slate-600">{c.label}</span>
          </div>
        ))}
      </section>

      {tab === 'c' ? (
        <div className="flex flex-col gap-6">
          {/* الحالة الأساسية + المستمدة تلقائياً */}
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-[19px] font-extrabold">مستمدة تلقائياً من الخطوات السابقة</h2>
                <p className="text-sm text-slate-600">لا تُسأل مرة ثانية. لتصحيح أي منها عدّل الخطوة المصدر.</p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="inst-status" className="text-[13px] font-bold text-slate-600">حالة المؤسسة</label>
                <select id="inst-status" disabled={isLocked} value={record.institution_status || 'فاعلة'}
                  onChange={e => update(r => ({ ...r, institution_status: e.target.value as ComplianceRecord['institution_status'] }))}
                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold disabled:bg-slate-50">
                  {INSTITUTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {checks.map(c => {
                const tone = !c.ok ? 'border-[#fdba74] bg-[#fff7ed]' : c.warn ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#a7f3d0] bg-[#ecfdf5]';
                const status = !c.ok ? { t: 'غير ملتزم', cl: 'text-[#c2410c]' } : c.warn ? { t: 'تنبيه', cl: 'text-[#b45309]' } : { t: 'ملتزم', cl: 'text-[#047857]' };
                return (
                  <div key={c.key} className={`flex flex-col gap-1.5 rounded-xl border p-4 ${tone}`}>
                    <span className={`text-[13px] font-bold ${status.cl}`}>{status.t}</span>
                    <span className="text-[15px] font-bold">{c.title}</span>
                    <span className="text-[13px] text-slate-600 break-words">{c.detail}</span>
                    <span className="text-[13px] text-slate-600">المصدر: {c.source} · <a href={`#${c.path}`} className="font-bold text-[#0f766e] hover:underline">{c.ok && !c.warn ? 'عرض' : 'تحديث'}</a></span>
                  </div>
                );
              })}
            </div>
          </section>

          <p className="rounded-[10px] bg-[#fef3c7] px-3.5 py-2.5 text-[13px] text-[#92400e]">
            الالتزامات التالية مسودة مقترحة للنقاش، وتُعتمد صياغتها النهائية من اللوائح المنظمة للمؤسسات الوقفية.
          </p>

          {OBLIGATION_GROUPS.map(g => {
            const answered = g.items.filter(o => record.obligations?.[o.id]).length;
            return (
              <section key={g.title} className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-[19px] font-extrabold">{g.title}</h2>
                  <span className="text-[13px] text-slate-600">{answered} من {g.items.length} مُجاب</span>
                </div>
                {g.items.map(o => (
                  <ObligationCard key={o.id} domId={`obl-${o.id}`} label={o.label} hint={o.hint}
                    answer={record.obligations?.[o.id]} doc={record.obligation_evidence?.[o.id]} note={record.obligation_notes?.[o.id]}
                    locked={isLocked} uploading={uploadingKey === o.id} highlight={highlight === `obl-${o.id}`}
                    onAnswer={a => setAnswer(o.id, a)}
                    onUpload={f => upload(o.id, f, d => update(r => ({ ...r, obligation_evidence: { ...(r.obligation_evidence || {}), [o.id]: d } })))}
                    onRemoveDoc={() => removeDoc(o.id)} onNote={t => setNote(o.id, t)} />
                ))}
              </section>
            );
          })}

          {/* متطلبات إضافية يحددها المدير لهذه المؤسسة */}
          {((record.custom_requirements || []).length > 0 || role === 'admin') && (
            <section className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-[19px] font-extrabold">متطلبات إضافية من الوزارة</h2>
                <p className="text-[13px] text-slate-600">متطلبات خاصة بهذه المؤسسة يضيفها مدير النظام.</p>
              </div>
              {(record.custom_requirements || []).map(c => (
                <ObligationCard key={c.id} domId={`custom-${c.id}`} label={c.text}
                  answer={c.answer} doc={c.evidence_doc} note={c.note}
                  locked={isLocked} uploading={uploadingKey === c.id} highlight={highlight === `custom-${c.id}`}
                  onAnswer={a => updateCustom(c.id, { answer: c.answer === a ? undefined : a })}
                  onUpload={f => upload(c.id, f, d => updateCustom(c.id, { evidence_doc: d }))}
                  onRemoveDoc={() => updateCustom(c.id, { evidence_doc: undefined })}
                  onNote={t => updateCustom(c.id, { note: t })}
                  onDelete={role === 'admin' ? () => update(r => ({ ...r, custom_requirements: (r.custom_requirements || []).filter(x => x.id !== c.id) })) : undefined} />
              ))}
              {role === 'admin' && !isLocked && (
                <div className="flex flex-wrap gap-2">
                  <label htmlFor="new-req" className="sr-only">متطلب جديد</label>
                  <input id="new-req" value={newReqText} onChange={e => setNewReqText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                    placeholder="مثال: تقديم شهادة سريان الترخيص"
                    className="min-h-[44px] min-w-0 rounded-lg border border-slate-300 px-3 text-sm" style={{ flex: '1 1 280px' }} />
                  <button type="button" onClick={addCustom} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#0a1929] px-4 text-sm font-bold text-white hover:bg-[#102a43]">
                    <Plus size={16} aria-hidden="true" /> إضافة متطلب
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-6">
            {/* مصفوفة المخاطر */}
            <section className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-6" style={{ flex: '1 1 380px' }}>
              <h2 className="text-[19px] font-extrabold">مصفوفة المخاطر</h2>
              <p className="text-[13px] text-slate-600">الاحتمالية (عمودياً) × الأثر (أفقياً). الرقم داخل الخانة عدد المخاطر.</p>
              <div className="grid grid-cols-6 gap-1">
                {[5, 4, 3, 2, 1].map(p => (
                  <React.Fragment key={p}>
                    <div className="flex min-h-[44px] items-center justify-center text-xs font-bold text-slate-600">احتمال {p}</div>
                    {[1, 2, 3, 4, 5].map(i => {
                      const n = heatCount(p, i);
                      return (
                        <div key={i} className={`flex min-h-[44px] items-center justify-center rounded-lg text-lg font-extrabold ${HEAT_BG[riskLevel(p * i)]} ${n ? 'outline outline-[3px] -outline-offset-[3px] outline-[#0a1929]' : ''}`}>
                          {n || ''}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
                <div />
                {[1, 2, 3, 4, 5].map(i => <div key={i} className="flex min-h-[44px] items-center justify-center text-xs font-bold text-slate-600">أثر {i}</div>)}
              </div>
              <div className="flex flex-wrap gap-3.5 text-[13px] text-slate-700">
                {(['low', 'mid', 'high'] as RiskLevel[]).map(l => (
                  <span key={l} className="inline-flex items-center gap-1.5"><span className={`inline-block h-3.5 w-3.5 rounded ${HEAT_BG[l]}`} aria-hidden="true" />{RISK_LEVEL_LABEL[l]}</span>
                ))}
              </div>
            </section>

            {/* مكتبة المخاطر */}
            <section className="flex min-w-0 flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-6" style={{ flex: '1 1 380px' }}>
              <h2 className="text-[19px] font-extrabold">مكتبة مخاطر الأوقاف</h2>
              <p className="text-[13px] text-slate-600">اختر المخاطر التي تنطبق على مؤسستك، ثم عدّل تقديرها. أو أضف خطراً خاصاً.</p>
              <div className="flex flex-wrap gap-2">
                {RISK_LIBRARY.filter(l => !chosenLibrary.has(l.id)).map(l => (
                  <button key={l.id} type="button" disabled={isLocked} onClick={() => addFromLibrary(l.id)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-semibold hover:bg-white disabled:opacity-50">
                    <span aria-hidden="true" className="font-extrabold text-[#0f766e]">+</span>{l.title}
                  </button>
                ))}
              </div>
              {RISK_LIBRARY.every(l => chosenLibrary.has(l.id)) && <p className="text-sm text-slate-500">أُضيفت كل مخاطر المكتبة.</p>}
              {!isLocked && (
                <button type="button" onClick={() => openRiskForm()} className="min-h-[44px] self-start rounded-[10px] bg-[#0a1929] px-[18px] py-2.5 text-sm font-bold text-white hover:bg-[#102a43]">
                  إضافة خطر خاص
                </button>
              )}
            </section>
          </div>

          {/* نموذج إضافة / تعديل خطر */}
          {riskForm && (
            <div ref={riskFormRef} className="flex flex-col gap-4 rounded-2xl border-2 border-[#0a1929] bg-white p-6">
              <h3 className="text-lg font-extrabold">{riskForm.id ? 'تعديل الخطر' : 'خطر جديد'}</h3>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div className="flex flex-col gap-1" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="rf-title" className="text-[13px] font-bold">وصف الخطر *</label>
                  <input id="rf-title" value={riskForm.risk_title || ''} onChange={e => setRiskForm({ ...riskForm, risk_title: e.target.value })}
                    placeholder="مثال: نزاع قانوني على أصل وقفي" className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rf-cat" className="text-[13px] font-bold">التصنيف</label>
                  <select id="rf-cat" value={riskForm.category} onChange={e => setRiskForm({ ...riskForm, category: e.target.value as RiskRegisterItem['category'] })}
                    className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm">
                    {Object.entries(RISK_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rf-p" className="text-[13px] font-bold">الاحتمالية</label>
                  <select id="rf-p" value={riskForm.probability} onChange={e => setRiskForm({ ...riskForm, probability: Number(e.target.value) })}
                    className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm">
                    {['نادر جداً', 'نادر', 'متوسط', 'محتمل', 'مؤكد'].map((t, i) => <option key={i} value={i + 1}>{i + 1} - {t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rf-i" className="text-[13px] font-bold">الأثر</label>
                  <select id="rf-i" value={riskForm.impact} onChange={e => setRiskForm({ ...riskForm, impact: Number(e.target.value) })}
                    className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm">
                    {['غير مؤثر', 'بسيط', 'متوسط', 'جسيم', 'كارثي'].map((t, i) => <option key={i} value={i + 1}>{i + 1} - {t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rf-owner" className="text-[13px] font-bold">المسؤول عن المتابعة</label>
                  <input id="rf-owner" value={riskForm.owner || ''} onChange={e => setRiskForm({ ...riskForm, owner: e.target.value })}
                    placeholder="مثال: المدير التنفيذي" className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rf-due" className="text-[13px] font-bold">الموعد المستهدف</label>
                  <input id="rf-due" type="date" value={riskForm.due_date || ''} onChange={e => setRiskForm({ ...riskForm, due_date: e.target.value })}
                    className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="rf-status" className="text-[13px] font-bold">الحالة</label>
                  <select id="rf-status" value={riskForm.status} onChange={e => setRiskForm({ ...riskForm, status: e.target.value as RiskRegisterItem['status'] })}
                    className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm">
                    <option value="Open">قائم</option><option value="Mitigated">تمت معالجته جزئياً</option><option value="Closed">مغلق</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="rf-plan" className="text-[13px] font-bold">خطة المعالجة</label>
                  <textarea id="rf-plan" rows={2} value={riskForm.mitigation_plan || ''} onChange={e => setRiskForm({ ...riskForm, mitigation_plan: e.target.value })}
                    placeholder="ما هي الإجراءات المتخذة للحد من الخطر؟" className="resize-y rounded-lg border border-slate-300 p-2.5 text-sm" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-3.5 py-1.5 text-sm font-extrabold ${LEVEL_BADGE[riskLevel((riskForm.probability || 1) * (riskForm.impact || 1))]}`}>
                  {RISK_LEVEL_LABEL[riskLevel((riskForm.probability || 1) * (riskForm.impact || 1))]} · {(riskForm.probability || 1) * (riskForm.impact || 1)}
                </span>
                <div className="flex-1" />
                <button type="button" onClick={() => setRiskForm(null)} className="min-h-[44px] rounded-lg bg-slate-100 px-4 text-sm font-bold hover:bg-slate-200">إلغاء</button>
                <button type="button" onClick={submitRiskForm} className="min-h-[44px] rounded-lg bg-[#0f766e] px-5 text-sm font-bold text-white hover:bg-[#115e59]">حفظ الخطر</button>
              </div>
            </div>
          )}

          {/* سجل المخاطر */}
          <section className="flex flex-col gap-3">
            <h2 className="text-[19px] font-extrabold">سجل المخاطر ({risks.length})</h2>
            {scoredRisks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
                لا توجد مخاطر مسجلة بعد. اختر من مكتبة المخاطر أعلاه، أو أضف خطراً خاصاً. (مطلوب خطر واحد على الأقل)
              </div>
            )}
            {scoredRisks.map(r => {
              const score = r.probability * r.impact;
              const lv = riskLevel(score);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-[14px] border border-slate-200 bg-white p-[18px]">
                  <span className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-extrabold ${LEVEL_BADGE[lv]}`}>{RISK_LEVEL_LABEL[lv]} · {score}</span>
                  <div className="flex min-w-0 flex-col gap-1" style={{ flex: '1 1 280px' }}>
                    <span className="text-base font-bold">{r.risk_title}</span>
                    <span className="text-[13px] text-slate-600">
                      {RISK_CATEGORY_LABEL[r.category] || r.category} · الاحتمالية {r.probability} × الأثر {r.impact}
                      {r.owner ? ` · المسؤول: ${r.owner}` : ''}{r.due_date ? ` · الموعد: ${r.due_date}` : ''}
                    </span>
                    {r.mitigation_plan && <span className="text-[13px] text-slate-500">المعالجة: {r.mitigation_plan}</span>}
                    {lv === 'high' && <span className="text-[13px] font-bold text-[#b91c1c]">يُضاف تلقائياً إلى خطة التحسين</span>}
                  </div>
                  {!isLocked && (confirmDelete === r.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#b91c1c]">حذف هذا الخطر؟</span>
                      <button type="button" onClick={() => removeRisk(r.id)} className="min-h-[44px] rounded-lg bg-[#b91c1c] px-3.5 text-sm font-bold text-white">نعم</button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="min-h-[44px] rounded-lg bg-slate-100 px-3.5 text-sm font-bold">لا</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openRiskForm(r)} className="min-h-[44px] rounded-lg bg-slate-100 px-3.5 text-sm font-bold hover:bg-slate-200">تعديل</button>
                      <button type="button" onClick={() => setConfirmDelete(r.id)} className="min-h-[44px] rounded-lg bg-[#fef2f2] px-3.5 text-sm font-bold text-[#b91c1c] hover:bg-[#fee2e2]">حذف</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* شريط الحفظ: ثابت أسفل الصفحة ولا يغطي المحتوى */}
      <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-2 border-t border-slate-200 bg-white px-4 py-3.5 lg:-mx-8 lg:-mb-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-600">{footerText}{dirty && !isLocked ? ' · تغييرات غير محفوظة' : ''}</span>
          {!isLocked && (
            <div className="flex gap-2.5">
              <button type="button" onClick={saveDraft} className="min-h-[44px] rounded-[10px] bg-slate-100 px-5 text-[15px] font-bold hover:bg-slate-200">حفظ كمسودة</button>
              <button type="button" onClick={saveAndContinue} disabled={saving} className="min-h-[44px] rounded-[10px] bg-[#0f766e] px-6 text-[15px] font-bold text-white hover:bg-[#115e59] disabled:opacity-60">حفظ والانتقال لخطة التحسين</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompliancePage;
