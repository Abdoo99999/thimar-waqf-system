import React from 'react';
import DashboardModern from './DashboardModern';

// لوحة القيادة: الشكل الجديد فقط. الشكل السابق محفوظ في DashboardClassic.tsx احتياطاً (غير مرتبط بالواجهة)
const Dashboard: React.FC = () => <DashboardModern />;

export default Dashboard;
