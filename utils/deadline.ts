// الموعد النهائي لرفع التقييم: يحدده المدير من الإعدادات ويظهر للمؤسسات
import { getSettings } from '../services/db';

export type DeadlineTone = 'ok' | 'soon' | 'urgent' | 'passed';
export interface DeadlineInfo { date: string; daysLeft: number; tone: DeadlineTone; label: string; dateLabel: string }

export const getDeadline = (): DeadlineInfo | null => {
  const date: string | undefined = getSettings().evaluation_deadline;
  if (!date) return null;
  const end = new Date(`${date}T23:59:59`);
  if (isNaN(end.getTime())) return null;
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86400000);
  const tone: DeadlineTone = daysLeft < 0 ? 'passed' : daysLeft <= 3 ? 'urgent' : daysLeft <= 14 ? 'soon' : 'ok';
  const label = daysLeft < 0 ? `انتهى الموعد منذ ${Math.abs(daysLeft)} يوماً`
    : daysLeft === 0 ? 'اليوم آخر يوم للرفع'
    : daysLeft === 1 ? 'باقي يوم واحد'
    : daysLeft === 2 ? 'باقي يومان'
    : daysLeft <= 10 ? `باقي ${daysLeft} أيام` : `باقي ${daysLeft} يوماً`;
  const dateLabel = end.toLocaleDateString('ar-OM', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return { date, daysLeft, tone, label, dateLabel };
};

export const DEADLINE_STYLE: Record<DeadlineTone, string> = {
  ok: 'border-sky-200 bg-sky-50 text-sky-900',
  soon: 'border-amber-200 bg-amber-50 text-amber-900',
  urgent: 'border-orange-300 bg-orange-50 text-orange-900',
  passed: 'border-red-300 bg-red-50 text-red-900',
};
