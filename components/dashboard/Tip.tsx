import React, { createContext, useCallback, useContext, useState } from 'react';

// تلميح يظهر عند تمرير الماوس على عناصر الرسوم
type Show = (e: React.MouseEvent | React.FocusEvent, lines: string[]) => void;
const Ctx = createContext<{ show: Show; hide: () => void }>({ show: () => {}, hide: () => {} });

export const TipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const show = useCallback<Show>((e, lines) => {
    let x: number, y: number;
    if ('clientX' in e) { x = e.clientX; y = e.clientY; }
    else { const r = (e.target as Element).getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
    setTip({ x, y, lines });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
  return (
    <Ctx.Provider value={{ show, hide }}>
      {children}
      {tip && (
        <div role="tooltip" dir="rtl" className="no-print pointer-events-none fixed z-[200] max-w-[260px] rounded-xl bg-navy-900 px-3 py-2 text-[13px] leading-6 text-white shadow-xl"
          style={{ top: tip.y + 16, ...(tip.x > w - 280 ? { right: w - tip.x + 12 } : { left: tip.x + 12 }) }}>
          {tip.lines.map((l, i) => <div key={i} className={i === 0 ? 'font-extrabold' : 'text-slate-200'}>{l}</div>)}
        </div>
      )}
    </Ctx.Provider>
  );
};

// خصائص جاهزة لأي عنصر يعرض تلميحاً
export const useTip = () => {
  const { show, hide } = useContext(Ctx);
  return (lines: string[]) => ({
    onMouseEnter: (e: React.MouseEvent) => show(e, lines),
    onMouseMove: (e: React.MouseEvent) => show(e, lines),
    onMouseLeave: hide,
    onFocus: (e: React.FocusEvent) => show(e, lines),
    onBlur: hide,
  });
};
