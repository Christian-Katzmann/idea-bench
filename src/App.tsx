/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import OperatorHome from './pages/OperatorHome';
import OperatorLogin from './pages/OperatorLogin';
import CreateCampaign from './pages/CreateCampaign';
import CampaignDashboard from './pages/CampaignDashboard';
import ParticipantLanding from './pages/ParticipantLanding';
import VotingInterface from './pages/VotingInterface';
import PersonalResults from './pages/PersonalResults';
import { ThemeProvider } from './components/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <BrowserRouter>
        <Routes>
          {/* Auth */}
          <Route path="/login" element={<OperatorLogin />} />

          {/* Operator Routes */}
          <Route path="/" element={<OperatorHome />} />
          <Route path="/campaign/new" element={<CreateCampaign />} />
          <Route path="/campaign/:id" element={<CampaignDashboard />} />

          {/* Participant Routes */}
          <Route path="/vote/:campaignId" element={<ParticipantLanding />} />
          <Route path="/vote/:campaignId/play" element={<VotingInterface />} />
          <Route path="/vote/:campaignId/results" element={<PersonalResults />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
