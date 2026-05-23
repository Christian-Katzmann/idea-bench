import { Link, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { AppShell } from '../components/layout/app-shell';
import { buttonVariants } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Catch-all fallback for unknown URLs. Operator-default — most stray URLs
// inside the app are typo'd internal links, so we point back to /dashboard
// and surface the actual path that didn't match so the user can spot the
// typo. Participants who land here from a bad share link can still reach
// /vote/<slug> via the URL bar.

export default function NotFound() {
  const location = useLocation();
  useDocumentTitle('Page not found');

  return (
    <AppShell breadcrumb={[{ label: 'Page not found' }]}>
      <EmptyState
        icon={Compass}
        title="We couldn't find that page"
        description={
          <>
            No route matches{' '}
            <code className="rounded bg-surface-highlight px-1.5 py-0.5 font-mono text-[12px] text-foreground">
              {location.pathname}
            </code>
            . Check the URL for a typo or jump back to the dashboard.
          </>
        }
        action={
          <Link to="/dashboard" className={buttonVariants()}>
            Back to dashboard
          </Link>
        }
      />
    </AppShell>
  );
}
