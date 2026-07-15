import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import AppLayout from './layouts/AppLayout';
import AdminDashboard from './pages/AdminDashboard';
import PlayerDashboard from './pages/PlayerDashboard';
import CaptainTeamView from './pages/CaptainTeamView';
import TeamsPage from './pages/TeamsPage';
import PlayersPage from './pages/PlayersPage';
import PlayersOpsPage from './pages/PlayersOpsPage';
import SyncPage from './pages/SyncPage';
import RulesPage from './pages/RulesPage';
import ChallengePage from './pages/ChallengePage';
import SubstitutionsPage from './pages/SubstitutionsPage';
import ActivitiesPage from './pages/ActivitiesPage';
import TeamGridView from './pages/TeamGridView';
import AttentionCenter from './pages/AttentionCenter';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* App shell with rail nav */}
        <Route path="/app" element={<AppLayout />}>
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="my-dashboard" element={<PlayerDashboard />} />
          <Route path="team" element={<CaptainTeamView />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="players" element={<PlayersOpsPage />} />
          <Route path="attention" element={<AttentionCenter />} />
          <Route path="players-list" element={<PlayersPage />} />
          <Route path="sync" element={<SyncPage />} />
          <Route path="rules" element={<RulesPage />} />
          <Route path="challenge" element={<ChallengePage />} />
          <Route path="substitutions" element={<SubstitutionsPage />} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="grid" element={<TeamGridView />} />
          <Route index element={<Navigate to="my-dashboard" replace />} />
        </Route>

        {/* Legacy redirect */}
        <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
