
import { Institution, Indicator, Evaluation, Response, ComplianceRecord, ImprovementItem, RiskRegisterItem, FinancialRecord } from '../types';
import { DEFAULT_INDICATORS, CURRENT_YEAR, SEEDED_INSTITUTIONS, GOVERNORATES } from '../constants';

// --- Keys ---
const DB_KEYS = {
  INSTITUTIONS: 'waqf_institutions',
  LEGACY_INSTITUTIONS: 'institutions',
  INDICATORS: 'waqf_indicators',
  EVALUATIONS: 'waqf_evaluations',
  RESPONSES: 'waqf_responses',
  COMPLIANCE: 'waqf_compliance',
  IMPROVEMENTS: 'waqf_improvements',
  RISKS: 'waqf_risks',
  FINANCIALS: 'waqf_financials',
  SETTINGS: 'waqf_settings'
};

// --- In-Memory Cache ---
const cache: Record<string, any> = {};

// --- Helper: Generators ---
export const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const SIMPLE_NAMES = ['محمد', 'علي', 'أحمد', 'سالم', 'خالد', 'سعيد', 'عبدالله', 'ناصر', 'يوسف', 'عمر'];

// --- Helper: Location Logic ---
const inferDetailsByName = (name: string) => {
  const n = name;
  if (n.includes('صحار')) return { gov: 'شمال الباطنة', wil: 'صحار' };
  if (n.includes('نزوى') || n.includes('علاية نزوى') || n.includes('سعال') || n.includes('كرشاء')) return { gov: 'الداخلية', wil: 'نزوى' };
  if (n.includes('صلالة')) return { gov: 'ظفار', wil: 'صلالة' };
  if (n.includes('البريمي')) return { gov: 'البريمي', wil: 'البريمي' };
  if (n.includes('صور')) return { gov: 'جنوب الشرقية', wil: 'صور' };
  if (n.includes('الرستاق')) return { gov: 'جنوب الباطنة', wil: 'الرستاق' };
  if (n.includes('بهلاء')) return { gov: 'الداخلية', wil: 'بهلاء' };
  if (n.includes('عبري')) return { gov: 'الظاهرة', wil: 'عبري' };
  if (n.includes('إبراء')) return { gov: 'شمال الشرقية', wil: 'إبراء' };
  if (n.includes('السيب')) return { gov: 'مسقط', wil: 'السيب' };
  if (n.includes('بوشر')) return { gov: 'مسقط', wil: 'بوشر' };
  if (n.includes('العامرات')) return { gov: 'مسقط', wil: 'العامرات' };
  if (n.includes('سمائل')) return { gov: 'الداخلية', wil: 'سمائل' };
  if (n.includes('المضيبي') || n.includes('سناو')) return { gov: 'شمال الشرقية', wil: 'المضيبي' };
  if (n.includes('السويق')) return { gov: 'شمال الباطنة', wil: 'السويق' };
  if (n.includes('محضة')) return { gov: 'البريمي', wil: 'محضة' };
  if (n.includes('جعلان')) return { gov: 'جنوب الشرقية', wil: 'جعلان بني بو علي' };
  return { gov: 'مسقط', wil: 'بوشر' };
};

// --- Helper: Financial Data Generator ---
const generateDummyFinancials = (instId: string, year: number, type: 'GOOD' | 'AVERAGE' | 'BAD'): FinancialRecord => {
    const baseAssets = getRandomInt(100000, 5000000); 
    const assets = year === 2025 ? Math.floor(baseAssets * 1.05) : baseAssets; 
    
    const liabilities = Math.floor(assets * (getRandomInt(1, 10) / 100)); 
    const netAssets = assets - liabilities;

    let revenue = 0, expenses = 0, adminExpenses = 0;

    if (type === 'GOOD') {
        revenue = Math.floor(assets * 0.15); 
        expenses = Math.floor(revenue * 0.70); 
        adminExpenses = Math.floor(expenses * 0.10); 
    } else if (type === 'AVERAGE') {
        revenue = Math.floor(assets * 0.08); 
        expenses = Math.floor(revenue * 0.95); 
        adminExpenses = Math.floor(expenses * 0.18); 
    } else { // BAD
        revenue = Math.floor(assets * 0.03); 
        expenses = Math.floor(revenue * 1.5); 
        adminExpenses = Math.floor(expenses * 0.40); 
    }

    return {
        id: generateId(),
        institution_id: instId,
        fiscal_year: year,
        auditor_name: type === 'GOOD' ? 'مكتب ديلويت للتدقيق' : (type === 'BAD' ? 'مكتب المحاسبة العامة' : 'مكتب النزاهة'),
        total_assets: assets,
        total_liabilities: liabilities,
        net_waqf_assets: netAssets,
        total_revenues: revenue,
        total_expenses: expenses,
        admin_general_expenses: adminExpenses,
        surplus_deficit: revenue - expenses,
        // Added realistic cash flow for new dashboard design
        cash_end_period: Math.floor(revenue * 0.2), 
        operating_cash_flow: Math.floor(revenue * 0.25),
        status: type === 'BAD' ? 'Flagged' : 'Submitted',
        flags: [],
        submission_date: new Date().toISOString()
    };
};

// --- SAFE PARSE HELPER ---
const safeParse = <T>(json: string | null, fallback: T): T => {
    if (!json) return fallback;
    try {
        return JSON.parse(json);
    } catch (e) {
        console.warn("Recovered from corrupted data:", e);
        return fallback;
    }
};

// --- DB ACCESS FUNCTIONS ---
const data = <T>(key: string): T[] => {
  if (cache[key]) return cache[key];
  const stored = localStorage.getItem(key);
  const parsed = safeParse<T[]>(stored, []);
  cache[key] = parsed;
  return parsed;
};

const save = <T>(key: string, items: T[]) => {
  cache[key] = items;
  // Use try-catch to prevent quota exceeded errors from crashing the app
  try {
      localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
      console.error("Storage quota exceeded or error saving:", e);
  }
};

// --- INITIALIZATION (LITE MODE: 5 VIPs Only) ---
const initializeDatabase = () => {
    // Check if data exists. If yes, DO NOTHING (to preserve speed).
    // The user must use "Factory Reset" to regenerate.
    if (localStorage.getItem(DB_KEYS.INSTITUTIONS)) {
        return; 
    }

    console.log("Initializing LITE Database (5 VIPs)...");

    // Load financials map for syncing
    const currentFinancials: FinancialRecord[] = [];
    const mergedMap = new Map<string, Institution>();
    let financialsChanged = false;

    // Process Seed Data
    SEEDED_INSTITUTIONS.forEach((seedInst: any, index) => {
        const id = seedInst.id || generateId(); 
        const location = inferDetailsByName(seedInst.name);
        const simpleManager = getRandomItem(SIMPLE_NAMES);
        
        // --- THE MAGIC: ONLY TOP 5 GET DATA ---
        // FIX: Start VIP from index 1 (Indices 1 to 5), so index 0 (First User) is empty for testing flow
        const isVIP = index > 0 && index <= 5; 

        const mod = index % 10;
        let type: 'GOOD' | 'AVERAGE' | 'BAD' = 'GOOD';
        if (mod > 7) type = 'BAD';       
        else if (mod > 5) type = 'AVERAGE'; 

        const instObj: Institution = {
            ...seedInst,
            id: id,
            governorate: seedInst.governorate || location.gov,
            wilayat: seedInst.wilayat || location.wil,
            manager_name: seedInst.manager_name || simpleManager,
            phone: seedInst.phone || `9${getRandomInt(1000000, 9999999)}`,
            email: seedInst.email || `info@waqf.om`,
            establishment_date: seedInst.establishment_date || `20${getRandomInt(15, 23)}-01-01`,
            license_number: seedInst.license_number || `${getRandomInt(1000, 9999)}`,
            capital_omr: seedInst.capital_omr || getRandomInt(100000, 5000000),
            employees_omani: seedInst.employees_omani || getRandomInt(2, 15),
            employees_non_omani: seedInst.employees_non_omani || getRandomInt(0, 5),
            // ONLY VIPs look "Active/Completed"
            profile_completed: isVIP, 
            institution_status: 'فاعلة',
            board_status: 'قائم',
            has_executive_management: true,
            has_auditor_company: true,
            has_financial_report_prev_year: true,
            has_minutes_prev_year: true,
            financial_reports: [], // Will be synced separately
            created_at: new Date().toISOString(),
            documents: [] // Keep empty for lightness
        };

        // ONLY generate financials for VIPs (Index 1-5)
        if (isVIP) {
            const fin2024 = generateDummyFinancials(id, 2024, type);
            const fin2025 = generateDummyFinancials(id, 2025, type);
            instObj.financial_reports = [fin2024, fin2025];
        }

        mergedMap.set(seedInst.name, instObj);
    });

    const finalResults = Array.from(mergedMap.values());

    // Sync Financials to separate table (Only for VIPs found above)
    finalResults.forEach(inst => {
        if (inst.financial_reports && inst.financial_reports.length > 0) {
            inst.financial_reports.forEach(report => {
                const fullRecord: FinancialRecord = {
                    ...report,
                    id: report.id || generateId(),
                    institution_id: inst.id,
                    fiscal_year: report.fiscal_year || CURRENT_YEAR,
                    auditor_name: report.auditor_name || 'غير محدد',
                    total_assets: report.total_assets || 0,
                    total_liabilities: report.total_liabilities || 0,
                    net_waqf_assets: report.net_waqf_assets || 0,
                    total_revenues: report.total_revenues || 0,
                    total_expenses: report.total_expenses || 0,
                    admin_general_expenses: report.admin_general_expenses || 0,
                    surplus_deficit: report.surplus_deficit || 0,
                    status: (report.status as any) || 'Submitted',
                    flags: report.flags || [],
                    submission_date: report.submission_date || new Date().toISOString()
                };
                currentFinancials.push(fullRecord);
                financialsChanged = true;
            });
        }
    });

    save(DB_KEYS.INSTITUTIONS, finalResults);
    
    if (financialsChanged || currentFinancials.length === 0) {
        save(DB_KEYS.FINANCIALS, currentFinancials);
    } else {
        cache[DB_KEYS.FINANCIALS] = currentFinancials;
    }
};

// Run init once on load
try {
    initializeDatabase();
} catch (e) {
    console.error("Failed to initialize DB:", e);
}

// --- EXPORTS ---
export const getInstitutions = (): Institution[] => data<Institution>(DB_KEYS.INSTITUTIONS);

// ==========================================
// 🚀 MAINTENANCE & SMART CLEANUP
// ==========================================

export const clearSystemCache = () => {
    try {
        Object.values(DB_KEYS).forEach(key => {
            localStorage.removeItem(key);
            if(cache[key]) delete cache[key];
        });
        // FIX: Use Redirect instead of Reload to avoid Grey Screen in IDX
        window.location.href = "/";
    } catch(e) {
        alert("حدث خطأ أثناء مسح الذاكرة.");
    }
};

// Auto-repair for dev/demo purposes: Ensure first institution is reset to incomplete if it was previously set to complete
const repairFirstInstitution = () => {
    try {
        const insts = getInstitutions();
        if (insts.length > 0) {
            // Find the institution that is usually first in SEEDED_INSTITUTIONS
            const first = insts.find(i => i.name.includes("جابر بن زيد"));
            
            // If it exists and profile is completed, reset it to demonstrate the workflow
            if (first && first.profile_completed) {
                console.log("Auto-repairing flow for first institution...");
                
                // 1. Reset Profile
                first.profile_completed = false;
                saveInstitution(first);
                
                // 2. Remove any associated financials to lock the second step
                const allFin = data<FinancialRecord>(DB_KEYS.FINANCIALS);
                const filteredFin = allFin.filter(f => f.institution_id !== first.id);
                if (allFin.length !== filteredFin.length) {
                    save(DB_KEYS.FINANCIALS, filteredFin);
                }
                
                // 3. Remove evaluations/compliance to lock further steps
                // (Optional but good for cleanliness, keeping it simple for now)
            }
        }
    } catch (e) {
        console.warn("Auto-repair skipped");
    }
};
// Run repair
repairFirstInstitution();


// Smart Cleanup: Forces a reset to the "Lite Mode" (5 VIPs)
export const performSmartCleanup = () => {
  try {
    console.log("Forcing Smart Cleanup (Reset to Lite Mode)...");
    
    // 1. WIPE EVERYTHING
    Object.values(DB_KEYS).forEach(key => {
        localStorage.removeItem(key);
        if(cache[key]) delete cache[key];
    });

    // 2. Re-Initialize (This will trigger the new LITE logic above)
    initializeDatabase();

    // 3. Redirect to Home (FIX for Grey Screen)
    setTimeout(() => {
        alert(`✅ تم تسريع النظام بنجاح!\n\nتم الاحتفاظ ببيانات 5 مؤسسات فقط للعرض.\nباقي المؤسسات تظهر كأرشيف (اسم فقط).`);
        window.location.href = "/"; 
    }, 100);

  } catch (error) {
    console.error("Cleanup Failed:", error);
    alert("حدث خطأ أثناء محاولة تسريع النظام.");
  }
};

// --- Other Exports ---
export const saveInstitution = (inst: Institution) => {
  const list = getInstitutions();
  const index = list.findIndex(i => i.id === inst.id);
  if (index >= 0) list[index] = inst; else list.push(inst);
  save(DB_KEYS.INSTITUTIONS, list);
};
export const deleteInstitution = (id: string) => {
  const list = getInstitutions().filter(i => i.id !== id);
  save(DB_KEYS.INSTITUTIONS, list);
};
export const getFinancialRecords = (instId?: string): FinancialRecord[] => {
  const all = data<FinancialRecord>(DB_KEYS.FINANCIALS);
  if (instId) return all.filter(f => f.institution_id === instId);
  return all;
};
export const analyzeFinancialHealth = (record: FinancialRecord) => {
  const flags: string[] = [], errors: string[] = [];
  const calculatedNet = record.total_assets - record.total_liabilities;
  const diff = Math.abs(calculatedNet - record.net_waqf_assets);
  if (diff > 1) errors.push(`خطأ محاسبي: المعادلة غير متزنة.`);
  if (record.total_expenses > 0 && ((record.admin_general_expenses / record.total_expenses) * 100 > 20)) flags.push(`تنبيه: المصاريف الإدارية مرتفعة.`);
  if (record.total_expenses > record.total_revenues) flags.push('تنبيه: عجز تشغيلي.');
  if (record.net_waqf_assets < 0) flags.push('خطر حرج: تآكل رأس المال.');
  return { isValid: errors.length === 0, status: flags.length > 0 ? 'Flagged' : 'Submitted' as const, flags, errors };
};
export const saveFinancialRecord = (record: FinancialRecord) => {
  const list = data<FinancialRecord>(DB_KEYS.FINANCIALS);
  const index = list.findIndex(r => r.id === record.id);
  if (index >= 0) list[index] = record; else list.push(record);
  save(DB_KEYS.FINANCIALS, list);
};
export const deleteFinancialRecord = (id: string) => {
  const list = data<FinancialRecord>(DB_KEYS.FINANCIALS).filter(r => r.id !== id);
  save(DB_KEYS.FINANCIALS, list);
};
export const getIndicators = () => { let s = data<Indicator>(DB_KEYS.INDICATORS); if(!s.length) { save(DB_KEYS.INDICATORS, DEFAULT_INDICATORS); s = DEFAULT_INDICATORS; } return s; };
export const saveIndicators = (i: Indicator[]) => save(DB_KEYS.INDICATORS, i);
export const getEvaluations = (y?: number) => { const e = data<Evaluation>(DB_KEYS.EVALUATIONS); return y ? e.filter(x => x.cycle_year === y) : e; };
export const getEvaluationByInstAndYear = (id: string, y: number) => getEvaluations().find(e => e.institution_id === id && e.cycle_year === y);
export const saveEvaluation = (e: Evaluation) => { const l = getEvaluations(); const i = l.findIndex(x => x.id === e.id); if(i>=0) l[i] = e; else l.push(e); save(DB_KEYS.EVALUATIONS, l); };
export const getPendingEvaluationsCount = () => getEvaluations(CURRENT_YEAR).filter(e => e.workflow_status === 'submitted').length;
export const getResponses = (id: string) => data<Response>(DB_KEYS.RESPONSES).filter(r => r.evaluation_id === id);
export const getAllResponses = () => data<Response>(DB_KEYS.RESPONSES);
export const saveResponse = (r: Response) => { const l = data<Response>(DB_KEYS.RESPONSES); const i = l.findIndex(x => x.evaluation_id === r.evaluation_id && x.indicator_id === r.indicator_id); if(i>=0) l[i] = { ...l[i], ...r }; else l.push({ ...r, id: generateId() }); save(DB_KEYS.RESPONSES, l); };
export const getComplianceRecords = (y?: number) => { const r = data<ComplianceRecord>(DB_KEYS.COMPLIANCE); return y ? r.filter(x => x.cycle_year === y) : r; };
export const getComplianceByInstAndYear = (id: string, y: number) => getComplianceRecords(y).find(r => r.institution_id === id);
export const saveComplianceRecord = (r: ComplianceRecord) => { const l = data<ComplianceRecord>(DB_KEYS.COMPLIANCE); const i = l.findIndex(x => x.id === r.id); if(i>=0) l[i] = r; else l.push(r); save(DB_KEYS.COMPLIANCE, l); };
export const getRisks = (id?: string) => { const a = data<RiskRegisterItem>(DB_KEYS.RISKS); return id ? a.filter(r => r.institution_id === id) : a; };
export const saveRisk = (r: RiskRegisterItem) => { const l = data<RiskRegisterItem>(DB_KEYS.RISKS); const i = l.findIndex(x => x.id === r.id); if(i>=0) l[i] = r; else l.push(r); save(DB_KEYS.RISKS, l); };
export const deleteRisk = (id: string) => save(DB_KEYS.RISKS, data<RiskRegisterItem>(DB_KEYS.RISKS).filter(x => x.id !== id));
export const getImprovements = (id: string) => data<ImprovementItem>(DB_KEYS.IMPROVEMENTS).filter(i => i.evaluation_id === id);
export const saveImprovement = (i: ImprovementItem) => { const l = data<ImprovementItem>(DB_KEYS.IMPROVEMENTS); const x = l.findIndex(z => z.id === i.id); if(x>=0) l[x] = i; else l.push(i); save(DB_KEYS.IMPROVEMENTS, l); };
export const deleteImprovement = (id: string) => save(DB_KEYS.IMPROVEMENTS, data<ImprovementItem>(DB_KEYS.IMPROVEMENTS).filter(x => x.id !== id));
export const getSettings = () => { const s = localStorage.getItem(DB_KEYS.SETTINGS); return safeParse(s, { managerName: 'د. عبدالرحمن النوفلي', darkMode: false, orgName: 'وزارة الأوقاف والشؤون الدينية' }); };
export const saveSettings = (s: any) => { localStorage.setItem(DB_KEYS.SETTINGS, JSON.stringify(s)); window.dispatchEvent(new Event('settingsChanged')); };

// --- UPDATED PROGRESS TRACKER (STRICT SEQUENTIAL) ---
export const getInstitutionProgress = (id: string | null) => {
  // If no ID is selected, nothing is done.
  if (!id) return { dataComplete: false, financialsDone: false, evalFinalized: false, complianceDone: false, workflowStatus: 'draft' as const, isLocked: false };
  
  const i = getInstitutions().find(x => x.id === id);
  const e = getEvaluations().find(x => x.institution_id === id && x.cycle_year === CURRENT_YEAR);
  const c = getComplianceRecords().find(x => x.institution_id === id && x.cycle_year === CURRENT_YEAR);
  
  // Strict Financial Check: Must exist for current year (or prev) AND status must be 'Submitted' or 'Approved' (not Draft/Null)
  // Note: In this system, saving financials defaults to 'Submitted', so existence is usually enough, but we add checks.
  const f = getFinancialRecords(id).find(r => r.fiscal_year === CURRENT_YEAR || r.fiscal_year === CURRENT_YEAR - 1);
  const isFinancialsSubmitted = !!f && (f.status === 'Submitted' || f.status === 'Approved' || f.status === 'Flagged');

  return { 
      dataComplete: !!(i?.profile_completed), // Strict Step 1
      financialsDone: isFinancialsSubmitted,  // Strict Step 2
      evalFinalized: !!(e?.status === 'final'), // Strict Step 3
      complianceDone: !!c && getRisks(id).length > 0, // Strict Step 4 (Any save creates a record, but must have risks)
      
      workflowStatus: e?.workflow_status || 'draft', 
      isLocked: e?.workflow_status === 'submitted' || e?.workflow_status === 'approved' 
  };
};
