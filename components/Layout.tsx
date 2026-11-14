
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, ClipboardCheck, Scale, FileBarChart, Menu, X, ShieldAlert, Settings, LogOut, Lock, Send, Inbox, CheckCircle, RotateCcw, Landmark, RefreshCw, AlertTriangle, MessageSquarePlus, MessageSquare, KeyRound, Shield, Home, ListChecks } from 'lucide-react';
import { getSession, getSettings, getInstitutionProgress, getPendingEvaluationsCount, getEvaluationByInstAndYear, saveEvaluation, getUnreadFeedbackCount, getUnseenRepliesCount, getInstitutions } from '../services/db';
import { CURRENT_YEAR } from '../constants';
import { useUi } from '../contexts/UiContext';
import { ChangePasswordModal, CredentialsModal } from './AccountModals';

// Helper to determine if a route is locked
// STRICT SEQUENTIAL LOGIC applied here to match App.tsx
const isRouteLocked = (path: string, role: string | null, progress: any) => {
    if (role === 'admin') return false; // Admin can access everything
    
    // --- 1. POST-SUBMISSION LOCKDOWN (The requested feature) ---
    // If the workflow is Submitted or Approved, lock all INPUT pages.
    if (progress.isLocked) {
        // Allow ONLY these pages:
        // - Review/Submit: To see status message.
        // - Improvements: To work on action plan.
        // - Reports: To view results (Read Only).
        const allowedPaths = ['/review-submit', '/improvements', '/reports', '/feedback'];
        
        if (allowedPaths.includes(path)) {
            return false; // Allowed
        }
        
        return true; // Lock Institutions, Financials, Evaluation, Compliance, Settings
    }

    // --- 2. DRAFT PHASE PROGRESSIVE LOGIC ---
    // 1. /institutions -> Always Open (Start)
    
    // 2. /financial-reports -> Locked if Data Not Complete
    if (path === '/financial-reports' && !progress.dataComplete) return true;
    
    // 3. /evaluation -> Locked if Financials Not Done
    if (path === '/evaluation' && (!progress.dataComplete || !progress.financialsDone)) return true;
    
    // 4. /compliance -> Locked if Evaluation Not Finalized
    if (path === '/compliance' && !progress.evalFinalized) return true;
    
    // 5. /improvements & /review-submit -> Locked if Compliance Not Done
    if (path === '/improvements' && !progress.complianceDone) return true;
    if (path === '/review-submit' && !progress.complianceDone) return true;
    
    return false;
};

const SidebarItem = ({ to, icon: Icon, label, active, locked, badge }: any) => (
  <Link 
    to={locked ? '#' : to} 
    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ease-in-out transform
        ${active ? 'bg-navy-800 text-gold-400 scale-105 shadow-lg' : 'text-white hover:bg-navy-800/50 hover:scale-105 hover:translate-x-1'} 
        ${locked ? 'opacity-50 cursor-not-allowed grayscale hover:scale-100 hover:translate-x-0' : ''}
    `}
    onClick={(e) => locked && e.preventDefault()}
  >
    <div className="relative">
        <Icon size={20} className={`transition-transform duration-300 ${active ? 'scale-110' : ''}`} />
        {badge > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full animate-pulse">
                {badge}
            </span>
        )}
    </div>
    <span className="font-medium flex-1">{label}</span>
    {locked && <Lock size={14} className="text-gray-400" />}
  </Link>
);

const AdminActionBar = ({ waqfId, showToast }: any) => {
    const [ev, setEv] = useState<any>(null);
    const [showReturnModal, setShowReturnModal] = useState(false);
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if(waqfId) {
            const evaluation = getEvaluationByInstAndYear(waqfId, CURRENT_YEAR);
            setEv(evaluation);
        }
    }, [waqfId]);

    if (!ev || ev.workflow_status !== 'submitted') return null;

    const confirmApprove = () => {
        const updatedEv = {...ev, workflow_status: 'approved'};
        saveEvaluation(updatedEv);
        showToast('تم اعتماد الأداء المؤسسي بنجاح', 'success');
        setEv(updatedEv); // Updates local state to remove the bar immediately
        setShowApproveModal(false);
    };

    const confirmReturn = () => {
        if(!reason.trim()) { 
            showToast('يرجى كتابة سبب الإعادة', 'error'); 
            return; 
        }
        const updatedEv = {...ev, workflow_status: 'returned', admin_feedback: reason};
        saveEvaluation(updatedEv);
        showToast('تم إعادة الملف للمؤسسة للتعديل', 'info');
        setEv(updatedEv); // Updates local state to remove the bar immediately
        setShowReturnModal(false);
        setReason('');
    };

    return (
        <div className="bg-navy-900 text-white p-3 px-4 md:px-6 flex flex-col sm:flex-row gap-2 sm:gap-0 justify-between items-start sm:items-center shadow-lg animate-slideDown z-30 sticky top-0 border-b border-navy-800">
            <div className="flex items-center gap-2">
                <Lock size={18} className="text-gold-500 shrink-0" />
                <span className="font-bold text-sm">هذا الملف قيد المراجعة (للاعتماد)</span>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
                <button 
                    type="button"
                    onClick={() => setShowReturnModal(true)}
                    className="flex-1 sm:flex-none bg-red-700 hover:bg-red-800 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                >
                    <RotateCcw size={15} /> <span className="hidden sm:inline">إعادة للتعديل</span><span className="sm:hidden">إعادة</span>
                </button>
                <button 
                    type="button"
                    onClick={() => setShowApproveModal(true)}
                    className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-md active:scale-95"
                >
                    <CheckCircle size={15} /> <span className="hidden sm:inline">اعتماد الأداء المؤسسي</span><span className="sm:hidden">اعتماد</span>
                </button>
            </div>

            {/* Return Modal */}
            {showReturnModal && (
                <div className="fixed inset-0 bg-navy-900/70 z-[60] flex items-center justify-center p-4 text-gray-800 backdrop-blur-sm">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md animate-scaleIn shadow-2xl">
                        <div className="flex items-center gap-3 text-red-600 mb-4">
                            <div className="p-2 bg-red-100 rounded-full"><RotateCcw size={24} /></div>
                            <h3 className="font-bold text-lg text-gray-900">إعادة الملف للتعديل</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">يرجى توضيح أسباب الإعادة للمؤسسة:</p>
                        <textarea 
                            className="w-full border p-3 rounded-lg h-32 mb-4 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-red-500 outline-none transition-all" 
                            placeholder="اكتب الملاحظات هنا..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => setShowReturnModal(false)} className="text-gray-500 hover:bg-gray-100 px-4 py-2 rounded-lg font-bold transition-colors">إلغاء</button>
                            <button type="button" onClick={confirmReturn} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-bold shadow-md transition-colors">تأكيد الإعادة</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Approve Modal */}
            {showApproveModal && (
                <div className="fixed inset-0 bg-navy-900/70 z-[60] flex items-center justify-center p-4 text-gray-800 backdrop-blur-sm">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md animate-scaleIn shadow-2xl border-t-4 border-green-500">
                        <div className="flex items-center gap-3 text-green-600 mb-4">
                            <div className="p-2 bg-green-100 rounded-full"><CheckCircle size={24} /></div>
                            <h3 className="font-bold text-lg text-gray-900">اعتماد الأداء المؤسسي النهائي</h3>
                        </div>
                        <p className="text-gray-600 mb-6 leading-relaxed font-medium">
                            هل أنت متأكد من رغبتك في اعتماد نتيجة الأداء المؤسسي لهذه المؤسسة؟
                            <br/>
                            <span className="text-xs text-gray-400 font-normal">عند الاعتماد، ستظهر النتيجة النهائية للمؤسسة ولن يمكنهم إجراء تعديلات إضافية.</span>
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button type="button" onClick={() => setShowApproveModal(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg font-bold transition-colors">إلغاء</button>
                            <button type="button" onClick={confirmApprove} className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold shadow-md transition-colors">نعم، اعتماد</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settings, setSettings] = useState(getSettings());
  const { isAuthenticated, logout, user, role, currentWaqfId, showToast } = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const [pwModal, setPwModal] = useState<'none' | 'optional' | 'forced'>(() => getSession().must_change_password ? 'forced' : 'none');

  // بعد الدخول بكلمة مرور مؤقتة: إلزام المؤسسة بتغييرها
  useEffect(() => {
    if (isAuthenticated && getSession().must_change_password) setPwModal('forced');
  }, [isAuthenticated, location.pathname]);

  // Auto-close sidebar on navigation (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Get Progress for User
  // Force re-calculation on location change to keep locks updated
  const progress = getInstitutionProgress(currentWaqfId);
  const pendingCount = role === 'admin' ? getPendingEvaluationsCount() : 0;
  const unreadFeedback = role === 'admin' ? getUnreadFeedbackCount() : 0;
  const [, setRepliesTick] = useState(0);
  useEffect(() => {
    const onSeen = () => setRepliesTick(t => t + 1);
    window.addEventListener('feedbackRepliesSeen', onSeen);
    return () => window.removeEventListener('feedbackRepliesSeen', onSeen);
  }, []);
  const unseenReplies = role === 'user' ? getUnseenRepliesCount() : 0;

  useEffect(() => {
    // Apply Dark Mode
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    const handleSettingsChange = () => {
        const newSettings = getSettings();
        setSettings(newSettings);
        if (newSettings.darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };
    window.addEventListener('settingsChanged', handleSettingsChange);
    return () => window.removeEventListener('settingsChanged', handleSettingsChange);
  }, [settings.darkMode]);

  // If not authenticated, render children directly (Login page handles its own layout mostly)
  if (!isAuthenticated) {
      return <>{children}</>;
  }

  // Define All Routes with Roles
  const allNavItems = [
    { to: '/home', icon: Home, label: 'الرئيسية', roles: ['user'] },
    { to: '/dashboard', icon: LayoutDashboard, label: 'الرئيسية (القيادة)', roles: ['admin'] },
    { to: '/tracking', icon: ListChecks, label: 'متابعة المؤسسات', roles: ['admin'] },
    { to: '/approval-requests', icon: Inbox, label: 'طلبات الاعتماد', roles: ['admin'], badge: pendingCount },
    { to: '/system-feedback', icon: MessageSquare, label: 'ملاحظات النظام', roles: ['admin'], badge: unreadFeedback },
    { to: '/accounts', icon: KeyRound, label: 'حسابات المؤسسات', roles: ['admin'] },
    { to: '/institutions', icon: Building2, label: role === 'admin' ? 'بيانات المؤسسات' : 'بيانات المؤسسة', roles: ['admin', 'user'] },
    { to: '/financial-reports', icon: Landmark, label: 'القوائم المالية', roles: ['admin', 'user'] },
    { to: '/evaluation', icon: ClipboardCheck, label: 'الأداء المؤسسي', roles: ['admin', 'user'] },
    { to: '/compliance', icon: Scale, label: 'الامتثال والمخاطر', roles: ['admin', 'user'] },
    { to: '/improvements', icon: ShieldAlert, label: 'خطة التحسين', roles: ['admin', 'user'] },
    { to: '/reports', icon: FileBarChart, label: 'النتائج والتقارير', roles: ['admin'] },
    { to: '/settings', icon: Settings, label: 'إعدادات النظام', roles: ['admin'] },
    { to: '/review-submit', icon: Send, label: 'المراجعة والإرسال', roles: ['user'] },
    { to: '/feedback', icon: MessageSquarePlus, label: 'إبداء ملاحظة على النظام', roles: ['user'], badge: unseenReplies },
  ];

  // Filter based on current role
  const navItems = allNavItems.filter(item => role && item.roles.includes(role));
  const selectedInstitution = role === 'admin' && currentWaqfId ? getInstitutions().find(i => i.id === currentWaqfId) : null;
  const renderNavItem = (item: typeof allNavItems[number]) => (
    <SidebarItem key={item.to} {...item} active={location.pathname === item.to}
      locked={item.to === '/home' ? false : isRouteLocked(item.to, role, progress)} />
  );

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900 overflow-hidden font-sans text-right" dir="rtl">
      {/* Sidebar - Desktop */}
      <aside className={`fixed inset-y-0 right-0 z-50 h-[100dvh] max-h-[100dvh] w-64 flex flex-col bg-navy-900 dark:bg-black text-white transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 shadow-2xl ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between p-4 border-b border-navy-800 min-h-[5rem]">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 min-w-[2.5rem] bg-white rounded-full p-1 overflow-hidden flex items-center justify-center shadow-md transition-transform hover:scale-110 duration-300">
                 <img 
                    src="/logo-emblem.png" 
                    className="w-full h-full object-contain" 
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                 />
             </div>
             <div className="flex flex-col">
                 <h1 className="text-sm font-bold text-white leading-tight">نظام تقييم المؤسسات الوقفية</h1>
                 <span className="text-[10px] text-gray-400 mt-1 font-medium">وزارة الأوقاف والشؤون الدينية</span>
             </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-white transition-transform hover:rotate-90">
            <X size={24} />
          </button>
        </div>

        {/* User Role Badge */}
        <div className="px-4 mt-4">
            <div className={`p-2 rounded-lg text-center text-xs font-bold border transform hover:scale-105 transition-transform duration-300 ${role === 'admin' ? 'bg-navy-800 border-navy-700 text-gold-400' : 'bg-teal-900/50 border-teal-800 text-teal-400'}`}>
                {role === 'admin' ? 'صلاحية: مدير النظام' : 'صلاحية: مؤسسة وقفية'}
            </div>
        </div>
        
        <nav className="p-4 pb-6 space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain mt-2 scrollbar-thin scrollbar-thumb-navy-700">
          {role === 'admin' ? (
            <>
              <p className="px-4 pt-2 text-xs font-bold text-gray-400">الإدارة</p>
              {['/dashboard', '/tracking', '/approval-requests', '/institutions'].map(path => renderNavItem(navItems.find(item => item.to === path)!))}
              {currentWaqfId ? (
                <>
                  <p className="px-4 pt-5 text-xs font-bold text-gray-400">المؤسسة المختارة</p>
                  <div className="mx-2 flex items-start justify-between gap-2 rounded-lg border border-navy-700 bg-navy-800 p-3">
                    <span className="min-w-0 break-words text-xs font-bold text-white">{selectedInstitution?.name || 'المؤسسة المختارة'}</span>
                    <Link to="/tracking" className="shrink-0 text-xs font-bold text-teal-400 hover:underline">تغيير</Link>
                  </div>
                  {['/financial-reports', '/evaluation', '/compliance', '/improvements', '/reports'].map(path => renderNavItem(navItems.find(item => item.to === path)!))}
                </>
              ) : <p className="px-4 py-5 text-xs leading-relaxed text-gray-400">اختر مؤسسة من متابعة المؤسسات</p>}
              <p className="px-4 pt-5 text-xs font-bold text-gray-400">النظام</p>
              {['/system-feedback', '/accounts', '/settings'].map(path => renderNavItem(navItems.find(item => item.to === path)!))}
            </>
          ) : navItems.map(renderNavItem)}
          <button
            onClick={() => setPwModal('optional')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 text-gray-300 hover:bg-navy-800 hover:text-white mt-4"
          >
             <KeyRound size={20} />
             <span className="font-medium">تغيير كلمة المرور</span>
          </button>
        </nav>
        <div className="shrink-0 w-full p-4 border-t border-navy-800 text-xs text-gray-400 text-center">
          <p>{settings.orgName}</p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm z-10 border-b border-gray-200 dark:border-gray-700 min-h-[4rem] flex items-center px-4 md:px-6 justify-between print:hidden">
            <button
                type="button"
                onClick={logout}
                className="shrink-0 flex items-center gap-2 p-2 text-red-600 hover:bg-red-50 rounded-lg"
                aria-label="تسجيل الخروج"
                title="تسجيل الخروج"
            >
                <LogOut size={20} />
                <span className="hidden md:inline text-sm font-bold">تسجيل الخروج</span>
            </button>
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-600 dark:text-gray-200 transition-transform hover:scale-110 p-1 ml-2">
                <Menu size={24} />
            </button>
            
            <div className="flex flex-col items-center flex-1 lg:flex-none lg:items-start min-w-0">
                <h2 className="text-base md:text-xl font-bold text-navy-900 dark:text-white truncate">نظام تقييم المؤسسات الوقفية</h2>
                <span className="text-xs text-teal-600 dark:text-teal-400 font-semibold hidden sm:block">سلطنة عُمان - {settings.orgName}</span>
            </div>

            <div className="flex items-center gap-2 md:gap-4 mr-2">
                <button 
                  onClick={() => window.location.reload()}
                  className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-all"
                  title="تحديث سريع"
                >
                    <RefreshCw size={18} />
                </button>

                <div className="hidden md:block text-left">
                   <p className="text-sm font-bold text-navy-900 dark:text-white">أهلاً، {user}</p>
                   <p className="text-xs text-gold-600 dark:text-gold-400">{role === 'admin' ? 'مدير النظام' : 'مستخدم مؤسسة'}</p>
                </div>
                <div className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-white shadow-md shrink-0 ${role === 'admin' ? 'bg-navy-800' : 'bg-teal-600'}`}>
                    {role === 'admin' ? <Shield size={19} /> : (user?.trim().split(/\s+/).find(word => word !== 'مؤسسة' && word !== 'مدير')?.charAt(0) || user?.charAt(0))?.toUpperCase()}
                </div>
            </div>
        </header>

        {/* ADMIN ACTION BAR (CONDITIONAL) */}
        {role === 'admin' && currentWaqfId && <AdminActionBar waqfId={currentWaqfId} showToast={showToast} />}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 relative dark:text-gray-100">
          {children}
          
          {/* Footer - Print Only */}
          <div className="hidden print:block fixed bottom-0 left-0 right-0 text-center p-4 border-t text-sm">
             <p>تم استخراج هذا التقرير آلياً من نظام تقييم المؤسسات الوقفية</p>
          </div>
        </main>
      </div>

      {pwModal !== 'none' && (
        <ChangePasswordModal
          forced={pwModal === 'forced'}
          onClose={() => setPwModal('none')}
          onDone={() => { setPwModal('none'); showToast('تم تغيير كلمة المرور بنجاح', 'success'); }}
        />
      )}
      <CredentialsModal />

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}></div>
      )}
    </div>
  );
};

export default Layout;
