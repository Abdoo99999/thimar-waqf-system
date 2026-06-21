
import React, { useState } from 'react';
import { useUi } from '../contexts/UiContext';
import { authenticateInstitution } from '../services/db';
import { Lock, Building2, ArrowRight, KeyRound, AlertTriangle } from 'lucide-react';

const Login: React.FC = () => {
  const { login, showToast, setWaqfContext } = useUi();
  const [loginCode, setLoginCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      const institution = authenticateInstitution(loginCode, password);
      if (institution) {
        setWaqfContext(institution.id);
        login(institution.name, 'user');
        showToast(`مرحباً، ${institution.name}`, 'success');
      } else {
        showToast('رمز الدخول أو كلمة المرور غير صحيحة', 'error');
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] bg-gold-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] bg-teal-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative z-10">
        <div className="bg-navy-900 p-8 text-center border-b-4 border-gold-500">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl p-2 border-2 border-gray-100">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/5/52/Ministry_of_Endowments_and_Religious_Affairs_%28Oman%29_Logo.png"
              alt="Logo"
              className="w-full h-full object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-white mb-2 leading-tight">
            نظام تقييم المؤسسات الوقفية
          </h1>
          <p className="text-gray-300 text-sm font-medium tracking-wide opacity-90">
            وزارة الأوقاف والشؤون الدينية
          </p>
          <div className="mt-3 inline-flex items-center gap-2 bg-teal-900/60 border border-teal-700 rounded-full px-4 py-1.5">
            <Building2 size={14} className="text-teal-400" />
            <span className="text-teal-300 text-xs font-bold">دخول المؤسسة الوقفية – النسخة التجريبية</span>
          </div>
        </div>

        {/* Trial Warning */}
        <div className="mx-6 mt-5 bg-amber-50 border border-amber-300 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed font-medium">
            <strong>تنبيه:</strong> هذه نسخة تجريبية مخصصة لاختبار النظام وتقديم الملاحظات.
            يرجى عدم إدخال بيانات فعلية أو وثائق سرية.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="text-center mb-4">
            <h3 className="text-lg font-bold text-gray-800">مرحباً بك في بوابة الخدمات الوقفية</h3>
            <p className="text-sm text-gray-500 mt-1">أدخل رمز الدخول وكلمة المرور الخاصة بمؤسستك</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">رمز الدخول</label>
            <div className="relative">
              <KeyRound className="absolute top-3 right-3 text-gray-400" size={20} />
              <input
                type="text"
                required
                className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-600 outline-none transition-shadow uppercase"
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value)}
                placeholder="مثال: WQ001"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">كلمة المرور</label>
            <div className="relative">
              <Lock className="absolute top-3 right-3 text-gray-400" size={20} />
              <input
                type="password"
                required
                className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-600 outline-none transition-shadow"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            {loading ? <span className="animate-pulse">جاري التحقق...</span> : <><ArrowRight size={18} /> تسجيل الدخول</>}
          </button>

          <p className="text-center text-xs text-gray-400 pt-1">
            للحصول على بيانات الدخول، يرجى التواصل مع إدارة المشروع
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
