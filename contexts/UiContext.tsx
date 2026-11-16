
import React, { createContext, useContext, useState, useEffect } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { CURRENT_YEAR } from '../constants';
import { getSession, logoutServer } from '../services/db';

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

export type UserRole = 'admin' | 'user' | 'approver' | 'viewer';
// مستخدمو الوزارة: يرون كل المؤسسات (المدير والمعتمِد والمطّلع)
export const isMinistryRole = (r?: string | null) => r === 'admin' || r === 'approver' || r === 'viewer';
export const canApproveRole = (r?: string | null) => r === 'admin' || r === 'approver';
export const ROLE_LABEL: Record<UserRole, string> = { admin: 'مدير النظام', approver: 'معتمِد', viewer: 'مطّلع', user: 'مؤسسة وقفية' };

interface UiContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
    isAuthenticated: boolean;
    login: (username: string, role: UserRole) => void;
    logout: () => void;
    user: string | null;
    role: UserRole | null;
    
    // Global Institution Context
    currentWaqfId: string | null;
    setWaqfContext: (id: string) => void;

    // Global Year Context
    currentYear: number;
    setYearContext: (year: number) => void;
}

const UiContext = createContext<UiContextType | undefined>(undefined);

export const UiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    // حالة الدخول تأتي من الخادم (جلسة HttpOnly)، وليس من localStorage
    const initial = getSession();
    const [isAuthenticated, setIsAuthenticated] = useState(initial.authenticated);
    const [user, setUser] = useState<string | null>(initial.authenticated ? (initial.name || null) : null);
    const [role, setRole] = useState<UserRole | null>(initial.authenticated ? (initial.role || null) : null);

    const [currentWaqfId, setCurrentWaqfId] = useState<string | null>(() => {
        if (initial.role === 'user') return initial.institution_id || null;
        if (isMinistryRole(initial.role)) { try { return localStorage.getItem('currentWaqfContext'); } catch { return null; } }
        return null;
    });

    // Global Year State (Default to Constant CURRENT_YEAR)
    const [currentYear, setCurrentYear] = useState<number>(CURRENT_YEAR);

    const resetAuthState = () => {
        try { localStorage.removeItem('currentWaqfContext'); } catch { /* ignore */ }
        setUser(null);
        setRole(null);
        setCurrentWaqfId(null);
        setIsAuthenticated(false);
    };

    // يُستدعى بعد نجاح الدخول في الخادم
    const login = (username: string, newRole: UserRole) => {
        const s = getSession();
        setUser(username);
        setRole(newRole);
        if (newRole === 'user') setCurrentWaqfId(s.institution_id || null);
        setCurrentYear(CURRENT_YEAR); // دورة التقييم من إعدادات الخادم بعد تحميل البيانات
        setIsAuthenticated(true);
    };

    const logout = () => {
        resetAuthState();
        logoutServer().finally(() => { window.location.hash = '#/'; });
    };

    useEffect(() => {
        const onExpired = () => { resetAuthState(); window.location.hash = '#/'; };
        const onError = (e: Event) => showToast((e as CustomEvent).detail || 'حدث خطأ', 'error');
        const onSettings = () => setCurrentYear(CURRENT_YEAR);
        window.addEventListener('sessionExpired', onExpired);
        window.addEventListener('dbError', onError);
        window.addEventListener('settingsChanged', onSettings);
        return () => {
            window.removeEventListener('sessionExpired', onExpired);
            window.removeEventListener('dbError', onError);
            window.removeEventListener('settingsChanged', onSettings);
        };
    }, []);

    const setWaqfContext = (id: string) => {
        // المؤسسة مقيدة بمؤسستها فقط (والخادم يفرض ذلك أيضاً)
        if (role === 'user' || getSession().role === 'user') {
            setCurrentWaqfId(getSession().institution_id || null);
            return;
        }
        try { localStorage.setItem('currentWaqfContext', id); } catch { /* ignore */ }
        setCurrentWaqfId(id);
    };

    const setYearContext = (year: number) => {
        setCurrentYear(year);
    };

    const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));
    // رسائل الخطأ تبقى حتى يغلقها المستخدم (حتى لا يفوته أن الحفظ لم يتم)، والباقي تختفي بعد ثوانٍ
    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => prev.some(t => t.message === message) ? prev : [...prev.slice(-3), { id, message, type }]);
        if (type !== 'error') setTimeout(() => dismiss(id), 4000);
    };

    return (
        <UiContext.Provider value={{ showToast, isAuthenticated, login, logout, user, role, currentWaqfId, setWaqfContext, currentYear, setYearContext }}>
            {children}
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-md px-4" aria-live="polite" role="status">
                {toasts.map(toast => (
                    <div key={toast.id} role={toast.type === 'error' ? 'alert' : undefined} className={`toast-enter flex items-center gap-3 p-4 rounded-xl shadow-2xl border ${
                        toast.type === 'success' ? 'bg-navy-900 text-white border-teal-500' : 
                        toast.type === 'error' ? 'bg-red-600 text-white border-red-400' : 'bg-white text-gray-800 border-gray-200'
                    }`}>
                        {toast.type === 'success' && <CheckCircle className="text-teal-400 shrink-0" size={24} aria-hidden="true" />}
                        {toast.type === 'error' && <XCircle className="text-white shrink-0" size={24} aria-hidden="true" />}
                        {toast.type === 'info' && <Info className="text-blue-500 shrink-0" size={24} aria-hidden="true" />}
                        <span className="font-bold flex-1">{toast.message}</span>
                        <button type="button" onClick={() => dismiss(toast.id)} aria-label="إغلاق الرسالة" className="shrink-0 rounded-full p-1 opacity-80 hover:bg-black/10 hover:opacity-100">
                            <X size={18} aria-hidden="true" />
                        </button>
                    </div>
                ))}
            </div>
        </UiContext.Provider>
    );
};

export const useUi = () => {
    const context = useContext(UiContext);
    if (!context) throw new Error('useUi must be used within UiProvider');
    return context;
};
