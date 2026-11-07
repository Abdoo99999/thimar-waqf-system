import React, { useEffect, useState } from 'react';
import { KeyRound, Copy, CheckCircle, Download, X } from 'lucide-react';
import { changePassword } from '../services/db';

// ─── تغيير كلمة المرور ──────────────────────────────────────────────────────
export const ChangePasswordModal: React.FC<{ forced: boolean; onClose: () => void; onDone: () => void }> = ({ forced, onClose, onDone }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 8) return setError('كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف');
    if (next !== confirm) return setError('تأكيد كلمة المرور غير مطابق');
    setSaving(true);
    try {
      await changePassword(current, next);
      onDone();
    } catch (err: any) {
      setError(err?.message || 'تعذر تغيير كلمة المرور');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none';
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] p-4" dir="rtl">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
            <KeyRound size={22} className="text-teal-700" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-navy-900">تغيير كلمة المرور</h3>
            {forced && <p className="text-sm text-gray-500">يجب تغيير كلمة المرور المؤقتة قبل المتابعة</p>}
          </div>
          {!forced && (
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          )}
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">كلمة المرور الحالية</label>
          <input type="password" required autoComplete="current-password" className={input} value={current} onChange={e => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">كلمة المرور الجديدة (8 أحرف على الأقل)</label>
          <input type="password" required autoComplete="new-password" className={input} value={next} onChange={e => setNext(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">تأكيد كلمة المرور الجديدة</label>
          <input type="password" required autoComplete="new-password" className={input} value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={saving} className="w-full bg-navy-900 hover:bg-navy-800 disabled:opacity-60 text-white font-bold py-3 rounded-lg">
          {saving ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
        </button>
      </form>
    </div>
  );
};

// ─── عرض بيانات الدخول الجديدة (تظهر مرة واحدة) ────────────────────────────
export interface CredentialRow { institution_id: string; login_code: string; password: string; name?: string; }

export const downloadCredentialsCsv = (rows: CredentialRow[]) => {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + ['اسم المؤسسة,رمز الدخول,كلمة المرور', ...rows.map(r => [esc(r.name || ''), esc(r.login_code), esc(r.password)].join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `waqf-credentials-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const CredentialsModal: React.FC = () => {
  const [state, setState] = useState<{ title: string; accounts: CredentialRow[] } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onShow = (e: Event) => setState((e as CustomEvent).detail);
    window.addEventListener('showCredentials', onShow);
    return () => window.removeEventListener('showCredentials', onShow);
  }, []);

  if (!state) return null;

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[90vh] flex flex-col">
        <h3 className="text-lg font-bold text-navy-900 mb-1">{state.title}</h3>
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          كلمات المرور تظهر الآن فقط ولا تُحفظ إلا مشفّرة. انسخها أو نزّلها قبل الإغلاق، وسلّمها لكل مؤسسة عبر قناة آمنة.
          سيُطلب من المؤسسة تغييرها عند أول دخول.
        </p>
        <div className="overflow-auto border border-gray-200 rounded-xl flex-1">
          <table className="w-full text-sm">
            <thead className="bg-navy-900 text-white sticky top-0">
              <tr>
                <th className="px-3 py-2 text-right">المؤسسة</th>
                <th className="px-3 py-2 text-center">رمز الدخول</th>
                <th className="px-3 py-2 text-center">كلمة المرور</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {state.accounts.map(a => (
                <tr key={a.institution_id}>
                  <td className="px-3 py-2 text-navy-900">{a.name || '—'}</td>
                  <td className="px-3 py-2 text-center font-mono font-bold">{a.login_code}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded select-all">{a.password}</span>
                    <button onClick={() => copy(`${a.login_code} / ${a.password}`, a.institution_id)} className="mr-2 text-gray-400 hover:text-teal-600 align-middle">
                      {copied === a.institution_id ? <CheckCircle size={14} className="text-teal-600" /> : <Copy size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={() => downloadCredentialsCsv(state.accounts)} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
            <Download size={16} /> تنزيل كملف Excel (CSV)
          </button>
          <button onClick={() => setState(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl">
            تم، أغلق
          </button>
        </div>
      </div>
    </div>
  );
};
