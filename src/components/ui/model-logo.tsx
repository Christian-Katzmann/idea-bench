import { cn } from '@/lib/utils';
import { familyOf, type ModelFamily } from '@/lib/models';
import { EntityIcon } from './entity-icon';

import claudeIcon from '@lobehub/icons-static-svg/icons/claude-color.svg';
import openaiIcon from '@lobehub/icons-static-svg/icons/openai.svg';
import geminiIcon from '@lobehub/icons-static-svg/icons/gemini-color.svg';
import metaIcon from '@lobehub/icons-static-svg/icons/meta-color.svg';
import deepseekIcon from '@lobehub/icons-static-svg/icons/deepseek-color.svg';

/**
 * Provider-branded tile for any AVAILABLE_MODELS entry. Mirrors EntityIcon's
 * tile dimensions so list/dialog layouts stay aligned, but renders the real
 * provider mark (Claude, OpenAI, Gemini, Meta, DeepSeek) inside.
 *
 * Falls back to EntityIcon's letter tile when the provider id isn't in our
 * catalog — keeps legacy/unknown rows readable instead of showing a blank.
 *
 * OpenAI's mark ships monochrome (currentColor → black in <img>), so we
 * invert it in dark mode so it stays visible on the surface tile.
 */

type ModelLogoSize = 'sm' | 'md' | 'lg';

const tileMap: Record<ModelLogoSize, string> = {
  sm: 'size-7 rounded-md',
  md: 'size-9 rounded-lg',
  lg: 'size-11 rounded-lg',
};

const iconMap: Record<ModelLogoSize, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
};

const familyIcon: Record<ModelFamily, { src: string; mono?: boolean }> = {
  anthropic: { src: claudeIcon },
  openai: { src: openaiIcon, mono: true },
  google: { src: geminiIcon },
  meta: { src: metaIcon },
  deepseek: { src: deepseekIcon },
};

export function ModelLogo({
  providerModelId,
  name,
  size = 'md',
  className,
}: {
  providerModelId: string;
  name?: string;
  size?: ModelLogoSize;
  className?: string;
}) {
  const family = familyOf(providerModelId);
  const icon = family ? familyIcon[family] : null;

  if (!icon) {
    return (
      <EntityIcon
        name={name ?? providerModelId}
        size={size}
        className={className}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-border bg-surface-highlight',
        tileMap[size],
        className,
      )}
    >
      <img
        src={icon.src}
        alt=""
        className={cn(iconMap[size], icon.mono && 'dark:invert')}
      />
    </span>
  );
}
