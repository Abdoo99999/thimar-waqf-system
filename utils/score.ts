// طريقة واحدة لحساب درجة التقييم في كل الصفحات:
// متوسط بسيط لدرجات المؤشرات المُجابة (1–5)، ثم تحويله إلى نسبة مئوية وتقريبه مرة واحدة
export const toPct = (avg: number) => Math.round((avg / 5) * 100);

export interface ScoreResult {
  avg: number;                     // من 5 (بلا تقريب)
  overall: number;                 // نسبة مئوية
  pillars: Record<string, number>; // نسبة لكل محور
  count: number;                   // عدد المؤشرات المُجابة
}

export const scoreResponses = (
  responses: { indicator_id: string; score: number }[],
  axisOf: (indicatorId: string) => string | undefined,
): ScoreResult => {
  const rs = responses.filter(r => Number(r.score) > 0);
  const axes: Record<string, { t: number; n: number }> = {};
  rs.forEach(r => {
    const ax = axisOf(r.indicator_id);
    if (!ax) return;
    (axes[ax] ||= { t: 0, n: 0 });
    axes[ax].t += r.score; axes[ax].n++;
  });
  const avg = rs.length ? rs.reduce((a, r) => a + r.score, 0) / rs.length : 0;
  const pillars: Record<string, number> = {};
  Object.entries(axes).forEach(([k, v]) => { pillars[k] = toPct(v.t / v.n); });
  return { avg, overall: rs.length ? toPct(avg) : 0, pillars, count: rs.length };
};

// للعرض: «3.7 / 5 (75%)»
export const formatScore = (s: ScoreResult) => (s.count ? `${s.avg.toFixed(1)} / 5 (${s.overall}%)` : '—');
