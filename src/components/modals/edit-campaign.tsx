import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { VotingMode } from '@/lib/api';

/**
 * Edit-campaign-metadata modal. Used by the operator from the
 * CampaignDashboard Settings tab to rename / re-describe / re-tag a
 * campaign without leaving the page. Submits a PATCH /api/campaigns/:id.
 *
 * Categories are entered as a comma-separated list — same shape the
 * create-wizard uses internally. Empty inputs are filtered server-side.
 *
 * Also exposes the voter-identity policy (`votingMode`) and optional
 * operator copy shown above the email field. The prompt-message field
 * is disabled in `anonymous` mode — there's no email field to prompt for.
 */
export interface EditCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: {
    name: string;
    description: string;
    categories: string[];
    votingMode: VotingMode;
    emailPromptMessage: string | null;
  };
  isPending?: boolean;
  errorMessage?: string | null;
  onSave: (patch: {
    name: string;
    description: string;
    categories: string[];
    votingMode: VotingMode;
    emailPromptMessage: string | null;
  }) => void;
}

const MODE_LABELS: Record<VotingMode, string> = {
  anonymous: 'Anonymous only — no email collected',
  email_required: 'Email required — voters must enter an email',
  hybrid: 'Hybrid — voter chooses email or anonymous',
};

const MODE_HELP: Record<VotingMode, string> = {
  anonymous:
    'The landing page shows a single "Start voting" button. No email field. Votes are still deduped per device.',
  email_required:
    'Voters must enter a valid email to start. Good for closed audiences where you need to know who voted.',
  hybrid:
    'Landing page shows both an email field and a "Vote as anonymous" button. Voters who give email appear in the participants CSV; the rest stay anonymous.',
};

export function EditCampaignDialog({
  open,
  onOpenChange,
  initial,
  isPending = false,
  errorMessage,
  onSave,
}: EditCampaignDialogProps) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [categories, setCategories] = useState(initial.categories.join(', '));
  const [votingMode, setVotingMode] = useState<VotingMode>(initial.votingMode);
  const [emailPromptMessage, setEmailPromptMessage] = useState(
    initial.emailPromptMessage ?? '',
  );

  // Re-sync form state when the dialog (re)opens or the underlying campaign
  // changes — without this, opening, editing, cancelling, and re-opening
  // would still show the abandoned edits.
  useEffect(() => {
    if (open) {
      setName(initial.name);
      setDescription(initial.description);
      setCategories(initial.categories.join(', '));
      setVotingMode(initial.votingMode);
      setEmailPromptMessage(initial.emailPromptMessage ?? '');
    }
  }, [
    open,
    initial.name,
    initial.description,
    initial.categories,
    initial.votingMode,
    initial.emailPromptMessage,
  ]);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && !isPending;
  const promptDisabled = votingMode === 'anonymous';

  const handleSave = () => {
    if (!canSave) return;
    const trimmedPrompt = emailPromptMessage.trim();
    onSave({
      name: trimmedName,
      description: description.trim(),
      categories: categories
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      votingMode,
      // Only send the prompt message when it's actually used by the mode.
      // Null clears the field on the server.
      emailPromptMessage: promptDisabled
        ? null
        : trimmedPrompt
          ? trimmedPrompt
          : null,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit campaign</DialogTitle>
          <DialogDescription>
            Rename, rewrite the description, tweak the category tags, or
            change how voters identify themselves.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-campaign-name">Name</Label>
            <Input
              id="edit-campaign-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={200}
              required
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-campaign-description">Description</Label>
            <Textarea
              id="edit-campaign-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              disabled={isPending}
              className="resize-y"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-campaign-categories">
              Categories{' '}
              <span className="text-muted-foreground">
                (comma-separated)
              </span>
            </Label>
            <Input
              id="edit-campaign-categories"
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="summarization, support, code"
              disabled={isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-campaign-mode">Voter identity</Label>
            <Select
              value={votingMode}
              onValueChange={(v) => setVotingMode(v as VotingMode)}
              disabled={isPending}
            >
              <SelectTrigger
                id="edit-campaign-mode"
                className="w-full justify-between"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anonymous">
                  {MODE_LABELS.anonymous}
                </SelectItem>
                <SelectItem value="email_required">
                  {MODE_LABELS.email_required}
                </SelectItem>
                <SelectItem value="hybrid">{MODE_LABELS.hybrid}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {MODE_HELP[votingMode]}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="edit-campaign-prompt"
              className={promptDisabled ? 'text-muted-foreground' : undefined}
            >
              Email prompt message{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="edit-campaign-prompt"
              value={emailPromptMessage}
              onChange={(e) => setEmailPromptMessage(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Use your @acme.com email so we can count internal votes separately."
              disabled={isPending || promptDisabled}
              className="resize-y"
            />
            <p className="text-[11px] text-muted-foreground">
              {promptDisabled
                ? 'Not shown — this mode hides the email field entirely.'
                : 'Shown above the email field on the voting page.'}
            </p>
          </div>

          {errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
