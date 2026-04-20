/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './components/ThemeProvider';
import { Toaster } from './components/ui/toast';

const OperatorHome = lazy(() => import('./pages/OperatorHome'));
const OperatorDashboard = lazy(() => import('./pages/OperatorDashboard'));
const TeamActivity = lazy(() => import('./pages/TeamActivity'));
const ModelLibrary = lazy(() => import('./pages/ModelLibrary'));
const ApiSettings = lazy(() => import('./pages/ApiSettings'));
const OperatorLogin = lazy(() => import('./pages/OperatorLogin'));
const CreateCampaign = lazy(() => import('./pages/CreateCampaign'));
const CampaignDashboard = lazy(() => import('./pages/CampaignDashboard'));
const CampaignPreview = lazy(() => import('./pages/CampaignPreview'));
const ParticipantLanding = lazy(() => import('./pages/ParticipantLanding'));
const VotingInterface = lazy(() => import('./pages/VotingInterface'));
const PersonalResults = lazy(() => import('./pages/PersonalResults'));

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-dvh bg-background" aria-hidden="true" />}>
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
            <Route path="/campaign/:id/preview" element={<CampaignPreview />} />

            {/* Participant Routes — `slug` is the public share slug
                (unguessable 16-char base62). Internal campaign UUIDs
                never appear in the URL. */}
            <Route path="/vote/:slug" element={<ParticipantLanding />} />
            <Route path="/vote/:slug/play" element={<VotingInterface />} />
            <Route path="/vote/:slug/results" element={<PersonalResults />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
}
