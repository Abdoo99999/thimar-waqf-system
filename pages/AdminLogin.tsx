
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUi } from '../contexts/UiContext';
import { ShieldCheck, User, Lock, ArrowRight } from 'lucide-react';

const AdminLogin: React.FC = () => {
  const { login, showToast, isAuthenticated, role, setWaqfContext } = useUi();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated && role === 'admin') {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, role, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().toLowerCase() === 'admin' && password === 'admin') {
      setWaqfContext('');
      login('مدير النظام', 'admin');
      showToast('مرحباً بك، مدير النظام', 'success');
      navigate('/', { replace: true });
    } else {
      showToast('بيانات الدخول غير صحيحة', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] bg-gold-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] bg-navy-800/30 rounded-full blur-3xl"></div>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative z-10">
        <div className="bg-navy-900 p-8 text-center border-b-4 border-gold-500">
          <div className="w-16 h-16 bg-navy-800 border-2 border-gold-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={32} className="text-gold-500" />
          </div>
          <h1 className="text-xl font-bold text-white mb-1">بوابة مدير النظام</h1>
          <p className="text-gray-400 text-sm">نظام تقييم المؤسسات الوقفية</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">اسم المستخدم</label>
            <div className="relative">
              <User className="absolute top-3 right-3 text-gray-400" size={20} />
              <input
                type="text"
                required
                className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-800 outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
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
                className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-navy-800 outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-navy-900 hover:bg-navy-800 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            دخول لوحة التحكم <ArrowRight size={18} />
          </button>
          <p className="text-center text-xs text-gray-400 pt-2">
            هذه الصفحة مخصصة لمديري النظام فقط
          </p>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
