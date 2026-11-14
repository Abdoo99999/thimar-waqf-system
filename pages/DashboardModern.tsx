import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Coins, Timer } from 'lucide-react';
import { getInstitutions, getEvaluations, getAllResponses, getRisks, getIndicators, getFinancialRecords, getComplianceRecords, getSettings, saveSettings } from '../services/db';
import { buildDemoData } from '../services/demoData';
import { useUi } from '../contexts/UiContext';
import { getDeadline } from '../utils/deadline';
import { buildDashboard, DashSource } from '../utils/dashboardData';
import { Donut, Gauge, Ring, RadarChart, ProgressCurve, RiskMatrix } from '../components/dashboard/Charts';
import { TipProvider, useTip } from '../components/dashboard/Tip';
import { scoreLevel } from '../utils/report';

const money = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} مليون`;
  if (a >= 1_000) return `${Math.round(v).toLocaleString('en-US')}`;
  return `${Math.round(v)}`;
};
const num = (v: number) => v.toLocaleString('en-US');

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`rounded-[18px] border border-slate-200 bg-white p-5 sm:p-6 ${className}`}>{children}</div>
);
const SectionTitle: React.FC<{ id: string; title: string; sub?: string }> = ({ id, title, sub }) => (
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <h2 id={id} className="m-0 text-xl font-extrabold text-navy-900">{title}</h2>
    {sub && <span className="text-[13px] text-slate-600">{sub}</span>}
  </div>
);
const Empty: React.FC<{ text?: string }> = ({ text = 'لا توجد بيانات بعد' }) => (
  <div className="flex min-h-[120px] items-center justify-center text-sm text-slate-500">{text}</div>
);
const Swatch: React.FC<{ color: string }> = ({ color }) => <span className="h-3 w-3 shrink-0 rounded" style={{ background: color, border: color === '#e2e8f0' ? '1px solid #cbd5e1' : undefined }} />;

const TAG = { bad: 'bg-red-50 text-red-700', warn: 'bg-amber-50 text-amber-800', info: 'bg-slate-100 text-slate-700' };

const LEVEL_RANGE: Record<string, string> = { 'ممتاز': '90% فأعلى', 'جيد جداً': '75–89%', 'جيد': '60–74%', 'مقبول': '50–59%', 'ضعيف': 'أقل من 50%' };
const share = (n: number, t: number) => `${t ? Math.round((n / t) * 100) : 0}%`;

const DashboardInner: React.FC<{ onSwitchLayout: () => void }> = ({ onSwitchLayout }) => {
  const tip = useTip();
  const { currentWaqfId, setWaqfContext, currentYear, setYearContext } = useUi();
  const navigate = useNavigate();
  const [demoMode, setDemoMode] = useState(() => getSettings().demoMode === true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sync = () => { setDemoMode(getSettings().demoMode === true); setTick(t => t + 1); };
    window.addEventListener('settingsChanged', sync);
    return () => window.removeEventListener('settingsChanged', sync);
  }, []);

  const deadline = getDeadline();
  const src: DashSource = useMemo(() => {
    const institutions = getInstitutions() || [];
    const indicators = getIndicators() || [];
    if (demoMode) {
      const d = buildDemoData(institutions, indicators);
      return { institutions: d.institutions, evaluations: d.evaluations, responses: d.responses, financials: d.financials, risks: d.risks, indicators, compliance: [], demo: true };
    }
    return {
      institutions, indicators, demo: false,
      evaluations: getEvaluations() || [], responses: getAllResponses() || [], financials: getFinancialRecords() || [],
      risks: getRisks() || [], compliance: getComplianceRecords() || [],
    };
  }, [demoMode, tick]);

  const m = useMemo(() => buildDashboard(src, currentYear, currentWaqfId || null, deadline?.date || null), [src, currentYear, currentWaqfId, deadline?.date]);
  const years = Array.from({ length: 7 }, (_, i) => 2024 + i);
  const toggleDemo = () => saveSettings({ ...getSettings(), demoMode: !demoMode });
  const openInst = (id: string) => { setWaqfContext(id); navigate('/reports'); };

  const maxBracket = Math.max(1, ...m.brackets.map(b => b.n));
  const maxGov = Math.max(1, ...m.governorates.map(g => g.n));
  const maxLevel = Math.max(1, ...m.levels.map(l => l.n));
  const maxCat = Math.max(1, ...m.categories.map(c => c.n));
  const strongest = [...m.axes].filter(a => a.v > 0).sort((a, b) => b.v - a.v)[0];
  const weakest = [...m.axes].filter(a => a.v > 0).sort((a, b) => a.v - b.v)[0];
  const surplus = m.finance.revenues - m.finance.expenses;
  const finMax = Math.max(1, m.finance.revenues, m.finance.expenses);

  return (
    <div className="print-content mx-auto flex max-w-[1320px] flex-col gap-9 pb-16 text-navy-900" dir="rtl">
      {demoMode && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          بيانات توضيحية – ليست حقيقية. أوقف «وضع العرض التوضيحي» لعرض بيانات المؤسسات الفعلية.
        </div>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-extrabold">لوحة القيادة</h1>
          <div className="no-print flex flex-wrap items-center gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2 font-bold text-amber-800">
              <input type="checkbox" role="switch" checked={demoMode} onChange={toggleDemo} className="h-5 w-5 accent-amber-600" /> وضع العرض التوضيحي
            </label>
            <button type="button" onClick={onSwitchLayout} className="font-bold text-slate-600 underline underline-offset-4 hover:text-navy-900">العودة للشكل السابق</button>
          </div>
        </div>
        <div className="no-print flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">دورة التقييم
            <select value={currentYear} onChange={e => setYearContext(Number(e.target.value))} className="min-h-[44px] min-w-[120px] rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-navy-900">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">المؤسسة
            <select value={currentWaqfId || ''} onChange={e => setWaqfContext(e.target.value)} className="min-h-[44px] min-w-[220px] max-w-[320px] rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-navy-900">
              <option value="">جميع المؤسسات</option>
              {src.institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-navy-900 px-[18px] text-[15px] font-bold text-white hover:bg-navy-800">
            <Printer size={18} aria-hidden="true" /> ملخص للعرض
          </button>
        </div>
      </header>

      {/* 1. حجم القطاع */}
      <section aria-labelledby="d1" className="flex flex-col gap-4">
        <SectionTitle id="d1" title="حجم القطاع الوقفي" sub="من ملفات المؤسسات المسجلة" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative flex min-h-[170px] flex-col justify-between gap-3 overflow-hidden rounded-[18px] bg-navy-900 p-6 text-white">
            <svg aria-hidden="true" width="190" height="190" viewBox="0 0 100 100" className="absolute -bottom-12 -left-10 opacity-[0.08]"><circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeWidth="8" /><circle cx="50" cy="50" r="28" fill="none" stroke="#fff" strokeWidth="8" /></svg>
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-slate-300">رأس المال الوقفي المصرّح به</span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-300/15 text-amber-300"><Coins size={24} aria-hidden="true" /></span>
            </div>
            <div className="flex flex-col">
              <span className="text-[34px] font-extrabold leading-tight">{m.capital ? money(m.capital) : '—'}</span>
              <span className="text-sm font-bold text-amber-300">ريال عماني · {m.count} مؤسسة</span>
            </div>
          </div>

          <Card className="flex min-h-[170px] items-center justify-between gap-3">
            <div className="flex flex-col gap-2.5">
              <span className="text-[15px] text-slate-600">المؤسسات الوقفية</span>
              <span className="flex items-center gap-2 text-sm font-bold"><Swatch color="#0f766e" />عامة <strong className="text-[22px]">{m.publicCount}</strong></span>
              <span className="flex items-center gap-2 text-sm font-bold"><Swatch color="#d97706" />خاصة <strong className="text-[22px]">{m.privateCount}</strong></span>
            </div>
            <Donut label={`${m.publicCount} عامة و${m.privateCount} خاصة`} center={m.count} sub="مؤسسة" unit="مؤسسة" parts={[{ n: m.publicCount, color: '#0f766e', label: 'مؤسسات وقفية عامة' }, { n: m.privateCount, color: '#d97706', label: 'مؤسسات وقفية خاصة' }]} />
          </Card>

          <Card className="flex min-h-[170px] items-center justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[15px] text-slate-600">العاملون</span>
              <span className="text-[32px] font-extrabold leading-tight">{num(m.employees)}</span>
              <span className="text-[13px] text-slate-700">عمانيون <strong>{num(m.omani)}</strong> · غير عمانيين <strong>{num(m.nonOmani)}</strong></span>
            </div>
            <Gauge tip={['نسبة التعمين', `${num(m.omani)} عماني من ${num(m.employees)} موظف`, `غير عمانيين: ${num(m.nonOmani)}`]} label={`نسبة التعمين ${m.omanization}%`} pct={m.omanization} color="#0f766e" value={`${Math.round(m.omanization)}%`} sub="تعمين" />
          </Card>

          <Card className="flex min-h-[170px] items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <span className="text-[15px] text-slate-600">المخاطر القائمة</span>
              <span className="flex items-center gap-2 text-sm font-bold"><Swatch color="#b91c1c" />مرتفعة <strong className="text-xl text-red-700">{m.riskLv.high}</strong></span>
              <span className="flex items-center gap-2 text-sm font-bold"><Swatch color="#f59e0b" />متوسطة <strong className="text-xl">{m.riskLv.mid}</strong></span>
              <span className="flex items-center gap-2 text-sm font-bold"><Swatch color="#cbd5e1" />منخفضة <strong className="text-xl">{m.riskLv.low}</strong></span>
            </div>
            <Donut label={`${m.risksOpen} خطراً قائماً منها ${m.riskLv.high} مرتفعة`} center={m.risksOpen} sub="خطراً" unit="خطراً" parts={[{ n: m.riskLv.high, color: '#b91c1c', label: 'مخاطر مرتفعة (15–25)' }, { n: m.riskLv.mid, color: '#f59e0b', label: 'مخاطر متوسطة (8–12)' }, { n: m.riskLv.low, color: '#cbd5e1', label: 'مخاطر منخفضة (1–6)' }]} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-4">
            <h3 className="m-0 text-base font-extrabold">المؤسسات حسب رأس المال</h3>
            <div className="grid h-[220px] grid-cols-4 items-end gap-4 border-b-2 border-slate-200 px-2">
              {m.brackets.map(b => (
                <div key={b.label} className="flex h-full cursor-default flex-col items-center justify-end gap-1.5" {...tip([`رأس مال ${b.label}`, `${b.n} مؤسسة (${share(b.n, m.count)})`, `مجموع رأس مالها: ${b.cap ? money(b.cap) : 0} ر.ع`])}>
                  <span className="text-xl font-extrabold">{b.n}</span>
                  <div className="w-[70%] max-w-[84px] rounded-t-[10px] transition-opacity hover:opacity-80" style={{ height: `${Math.round((b.n / maxBracket) * 150)}px`, background: b.color }} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-4 px-2 text-center text-[13px] font-semibold text-slate-700">
              {m.brackets.map(b => <span key={b.label}>{b.label}</span>)}
            </div>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="m-0 text-base font-extrabold">التوزيع حسب المحافظات</h3>
            {m.governorates.length ? m.governorates.map(g => (
              <div key={g.name} className="grid cursor-default grid-cols-[120px_minmax(0,1fr)_90px] items-center gap-3 rounded-md hover:bg-slate-50 sm:grid-cols-[150px_minmax(0,1fr)_100px]"
                {...tip([g.name, `${g.n} مؤسسة (${share(g.n, m.count)} من المؤسسات)`, `رأس المال: ${money(g.cap)} ر.ع (${share(g.cap, m.capital)})`])}>
                <span className="truncate text-sm font-semibold">{g.name}</span>
                <div className="h-[22px] overflow-hidden rounded-md bg-slate-100">
                  <div className="flex h-full items-center rounded-md bg-gradient-to-l from-teal-700 to-teal-500 px-2 text-xs font-extrabold text-white" style={{ width: `${Math.max(8, Math.round((g.n / maxGov) * 100))}%` }}>{g.n}</div>
                </div>
                <span className="text-left text-[13px] text-slate-700">{g.cap ? money(g.cap) : '—'}</span>
              </div>
            )) : <Empty />}
          </Card>
        </div>
      </section>

      {/* 2. سير الدورة */}
      <section aria-labelledby="d2" className="flex flex-col gap-4">
        <SectionTitle id="d2" title={`سير دورة التقييم ${currentYear}`} sub={deadline ? `الموعد النهائي: ${deadline.dateLabel}` : 'لم يُحدد موعد نهائي (من الإعدادات)'} />
        <Card className="flex flex-wrap items-center gap-8">
          <Donut size={190} stroke={12} label={`${m.submittedCount} من ${m.count} مؤسسة رفعت تقييمها`} center={`${m.submittedCount}/${m.count}`} sub="رفعت تقييمها"
            unit="مؤسسة" parts={m.stages.map(s => ({ n: s.n, color: s.color, label: s.label }))} />
          <div className="grid min-w-0 flex-[999_1_420px] grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {m.stages.map(s => (
              <button key={s.key} type="button" onClick={() => navigate('/tracking')} className="flex min-h-[44px] flex-col gap-0.5 rounded-[14px] border border-slate-200 px-4 py-3.5 text-right hover:border-slate-400">
                <span className="flex items-center gap-2 text-[13px] font-bold text-slate-700"><Swatch color={s.color} />{s.label}</span>
                <span className="text-[28px] font-extrabold">{s.n}</span>
              </button>
            ))}
          </div>
          {m.daysLeft !== null && (
            <div className={`flex flex-[1_1_170px] flex-col items-center gap-1 rounded-2xl p-5 ${m.daysLeft < 0 ? 'bg-red-50 text-red-800' : 'bg-sky-50 text-sky-800'}`}>
              <Timer size={34} aria-hidden="true" />
              <span className="text-[40px] font-extrabold leading-none">{Math.abs(m.daysLeft)}</span>
              <span className="text-sm font-bold">{m.daysLeft < 0 ? 'يوماً بعد انتهاء الموعد' : 'يوماً على الموعد'}</span>
            </div>
          )}
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
              <h3 className="m-0 text-base font-extrabold">منحنى تقدّم الدورة</h3>
              <span className="text-[13px] text-slate-600">كيف وصلنا إلى أرقام اليوم أسبوعاً بأسبوع؛ آخر نقطة تطابق الدائرة أعلاه</span>
            </div>
            <div className="flex flex-wrap gap-4 text-[13px] font-bold text-slate-700">
              <span className="flex items-center gap-1.5"><span className="h-1 w-[18px] rounded bg-sky-700" />مرفوعة</span>
              <span className="flex items-center gap-1.5"><span className="h-1 w-[18px] rounded bg-green-700" />معتمدة</span>
              {m.curve.hasDeadline && <span className="flex items-center gap-1.5"><span className="w-[18px] border-t-2 border-dashed border-red-700" />الموعد النهائي</span>}
            </div>
          </div>
          <div className="overflow-x-auto"><ProgressCurve {...m.curve} /></div>
        </Card>
      </section>

      {/* 3. النتائج */}
      <section aria-labelledby="d3" className="flex flex-col gap-4">
        <SectionTitle id="d3" title="نتائج التقييم" sub={`من ${m.counted} تقييماً مرفوعاً أو معتمداً`} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="flex flex-col items-center gap-3">
            <h3 className="m-0 self-stretch text-base font-extrabold">متوسط الأداء والامتثال</h3>
            {m.counted ? (<>
              <Gauge width={230} tip={['متوسط الأداء المؤسسي', `${m.overall}% · مستوى ${m.overallLevel}`, `محسوب من ${m.counted} تقييماً`]} label={`متوسط الأداء ${m.overall}%`} pct={m.overall} color="#7c3aed" value={`${m.overall}%`} sub={`مستوى ${m.overallLevel}`} subColor="#6d28d9" />
              <div className="flex items-center gap-3.5 self-stretch rounded-[14px] bg-teal-50 px-4 py-3">
                <Ring tip={['متوسط الامتثال', `${m.compliance}% من الالتزامات مستوفاة بدليل`]} label={`متوسط الامتثال ${m.compliance}%`} pct={m.compliance} color="#0f766e" track="#ccfbf1" value="" size={60} />
                <div className="flex flex-col"><span className="text-[13px] text-slate-700">متوسط الامتثال</span><span className="text-[26px] font-extrabold leading-tight text-teal-700">{m.compliance}%</span></div>
              </div>
            </>) : <Empty text="لا توجد تقييمات مرفوعة بعد" />}
          </Card>
          <Card className="flex flex-col gap-3.5">
            <h3 className="m-0 text-base font-extrabold">المؤسسات حسب المستوى</h3>
            {m.counted ? (<>
              <div className="grid h-[200px] grid-cols-5 items-end gap-2.5 border-b-2 border-slate-200">
                {m.levels.map(l => (
                  <div key={l.label} className="flex h-full cursor-default flex-col items-center justify-end gap-1.5" {...tip([`مستوى ${l.label} (${LEVEL_RANGE[l.label]})`, `${l.n} مؤسسة`, `${share(l.n, m.counted)} من المؤسسات المقيّمة`])}>
                    <span className="text-lg font-extrabold">{l.n}</span>
                    <div className="w-[70%] max-w-[56px] rounded-t-lg transition-opacity hover:opacity-80" style={{ height: `${Math.round((l.n / maxLevel) * 140)}px`, background: l.color }} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2.5 text-center text-[13px] font-bold text-slate-700">{m.levels.map(l => <span key={l.label}>{l.label}</span>)}</div>
            </>) : <Empty text="لا توجد تقييمات مرفوعة بعد" />}
          </Card>
          <Card className="flex flex-col items-center gap-2">
            <h3 className="m-0 self-stretch text-base font-extrabold">توازن المحاور</h3>
            {m.counted ? (<>
              <RadarChart axes={m.axes} level={scoreLevel} />
              {strongest && weakest && <p className="m-0 text-[13px] text-slate-600">الأقوى: {strongest.name} {strongest.v}% · الأضعف: {weakest.name} {weakest.v}%</p>}
            </>) : <Empty text="لا توجد تقييمات مرفوعة بعد" />}
          </Card>
        </div>
      </section>

      {/* 4. خارطة المخاطر */}
      <section aria-labelledby="d4" className="flex flex-col gap-4">
        <SectionTitle id="d4" title="مصفوفة المخاطر للقطاع" sub={`${m.risksOpen} خطراً قائماً في سجلات المؤسسات`} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="flex flex-col gap-4 lg:col-span-2">
            <RiskMatrix matrix={m.matrix} total={m.risksOpen} />
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-bold text-slate-700">
              <span className="flex items-center gap-2"><span className="h-3 w-7 rounded bg-gradient-to-l from-amber-200 to-green-200" />منخفض (1–6)</span>
              <span className="flex items-center gap-2"><span className="h-3 w-7 rounded bg-gradient-to-l from-orange-400 to-orange-200" />متوسط (8–12)</span>
              <span className="flex items-center gap-2"><span className="h-3 w-7 rounded bg-gradient-to-l from-red-600 to-red-400" />مرتفع (15–25)</span>
            </div>
          </Card>
          <Card className="flex flex-col gap-4">
            <h3 className="m-0 text-base font-extrabold">الأعلى مخاطر</h3>
            {m.riskInst.length ? (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {m.riskInst.map((r, i) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => openInst(r.id)} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-right text-sm hover:bg-slate-50"
                      {...tip([r.name, `مخاطر قائمة: ${r.total}`, `منها مرتفعة: ${r.high}`])}>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-extrabold">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                      {r.high > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{r.high} مرتفعة</span>}
                      <span className="text-xs font-bold text-slate-500">{r.total}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <Empty />}
            <h3 className="m-0 mt-2 text-base font-extrabold">حسب الفئة</h3>
            {m.categories.length ? m.categories.map(c => (
              <div key={c.label} className="grid cursor-default grid-cols-[70px_minmax(0,1fr)_30px] items-center gap-2.5 text-sm" {...tip([c.label === 'أخرى' ? 'مخاطر أخرى' : `المخاطر ال${c.label}ة`, `${c.n} خطراً (${share(c.n, m.risksOpen)})`, `منها مرتفعة: ${c.high}`])}>
                <span className="font-semibold">{c.label}</span>
                <div className="flex h-3 overflow-hidden rounded-md bg-slate-100">
                  <span className="h-3 bg-red-600" style={{ width: `${(c.high / maxCat) * 100}%` }} />
                  <span className="h-3 bg-slate-400" style={{ width: `${((c.n - c.high) / maxCat) * 100}%` }} />
                </div>
                <strong className="text-left">{c.n}</strong>
              </div>
            )) : <Empty />}
            {m.categories.length > 0 && <p className="m-0 text-xs text-slate-600">الجزء الأحمر من كل شريط: المخاطر المرتفعة</p>}
          </Card>
        </div>
      </section>

      {/* 5. المالية ومؤسسات تحتاج متابعة */}
      <section aria-labelledby="d5" className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <SectionTitle id="d5" title="المؤشرات المالية للقطاع" sub={`من ${m.finance.count} قائمة مالية لسنة ${currentYear}`} />
          <Card className="flex flex-col gap-4">
            {m.finance.count ? (<>
              <div className="flex flex-col gap-2.5">
                <div className="flex justify-between text-sm"><span className="font-bold">الإيرادات مقابل المصروفات</span><span className={`font-bold ${surplus >= 0 ? 'text-green-700' : 'text-red-700'}`}>{surplus >= 0 ? 'فائض' : 'عجز'} {money(Math.abs(surplus))}</span></div>
                {[{ l: 'الإيرادات', v: m.finance.revenues, c: 'bg-teal-700' }, { l: 'المصروفات', v: m.finance.expenses, c: 'bg-amber-500' }].map(r => (
                  <div key={r.l} className="grid cursor-default grid-cols-[80px_minmax(0,1fr)_100px] items-center gap-2.5 text-[13px]" {...tip([`إجمالي ${r.l}`, `${Math.round(r.v).toLocaleString('en-US')} ر.ع`, `من ${m.finance.count} قائمة مالية`])}>
                    <span>{r.l}</span>
                    <div className="h-[18px] rounded bg-slate-100"><div className={`h-[18px] rounded ${r.c}`} style={{ width: `${(r.v / finMax) * 100}%` }} /></div>
                    <strong className="text-left">{money(r.v)}</strong>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-[14px] bg-teal-50 p-3.5">
                  <Ring tip={['المصروف على الموقوف عليهم', `${money(m.finance.benef)} ر.ع`, m.finance.benefShare !== null ? `${m.finance.benefShare}% من مصروفات ${m.finance.benefCount} مؤسسة` : 'لم يُدخل بعد']} label="نسبة المصروف على الموقوف عليهم" pct={m.finance.benefShare ?? 0} color="#0f766e" track="#ccfbf1" value={m.finance.benefShare !== null ? `${m.finance.benefShare}%` : '—'} />
                  <div className="flex flex-col"><span className="text-xs text-slate-700">للموقوف عليهم</span><strong className="text-lg">{m.finance.benefCount ? money(m.finance.benefCount ? m.finance.benef : 0) : 'لم يُدخل'}</strong></div>
                </div>
                <div className="flex items-center gap-3 rounded-[14px] bg-amber-50 p-3.5">
                  <Ring tip={['متوسط المصاريف الإدارية', `${m.finance.adminAvg}% من المصروفات`, `${m.finance.adminOver} مؤسسة فوق حد 20%`]} label={`متوسط المصاريف الإدارية ${m.finance.adminAvg}%`} pct={m.finance.adminAvg} color="#b45309" track="#fde68a" value={`${m.finance.adminAvg}%`} />
                  <div className="flex flex-col"><span className="text-xs text-slate-700">مصاريف إدارية</span><strong className={`text-sm ${m.finance.adminOver ? 'text-amber-800' : 'text-green-700'}`}>{m.finance.adminOver ? `${m.finance.adminOver} فوق الحد (20%)` : 'ضمن الحد'}</strong></div>
                </div>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-[13px] text-slate-700">
                <span>إجمالي الأصول: <strong className="text-navy-900">{money(m.finance.assets)}</strong></span>
                <span>قوائم غير مدققة: <strong className="text-amber-800">{m.finance.unaudited} من {m.finance.count}</strong></span>
              </div>
            </>) : <Empty text="لا توجد قوائم مالية لهذه السنة" />}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <h2 className="m-0 text-xl font-extrabold">مؤسسات تحتاج متابعة</h2>
          <Card className="!p-0 overflow-hidden">
            {m.attention.length ? m.attention.map(a => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 px-[18px] py-3.5 last:border-b-0">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[15px] font-bold">{a.name}</span>
                  <div className="flex flex-wrap gap-1.5">{a.tags.map((t, i) => <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TAG[t.tone]}`}>{t.text}</span>)}</div>
                </div>
                <button type="button" onClick={() => openInst(a.id)} className="no-print inline-flex min-h-[44px] items-center rounded-[10px] border border-slate-300 px-3.5 text-sm font-bold hover:bg-slate-50">عرض</button>
              </div>
            )) : <Empty text="لا توجد مؤسسات تستدعي المتابعة حالياً" />}
          </Card>
        </div>
      </section>
    </div>
  );
};

const DashboardModern: React.FC<{ onSwitchLayout: () => void }> = props => (
  <TipProvider><DashboardInner {...props} /></TipProvider>
);

export default DashboardModern;
