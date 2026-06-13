
import React, { useState, useEffect } from 'react';
import { useUi } from '../contexts/UiContext';
import { getInstitutions } from '../services/db';
import { Institution } from '../types';
import { User, Lock, Building2, ShieldCheck, ArrowRight, ChevronDown } from 'lucide-react';

type LoginType = 'admin' | 'user';

const Login: React.FC = () => {
  const { login, showToast, setWaqfContext } = useUi();
  
  // Login State
  const [loginType, setLoginType] = useState<LoginType>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Institution Selection State
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInstId, setSelectedInstId] = useState('');

  // Load institutions for the dropdown
  useEffect(() => {
    setInstitutions(getInstitutions());
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (loginType === 'admin') {
        // --- ADMIN VALIDATION ---
        // Simple mock validation
        if (username.trim().toLowerCase() === 'admin' && password === 'admin') {
            // 1. Set Context (Admin has no specific Waqf context initially)
            setWaqfContext(''); 
            
            // 2. Perform Login
            login('مدير النظام', 'admin');
            showToast('مرحباً بك، مدير النظام', 'success');
        } else {
            showToast('بيانات المدير غير صحيحة (جرب admin/admin)', 'error');
        }
    } else {
        // --- INSTITUTION VALIDATION ---
        if (!selectedInstId) {
            showToast('يرجى اختيار المؤسسة من القائمة', 'error');
            return;
        }

        const selectedInst = institutions.find(i => i.id === selectedInstId);
        if (!selectedInst) return;

        // Mock password check (allow any password for demo ease, or enforce specific)
        if (password === '1234') {
            // 1. Set Global Context to the selected institution
            setWaqfContext(selectedInst.id);

            // 2. Perform Login with the Institution's Name
            login(selectedInst.name, 'user');
            
            showToast(`مرحباً، ${selectedInst.name}`, 'success');
        } else {
            showToast('كلمة المرور غير صحيحة (جرب 1234)', 'error');
        }
    }
  };

  const handleTabSwitch = (type: LoginType) => {
      setLoginType(type);
      setUsername(''); 
      setPassword('');
      setSelectedInstId('');
  };

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4" dir="rtl">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] bg-gold-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] bg-teal-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative z-10">
        {/* Header */}
        <div className="bg-navy-900 p-8 text-center border-b-4 border-gold-500">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-xl p-2 border-2 border-gray-100">
                <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/5/52/Ministry_of_Endowments_and_Religious_Affairs_%28Oman%29_Logo.png" 
                    alt="Logo" 
                    className="w-full h-full object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white mb-2 leading-tight">نظام تقييم المؤسسات الوقفية</h1>
            <p className="text-gray-300 text-sm font-medium tracking-wide opacity-90">وزارة الأوقاف والشؤون الدينية</p>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
            <button 
                type="button"
                onClick={() => handleTabSwitch('admin')}
                className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${loginType === 'admin' ? 'text-navy-900 bg-white border-b-2 border-navy-900 shadow-[inset_0_-2px_0_0_#0a1929]' : 'text-gray-400 bg-gray-50 hover:bg-gray-100'}`}
            >
                <ShieldCheck size={18} /> دخول مدير النظام
            </button>
            <button 
                type="button"
                onClick={() => handleTabSwitch('user')}
                className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-all ${loginType === 'user' ? 'text-teal-700 bg-white border-b-2 border-teal-600 shadow-[inset_0_-2px_0_0_#0d9488]' : 'text-gray-400 bg-gray-50 hover:bg-gray-100'}`}
            >
                <Building2 size={18} /> دخول المؤسسة الوقفية
            </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div className="text-center mb-6">
                <h3 className="text-lg font-bold text-gray-800">
                    {loginType === 'admin' ? 'مرحباً بك في لوحة التحكم المركزية' : 'مرحباً بك في بوابة الخدمات الوقفية'}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                    {loginType === 'admin' ? 'يرجى إدخال بيانات المشرف العام' : 'اختر المؤسسة للوصول إلى بياناتها'}
                </p>
            </div>

            {/* Inputs based on Role */}
            {loginType === 'admin' ? (
                // ADMIN INPUTS
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">اسم المستخدم</label>
                    <div className="relative">
                        <User className="absolute top-3 right-3 text-gray-400" size={20} />
                        <input 
                            type="text" 
                            required
                            className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-800 outline-none transition-shadow"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin"
                        />
                    </div>
                </div>
            ) : (
                // INSTITUTION INPUTS (DROPDOWN)
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">اختر المؤسسة</label>
                    <div className="relative">
                        <select 
                            required
                            className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-600 outline-none transition-shadow appearance-none bg-white"
                            value={selectedInstId}
                            onChange={(e) => setSelectedInstId(e.target.value)}
                        >
                            <option value="">-- اختر المؤسسة من القائمة --</option>
                            {institutions.map(inst => (
                                <option key={inst.id} value={inst.id}>{inst.name}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute top-3.5 left-3 text-gray-400 pointer-events-none" size={18} />
                        <Building2 className="absolute top-3 right-3 text-gray-400" size={20} />
                    </div>
                </div>
            )}

            {/* Password Field (Shared) */}
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">كلمة المرور</label>
                <div className="relative">
                    <Lock className="absolute top-3 right-3 text-gray-400" size={20} />
                    <input 
                        type="password" 
                        required
                        className={`w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 outline-none transition-shadow ${loginType === 'admin' ? 'focus:ring-navy-800' : 'focus:ring-teal-600'}`}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                    />
                </div>
            </div>
            
            <button 
                type="submit" 
                className={`w-full font-bold py-3 rounded-lg shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 text-white
                    ${loginType === 'admin' ? 'bg-navy-900 hover:bg-navy-800' : 'bg-teal-600 hover:bg-teal-700'}
                `}
            >
                تسجيل الدخول <ArrowRight size={18} />
            </button>
            
            {/* Mock Data Hint */}
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-center text-gray-500">
                <p className="font-bold mb-2">بيانات الدخول (تجريبية):</p>
                <div className="flex justify-center gap-4">
                    {loginType === 'admin' ? (
                        <div className="text-navy-900 font-bold">
                            Admin: <span className="font-mono">admin / admin</span>
                        </div>
                    ) : (
                        <div className="text-teal-700 font-bold">
                            Password: <span className="font-mono">1234</span>
                        </div>
                    )}
                </div>
            </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
