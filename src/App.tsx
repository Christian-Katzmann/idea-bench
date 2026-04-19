/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import OperatorHome from './pages/OperatorHome';
import OperatorDashboard from './pages/OperatorDashboard';
import TeamActivity from './pages/TeamActivity';
import ModelLibrary from './pages/ModelLibrary';
import ApiSettings from './pages/ApiSettings';
import OperatorLogin from './pages/OperatorLogin';
import CreateCampaign from './pages/CreateCampaign';
import CampaignDashboard from './pages/CampaignDashboard';
import ParticipantLanding from './pages/ParticipantLanding';
import VotingInterface from './pages/VotingInterface';
import PersonalResults from './pages/PersonalResults';
import { ThemeProvider } from './components/ThemeProvider';
import { Toaster } from './components/ui/toast';

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <BrowserRouter>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<OperatorLogin />} />

          {/* Operator Routes */}
          <Route path="/" element={<OperatorHome />} />
          <Route path="/dashboard" element={<OperatorDashboard />} />
          <Route path="/team-activity" element={<TeamActivity />} />
          <Route path="/models" element={<ModelLibrary />} />
          <Route path="/settings/api" element={<ApiSettings />} />
          <Route path="/campaign/new" element={<CreateCampaign />} />
          <Route path="/campaign/:id" element={<CampaignDashboard />} />

          {/* Participant Routes — `slug` is the public share slug
              (unguessable 16-char base62). Internal campaign UUIDs
              never appear in the URL. */}
          <Route path="/vote/:slug" element={<ParticipantLanding />} />
          <Route path="/vote/:slug/play" element={<VotingInterface />} />
          <Route path="/vote/:slug/results" element={<PersonalResults />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
}
