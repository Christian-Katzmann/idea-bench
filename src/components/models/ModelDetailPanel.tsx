import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { EntityIcon } from '../ui/entity-icon';
import { StatusBadge, type StatusState } from '../ui/status-badge';
import type { ModelLibraryRow } from '../../lib/api';

function availabilityState(row: ModelLibraryRow) {
  if (row.legacy) return { label: 'Legacy', state: 'directional' as const };
  return row.enabled
    ? { label: 'Enabled', state: 'live' as const }
    : { label: 'Disabled', state: 'draft' as const };
}

function campaignStatusToState(status: string): StatusState {
  if (status === 'active' || status === 'draft' || status === 'completed') {
    return status;
  }
  return 'directional';
}

export default function ModelDetailPanel({
  row,
  open,
  pending,
  onOpenChange,
  onToggleLegacy,
}: {
  row: ModelLibraryRow | null;
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleLegacy: (row: ModelLibraryRow, legacy: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {row &&
          (() => {
            const availability = availabilityState(row);
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-3">
                    <EntityIcon name={row.displayName} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <DialogTitle className="truncate">
                          {row.displayName}
                        </DialogTitle>
                        <StatusBadge
                          state={availability.state}
                          label={availability.label}
                        />
                      </div>
                      <DialogDescription className="font-mono text-xs">
                        {row.providerModelId}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Stat
                    label="Usage"
                    rows={[
                      [`${row.usage.campaigns}`, 'campaigns'],
                      [`${row.usage.activeCampaigns}`, 'active'],
                      [`${row.usage.completedCampaigns}`, 'completed'],
                    ]}
                  />
                  <Stat
                    label="Performance"
                    rows={[
                      [`${row.performance.comparisons}`, 'comparisons'],
                      [
                        row.performance.winRate != null
                          ? `${Math.round(row.performance.winRate * 100)}%`
                          : '—',
                        'win rate',
                      ],
                      [row.recommendation, 'signal'],
                    ]}
                  />
                </div>

                <section>
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Campaign footprint
                  </div>
                  {row.footprint.length > 0 ? (
                    <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
                      {row.footprint.map((campaign) => (
                        <li key={campaign.campaignId}>
                          <Link
                            to={`/campaign/${campaign.campaignId}`}
                            onClick={() => onOpenChange(false)}
                            className="group flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-highlight/40"
                          >
                            <span className="truncate text-foreground">
                              {campaign.name}
                            </span>
                            <span className="flex items-center gap-2">
                              <StatusBadge
                                state={campaignStatusToState(campaign.status)}
                              />
                              <ExternalLink className="size-3 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                      Not used in a campaign yet.
                    </div>
                  )}
                </section>

                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => onToggleLegacy(row, !row.legacy)}
                  >
                    {row.legacy ? 'Remove legacy flag' : 'Mark as legacy'}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  rows,
}: {
  label: string;
  rows: Array<[value: string | number, caption: string]>;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-highlight/30 p-4">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <dl className="space-y-1 text-sm">
        {rows.map(([value, caption]) => (
          <div key={caption} className="flex items-baseline gap-2">
            <dt className="font-mono text-foreground">{value}</dt>
            <dd className="text-xs text-muted-foreground">{caption}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
