import React, { useEffect, useMemo, useState } from 'react';
import DeadlineNotice from '../components/DeadlineNotice';
import { getDeadline } from '../utils/deadline';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  Filter,
  MapPin,
  Search,
  Send,
  RotateCcw,
  CircleDashed,
} from 'lucide-react';
import { GOVERNORATES } from '../constants';
import { getInstitutions } from '../services/db';
import { useUi } from '../contexts/UiContext';
import type { Institution } from '../types';
import {
  getInstitutionProgressSummary,
  JOURNEY_STEPS,
  type WorkflowStatus,
  WORKFLOW_STATUS_META,
} from '../utils/institutionJourney';

declare global {
  interface Window {
    XLSX?: any;
  }
}

type SummaryStatus = 'not-started' | 'in-progress' | WorkflowStatus;
type TrackingItem = ReturnType<typeof getInstitutionProgressSummary> & { institution: Institution };

const SUMMARY_TILES: { key: SummaryStatus | 'all'; label: string; icon: React.ReactNode; accent: string }[] = [
  { key: 'all', label: 'الإجمالي', icon: <Building2 size={17} />, accent: 'text-[#31595a] bg-[#e8f1ef]' },
  { key: 'not-started', label: 'لم تبدأ', icon: <CircleDashed size={17} />, accent: 'text-stone-600 bg-stone-100' },
  { key: 'in-progress', label: 'قيد التعبئة', icon: <ClipboardList size={17} />, accent: 'text-amber-700 bg-amber-50' },
  { key: 'submitted', label: 'مرفوعة', icon: <Send size={16} />, accent: 'text-sky-700 bg-sky-50' },
  { key: 'returned', label: 'مُعادة', icon: <RotateCcw size={16} />, accent: 'text-orange-700 bg-orange-50' },
  { key: 'approved', label: 'معتمدة', icon: <CheckCircle2 size={17} />, accent: 'text-emerald-700 bg-emerald-50' },
];

const Tracking: React.FC = () => {
  const navigate = useNavigate();
  const { setWaqfContext, showToast } = useUi();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SummaryStatus | 'all'>('all');
  const [governorate, setGovernorate] = useState('all');

  const loadInstitutions = () => {
    setLoading(true);
    try {
      setInstitutions(getInstitutions());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstitutions();
  }, []);

  const rows = useMemo<TrackingItem[]>(() => institutions.map(institution => ({
    institution,
    ...getInstitutionProgressSummary(institution),
  })), [institutions]);

  const counts = useMemo(() => ({
    all: rows.length,
    'not-started': rows.filter(item => item.summaryStatus === 'not-started').length,
    'in-progress': rows.filter(item => item.summaryStatus === 'in-progress').length,
    submitted: rows.filter(item => item.summaryStatus === 'submitted').length,
    returned: rows.filter(item => item.summaryStatus === 'returned').length,
    approved: rows.filter(item => item.summaryStatus === 'approved').length,
  }), [rows]);

  const filteredRows = useMemo(() => rows.filter(({ institution, summaryStatus }) => {
    const matchesName = institution.name.toLocaleLowerCase('ar').includes(search.trim().toLocaleLowerCase('ar'));
    const matchesStatus = statusFilter === 'all' || summaryStatus === statusFilter;
    const matchesGovernorate = governorate === 'all' || institution.governorate === governorate;
    return matchesName && matchesStatus && matchesGovernorate;
  }), [rows, search, statusFilter, governorate]);

  const openInstitution = (id: string) => {
    setWaqfContext(id);
    navigate('/institutions');
  };

  const exportExcel = () => {
    const xlsx = window.XLSX;
    if (!xlsx) {
      showToast('تعذر العثور على مكتبة تصدير Excel.', 'error');
      return;
    }
    const exportRows = filteredRows.map(({ institution, completionPercent, currentIndex, workflowStatus }) => ({
      'المؤسسة': institution.name,
      'النوع': institution.type,
      'المحافظة': institution.governorate || '',
      'نسبة الإنجاز': `${completionPercent}%`,
      'الخطوة الحالية': JOURNEY_STEPS[currentIndex]?.title || '',
      'حالة الطلب': WORKFLOW_STATUS_META[workflowStatus].label,
    }));
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(exportRows, {
      header: ['المؤسسة', 'النوع', 'المحافظة', 'نسبة الإنجاز', 'الخطوة الحالية', 'حالة الطلب'],
    });
    xlsx.utils.book_append_sheet(workbook, worksheet, 'متابعة المؤسسات');
    const date = new Date().toISOString().slice(0, 10);
    xlsx.writeFile(workbook, `waqf-tracking-${date}.xlsx`);
  };

  const chooseRow = (event: React.MouseEvent, id: string) => {
    if ((event.target as HTMLElement).closest('button, a, select, input')) return;
    openInstitution(id);
  };

  const stepLabel = (item: TrackingItem) => {
    if (item.completedCount === 6) return 'اكتملت جميع الخطوات';
    return JOURNEY_STEPS[item.currentIndex]?.title || 'غير محددة';
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-10" dir="rtl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#193b3e] sm:text-3xl">متابعة المؤسسات</h1>
        </div>
        <button
          onClick={exportExcel}
          disabled={loading || error}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-[#173d45] px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#102f36] disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <Download size={17} /> تصدير Excel <span className="text-teal-200">({filteredRows.length})</span>
        </button>
      </header>

      {getDeadline() && !loading && !error && (
        <div className="flex flex-col gap-2">
          <DeadlineNotice compact />
          <p className="text-xs font-bold text-slate-500">
            لم ترفع تقييمها بعد: {counts['not-started'] + counts['in-progress'] + counts.returned} مؤسسة
          </p>
        </div>
      )}

      {error ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center" role="alert">
          <p className="font-bold text-rose-900">تعذر تحميل قائمة المؤسسات.</p>
          <button onClick={loadInstitutions} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-900 px-4 py-2 text-sm font-bold text-white"><RotateCcw size={15} /> إعادة المحاولة</button>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {SUMMARY_TILES.map(tile => (
              <button
                key={tile.key}
                onClick={() => setStatusFilter(tile.key)}
                className={`rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 ${
                  statusFilter === tile.key ? 'border-[#729b90] bg-[#f0f7f4] shadow-sm' : 'border-[#e3ebe8] bg-[#fbfdfb] hover:border-[#b6ccc4]'
                }`}
              >
                <span className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${tile.accent}`}>{tile.icon}</span>
                <span className="block text-xs font-semibold text-slate-500">{tile.label}</span>
                <span className="mt-1 block font-mono text-2xl font-bold text-[#193b3e]">
                  {loading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-slate-200" /> : counts[tile.key]}
                </span>
              </button>
            ))}
          </section>

          <section className="rounded-2xl border border-[#e1eae6] bg-[#fbfdfb] p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#34575a]"><Filter size={16} /> تصفية النتائج</div>
            <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_220px]">
              <label className="relative block">
                <span className="sr-only">بحث بالاسم</span>
                <Search size={17} className="absolute right-3 top-3.5 text-slate-400" />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="بحث باسم المؤسسة..." className="w-full rounded-xl border border-[#dfe8e4] bg-white py-3 pr-10 pl-3 text-sm outline-none transition focus:border-[#74a096] focus:ring-2 focus:ring-[#74a096]/15" />
              </label>
              <label className="relative">
                <span className="sr-only">الحالة</span>
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as SummaryStatus | 'all')} className="w-full appearance-none rounded-xl border border-[#dfe8e4] bg-white px-3 py-3 text-sm text-slate-700 outline-none focus:border-[#74a096] focus:ring-2 focus:ring-[#74a096]/15">
                  <option value="all">كل الحالات</option>
                  <option value="not-started">لم تبدأ</option>
                  <option value="in-progress">قيد التعبئة</option>
                  <option value="submitted">مرفوعة — قيد المراجعة</option>
                  <option value="returned">مُعادة للتعديل</option>
                  <option value="approved">معتمدة</option>
                </select>
              </label>
              <label className="relative">
                <span className="sr-only">المحافظة</span>
                <MapPin size={16} className="pointer-events-none absolute right-3 top-3.5 text-slate-400" />
                <select value={governorate} onChange={event => setGovernorate(event.target.value)} className="w-full appearance-none rounded-xl border border-[#dfe8e4] bg-white py-3 pr-9 pl-3 text-sm text-slate-700 outline-none focus:border-[#74a096] focus:ring-2 focus:ring-[#74a096]/15">
                  <option value="all">كل المحافظات</option>
                  {GOVERNORATES.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>
          </section>

          {loading ? (
            <div className="space-y-3" aria-label="جاري تحميل المؤسسات">
              {[1, 2, 3, 4].map(item => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-200/70" />)}
            </div>
          ) : filteredRows.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-[#c9d9d2] bg-[#f7faf8] px-6 py-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f1ed] text-[#426b62]"><Search size={22} /></div>
              <h2 className="mt-4 font-extrabold text-[#263f40]">{institutions.length ? 'لا توجد نتائج مطابقة' : 'لا توجد مؤسسات مسجلة'}</h2>
              <p className="mt-2 text-sm text-slate-500">{institutions.length ? 'جرّب تغيير كلمات البحث أو خيارات التصفية.' : 'ستظهر ملفات المؤسسات هنا عند توفرها.'}</p>
              {!!(search || statusFilter !== 'all' || governorate !== 'all') && (
                <button onClick={() => { setSearch(''); setStatusFilter('all'); setGovernorate('all'); }} className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#31595a] ring-1 ring-[#d3e0da] hover:bg-[#f1f6f3]">مسح الفلاتر</button>
              )}
            </section>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-2xl border border-[#e1eae6] bg-[#fbfdfb] shadow-sm md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-right">
                    <thead className="bg-[#eff5f2] text-xs font-bold text-[#59746d]">
                      <tr>
                        <th className="px-5 py-4">المؤسسة</th>
                        <th className="px-4 py-4">النوع</th>
                        <th className="px-4 py-4">المحافظة</th>
                        <th className="px-4 py-4">نسبة الإنجاز</th>
                        <th className="px-4 py-4">الخطوة الحالية</th>
                        <th className="px-4 py-4">حالة الطلب</th>
                        <th className="px-4 py-4"><span className="sr-only">فتح</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1ef]">
                      {filteredRows.map(item => (
                        <tr key={item.institution.id} tabIndex={0} onClick={event => chooseRow(event, item.institution.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') openInstitution(item.institution.id); }} className="cursor-pointer transition-colors hover:bg-[#f3f8f5] focus:bg-[#f3f8f5] focus:outline-none">
                          <td className="px-5 py-4">
                            <div className="font-bold text-[#263e40]">{item.institution.name}</div>
                            <div className="mt-1 text-xs text-slate-400">{item.institution.wilayat || '—'}</div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">{item.institution.type}</td>
                          <td className="px-4 py-4 text-sm text-slate-600">{item.institution.governorate || '—'}</td>
                          <td className="px-4 py-4">
                            <div className="flex min-w-32 items-center gap-3">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e5eeea]"><div className="h-full rounded-full bg-[#438377]" style={{ width: `${item.completionPercent}%` }} /></div>
                              <span className="w-10 text-left font-mono text-xs font-bold text-[#365d57]">{item.completionPercent}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">{stepLabel(item)}</td>
                          <td className="px-4 py-4"><StatusBadge status={item.workflowStatus} /></td>
                          <td className="px-4 py-4 text-[#6b8d83]"><ArrowLeft size={16} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 md:hidden">
                {filteredRows.map(item => (
                  <button key={item.institution.id} onClick={() => openInstitution(item.institution.id)} className="rounded-2xl border border-[#e1eae6] bg-[#fbfdfb] p-4 text-right shadow-sm transition active:scale-[.99]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-extrabold leading-6 text-[#263e40]">{item.institution.name}</h2>
                        <p className="mt-1 text-xs text-slate-500">{item.institution.type}</p>
                      </div>
                      <ArrowLeft size={17} className="mt-1 shrink-0 text-[#6b8d83]" />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><MapPin size={13} />{item.institution.governorate || 'المحافظة غير محددة'}</span>
                      {item.institution.wilayat && <span>· {item.institution.wilayat}</span>}
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <StatusBadge status={item.workflowStatus} />
                      <span className="text-xs font-semibold text-slate-500">{stepLabel(item)}</span>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e5eeea]"><div className="h-full rounded-full bg-[#438377]" style={{ width: `${item.completionPercent}%` }} /></div>
                      <span className="w-10 text-left font-mono text-xs font-bold text-[#365d57]">{item.completionPercent}%</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
          {!loading && filteredRows.length > 0 && (
            <p className="text-left text-xs text-slate-400">عرض {filteredRows.length} من {institutions.length} مؤسسة</p>
          )}
        </>
      )}
    </main>
  );
};

const StatusBadge: React.FC<{ status: WorkflowStatus }> = ({ status }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold ${WORKFLOW_STATUS_META[status].className}`}>
    {WORKFLOW_STATUS_META[status].shortLabel}
  </span>
);

export default Tracking;
