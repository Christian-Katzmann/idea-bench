// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/modal-focus-trap/src/useFocusTrap.ts
//
// Note: ïdea Bench's shared `Dialog` component (src/components/ui/dialog.tsx)
// is built on Base UI's DialogPrimitive, which handles focus trapping +
// ESC-to-close + focus restoration natively. Use this hook only for
// custom overlays that do NOT wrap Dialog (e.g. bespoke popover-style
// surfaces where we don't want the dialog chrome).

import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

const isVisible = (element: HTMLElement): boolean => {
  const { offsetWidth, offsetHeight } = element;
  const hasSize = offsetWidth > 0 || offsetHeight > 0;
  const rect = element.getBoundingClientRect();
  return hasSize && rect.width > 0 && rect.height > 0;
};

const getFocusable = (container: HTMLElement): HTMLElement[] =>
  Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && isVisible(el),
  );

export type FocusTrapOptions = {
  initialFocusSelector?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
  restoreFocus?: boolean;
};

export const useFocusTrap = (
  containerRef: RefObject<HTMLElement | null>,
  options: FocusTrapOptions = {},
): void => {
  const {
    initialFocusSelector,
    initialFocusRef,
    enabled = true,
    restoreFocus = true,
  } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const previousActive = document.activeElement as HTMLElement | null;

    const focusables = getFocusable(container);
    const preferredTarget =
      initialFocusRef?.current ??
      (initialFocusSelector
        ? container.querySelector<HTMLElement>(initialFocusSelector)
        : null);
    const target = preferredTarget ?? focusables[0];
    if (target) {
      target.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const items = getFocusable(container);
      if (items.length === 0) return;

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      const isShift = event.shiftKey;

      if (isShift) {
        if (!active || active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (!active || active === last || !container.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus && previousActive instanceof HTMLElement) {
        previousActive.focus();
      }
    };
  }, [
    containerRef,
    enabled,
    initialFocusSelector,
    initialFocusRef,
    restoreFocus,
  ]);
};
