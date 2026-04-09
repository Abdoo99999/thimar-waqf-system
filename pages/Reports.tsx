import React, { useState, useEffect } from 'react';
import { 
    getInstitutions, 
    getEvaluations, 
    getResponses, 
    getIndicators, 
    getRisks, 
    getComplianceByInstAndYear,
    getImprovements,
    getFinancialRecords 
} from '../services/db';
import { Institution } from '../types';
import { CURRENT_YEAR } from '../constants';
import { 
    RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, 
    PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList 
} from 'recharts';
import { 
    Printer, ArrowUpCircle, Download, Building, 
    ShieldAlert, AlertTriangle, Scale, CheckCircle, XCircle, ListTodo,
    TrendingUp, TrendingDown, Wallet
} from 'lucide-react';
import { useUi } from '../contexts/UiContext';

// Declare html2pdf for TypeScript
declare const html2pdf: any;

// --- Custom Components ---

const RadarCustomTick = ({ payload, x, y, cx, cy, textAnchor, stroke, radius }: any) => {
    const shiftX = x > cx ? 20 : x < cx ? -20 : 0;
    const shiftY = y > cy ? 15 : y < cy ? -15 : 0;

    return (
        <g className="recharts-layer recharts-polar-angle-axis-tick">
            <text
                radius={radius}
                stroke={stroke}
                x={x + shiftX}
                y={y + shiftY}
                className="recharts-text recharts-polar-angle-axis-tick-value"
                textAnchor={textAnchor}
                fill="#374151"
                fontSize="12px"
                fontWeight="bold"
            >
                <tspan x={x + shiftX} dy="0.355em">{payload.value}</tspan>
            </text>
        </g>
    );
};

const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-3 border border-gray-100 shadow-xl rounded-xl text-right">
                <p className="font-bold text-navy-900 mb-1">{payload[0].name}</p>
                <p className="text-blue-600 font-semibold">
                    القيمة: {payload[0].value}
                </p>
            </div>
        );
    }
    return null;
};

const Reports: React.FC = () => {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const { currentWaqfId } = useUi();
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    setInstitutions(getInstitutions());
  }, []);

  useEffect(() => {
    if (!currentWaqfId) {
        setReportData(null);
        return;
    }
    
    // 1. Performance Data (Radar)
    const ev = getEvaluations().find(e => e.institution_id === currentWaqfId);
    let radarData: any[] = [];
    let improvementStats: any[] = [];
    let totalImprovementCount = 0;
    let totalAvg = "0.0";

    if (ev) {
        const responses = getResponses(ev.id);
        const indicators = getIndicators();
        const axisScores: Record<string, { total: number, count: number }> = {};
        
        const uniqueAxes = Array.from(new Set(indicators.map(i => i.axis)));
        uniqueAxes.forEach(ax => { axisScores[ax] = { total: 0, count: 0 } });

        responses.forEach(r => {
            const ind = indicators.find(i => i.id === r.indicator_id);
            if (ind) {
                if (!axisScores[ind.axis]) axisScores[ind.axis] = { total: 0, count: 0 };
                axisScores[ind.axis].total += r.score;
                axisScores[ind.axis].count += 1;
            }
        });

        radarData = uniqueAxes.map((axis) => {
            const scoreData = axisScores[axis];
            const avg = scoreData.count > 0 ? (scoreData.total / scoreData.count) : 0;
            return {
                subject: `${axis}`,
                A: Number(avg.toFixed(2)),
                fullMark: 5
            };
        });

        if (responses.length > 0) {
            totalAvg = (responses.reduce((a,b)=>a+b.score,0) / responses.length).toFixed(1);
        }

        // 2. Improvement Plan Data
        const improvements = getImprovements(ev.id);
        const todo = improvements.filter(i => i.status === 'ToDo').length;
        const doing = improvements.filter(i => i.status === 'Doing').length;
        const done = improvements.filter(i => i.status === 'Done').length;
        totalImprovementCount = improvements.length;

        improvementStats = [
            { name: 'قيد الانتظار', value: todo, fill: '#ef4444' }, 
            { name: 'جاري التنفيذ', value: doing, fill: '#f59e0b' }, 
            { name: 'تم الإنجاز', value: done, fill: '#10b981' }   
        ];
    }

    // 3. Risk Data Integration
    const risks = getRisks(currentWaqfId);
    let high = 0, medium = 0, low = 0;
    risks.forEach(r => {
        const s = r.probability * r.impact;
        if (s >= 15) high++;
        else if (s >= 8) medium++;
        else low++;
    });
    
    const riskData = [
        { name: 'حرج/مرتفع', value: high, fill: '#ef4444' }, 
        { name: 'متوسط', value: medium, fill: '#f97316' },   
        { name: 'منخفض', value: low, fill: '#10b981' }       
    ];

    // 4. Compliance Data Integration
    const compliance = getComplianceByInstAndYear(currentWaqfId, CURRENT_YEAR);
    let complianceScore = 0;
    let missingItems: string[] = [];
    
    if (compliance) {
        if (compliance.institution_status === 'فاعلة') complianceScore++; else missingItems.push('حالة المؤسسة غير فاعلة');
        if (compliance.board_status === 'قائم') complianceScore++; else missingItems.push('مجلس الإدارة غير قائم');
        if (compliance.has_executive_management) complianceScore++; else missingItems.push('لا توجد إدارة تنفيذية');
        if (compliance.has_auditor_company) complianceScore++; else missingItems.push('لم يتم تعيين مدقق خارجي');
        if (compliance.has_minutes_prev_year) complianceScore++; else missingItems.push('نقص محاضر الاجتماعات');
        if (compliance.has_financial_report_prev_year) complianceScore++; else missingItems.push('غياب التقرير المالي');
    } else {
        missingItems.push('لم يتم إنشاء سجل الامتثال لهذا العام');
    }

    const compliancePercentage = Math.round((complianceScore / 6) * 100);
    const complianceChartData = [
        { name: 'ممتثل', value: compliancePercentage, fill: '#3b82f6' }, 
        { name: 'غير ممتثل', value: 100 - compliancePercentage, fill: '#e5e7eb' } 
    ];

    // 5. Financial Data Integration
    const financials = getFinancialRecords(currentWaqfId);
    const finRecord = financials.find(f => f.fiscal_year === CURRENT_YEAR) || financials.find(f => f.fiscal_year === CURRENT_YEAR - 1) || financials[0];
    
    let financialData = null;
    if (finRecord) {
        // Calculate Metrics
        const adminRatio = finRecord.total_expenses > 0 ? (finRecord.admin_general_expenses / finRecord.total_expenses) * 100 : 0;
        const surplus = finRecord.surplus_deficit;
        const cashFlow = finRecord.operating_cash_flow || 0;
        const netAssets = finRecord.net_waqf_assets;

        // Calculate Health Score
        let score = 100;
        if (adminRatio > 20) score -= 20;
        if (surplus < 0) score -= 30;
        if (netAssets < 0) score -= 40;
        if (cashFlow <= 0) score -= 10;

        financialData = {
            year: finRecord.fiscal_year,
            score: Math.max(0, score),
            surplus: surplus,
            adminRatio: adminRatio,
            netAssets: netAssets,
            cashFlow: cashFlow
        };
    }


    setReportData({ 
        radarData, 
        improvementStats,
        totalImprovementCount,
        riskData,
        complianceData: { percentage: compliancePercentage, chart: complianceChartData, missing: missingItems },
        financialData, 
        totalScore: totalAvg,
        hasEvaluation: !!ev
    });

  }, [currentWaqfId]);

  const handleDownloadPDF = () => {
      const element = document.getElementById('report-content');
      if (!element) return;
      
      const opt = {
        margin:       5,
        filename:     `GRC-Report-${institutions.find(i => i.id === currentWaqfId)?.name}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      html2pdf().from(element).set(opt).save();
  };

  const currentInstitutionName = institutions.find(i => i.id === currentWaqfId)?.name;
  const formatCurrency = (num: number) => num.toLocaleString('en-US');

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center no-print">
        <h2 className="text-2xl font-bold text-navy-900 dark:text-white">النتائج والتقارير</h2>
        {reportData && (
            <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-navy-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-navy-900 shadow-md transition-colors">
                    <Printer size={18} /> طباعة
                </button>
                <button onClick={handleDownloadPDF} className="bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-800 shadow-md transition-colors">
                    <Download size={18} /> تصدير PDF
                </button>
            </div>
        )}
      </div>

       {/* Currently Viewing Banner */}
      {currentWaqfId ? (
          <div className="bg-gradient-to-l from-blue-50 to-white border border-blue-100 p-5 rounded-xl flex items-center justify-between text-blue-900 animate-fadeIn no-print shadow-sm">
              <div className="flex items-center gap-4">
                  <div className="bg-blue-600 p-3 rounded-xl text-white shadow-lg shadow-blue-200">
                      <Building size={24} />
                  </div>
                  <div>
                      <div className="text-xs text-blue-500 uppercase font-bold tracking-wider mb-1">التقرير الشامل (GRC) لـ:</div>
                      <div className="text-xl font-bold text-navy-900">{currentInstitutionName}</div>
                  </div>
              </div>
          </div>
      ) : (
          <div className="bg-orange-50 border border-orange-200 p-8 rounded-xl text-center no-print flex flex-col items-center justify-center">
              <div className="bg-orange-100 p-4 rounded-full mb-4 text-orange-600"><ShieldAlert size={32}/></div>
              <p className="text-orange-900 font-bold text-lg mb-2">لم يتم اختيار مؤسسة</p>
              <p className="text-sm text-orange-700 max-w-md mx-auto">يرجى الذهاب إلى لوحة القيادة أو صفحة بيانات المؤسسة لاختيار المؤسسة التي تود عرض تقاريرها.</p>
          </div>
      )}

      {reportData ? (
        <div id="report-content" className="space-y-8 animate-fadeIn print-content p-6 bg-white min-h-screen">
            {/* Header for Print/PDF */}
            <div className="flex justify-between items-end border-b-2 border-gray-100 pb-6 mb-8">
                <div>
                    {/* CHANGED TITLE HERE */}
                    <h1 className="text-3xl font-extrabold text-navy-900 mb-2">التقرير الشامل للمؤسسة</h1>
                    <p className="text-gray-500 font-medium">نظام تقييم الأوقاف - وزارة الأوقاف والشؤون الدينية</p>
                </div>
                <div className="text-left bg-gray-50 px-6 py-3 rounded-xl border border-gray-100">
                    <span className="text-xs text-gray-400 block mb-1 font-bold uppercase">النتيجة النهائية</span>
                    <div className="text-4xl font-black text-teal-600 flex items-baseline gap-1">
                        {reportData.totalScore} <span className="text-lg text-gray-400 font-medium">/ 5.0</span>
                    </div>
                </div>
            </div>

            {/* --- FINANCIAL HEALTH BAR (LIGHT VERSION) --- */}
            {reportData.financialData ? (
                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-xl relative overflow-hidden mb-8">
                     {/* Subtle Top Gradient Line */}
                     <div className="absolute top-0 right-0 w-full h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                     
                     {/* Background Pattern - Light */}
                     <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none"><Wallet size={120} className="text-navy-900" /></div>
                     
                     <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                         
                         {/* 1. Health Score Gauge */}
                         <div className="flex items-center gap-4">
                             <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 ${reportData.financialData.score >= 80 ? 'border-emerald-500 text-emerald-600' : (reportData.financialData.score >= 50 ? 'border-yellow-500 text-yellow-600' : 'border-red-500 text-red-600')}`}>
                                 <span className="text-2xl font-black">{reportData.financialData.score}%</span>
                             </div>
                             <div>
                                 <h3 className="text-lg font-bold text-navy-900">المتانة المالية</h3>
                                 <p className="text-xs text-gray-500">سنة: {reportData.financialData.year}</p>
                                 <span className={`text-xs font-bold px-2 py-0.5 rounded mt-1 inline-block ${reportData.financialData.score >= 80 ? 'bg-emerald-50 text-emerald-700' : (reportData.financialData.score >= 50 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700')}`}>
                                     {reportData.financialData.score >= 80 ? 'ممتاز' : (reportData.financialData.score >= 50 ? 'مستقر' : 'حرج')}
                                 </span>
                             </div>
                         </div>

                         {/* Divider - Light */}
                         <div className="hidden md:block w-px h-16 bg-gray-200"></div>

                         {/* 2. Surplus/Deficit Indicator */}
                         <div className="text-center">
                             <p className="text-xs text-gray-500 mb-1">الفائض / العجز التشغيلي</p>
                             <div className="flex items-center gap-2 justify-center">
                                 {reportData.financialData.surplus >= 0 
                                     ? <TrendingUp className="text-emerald-500" size={24} /> 
                                     : <TrendingDown className="text-red-500" size={24} />}
                                 <span className={`text-2xl font-bold ${reportData.financialData.surplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                     {formatCurrency(Math.abs(reportData.financialData.surplus))}
                                 </span>
                                 <span className="text-xs font-medium text-gray-400">ر.ع</span>
                             </div>
                             <p className="text-[10px] text-gray-400 mt-1">
                                 صافي الأصول: {formatCurrency(reportData.financialData.netAssets)} ر.ع
                             </p>
                         </div>

                         {/* Divider - Light */}
                         <div className="hidden md:block w-px h-16 bg-gray-200"></div>

                         {/* 3. Governance/Expenses Meter */}
                         <div className="w-full md:w-1/3">
                             <div className="flex justify-between text-xs mb-2">
                                 <span className="text-gray-600 font-bold">المصاريف الإدارية</span>
                                 <span className={reportData.financialData.adminRatio > 20 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>
                                     {reportData.financialData.adminRatio.toFixed(1)}%
                                 </span>
                             </div>
                             <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden relative border border-gray-200">
                                 {/* Limit Line at 20% */}
                                 <div className="absolute top-0 bottom-0 w-0.5 bg-navy-900 z-10 opacity-30" style={{left: '20%'}} title="الحد الأقصى 20%"></div>
                                 <div 
                                     className={`h-full rounded-full transition-all duration-1000 ${reportData.financialData.adminRatio > 20 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                                     style={{ width: `${Math.min(100, reportData.financialData.adminRatio)}%` }}
                                 ></div>
                             </div>
                             <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                 <span>0%</span>
                                 <span>الحد المسموح (20%)</span>
                                 <span>100%</span>
                             </div>
                         </div>

                     </div>
                </div>
            ) : (
                <div className="bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-6 text-center mb-8">
                    <p className="text-gray-500 text-sm">لا توجد بيانات مالية مسجلة لهذه المؤسسة لعرض شريط المتانة المالية.</p>
                </div>
            )}
            {/* --- END Financial Health Bar --- */}

            {/* Top Grid: Performance Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                
                {/* 1. Radar Chart (Performance) */}
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 page-break relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-teal-400 to-blue-500"></div>
                    <h3 className="text-xl font-bold text-navy-900 mb-6 flex items-center gap-2">
                        <ArrowUpCircle className="text-teal-600" /> تحليل الأداء المؤسسي
                    </h3>
                    <div className="h-80"> 
                        {reportData.radarData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={reportData.radarData}>
                                    <PolarGrid gridType="polygon" stroke="#e5e7eb" strokeWidth={1} />
                                    <PolarAngleAxis 
                                        dataKey="subject" 
                                        tick={RadarCustomTick}
                                    />
                                    <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                                    <Radar 
                                        name="أداء المؤسسة" 
                                        dataKey="A" 
                                        stroke="#059669" 
                                        strokeWidth={3}
                                        fill="#10b981" 
                                        fillOpacity={0.5} 
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                </RadarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400">لا توجد بيانات تقييم</div>
                        )}
                    </div>
                </div>

                {/* 2. Improvement Plan Status (Donut Chart) */}
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-orange-400 to-red-500"></div>
                      <h3 className="text-xl font-bold text-navy-900 mb-6 flex items-center gap-2">
                          <ListTodo className="text-orange-600" /> حالة خطة التحسين
                      </h3>
                      
                      <div className="flex flex-col md:flex-row items-center h-80">
                        {/* Legend */}
                        <div className="w-full md:w-1/3 space-y-4 pr-4">
                            {reportData.improvementStats.map((entry: any, index: number) => (
                                <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: entry.fill }}></div>
                                        <span className="text-sm font-bold text-gray-700">{entry.name}</span>
                                    </div>
                                    <span className="font-mono font-bold text-gray-900">{entry.value}</span>
                                </div>
                            ))}
                            {reportData.totalImprovementCount === 0 && (
                                <div className="text-center text-gray-400 text-sm">لا توجد مهام مسجلة</div>
                            )}
                        </div>

                        {/* Donut Chart */}
                        <div className="w-full md:w-2/3 h-full relative">
                            {reportData.totalImprovementCount > 0 ? (
                                <>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={reportData.improvementStats}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                                cornerRadius={6}
                                            >
                                                {reportData.improvementStats.map((entry: any, index: number) => (
                                                    <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<CustomTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-3xl font-black text-navy-900">{reportData.totalImprovementCount}</span>
                                        <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">مهمة</span>
                                    </div>
                                </>
                            ) : (
                                <div className="h-full flex items-center justify-center">
                                    <div className="text-center p-6 border-2 border-dashed border-gray-200 rounded-full w-40 h-40 flex flex-col items-center justify-center text-gray-300">
                                        <ListTodo size={32} className="mb-2" />
                                        <span className="text-xs">لا توجد مهام</span>
                                    </div>
                                </div>
                            )}
                        </div>
                      </div>
                </div>
            </div>

            {/* Bottom Grid: Risk & Compliance (GRC) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* 3. Risk Analysis Chart */}
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-red-400 to-red-600"></div>
                      <h3 className="text-xl font-bold text-navy-900 mb-2 flex items-center gap-2">
                          <AlertTriangle className="text-red-500" /> سجل المخاطر (Risk Matrix)
                      </h3>
                      <p className="text-gray-400 text-sm mb-6">تصنيف المخاطر حسب الشدة (الاحتمالية × الأثر)</p>
                      
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={reportData.riskData} barSize={60}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 'bold'}} />
                                <YAxis allowDecimals={false} />
                                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '10px'}} />
                                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                                    <LabelList dataKey="value" position="top" fill="#666" fontWeight="bold" />
                                    {reportData.riskData.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                      </div>
                </div>
                
                {/* 4. Compliance Gauge & Status */}
                <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100 flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-r from-blue-600 to-indigo-600"></div>
                    <h3 className="text-xl font-bold text-navy-900 mb-2 flex items-center gap-2">
                        <Scale className="text-indigo-600" /> مؤشر الامتثال النظامي
                    </h3>
                    <p className="text-gray-400 text-sm mb-4">مدى التزام المؤسسة بالمتطلبات التشريعية (6 معايير)</p>
                    
                    <div className="flex items-center gap-6 h-full">
                        {/* Gauge / Donut */}
                        <div className="w-40 h-40 relative flex-shrink-0">
                             <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={reportData.complianceData.chart}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={60}
                                        startAngle={90}
                                        endAngle={-270}
                                        dataKey="value"
                                        stroke="none"
                                        paddingAngle={5}
                                        cornerRadius={5}
                                    >
                                        <Cell fill={reportData.complianceData.percentage === 100 ? '#10b981' : (reportData.complianceData.percentage >= 60 ? '#3b82f6' : '#ef4444')} />
                                        <Cell fill="#f3f4f6" />
                                    </Pie>
                                </PieChart>
                             </ResponsiveContainer>
                             <div className="absolute inset-0 flex items-center justify-center flex-col">
                                 <span className={`text-2xl font-black ${reportData.complianceData.percentage === 100 ? 'text-green-600' : 'text-blue-600'}`}>
                                     {reportData.complianceData.percentage}%
                                 </span>
                             </div>
                        </div>

                        {/* Details List */}
                        <div className="flex-1 overflow-y-auto max-h-48 text-sm">
                            {reportData.complianceData.missing.length === 0 ? (
                                <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-green-800 flex items-start gap-2">
                                    <CheckCircle size={16} className="mt-0.5 shrink-0" />
                                    <span>المؤسسة ممتثلة لجميع المتطلبات الأساسية.</span>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-red-500 font-bold text-xs mb-1">نقاط عدم الامتثال:</p>
                                    {reportData.complianceData.missing.map((item: string, idx: number) => (
                                        <div key={idx} className="flex items-center gap-2 text-gray-600 bg-red-50 p-2 rounded-lg border border-red-100">
                                            <XCircle size={14} className="text-red-500 shrink-0" />
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* Footer */}
            <div className="mt-12 text-center text-gray-400 text-sm border-t pt-4">
                <p>تم استخراج هذا التقرير آلياً بواسطة نظام تقييم الأوقاف الإلكتروني</p>
                <p>{new Date().toLocaleDateString('ar-OM')}</p>
            </div>
        </div>
      ) : (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300 shadow-sm mx-4">
              <div className="text-gray-300 mb-4 flex justify-center"><Building size={48} /></div>
              <p className="text-gray-500 font-medium">
                  {currentWaqfId ? "لا توجد بيانات تقييم لهذه المؤسسة بعد" : "اختر مؤسسة لعرض النتائج"}
              </p>
          </div>
      )}
    </div>
  );
};

export default Reports;