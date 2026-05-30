import { cn } from '../../lib/utils';

interface ModelAvailabilityToggleProps {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
}

/**
 * Switch for enabling/disabling a model.
 * Checked = accent. Reserved for semantic "this is enabled"
 * states; primary-action elsewhere stays on the dark-ink pill pattern.
 */
export default function ModelAvailabilityToggle({
  checked,
  label,
  disabled,
  onChange,
}: ModelAvailabilityToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} availability`}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent/25',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        checked
          ? 'border-accent/30 bg-accent/90'
          : 'border-border bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block size-3.5 rounded-full bg-card shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}
