
import React, { useMemo, useEffect, useState } from 'react';
import { getInstitutions, getEvaluations, getComplianceRecords, getAllResponses, getRisks, getIndicators, getFinancialRecords, getSettings, saveSettings } from '../services/db';
import { buildDemoData } from '../services/demoData';
import { Institution, Evaluation, Response, RiskRegisterItem, Indicator, FinancialRecord } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, AreaChart, Area, CartesianGrid, LineChart, Line, LabelList, Legend, ComposedChart } from 'recharts';
import { Building, AlertTriangle, TrendingUp, TrendingDown, MapPin, Shield, Wallet, Users, Target, Activity, Coins, Medal, Briefcase, Filter, Trophy, Star, BarChart2, Scale, Banknote, Layers, Calendar, ArrowRightLeft } from 'lucide-react';
import { useUi } from '../contexts/UiContext';
import { GOVERNORATES } from '../constants';

const formatOMR = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1_000_000) return s + (a / 1_000_000).toFixed(1) + 'M';
  if (a >= 1_000) return s + (a / 1_000).toFixed(1) + 'K';
  return s + a.toFixed(0);
};

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'];
const GOV_COLORS = ['#3366cc', '#dc3912', '#ff9900', '#109618', '#990099', '#0099c6', '#dd4477', '#66aa00', '#b82e2e', '#316395', '#994499'];
const RANK_COLORS = ['#fbbf24', '#94a3b8', '#b45309', '#475569', '#475569']; 
const EmptyData = () => <div className="flex h-full min-h-24 items-center justify-center text-sm text-gray-400">لا توجد بيانات بعد</div>;
const ChartState = ({ hasData, children }: { hasData: boolean; children: React.ReactNode }) => hasData ? <>{children}</> : <EmptyData />;

// --- Components ---
const InfographicCard = ({ title, value, icon: Icon, gradient, subtext, footer }: any) => (
  <div className={`relative overflow-hidden rounded-2xl shadow-xl ${gradient} text-white p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:-translate-y-1`}>
    <div className="relative z-10 flex justify-between items-start">
        <div>
            <p className="text-blue-100 font-medium mb-1 text-lg">{title}</p>
            <h3 className="text-4xl font-extrabold tracking-tight my-3">{value}</h3>
            {subtext && <p className="text-sm text-white/80 font-light">{subtext}</p>}
        </div>
        <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm shadow-inner transition-transform duration-500 hover:rotate-12">
            <Icon size={32} className="text-white" />
        </div>
    </div>
    {footer && (
        <div className="relative z-10 mt-6 pt-4 border-t border-white/20 text-sm font-medium">
            {footer}
        </div>
    )}
    <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl transition-transform duration-700 hover:scale-150"></div>
    <div className="absolute top-10 -left-10 w-20 h-20 bg-black/10 rounded-full blur-2xl"></div>
  </div>
);

const RadarCustomTick = ({ payload, x, y, cx, cy, textAnchor, stroke, radius }: any) => {
    const shiftX = x > cx ? 25 : x < cx ? -25 : 0;
    const shiftY = y > cy ? 15 : y < cy ? -15 : 0;
    return (
        <g className="recharts-layer recharts-polar-angle-axis-tick">
            <text radius={radius} stroke={stroke} x={x + shiftX} y={y + shiftY} className="recharts-text recharts-polar-angle-axis-tick-value" textAnchor={textAnchor} fill="#374151" fontSize="12px" fontWeight="bold">
                <tspan x={x + shiftX} dy="0.355em">{payload.value}</tspan>
            </text>
        </g>
    );
};

const TopListItem = ({ rank, name, score, maxScore = 5 }: any) => {
    const percentage = (score / maxScore) * 100;
    const rankColor = RANK_COLORS[rank - 1] || RANK_COLORS[RANK_COLORS.length - 1];
    const Icon = rank <= 3 ? Trophy : Star;
    return (
        <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl transition-all duration-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-[1.02] hover:shadow-md cursor-default">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-white shrink-0 shadow-sm transition-transform hover:scale-110`} style={{ backgroundColor: rankColor }}>
                {rank <= 3 ? <Icon size={18} /> : <span>{rank}</span>}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                    <span className="text-sm font-bold text-navy-900 dark:text-white truncate" title={name}>{name}</span>
                    <span className="text-sm font-extrabold text-teal-600 dark:text-teal-400">{score.toFixed(2)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-600 overflow-hidden">
                    <div className="bg-teal-500 h-2.5 rounded-full transition-all duration-1000 ease-out" style={{ width: `${percentage}%` }}></div>
                </div>
            </div>
        </div>
    );
};

const Dashboard: React.FC = () => {
  const { currentWaqfId, setWaqfContext, currentYear, setYearContext } = useUi();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [risks, setRisks] = useState<RiskRegisterItem[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [financials, setFinancials] = useState<FinancialRecord[]>([]);
  const [demoMode, setDemoMode] = useState(() => (getSettings() as { demoMode?: boolean }).demoMode === true);
  
  // Years List 2024 - 2030
  const availableYears = Array.from({length: 7}, (_, i) => 2024 + i);

  useEffect(() => {
    const realInstitutions = getInstitutions() || [];
    const currentIndicators = getIndicators() || [];
    setIndicators(currentIndicators);
    if (demoMode) {
      const demo = buildDemoData(realInstitutions, currentIndicators);
      setInstitutions(demo.institutions);
      setEvaluations(demo.evaluations);
      setRisks(demo.risks);
      setResponses(demo.responses);
      setFinancials(demo.financials);
    } else {
      setInstitutions(realInstitutions);
      setEvaluations(getEvaluations() || []);
      setRisks(getRisks() || []);
      setResponses(getAllResponses() || []);
      setFinancials(getFinancialRecords() || []);
    }
  }, [demoMode]);

  useEffect(() => {
    const syncDemoMode = () => setDemoMode((getSettings() as { demoMode?: boolean }).demoMode === true);
    window.addEventListener('settingsChanged', syncDemoMode);
    return () => window.removeEventListener('settingsChanged', syncDemoMode);
  }, []);

  const toggleDemoMode = () => {
    const next = !demoMode;
    saveSettings({ ...getSettings(), demoMode: next });
    setDemoMode(next);
  };

  // Filter Institutions by ID (Year does not filter Institutions existence, only data)
  const filteredInstitutions = useMemo(() => currentWaqfId ? institutions.filter(i => i.id === currentWaqfId) : institutions, [currentWaqfId, institutions]);
  
  // Filter Evaluations by Year AND ID
  const filteredEvaluations = useMemo(() => {
    return evaluations.filter(e => {
        const matchesId = currentWaqfId ? e.institution_id === currentWaqfId : true;
        const matchesYear = e.cycle_year === currentYear;
        return matchesId && matchesYear;
    });
  }, [currentWaqfId, evaluations, currentYear]);

  const filteredRisks = useMemo(() => currentWaqfId ? risks.filter(r => r.institution_id === currentWaqfId) : risks, [currentWaqfId, risks]);
  
  const filteredResponses = useMemo(() => {
      // Must filter responses based on the FILTERED evaluations (which are already year-filtered)
      const evalIds = filteredEvaluations.map(e => e.id);
      return responses.filter(r => evalIds.includes(r.evaluation_id));
  }, [responses, filteredEvaluations]);
  
  // --- FINANCIAL SUMMARY CALCULATION (FILTERED BY YEAR) ---
  const financialStats = useMemo(() => {
     // Filter financials by Year AND ID
     const recordsToProcess = financials.filter(r => {
         const matchesId = currentWaqfId ? r.institution_id === currentWaqfId : true;
         const matchesYear = r.fiscal_year === currentYear;
         return matchesId && matchesYear;
     });

     if (recordsToProcess.length === 0) return { hasData: false, hasExpenses: false, adminRatio: 0, surplus: 0, cash: 0, netAssets: 0 };

     // If multiple records exist for same institution in same year (shouldn't happen but safe to handle), pick latest
     const latestMap = new Map();
     recordsToProcess.forEach(r => {
        latestMap.set(r.institution_id, r);
     });
     
     const latestRecords = Array.from(latestMap.values());
     
     let totalSurplus = 0;
     let totalCash = 0;
     let totalExpenses = 0;
     let totalAdmin = 0;
     let totalNetAssets = 0;

     latestRecords.forEach(r => {
        totalSurplus += (Number(r.surplus_deficit) || 0);
        totalCash += (Number(r.cash_end_period) || 0);
        totalExpenses += (Number(r.total_expenses) || 0);
        totalAdmin += (Number(r.admin_general_expenses) || 0);
        totalNetAssets += (Number(r.net_waqf_assets) || 0);
     });

     const avgAdminRatio = totalExpenses > 0 ? (totalAdmin / totalExpenses) * 100 : 0;

     return {
        hasData: true,
        hasExpenses: totalExpenses > 0,
        adminRatio: avgAdminRatio,
        surplus: totalSurplus,
        cash: totalCash,
        netAssets: totalNetAssets
     };
  }, [currentWaqfId, financials, currentYear]);

  // --- NEW: FINANCIAL EFFICIENCY CHART DATA (Revenue vs Expenses) ---
  const financialEfficiencyData = useMemo(() => {
      let totalRev = 0;
      let totalExp = 0;

      const recordsToProcess = financials.filter(r => {
          const matchesId = currentWaqfId ? r.institution_id === currentWaqfId : true;
          const matchesYear = r.fiscal_year === currentYear;
          return matchesId && matchesYear;
      });

      const latestMap = new Map();
      recordsToProcess.forEach(r => latestMap.set(r.institution_id, r));
      
      Array.from(latestMap.values()).forEach(r => {
          totalRev += (Number(r.total_revenues) || 0);
          totalExp += (Number(r.total_expenses) || 0);
      });

      return [
          { name: 'إجمالي الإيرادات', value: totalRev, fill: '#10b981' }, // Green
          { name: 'إجمالي المصروفات', value: totalExp, fill: '#ef4444' }  // Red
      ];
  }, [financials, currentWaqfId, currentYear]);

  // --- DYNAMIC STRATEGY CHART DATA ---
  const strategyData = useMemo(() => {
      return availableYears.map(year => {
          // 1. Calculate Global Average for 'year' (All institutions)
          const allEvalsInYear = evaluations.filter(e => e.cycle_year === year);
          // Get responses linked to these evaluations
          const allResponsesInYear = responses.filter(r => allEvalsInYear.some(e => e.id === r.evaluation_id));
          
          let globalAvg = null;
          if (allResponsesInYear.length > 0) {
              const totalScore = allResponsesInYear.reduce((acc, r) => acc + r.score, 0);
              globalAvg = Number((totalScore / allResponsesInYear.length).toFixed(2));
          }

          // 2. Calculate Selected Institution Score for 'year'
          let institutionScore = null;
          if (currentWaqfId) {
              const instEval = allEvalsInYear.find(e => e.institution_id === currentWaqfId);
              if (instEval) {
                  const instResps = responses.filter(r => r.evaluation_id === instEval.id);
                  if (instResps.length > 0) {
                      const total = instResps.reduce((acc, r) => acc + r.score, 0);
                      institutionScore = Number((total / instResps.length).toFixed(2));
                  }
              }
          }

          // 3. Strategic Target (Simulated linear growth from 3.0 to 5.0)
          // Starting base 3.0 in 2024, adding 0.3 every year
          const targetScore = Math.min(3.0 + ((year - 2024) * 0.3), 5.0);

          return {
              year: year.toString(),
              globalAvg: globalAvg, // Can be null
              institutionScore: institutionScore, // Can be null
              target: demoMode ? Number(targetScore.toFixed(1)) : null
          };
      });
  }, [evaluations, responses, currentWaqfId, availableYears, demoMode]);

  // --- Other Data Memos ---
  const typeStats = useMemo(() => {
      const general = filteredInstitutions.filter(i => i.type === 'وقفية عامة').length;
      const special = filteredInstitutions.filter(i => i.type === 'وقفية خاصة').length;
      return [ { name: 'عامة', value: general, fill: '#0d9488' }, { name: 'خاصة', value: special, fill: '#f59e0b' } ];
  }, [filteredInstitutions]);

  const totalCapital = useMemo(() => filteredInstitutions.reduce((acc, i) => acc + (i.capital_omr || 0), 0), [filteredInstitutions]);

  const topInstitutions = useMemo(() => {
      const scores: Record<string, { total: number, count: number, name: string }> = {};
      const instMap = new Map<string, string>(filteredInstitutions.map(i => [i.id, i.name] as [string, string]));
      filteredResponses.forEach(r => {
          const evalRec = filteredEvaluations.find(e => e.id === r.evaluation_id);
          if(evalRec && instMap.has(evalRec.institution_id)) {
             const id = evalRec.institution_id;
             if(!scores[id]) scores[id] = { total: 0, count: 0, name: instMap.get(id) || '' };
             scores[id].total += r.score;
             scores[id].count++;
          }
      });
      return Object.values(scores).map(s => ({ name: s.name, score: Number((s.total / s.count).toFixed(2)) })).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [filteredResponses, filteredInstitutions, filteredEvaluations]);

  const employeeStats = useMemo(() => {
      const omani = filteredInstitutions.reduce((acc, i) => acc + (i.employees_omani || 0), 0);
      const nonOmani = filteredInstitutions.reduce((acc, i) => acc + (i.employees_non_omani || 0), 0);
      const total = omani + nonOmani;
      const rate = total > 0 ? (omani / total) * 100 : 0;
      return { omani, nonOmani, total, rate: Number(rate.toFixed(1)), pieData: [{ name: 'عماني', value: omani, fill: '#10b981' }, { name: 'غير عماني', value: nonOmani, fill: '#e5e7eb' }] };
  }, [filteredInstitutions]);

  const capitalStats = useMemo(() => {
      let lessThan1M = 0; let between1Mand5M = 0; let moreThan5M = 0;
      filteredInstitutions.forEach(i => {
          const cap = i.capital_omr || 0;
          if (cap <= 0) return;
          if (cap < 1000000) lessThan1M++; else if (cap >= 1000000 && cap <= 5000000) between1Mand5M++; else moreThan5M++;
      });
      return [ { name: 'أقل من مليون', value: lessThan1M, fill: '#3b82f6' }, { name: 'من مليون إلى 5 ملايين', value: between1Mand5M, fill: '#f97316' }, { name: 'أكثر من 5 ملايين', value: moreThan5M, fill: '#10b981' } ];
  }, [filteredInstitutions]);

  const riskMatrix = useMemo(() => {
      let high = 0;
      filteredRisks.forEach(r => { if ((r.probability * r.impact) >= 15) high++; });
      return { high };
  }, [filteredRisks]);

  const govStats = useMemo(() => {
      const counts: Record<string, number> = {};
      GOVERNORATES.forEach(g => counts[g] = 0);
      filteredInstitutions.forEach(i => { if (i.governorate && counts[i.governorate] !== undefined) counts[i.governorate]++; });
      return GOVERNORATES.map((g, idx) => ({ name: g, value: counts[g], fill: GOV_COLORS[idx % GOV_COLORS.length] }));
  }, [filteredInstitutions]);

  const averageScore = useMemo(() => {
      if (filteredResponses.length === 0) return 0;
      return (filteredResponses.reduce((acc, r) => acc + r.score, 0) / filteredResponses.length).toFixed(1);
  }, [filteredResponses]);

  const radarData = useMemo(() => {
      if (filteredResponses.length === 0) return [];
      const axisScores: Record<string, { total: number, count: number }> = {};
      filteredResponses.forEach(r => {
          const ind = indicators.find(i => i.id === r.indicator_id);
          if (ind) {
              if (!axisScores[ind.axis]) axisScores[ind.axis] = { total: 0, count: 0 };
              axisScores[ind.axis].total += r.score;
              axisScores[ind.axis].count += 1;
          }
      });
      return Object.keys(axisScores).map((axis, i) => ({ id: i, subject: axis, A: Number((axisScores[axis].total / axisScores[axis].count).toFixed(1)), fullMark: 5 }));
  }, [filteredResponses, indicators]);

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
         <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-extrabold text-navy-900 dark:text-white tracking-tight">لوحة القيادة الاستراتيجية</h2>
              {demoMode && <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">بيانات توضيحية – ليست حقيقية</span>}
            </div>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-navy-800">
              <input type="checkbox" role="switch" checked={demoMode} onChange={toggleDemoMode} className="h-5 w-5 accent-amber-600" />
              وضع العرض التوضيحي
            </label>
         </div>
         
         <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
             {/* Year Selector */}
             <div className="w-full md:w-40">
                 <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                     <Calendar size={16} /> سنة الأداء المؤسسي
                 </label>
                 <div className="relative group">
                     <select 
                        className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-navy-800 outline-none appearance-none bg-white font-bold"
                        value={currentYear} 
                        onChange={(e) => setYearContext(Number(e.target.value))}
                     >
                         {availableYears.map(year => (
                             <option key={year} value={year}>{year}</option>
                         ))}
                     </select>
                     <div className="absolute left-3 top-3.5 pointer-events-none text-gray-500"><Calendar size={18} /></div>
                 </div>
             </div>

             {/* Institution Selector */}
             <div className="w-full md:w-auto min-w-[280px]">
                 <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                     <Filter size={16} /> تصفية البيانات حسب المؤسسة
                 </label>
                 <div className="relative group">
                     <select 
                        className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-navy-800 outline-none appearance-none bg-white font-bold"
                        value={currentWaqfId || ''} onChange={(e) => setWaqfContext(e.target.value)}
                     >
                         <option value="">جميع المؤسسات</option>
                         {institutions.map(inst => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
                     </select>
                     <div className="absolute left-3 top-3.5 pointer-events-none text-gray-500"><Building size={18} /></div>
                 </div>
                 {currentWaqfId && <p className="text-xs text-teal-600 mt-1 font-bold">تم تثبيت العرض على المؤسسة المختارة</p>}
             </div>
         </div>
      </div>

      {/* 1. TOP CARDS (HERO) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <InfographicCard title="حجم رأس المال الوقفي" value={totalCapital > 0 ? `${totalCapital.toLocaleString()} ر.ع.` : 'لا توجد بيانات بعد'} icon={Coins} gradient="bg-gradient-to-br from-indigo-900 to-navy-900" subtext="القيمة السوقية التقديرية" footer={demoMode ? <span className="text-blue-200">النمو السنوي: +4.2%</span> : null}/>
        
        <div className="relative overflow-hidden rounded-2xl shadow-xl bg-white dark:bg-gray-800 p-6 border border-gray-100 dark:border-gray-700 flex items-center justify-between transition-all hover:scale-105">
            <div className="w-1/2">
                <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">توزيع المؤسسات</p>
                <div className="space-y-4 mt-4">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-teal-600"></div><span className="text-navy-900 font-bold text-xl">{typeStats[0].value}</span><span className="text-xs text-gray-500">عامة</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div><span className="text-navy-900 font-bold text-xl">{typeStats[1].value}</span><span className="text-xs text-gray-500">خاصة</span></div>
                </div>
            </div>
            <div className="w-1/2 h-32"><ChartState hasData={typeStats.some(item => item.value > 0)}><ResponsiveContainer><PieChart><Pie data={typeStats} innerRadius={25} outerRadius={40} dataKey="value" paddingAngle={5}>{typeStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}</Pie></PieChart></ResponsiveContainer></ChartState></div>
        </div>

        <InfographicCard title={`متوسط الأداء (${currentYear})`} value={filteredResponses.length ? averageScore : 'لا توجد بيانات بعد'} icon={Activity} gradient="bg-gradient-to-br from-purple-700 to-purple-900" subtext="من 5.0"/>
        <div className="relative overflow-hidden rounded-2xl shadow-xl bg-gradient-to-br from-red-600 to-red-800 text-white p-6 hover:scale-105 transition-all">
            <div className="relative z-10"><div className="flex justify-between items-start"><p className="text-red-100 font-medium text-lg">المخاطر الحرجة</p><div className="bg-white/20 p-2 rounded-lg"><AlertTriangle size={24} /></div></div><div className="flex items-baseline mt-4"><h3 className="text-6xl font-extrabold tracking-tight">{riskMatrix.high}</h3><span className="mr-2 text-red-200 font-medium">حالة</span></div><p className="text-xs text-red-100 mt-2 opacity-80">تتطلب تدخلاً فورياً</p></div>
        </div>
      </div>
      
      {/* 2. === NEW: DESIGN 2 (Corrected Colors & Logic) === */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-navy-900 flex items-center gap-2">
                    <Wallet className="text-blue-600" /> الملخص المالي لسنة {currentYear}
                </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Right: Financial Position (Net Assets) */}
                <div className="bg-blue-50/50 rounded-2xl p-4 flex flex-col items-center justify-center border border-blue-100">
                    <h4 className="text-blue-800 font-bold mb-3 flex items-center gap-2"><Layers size={18}/> المركز المالي (صافي الأصول)</h4>
                    <div className="relative h-40 w-40 transition-transform duration-500 hover:scale-110">
                        <ChartState hasData={financialStats.hasData}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={[{ name: 'صافي الأصول', value: financialStats.netAssets }]} 
                                    cx="50%" cy="50%" innerRadius={55} outerRadius={70}
                                    startAngle={90} endAngle={-270}
                                    dataKey="value" stroke="none"
                                >
                                    <Cell fill="#3b82f6" />
                                </Pie>
                                <Tooltip position={{ x: 0, y: 0 }} contentStyle={{ borderRadius: '8px', direction: 'rtl' }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                             <Briefcase className="text-blue-500 mb-1" size={24} />
                             <span className="text-xl font-black text-navy-900">{formatOMR(financialStats.netAssets)}</span>
                             <span className="text-[10px] text-gray-500">ر.ع</span>
                        </div>
                        </ChartState>
                    </div>
                </div>

                {/* 2. Center: Performance (Surplus) */}
                <div className={`rounded-2xl p-4 flex flex-col items-center justify-center border ${financialStats.surplus >= 0 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'}`}>
                    <h4 className={`font-bold mb-3 flex items-center gap-2 ${financialStats.surplus >= 0 ? 'text-emerald-800' : 'text-red-800'}`}><TrendingUp size={18}/> الأداء المالي (الفائض)</h4>
                    <div className="relative h-40 w-40 transition-transform duration-500 hover:scale-110">
                        <ChartState hasData={financialStats.hasData}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={[{ name: 'الفائض/العجز', value: Math.abs(financialStats.surplus) }]} 
                                    cx="50%" cy="50%" innerRadius={55} outerRadius={70}
                                    startAngle={90} endAngle={-270}
                                    dataKey="value" stroke="none"
                                >
                                    <Cell fill={financialStats.surplus >= 0 ? '#10b981' : '#ef4444'} />
                                </Pie>
                                <Tooltip position={{ x: 0, y: 0 }} contentStyle={{ borderRadius: '8px', direction: 'rtl' }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                             {financialStats.surplus >= 0 ? <TrendingUp size={24} className="text-emerald-500 mb-1"/> : <TrendingDown size={24} className="text-red-500 mb-1"/>}
                             <span className="text-xl font-black text-navy-900">{formatOMR(financialStats.surplus)}</span>
                             <span className="text-[10px] text-gray-500">ر.ع</span>
                        </div>
                        </ChartState>
                    </div>
                </div>

                {/* 3. Left: Efficiency (Admin Expenses) */}
                <div className="bg-orange-50/50 rounded-2xl p-4 flex flex-col items-center justify-center border border-orange-100">
                    <h4 className="text-orange-800 font-bold mb-3 flex items-center gap-2"><Banknote size={18}/> المصاريف الإدارية والرواتب</h4>
                    <div className="relative h-40 w-40 transition-transform duration-500 hover:scale-110">
                        <ChartState hasData={financialStats.hasExpenses}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={[{ name: 'المصاريف الإدارية', value: financialStats.adminRatio }, { name: 'المصاريف التشغيلية', value: 100 - financialStats.adminRatio }]}
                                    cx="50%" cy="50%" innerRadius={55} outerRadius={70}
                                    startAngle={180} endAngle={0} // Half Circle (Gauge)
                                    dataKey="value" stroke="none"
                                >
                                    <Cell fill={financialStats.adminRatio > 20 ? '#ef4444' : '#f97316'} />
                                    <Cell fill="#fed7aa" />
                                </Pie>
                                <Tooltip position={{ x: 0, y: 0 }} contentStyle={{ borderRadius: '8px', direction: 'rtl' }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pt-8 pointer-events-none">
                             <span className="text-2xl font-black text-navy-900">{financialStats.adminRatio.toFixed(1)}%</span>
                             <span className="text-[10px] text-gray-500 mt-1">من إجمالي المصروفات</span>
                             <span className="text-xs text-orange-600 font-bold mt-1">الحد الأقصى 20%</span>
                        </div>
                        </ChartState>
                    </div>
                </div>

            </div>
      </div>
      {/* ====================================================== */}

      {/* 3. ROW: Geographic + Top 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 lg:col-span-2 hover:shadow-xl transition-all">
            <h3 className="text-xl font-bold text-navy-900 dark:text-white mb-6 flex items-center gap-2"><MapPin className="text-teal-600" /> التوزيع الجغرافي</h3>
            <div className="h-96"><ChartState hasData={govStats.some(item => item.value > 0)}><ResponsiveContainer width="100%" height="100%"><BarChart data={govStats} margin={{ top: 20, right: 30, left: 20, bottom: 120 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" /><XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{fontSize: 12, fill: '#4b5563', dy: 10}}/><YAxis axisLine={false} tickLine={false} allowDecimals={false}/><Tooltip cursor={{fill: '#f0f4f8'}} contentStyle={{borderRadius: '10px'}} /><Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={40}>{govStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}<LabelList dataKey="value" position="top" fill="#374151" fontSize={14} fontWeight="bold" /></Bar></BarChart></ResponsiveContainer></ChartState></div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all">
          <h3 className="text-xl font-bold text-navy-900 dark:text-white mb-6 flex items-center gap-2"><Medal className="text-gold-500" /> الأعلى أداءً (التوب 5)</h3>
          <div className="h-96 overflow-y-auto pr-2 scrollbar-thin">
             {topInstitutions.length > 0 ? ( <div className="space-y-3">{topInstitutions.map((inst, index) => <TopListItem key={inst.name} rank={index + 1} name={inst.name} score={inst.score} />)}</div> ) : <EmptyData />}
          </div>
        </div>
      </div>
      
      {/* 4. ROW: Capital Donut & Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all">
             <h3 className="text-xl font-bold text-navy-900 dark:text-white mb-6 flex items-center gap-2"><Briefcase className="text-blue-600" /> تصنيف المؤسسات حسب رأس المال</h3>
             <div className="h-96"><ChartState hasData={capitalStats.some(item => item.value > 0)}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={capitalStats} cx="50%" cy="50%" innerRadius={80} outerRadius={120} paddingAngle={5} dataKey="value">{capitalStats.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} strokeWidth={0} />)}</Pie><Tooltip contentStyle={{borderRadius: '10px'}} /><Legend verticalAlign="bottom" height={36} iconType="circle" /></PieChart></ResponsiveContainer></ChartState></div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all">
            <h3 className="text-xl font-bold text-navy-900 dark:text-white mb-6 flex items-center gap-2"><Shield className="text-blue-600" /> توازن الأداء المؤسسي ({currentYear})</h3>
            <div className="h-96"><ChartState hasData={radarData.length > 0}><ResponsiveContainer width="100%" height="100%"><RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}><PolarGrid gridType="polygon" stroke="#e5e7eb" /><PolarAngleAxis dataKey="subject" tick={RadarCustomTick} /><PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} /><Radar name="الأداء الحالي" dataKey="A" stroke="#2563eb" strokeWidth={3} fill="#3b82f6" fillOpacity={0.6} /><Tooltip contentStyle={{ borderRadius: '12px' }} /></RadarChart></ResponsiveContainer></ChartState></div>
        </div>
      </div>

      {/* 5. ROW: Employees & Financial Efficiency (REPLACED BENCHMARK) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all">
            <h3 className="text-xl font-bold text-navy-900 dark:text-white mb-2 flex items-center gap-2"><Users className="text-teal-600" /> نسبة التعمين</h3>
            <div className="h-72 relative flex flex-col justify-center items-center overflow-hidden">
                <ChartState hasData={employeeStats.total > 0}>
                <div className="w-full h-full absolute inset-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={employeeStats.pieData} cx="50%" cy="70%" startAngle={180} endAngle={0} innerRadius="60%" outerRadius="85%" paddingAngle={0} dataKey="value" stroke="none">{employeeStats.pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}</Pie><Tooltip contentStyle={{borderRadius: '10px'}} /></PieChart></ResponsiveContainer></div>
                <div className="absolute inset-0 pointer-events-none"><div className="absolute left-1/2 top-[70%] w-0 h-0"><div className="w-1 h-24 bg-gray-800 absolute left-[-2px] bottom-0 rounded-t-full origin-bottom transition-transform duration-1000 ease-out" style={{ transform: `rotate(${-90 + (employeeStats.rate / 100) * 180}deg)` }}></div><div className="w-4 h-4 bg-navy-900 rounded-full absolute -left-2 -top-2 border-2 border-white shadow-md"></div></div></div>
                <div className="absolute top-[75%] left-1/2 transform -translate-x-1/2 text-center"><span className="text-3xl font-black text-navy-900 block">{employeeStats.rate}%</span><span className="text-xs text-gray-500 font-bold uppercase tracking-wider">تكوين القوى البشرية</span></div>
                </ChartState>
            </div>
            <div className="w-full flex justify-around mt-2 pt-4 border-t border-gray-100"><div className="text-center"><p className="text-xs text-gray-400">الإجمالي</p><p className="text-lg font-bold text-navy-900">{employeeStats.total}</p></div><div className="text-center border-x border-gray-100 px-6"><p className="text-xs text-gray-400">عماني</p><p className="text-lg font-bold text-teal-600">{employeeStats.omani}</p></div><div className="text-center"><p className="text-xs text-gray-400">غير عماني</p><p className="text-lg font-bold text-indigo-500">{employeeStats.nonOmani}</p></div></div>
        </div>

        {/* --- CHANGED: FINANCIAL EFFICIENCY CHART --- */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all">
             <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-bold text-navy-900 flex items-center gap-2">
                     <ArrowRightLeft className="text-teal-600" /> الكفاءة المالية التشغيلية
                 </h3>
             </div>
             <div className="h-64">
                 <ChartState hasData={financialStats.hasData}>
                 <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={financialEfficiencyData} barSize={60}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                         <XAxis dataKey="name" tick={{fontSize: 14, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                         <YAxis axisLine={false} tickLine={false} />
                         <Tooltip 
                            cursor={{fill: '#f0f4f8'}} 
                            contentStyle={{borderRadius: '10px', direction: 'rtl', textAlign: 'right'}} 
                            formatter={(value: any) => value.toLocaleString()}
                         />
                         <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                             {financialEfficiencyData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                             <LabelList 
                                dataKey="value" 
                                position="top" 
                                fill="#374151" 
                                fontSize={14} 
                                fontWeight="bold" 
                                formatter={(val: number) => formatOMR(val)}
                             />
                         </Bar>
                     </BarChart>
                 </ResponsiveContainer>
                 </ChartState>
             </div>
        </div>
      </div>

      {/* 6. ROW: Strategy (Dynamic Chart - IMPROVED VISUALS) */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all">
        <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-navy-900 flex items-center gap-2"><Target className="text-red-600" /> مسار النضج الاستراتيجي</h3></div>
        <div className="h-80 bg-gradient-to-br from-white to-indigo-50/50 p-4 rounded-2xl border border-indigo-100 shadow-inner relative overflow-hidden">
            {/* Subtle Texture for Depth */}
            <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none" style={{backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '20px 20px'}}></div>
            
            <ChartState hasData={strategyData.some(item => currentWaqfId ? item.institutionScore !== null : item.globalAvg !== null)}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={strategyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorGlobal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#64748b" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#64748b" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorInst" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
                        </linearGradient>
                        <filter id="shadow" height="200%">
                            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.3"/>
                        </filter>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="year" axisLine={false} tickLine={false} fontWeight="bold" tick={{fill: '#475569'}} />
                    <YAxis domain={[0, 5]} axisLine={false} tickLine={false} tick={{fill: '#475569'}} />
                    <Tooltip 
                        contentStyle={{borderRadius: '12px', direction: 'rtl', textAlign: 'right', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} 
                        labelStyle={{fontWeight: 'bold', color: '#1e293b'}}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle"/>
                    
                    {/* Area: Global Average */}
                    <Area 
                        type="monotone" 
                        dataKey="globalAvg" 
                        stroke="#64748b" 
                        strokeWidth={2} 
                        fill="url(#colorGlobal)" 
                        name="المتوسط العام للقطاع" 
                    />
                    
                    {/* Area: Institution (Underline fill) */}
                    {currentWaqfId && (
                        <Area 
                            type="monotone" 
                            dataKey="institutionScore" 
                            fill="url(#colorInst)" 
                            stroke="none" 
                            legendType="none"
                            activeDot={false}
                        />
                    )}

                    {/* Line: Selected Institution (if exists) */}
                    {currentWaqfId && (
                        <Line 
                            type="monotone" 
                            dataKey="institutionScore" 
                            stroke="#0f766e" 
                            strokeWidth={4} 
                            dot={{r: 6, strokeWidth: 2, fill: 'white', stroke: '#0f766e'}} 
                            activeDot={{r: 8, stroke: '#0f766e', strokeWidth: 2, fill: '#10b981'}}
                            name="أداء المؤسسة الحالية" 
                            filter="url(#shadow)"
                        />
                    )}

                    {/* Line: Target (Dashed) */}
                    {demoMode && <Line 
                        type="monotone" 
                        dataKey="target" 
                        stroke="#f59e0b" 
                        strokeWidth={2} 
                        strokeDasharray="5 5" 
                        dot={false}
                        name="المسار المستهدف" 
                    />}
                </ComposedChart>
            </ResponsiveContainer>
            </ChartState>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
