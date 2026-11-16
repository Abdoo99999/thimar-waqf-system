// الموعد النهائي لرفع التقييم: يحدده المدير من الإعدادات ويظهر للمؤسسات
import { getSettings } from '../services/db';

export type DeadlineTone = 'ok' | 'soon' | 'urgent' | 'passed';
export interface DeadlineInfo { date: string; daysLeft: number; tone: DeadlineTone; label: string; dateLabel: string }

export const getDeadline = (): DeadlineInfo | null => {
  const date: string | undefined = getSettings().evaluation_deadline;
  if (!date) return null;
  const end = new Date(`${date}T23:59:59`);
  if (isNaN(end.getTime())) return null;
  // الفرق بالأيام التقويمية: يوم الموعد = 0، اليوم الذي بعده = -1
  const startOf = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const daysLeft = Math.round((startOf(end) - startOf(new Date())) / 86400000);
  const tone: DeadlineTone = daysLeft < 0 ? 'passed' : daysLeft <= 3 ? 'urgent' : daysLeft <= 14 ? 'soon' : 'ok';
  const ago = Math.abs(daysLeft);
  const label = daysLeft < 0 ? (ago === 1 ? 'انتهى الموعد أمس' : ago === 2 ? 'انتهى الموعد منذ يومين' : `انتهى الموعد منذ ${ago} ${ago <= 10 ? 'أيام' : 'يوماً'}`)
    : daysLeft === 0 ? 'اليوم آخر يوم للرفع'
    : daysLeft === 1 ? 'باقي يوم واحد'
    : daysLeft === 2 ? 'باقي يومان'
    : daysLeft <= 10 ? `باقي ${daysLeft} أيام` : `باقي ${daysLeft} يوماً`;
  const dateLabel = end.toLocaleDateString('ar-OM-u-nu-latn', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return { date, daysLeft, tone, label, dateLabel };
};

// هل رُفع التقييم في موعده؟ (حتى نهاية يوم الموعد)
export const submittedOnTime = (submissionIso?: string) => {
  const date: string | undefined = getSettings().evaluation_deadline;
  if (!date || !submissionIso) return true;
  return new Date(submissionIso).getTime() <= new Date(`${date}T23:59:59`).getTime();
};

export const DEADLINE_STYLE: Record<DeadlineTone, string> = {
  ok: 'border-sky-200 bg-sky-50 text-sky-900',
  soon: 'border-amber-200 bg-amber-50 text-amber-900',
  urgent: 'border-orange-300 bg-orange-50 text-orange-900',
  passed: 'border-red-300 bg-red-50 text-red-900',
};
