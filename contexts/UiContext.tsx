
import React, { createContext, useContext, useState, useEffect } from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import { CURRENT_YEAR } from '../constants';

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

export type UserRole = 'admin' | 'user';

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
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<string | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    
    // Initialize from LocalStorage
    const [currentWaqfId, setCurrentWaqfId] = useState<string | null>(() => {
        return localStorage.getItem('currentWaqfContext');
    });

    // Global Year State (Default to Constant CURRENT_YEAR)
    const [currentYear, setCurrentYear] = useState<number>(CURRENT_YEAR);

    // Load auth state
    useEffect(() => {
        const storedUser = localStorage.getItem('waqf_user');
        const storedRole = localStorage.getItem('waqf_role');
        if (storedUser && storedRole) {
            setUser(storedUser);
            setRole(storedRole as UserRole);
            setIsAuthenticated(true);
        }
    }, []);

    const login = (username: string, role: UserRole) => {
        localStorage.setItem('waqf_user', username);
        localStorage.setItem('waqf_role', role);
        setUser(username);
        setRole(role);
        setIsAuthenticated(true);
    };

    const logout = () => {
        localStorage.removeItem('waqf_user');
        localStorage.removeItem('waqf_role');
        localStorage.removeItem('currentWaqfContext'); // Clear context on logout
        setUser(null);
        setRole(null);
        setCurrentWaqfId(null);
        setIsAuthenticated(false);
    };

    const setWaqfContext = (id: string) => {
        // Institution users: once set, cannot change to a different institution
        if (role === 'user' && currentWaqfId && id !== currentWaqfId) return;
        localStorage.setItem('currentWaqfContext', id);
        setCurrentWaqfId(id);
    };

    const setYearContext = (year: number) => {
        setCurrentYear(year);
    };

    const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    };

    return (
        <UiContext.Provider value={{ showToast, isAuthenticated, login, logout, user, role, currentWaqfId, setWaqfContext, currentYear, setYearContext }}>
            {children}
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-md px-4">
                {toasts.map(toast => (
                    <div key={toast.id} className={`toast-enter flex items-center gap-3 p-4 rounded-xl shadow-2xl border ${
                        toast.type === 'success' ? 'bg-navy-900 text-white border-teal-500' : 
                        toast.type === 'error' ? 'bg-red-600 text-white border-red-400' : 'bg-white text-gray-800 border-gray-200'
                    }`}>
                        {toast.type === 'success' && <CheckCircle className="text-teal-400" size={24} />}
                        {toast.type === 'error' && <XCircle className="text-white" size={24} />}
                        {toast.type === 'info' && <Info className="text-blue-500" size={24} />}
                        <span className="font-bold">{toast.message}</span>
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
