import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { ModelLibraryRow } from '../../lib/api';

function availabilityLabel(row: ModelLibraryRow) {
  if (row.legacy) return 'Legacy';
  return row.enabled ? 'Enabled' : 'Disabled';
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
      <DialogContent className="max-w-xl bg-card">
        {row && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>{row.displayName}</DialogTitle>
                <Badge variant="outline" className="border-border text-muted-foreground">
                  {availabilityLabel(row)}
                </Badge>
              </div>
              <DialogDescription>{row.providerModelId}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/60 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Usage
                </div>
                <div className="space-y-1 text-sm">
                  <div>{row.usage.campaigns} campaigns</div>
                  <div>{row.usage.activeCampaigns} active</div>
                  <div>{row.usage.completedCampaigns} completed</div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Performance
                </div>
                <div className="space-y-1 text-sm">
                  <div>{row.performance.comparisons} comparisons</div>
                  <div>
                    Win rate:{' '}
                    {row.performance.winRate != null
                      ? `${Math.round(row.performance.winRate * 100)}%`
                      : '—'}
                  </div>
                  <div>Signal: {row.recommendation}</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Campaign Footprint
              </div>
              {row.footprint.length > 0 ? (
                <div className="space-y-2">
                  {row.footprint.map((campaign) => (
                    <div
                      key={campaign.campaignId}
                      className="rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
                    >
                      <div className="font-medium text-foreground">{campaign.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {campaign.status}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                  This model has not been used in a campaign yet.
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => onToggleLegacy(row, !row.legacy)}
              >
                {row.legacy ? 'Remove Legacy Flag' : 'Mark As Legacy'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
