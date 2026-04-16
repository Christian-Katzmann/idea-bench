import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ModeToggle } from '../ModeToggle';

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isCampaigns = location.pathname === '/' || location.pathname.startsWith('/campaign');

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
          <Link to="#" className="px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:bg-card hover:text-foreground transition-colors flex items-center gap-3">
            Dashboard
          </Link>
          <Link to="/" className={`px-3 py-2.5 rounded-md text-sm flex items-center gap-3 transition-colors ${isCampaigns ? 'bg-card text-foreground border border-border' : 'text-muted-foreground hover:bg-card hover:text-foreground'}`}>
            Campaigns
          </Link>
          <Link to="#" className="px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:bg-card hover:text-foreground transition-colors flex items-center gap-3">
            Team Activity
          </Link>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">System</div>
          <Link to="#" className="px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:bg-card hover:text-foreground transition-colors flex items-center gap-3">
            Model Library
          </Link>
          <Link to="#" className="px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:bg-card hover:text-foreground transition-colors flex items-center gap-3">
            API Settings
          </Link>
        </div>
        
        <div className="absolute bottom-6 left-6">
          <ModeToggle />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-10 flex flex-col gap-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
