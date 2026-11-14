import React, { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../services/db';
import { useUi } from '../contexts/UiContext';
import DashboardModern from './DashboardModern';
import DashboardClassic from './DashboardClassic';

// اختيار شكل لوحة القيادة (يُحفظ في الإعدادات): الجديد افتراضياً، والسابق متاح بضغطة
type Layout = 'modern' | 'classic';
const readLayout = (): Layout => ((getSettings() as { dashboardLayout?: Layout }).dashboardLayout === 'classic' ? 'classic' : 'modern');

const Dashboard: React.FC = () => {
  const { role } = useUi();
  const [layout, setLayout] = useState<Layout>(readLayout);
  useEffect(() => {
    const sync = () => setLayout(readLayout());
    window.addEventListener('settingsChanged', sync);
    return () => window.removeEventListener('settingsChanged', sync);
  }, []);
  const switchTo = (next: Layout) => { saveSettings({ ...getSettings(), dashboardLayout: next }); setLayout(next); };
  // تبديل الشكل ووضع العرض التوضيحي من صلاحية المدير فقط
  const admin = role === 'admin';
  return layout === 'classic'
    ? <DashboardClassic onSwitchLayout={admin ? () => switchTo('modern') : undefined} readOnly={!admin} />
    : <DashboardModern onSwitchLayout={admin ? () => switchTo('classic') : undefined} />;
};

export default Dashboard;
