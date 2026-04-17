import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Loader2 } from 'lucide-react';
import { ModeToggle } from '../ModeToggle';
import { Button } from '../ui/button';
import { apiFetch } from '../../lib/api';

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const isCampaigns =
    location.pathname === '/' || location.pathname.startsWith('/campaign');
  const isDashboard = location.pathname.startsWith('/dashboard');
  const isTeamActivity = location.pathname.startsWith('/team-activity');
  const isModels = location.pathname.startsWith('/models');
  const isApiSettings = location.pathname.startsWith('/settings/api');

  const navItemClass = (active: boolean) =>
    `px-3 py-2.5 rounded-md text-sm flex items-center gap-3 transition-colors ${
      active
        ? 'bg-card text-foreground border border-border'
        : 'text-muted-foreground hover:bg-card hover:text-foreground'
    }`;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await apiFetch<{ ok: true }>('/api/auth/logout', { method: 'POST' });
      queryClient.clear();
      navigate('/login', { replace: true });
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : 'Failed to log out.',
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground font-sans">
      {/* Sidebar Navigation */}
      <nav className="w-[240px] bg-sidebar border-r border-border p-6 flex flex-col gap-8 shrink-0 relative">
        <div className="font-bold tracking-tight text-xl flex items-center gap-2">
          <div className="w-6 h-6 bg-primary rounded" />
          ModelArena
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Main</div>
          <Link to="/dashboard" className={navItemClass(isDashboard)}>
            Dashboard
          </Link>
          <Link to="/" className={navItemClass(isCampaigns)}>
            Campaigns
          </Link>
          <Link to="/team-activity" className={navItemClass(isTeamActivity)}>
            Team Activity
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">System</div>
          <Link to="/models" className={navItemClass(isModels)}>
            Model Library
          </Link>
          <Link to="/settings/api" className={navItemClass(isApiSettings)}>
            API Settings
          </Link>
        </div>
        
        <div className="absolute bottom-6 left-6 right-6 flex flex-col gap-3">
          {logoutError && (
            <div className="text-xs text-red-400">{logoutError}</div>
          )}
          <div className="flex items-center justify-between gap-3">
            <ModeToggle />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="h-8 px-3 border-border text-muted-foreground hover:text-foreground"
            >
              {isLoggingOut ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4 mr-2" />
              )}
              Log Out
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-10 flex flex-col gap-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
