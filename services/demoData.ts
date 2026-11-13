import type { Institution, Evaluation, Response, FinancialRecord, RiskRegisterItem, Indicator } from '../types';
import { DEFAULT_INDICATORS, GOVERNORATES } from '../constants';

// Presentation-only fixtures. Never pass these records to persistence helpers.
export const buildDemoData = (institutions: Institution[], indicators: Indicator[] = DEFAULT_INDICATORS) => {
  const evaluations: Evaluation[] = [];
  const responses: Response[] = [];
  const financials: FinancialRecord[] = [];
  const risks: RiskRegisterItem[] = [];
  const demoInstitutions = institutions.map(institution => {
    const seed = Array.from(institution.id).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
    const capital = 400000 + (seed % 90) * 100000;
    const demoInstitution: Institution = {
      ...institution,
      capital_omr: capital,
      employees_omani: 8 + seed % 45,
      employees_non_omani: 2 + seed % 12,
      employees_seconded: 1 + seed % 4,
      governorate: institution.governorate || GOVERNORATES[seed % GOVERNORATES.length],
    };
    for (let year = 2024; year <= 2030; year++) {
      const date = `${year}-01-01T00:00:00.000Z`;
      const evaluationId = `demo-evaluation-${institution.id}-${year}`;
      evaluations.push({
        id: evaluationId, institution_id: institution.id, cycle_year: year,
        cycle_date: date, created_at: date, status: 'final', workflow_status: 'approved',
      });
      indicators.forEach((indicator, index) => {
        responses.push({
          id: `demo-response-${evaluationId}-${indicator.id}`, evaluation_id: evaluationId,
          indicator_id: indicator.id, score: 2 + ((seed + index + year - 2024) % 4),
          updated_at: date,
        });
      });
      const revenues = 120000 + (seed % 35) * 15000 + (year - 2024) * 12000;
      const expenses = Math.round(revenues * (0.62 + (seed % 15) / 100));
      const liabilities = Math.round(capital * 0.12);
      financials.push({
        id: `demo-financial-${institution.id}-${year}`, institution_id: institution.id,
        fiscal_year: year, auditor_name: 'مكتب تدقيق توضيحي', total_assets: capital,
        total_liabilities: liabilities, net_waqf_assets: capital - liabilities,
        total_revenues: revenues, total_expenses: expenses,
        admin_general_expenses: Math.round(expenses * 0.14), surplus_deficit: revenues - expenses,
        operating_cash_flow: revenues - expenses, investing_cash_flow: -25000,
        financing_cash_flow: 10000, cash_end_period: 75000 + seed % 100000,
        status: 'Approved', flags: [],
      });
    }
    risks.push({
      id: `demo-risk-${institution.id}`, institution_id: institution.id,
      risk_title: 'مخاطر تشغيلية توضيحية', category: 'Operational',
      probability: 3 + seed % 3, impact: 4 + seed % 2,
      mitigation_plan: 'خطة متابعة توضيحية', status: 'Open',
    });
    return demoInstitution;
  });
  return { institutions: demoInstitutions, evaluations, responses, financials, risks };
};
