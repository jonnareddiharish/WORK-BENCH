import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { UserProfilePage } from './pages/UserProfilePage';
import { RecordDetailPage } from './pages/RecordDetailPage';
import { AIChatPage } from './pages/AIChatPage';
import { FamilyGraphPage } from './pages/FamilyGraphPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import './app.css';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"           element={<DashboardPage />} />
        <Route path="dashboard/:id"       element={<UserProfilePage />} />
        <Route path="dashboard/:id/:type" element={<RecordDetailPage />} />
        <Route path="chat/:userId"        element={<AIChatPage />} />
        <Route path="graph"               element={<FamilyGraphPage />} />
        <Route path="reports"             element={<ReportsPage />} />
        <Route path="settings"            element={<SettingsPage />} />
        <Route path="*"                   element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
