import { cn } from '../../lib/utils';

interface ModelAvailabilityToggleProps {
  checked: boolean;
  label: string;
  disabled?: boolean;
  onChange: () => void;
}

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
        'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors disabled:opacity-50',
        checked
          ? 'border-emerald-500/30 bg-emerald-500/20'
          : 'border-border bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-foreground transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}
