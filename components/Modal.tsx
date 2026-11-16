import React, { useEffect, useRef } from 'react';

// نافذة منبثقة موحدة: تُعلن لقارئ الشاشة، تُغلق بمفتاح Escape أو بالضغط خارجها،
// تحبس التركيز داخلها، وتعيده للزر الذي فتحها عند الإغلاق
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Modal: React.FC<{
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  className?: string;
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}> = ({ onClose, labelledBy, label, className = 'max-w-md', closeOnBackdrop = true, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = ref.current;
    // التركيز على أول حقل، أو على النافذة نفسها
    const first = box?.querySelector<HTMLElement>('[autofocus], textarea, input, select') || box;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !box) return;
      const items = (Array.from(box.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const firstEl = items[0], lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-900/70 p-4 text-gray-800 backdrop-blur-sm"
      onMouseDown={e => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`max-h-[90dvh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-2xl outline-none animate-scaleIn ${className}`}
      >
        {children}
      </div>
    </div>
  );
};

export default Modal;

// إغلاق نافذة بمفتاح Escape (للنوافذ المبنية يدوياً)
export const useEscape = (active: boolean, onClose: () => void) => {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
};
