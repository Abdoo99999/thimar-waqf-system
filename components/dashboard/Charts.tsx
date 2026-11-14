import React from 'react';
import { useTip } from './Tip';

// رسوم لوحة القيادة (SVG خفيف بدون مكتبات)

const C = (r: number) => 2 * Math.PI * r;

export const Donut: React.FC<{
  parts: { n: number; color: string; label?: string }[]; size?: number; stroke?: number; center: React.ReactNode; sub?: string; label: string; track?: string; unit?: string;
}> = ({ parts, size = 124, stroke = 14, center, sub, label, track = '#e2e8f0', unit = '' }) => {
  const tip = useTip();
  const r = 50 - stroke / 2 - 4, c = C(r);
  const total = parts.reduce((a, p) => a + p.n, 0);
  let acc = 0;
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 100 100" className="shrink-0">
      <g transform="rotate(-90 50 50)">
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {total > 0 && parts.map((p, i) => {
          const len = (p.n / total) * c;
          const el = <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={p.color} strokeWidth={stroke + (p.label ? 2 : 0)} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc}
            className={p.label ? 'cursor-pointer transition-opacity hover:opacity-80' : ''}
            {...(p.label ? tip([p.label, `${p.n.toLocaleString('en-US')} ${unit}`.trim(), `${Math.round((p.n / total) * 100)}% من الإجمالي`]) : {})} />;
          acc += len;
          return el;
        })}
      </g>
      <text x="50" y={sub ? 49 : 56} textAnchor="middle" fontSize="19" fontWeight="800" fill="#0a1929">{center}</text>
      {sub && <text x="50" y="64" textAnchor="middle" fontSize="9" fill="#475569">{sub}</text>}
    </svg>
  );
};

export const Gauge: React.FC<{ pct: number; color: string; value: string; sub?: string; subColor?: string; width?: number; label: string; tip?: string[] }> = ({ pct, color, value, sub, subColor = '#475569', width = 130, label, tip: lines }) => {
  const tip = useTip();
  const L = Math.PI * 48;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <svg role="img" aria-label={label} width={width} height={width * 0.63} viewBox="0 0 120 76" className="shrink-0" {...(lines ? tip(lines) : {})}>
      <path d="M 12 66 A 48 48 0 0 1 108 66" fill="none" stroke="#e2e8f0" strokeWidth="11" strokeLinecap="round" />
      {v > 0 && <path d="M 12 66 A 48 48 0 0 1 108 66" fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(L * v) / 100} ${L}`} />}
      <text x="60" y="57" textAnchor="middle" fontSize="20" fontWeight="800" fill="#0a1929">{value}</text>
      {sub && <text x="60" y="72" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={subColor}>{sub}</text>}
    </svg>
  );
};

export const Ring: React.FC<{ pct: number; color: string; track: string; value: string; size?: number; label: string; tip?: string[] }> = ({ pct, color, track, value, size = 62, label, tip: lines }) => {
  const tip = useTip();
  const c = C(40); const v = Math.max(0, Math.min(100, pct));
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 100 100" className="shrink-0" {...(lines ? tip(lines) : {})}>
      <g transform="rotate(-90 50 50)">
        <circle cx="50" cy="50" r="40" fill="none" stroke={track} strokeWidth="16" />
        {v > 0 && <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="16" strokeDasharray={`${(c * v) / 100} ${c}`} />}
      </g>
      <text x="50" y="57" textAnchor="middle" fontSize={value.length > 4 ? 18 : 22} fontWeight="800" fill="#0a1929">{value}</text>
    </svg>
  );
};

export const RadarChart: React.FC<{ axes: { name: string; v: number }[]; level: (v: number) => string }> = ({ axes, level }) => {
  const tip = useTip();
  const n = axes.length;
  if (n < 3) return null;
  const cx = 150, cy = 128, R = 92;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * R * v / 100, cy + Math.sin(a) * R * v / 100]; };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ');
  const short = (s: string) => s.split(' ')[0];
  return (
    <svg role="img" aria-label={`متوسط المحاور: ${axes.map(a => `${a.name} ${a.v}%`).join('، ')}`} viewBox="-10 -6 320 268" className="w-full max-w-[340px]">
      {[25, 50, 75, 100].map(p => <polygon key={p} points={poly(axes.map(() => p))} fill="none" stroke="#e2e8f0" strokeWidth="1" />)}
      {axes.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth="1" />; })}
      <polygon points={poly(axes.map(a => a.v))} fill="rgba(15,118,110,0.22)" stroke="#0f766e" strokeWidth="2.5" />
      {axes.map((a, i) => { const [x, y] = pt(i, 121); return (
        <g key={a.name}>
          <text x={x} y={y - 3} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0a1929">{short(a.name)}</text>
          <text x={x} y={y + 12} textAnchor="middle" fontSize="12.5" fontWeight="800" fill="#0f766e">{a.v}%</text>
        </g>
      ); })}
      {axes.map((a, i) => { const [x, y] = pt(i, a.v); return (
        <circle key={`p${a.name}`} cx={x} cy={y} r="5" fill="#fff" stroke="#0f766e" strokeWidth="2.5" className="cursor-pointer" tabIndex={0}
          {...tip([a.name, `متوسط المؤسسات: ${a.v}%`, `المستوى: ${level(a.v)}`])} />
      ); })}
    </svg>
  );
};

export const ProgressCurve: React.FC<{
  weeks: number; nowWeek: number; total: number; submitted: { w: number; v: number; date: string }[]; approved: { w: number; v: number; date: string }[];
  startLabel: string; midLabel: string; endLabel: string; hasDeadline: boolean;
}> = ({ weeks, nowWeek, total, submitted, approved, startLabel, midLabel, endLabel, hasDeadline }) => {
  const tip = useTip();
  const [hover, setHover] = React.useState<number | null>(null);
  const max = Math.max(total, 1);
  const X = (w: number) => 50 + w * (740 / weeks), Y = (v: number) => 250 - v * (220 / max);
  const pts = (a: { w: number; v: number }[]) => a.map(p => `${X(p.w).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const step = max <= 8 ? 1 : Math.ceil(max / 4 / 5) * 5;
  const grid: number[] = []; for (let v = 0; v < max; v += step) grid.push(v);
  const lastS = submitted[submitted.length - 1], lastA = approved[approved.length - 1];
  const tx = X(nowWeek);
  return (
    <svg role="img" aria-label={`التقييمات المرفوعة ${lastS?.v ?? 0} والمعتمدة ${lastA?.v ?? 0} من ${total}`} viewBox="0 0 820 290" direction="ltr" className="block w-full min-w-[600px]">
      {grid.map(v => (<g key={v}><line x1="50" x2="790" y1={Y(v)} y2={Y(v)} stroke="#e2e8f0" /><text x="40" y={Y(v) + 4} textAnchor="end" fontSize="12" fill="#475569">{v}</text></g>))}
      <line x1="50" x2="790" y1={Y(max)} y2={Y(max)} stroke="#94a3b8" strokeDasharray="5 4" />
      <text x="40" y={Y(max) + 4} textAnchor="end" fontSize="12" fill="#475569">{max}</text>
      <text x="56" y={Y(max) - 6} textAnchor="start" fontSize="12" fontWeight="700" fill="#475569">إجمالي المؤسسات {total}</text>
      {nowWeek < weeks && <rect x={tx} y="30" width={790 - tx} height="220" fill="#f8fafc" />}
      {submitted.length > 1 && <path d={`M ${X(0)} 250 L ${pts(submitted).split(' ').join(' L ')} L ${X(lastS.w)} 250 Z`} fill="rgba(3,105,161,0.12)" />}
      <polyline points={pts(submitted)} fill="none" stroke="#0369a1" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={pts(approved)} fill="none" stroke="#15803d" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      {submitted.length <= 20 && submitted.map((p, i) => <circle key={`s${i}`} cx={X(p.w)} cy={Y(p.v)} r="4.5" fill="#fff" stroke="#0369a1" strokeWidth="2.5" />)}
      {approved.length <= 20 && approved.map((p, i) => <circle key={`a${i}`} cx={X(p.w)} cy={Y(p.v)} r="4.5" fill="#fff" stroke="#15803d" strokeWidth="2.5" />)}
      {lastS && <text pointerEvents="none" x={X(lastS.w) + 18} y={Y(lastS.v) + 5} textAnchor="middle" fontSize="15" fontWeight="800" fill="#0369a1">{lastS.v}</text>}
      {lastA && <text x={X(lastA.w) + 18} y={Math.max(Y(lastA.v) + 5, Y(lastS?.v ?? 0) + 20)} textAnchor="middle" fontSize="15" fontWeight="800" fill="#15803d">{lastA.v}</text>}
      {nowWeek < weeks && (<><line x1={tx} x2={tx} y1="30" y2="250" stroke="#94a3b8" strokeWidth="1.5" /><text x={hasDeadline && 790 - tx < 110 ? tx - 6 : tx} y="22" textAnchor={hasDeadline && 790 - tx < 110 ? 'end' : 'middle'} fontSize="12" fontWeight="700" fill="#334155">اليوم</text></>)}
      {hasDeadline && (<><line x1="790" x2="790" y1="30" y2="250" stroke="#b91c1c" strokeWidth="2" strokeDasharray="6 4" /><text x="790" y="22" textAnchor="end" fontSize="12" fontWeight="700" fill="#b91c1c">الموعد النهائي</text></>)}
      {hover !== null && submitted[hover] && <line x1={X(submitted[hover].w)} x2={X(submitted[hover].w)} y1="30" y2="250" stroke="#0a1929" strokeOpacity="0.25" strokeWidth="1.5" />}
      {submitted.map((p, i) => {
        const prev = i ? X(submitted[i - 1].w) : 50, next = i < submitted.length - 1 ? X(submitted[i + 1].w) : X(p.w) + 20;
        const x0 = (prev + X(p.w)) / 2, x1 = (X(p.w) + next) / 2;
        const a = approved[i]?.v ?? 0;
        const t = tip([p.date === 'اليوم' ? 'حتى اليوم' : `حتى ${p.date}`, `مرفوعة: ${p.v} من ${total}`, `معتمدة: ${a}`, `لم ترفع بعد: ${total - p.v}`]);
        return <rect key={`h${i}`} x={i ? x0 : 50} y="30" width={Math.max(4, x1 - (i ? x0 : 50))} height="220" fill="transparent"
          onMouseEnter={e => { setHover(i); t.onMouseEnter(e); }} onMouseMove={t.onMouseMove} onMouseLeave={() => { setHover(null); t.onMouseLeave(); }} />;
      })}
      <line x1="50" x2="790" y1="250" y2="250" stroke="#cbd5e1" strokeWidth="1.5" />
      <text x="50" y="274" textAnchor="middle" fontSize="12" fill="#475569">{startLabel}</text>
      <text x="420" y="274" textAnchor="middle" fontSize="12" fill="#475569">{midLabel}</text>
      <text x="790" y="274" textAnchor="end" fontSize="12" fill="#475569">{endLabel}</text>
    </svg>
  );
};

const shade = (s: number): [string, string] =>
  s >= 20 ? ['#dc2626', '#ffffff'] : s >= 15 ? ['#f87171', '#450a0a'] : s >= 10 ? ['#fb923c', '#431407'] : s >= 8 ? ['#fed7aa', '#7c2d12'] : s >= 5 ? ['#fde68a', '#713f12'] : s >= 3 ? ['#d9f99d', '#365314'] : ['#bbf7d0', '#14532d'];

const LV = (s: number) => (s >= 15 ? 'مرتفع' : s >= 8 ? 'متوسط' : 'منخفض');
export const RiskMatrix: React.FC<{ matrix: number[][]; total: number }> = ({ matrix, total }) => {
  const tip = useTip();
  return (
  <div className="flex min-w-0 flex-1 items-stretch gap-3">
    <div className="flex items-center justify-center text-sm font-extrabold text-slate-700 [writing-mode:vertical-rl]">الاحتمالية ←</div>
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      {[5, 4, 3, 2, 1].map(p => (
        <div key={p} className="grid grid-cols-[28px_repeat(5,minmax(0,1fr))] gap-2">
          <span className="flex items-center justify-center text-[15px] font-extrabold text-slate-600">{p}</span>
          {[1, 2, 3, 4, 5].map(i => {
            const n = matrix[p - 1][i - 1]; const [bg, fg] = shade(p * i);
            return (
              <div key={i} tabIndex={0} aria-label={`الاحتمالية ${p} والأثر ${i}: ${n} مخاطر`}
                {...tip([`خطورة ${LV(p * i)} (${p} × ${i} = ${p * i})`, `الاحتمالية ${p} · الأثر ${i}`, n ? `${n} مخاطر · ${Math.round((n / Math.max(1, total)) * 100)}% من القائمة` : 'لا توجد مخاطر'])}
                className="flex min-h-[56px] cursor-default items-center justify-center rounded-lg text-[22px] font-extrabold transition-transform hover:scale-[1.04] sm:min-h-[64px]" style={{ background: bg, color: fg }}>
                {n || ''}
              </div>
            );
          })}
        </div>
      ))}
      <div className="grid grid-cols-[28px_repeat(5,minmax(0,1fr))] gap-2 text-center text-[15px] font-extrabold text-slate-600">
        <span />{[1, 2, 3, 4, 5].map(i => <span key={i}>{i}</span>)}
      </div>
      <div className="text-center text-sm font-extrabold text-slate-700">الأثر ←</div>
    </div>
  </div>
  );
};
