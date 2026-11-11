
import React, { Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { UiProvider, useUi } from './contexts/UiContext';
import { getInstitutionProgress, dbReady } from './services/db';
import { Lock, Loader2 } from 'lucide-react';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Institutions = lazy(() => import('./pages/Institutions'));
const EvaluationPage = lazy(() => import('./pages/Evaluation'));
const CompliancePage = lazy(() => import('./pages/Compliance'));
const Reports = lazy(() => import('./pages/Reports'));
const Improvements = lazy(() => import('./pages/Improvements'));
const Settings = lazy(() => import('./pages/Settings'));
const ReviewSubmit = lazy(() => import('./pages/ReviewSubmit'));
const ApprovalRequests = lazy(() => import('./pages/ApprovalRequests'));
const FinancialReports = lazy(() => import('./pages/FinancialReports'));
const Feedback = lazy(() => import('./pages/Feedback'));
const SystemFeedbackPage = lazy(() => import('./pages/SystemFeedback'));

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center h-[80vh] text-navy-800">
    <Loader2 size={48} className="animate-spin mb-4 text-teal-600" />
    <p className="text-gray-500 font-bold">جاري تحميل النظام...</p>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode; requiredRole?: 'admin' | 'user' }> = ({ children, requiredRole }) => {
  const { isAuthenticated, role } = useUi();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (requiredRole === 'admin' && role !== 'admin') return <Navigate to="/institutions" replace />;
  if (requiredRole === 'user' && role !== 'user') return <Navigate to="/" replace />;
  return <>{children}</>;
};

const SequentialRoute: React.FC<{
  children: React.ReactNode;
  prereq: 'data' | 'financials' | 'evaluation' | 'compliance';
}> = ({ children, prereq }) => {
  const { role, currentWaqfId } = useUi();
  const progress = getInstitutionProgress(currentWaqfId);

  if (role === 'admin') return <>{children}</>;

  let isAllowed = false;
  let redirectPath = '/institutions';
  let message = 'يرجى استكمال البيانات السابقة أولاً';

  if (prereq === 'data') {
    isAllowed = progress.dataComplete;
    redirectPath = '/institutions';
    message = 'يرجى استكمال وحفظ بيانات المؤسسة أولاً للدخول إلى التقارير المالية.';
  } else if (prereq === 'financials') {
    isAllowed = progress.dataComplete && progress.financialsDone;
    redirectPath = '/financial-reports';
    message = 'يرجى استكمال وحفظ التقارير والقوائم المالية أولاً للدخول إلى الأداء المؤسسي.';
  } else if (prereq === 'evaluation') {
    isAllowed = progress.evalFinalized;
    redirectPath = '/evaluation';
    message = 'يرجى اعتماد الأداء المؤسسي النهائي أولاً للدخول إلى الامتثال والمخاطر.';
  } else if (prereq === 'compliance') {
    isAllowed = progress.complianceDone;
    redirectPath = '/compliance';
    message = 'يرجى مراجعة صفحة الامتثال والمخاطر أولاً.';
  }

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-xl shadow-sm border border-gray-100 mt-10 mx-auto max-w-2xl animate-fadeIn">
        <div className="bg-gray-100 p-6 rounded-full mb-6">
          <Lock size={48} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-navy-900 mb-2">هذه الصفحة مغلقة حالياً</h2>
        <p className="text-gray-500 mb-8 max-w-md">{message}</p>
        <a href={`#${redirectPath}`} className="bg-navy-800 text-white px-6 py-3 rounded-lg hover:bg-navy-900 font-bold shadow-lg transition-transform active:scale-95">
          الذهاب للخطوة السابقة
        </a>
      </div>
    );
  }

  return <>{children}</>;
};

// المدير المسجل يبقى داخل لوحة التحكم عند فتح الرابط الرئيسي.
const HomeRedirect: React.FC = () => {
  const { isAuthenticated, role } = useUi();
  if (isAuthenticated && role === 'admin') return <Navigate to="/dashboard" replace />;
  return <Login />;
};

const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/dashboard" element={<ProtectedRoute requiredRole="admin"><Dashboard /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute requiredRole="admin"><Reports /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute requiredRole="admin"><Settings /></ProtectedRoute>} />
        <Route path="/approval-requests" element={<ProtectedRoute requiredRole="admin"><ApprovalRequests /></ProtectedRoute>} />
        <Route path="/system-feedback" element={<ProtectedRoute requiredRole="admin"><SystemFeedbackPage /></ProtectedRoute>} />
        <Route path="/institutions" element={<ProtectedRoute><Institutions /></ProtectedRoute>} />
        <Route path="/feedback" element={<ProtectedRoute requiredRole="user"><Feedback /></ProtectedRoute>} />
        <Route path="/financial-reports" element={
          <ProtectedRoute>
            <SequentialRoute prereq="data"><FinancialReports /></SequentialRoute>
          </ProtectedRoute>
        } />
        <Route path="/evaluation" element={
          <ProtectedRoute>
            <SequentialRoute prereq="financials"><EvaluationPage /></SequentialRoute>
          </ProtectedRoute>
        } />
        <Route path="/compliance" element={
          <ProtectedRoute>
            <SequentialRoute prereq="evaluation"><CompliancePage /></SequentialRoute>
          </ProtectedRoute>
        } />
        <Route path="/improvements" element={
          <ProtectedRoute>
            <SequentialRoute prereq="compliance"><Improvements /></SequentialRoute>
          </ProtectedRoute>
        } />
        <Route path="/review-submit" element={
          <ProtectedRoute>
            <SequentialRoute prereq="compliance"><ReviewSubmit /></SequentialRoute>
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

const DbLoader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    dbReady.then(() => setIsReady(true), () => setIsReady(true));
  }, []);

  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-navy-900">
        <Loader2 size={52} className="animate-spin mb-5 text-teal-400" />
        <p className="text-white text-lg font-bold">جاري تحميل النظام...</p>
        <p className="text-gray-400 text-sm mt-2">يتم الاتصال بقاعدة البيانات</p>
      </div>
    );
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <DbLoader>
      <UiProvider>
        <Router>
          <Routes>
            {/* Institution login - outside Layout, no auth required */}
            <Route path="/" element={<HomeRedirect />} />
            {/* Admin login - outside Layout, no auth required */}
            <Route path="/admin-login" element={<Navigate to="/" replace />} />
            {/* All other routes use Layout */}
            <Route path="*" element={
              <Layout>
                <AppRoutes />
              </Layout>
            } />
          </Routes>
        </Router>
      </UiProvider>
    </DbLoader>
  );
};

export default App;
