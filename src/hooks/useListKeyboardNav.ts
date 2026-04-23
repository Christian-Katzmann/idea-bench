// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/list-keyboard-nav/src/useListKeyboardNav.ts
//
// j/k/arrow/Enter/Space/Escape navigation for any identifiable list.
// Skips inputs, combobox, dialog descendants so modal UI isn't disturbed.

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseListKeyboardNavOptions<T extends { id: string }> {
  items: T[];
  disabled?: boolean;
  onEnter?: (item: T) => void;
  onSpace?: (item: T) => void;
  onEscape?: () => void;
  deactivateOnPointer?: boolean;
}

export interface UseListKeyboardNavReturn {
  focusedId: string | null;
  focusedIndex: number | null;
  setFocusedIndex: (index: number | null) => void;
  clearFocus: () => void;
}

function isTypingTarget(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest('[role="dialog"]')) return true;
  if (el.closest('[role="combobox"]')) return true;
  return false;
}

export function useListKeyboardNav<T extends { id: string }>(
  options: UseListKeyboardNavOptions<T>,
): UseListKeyboardNavReturn {
  const {
    items,
    disabled = false,
    onEnter,
    onSpace,
    onEscape,
    deactivateOnPointer = true,
  } = options;

  const [focusedIndex, setFocusedIndexState] = useState<number | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const onSpaceRef = useRef(onSpace);
  onSpaceRef.current = onSpace;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const clearFocus = useCallback(() => setFocusedIndexState(null), []);

  const setFocusedIndex = useCallback((index: number | null) => {
    setFocusedIndexState(index);
  }, []);

  useEffect(() => {
    setFocusedIndexState((prev) => {
      if (prev === null) return null;
      if (prev >= items.length) {
        return items.length > 0 ? items.length - 1 : null;
      }
      return prev;
    });
  }, [items.length]);

  useEffect(() => {
    if (disabled) {
      setFocusedIndexState(null);
    }
  }, [disabled]);

  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget()) return;

      const list = itemsRef.current;
      if (list.length === 0) return;

      switch (event.key) {
        case 'j':
        case 'ArrowDown': {
          event.preventDefault();
          setFocusedIndexState((prev) =>
            prev === null ? 0 : Math.min(prev + 1, list.length - 1),
          );
          break;
        }
        case 'k':
        case 'ArrowUp': {
          event.preventDefault();
          setFocusedIndexState((prev) =>
            prev === null ? list.length - 1 : Math.max(prev - 1, 0),
          );
          break;
        }
        case 'Enter': {
          setFocusedIndexState((prev) => {
            if (prev === null) return null;
            const item = list[prev];
            if (item) {
              event.preventDefault();
              onEnterRef.current?.(item);
            }
            return prev;
          });
          break;
        }
        case ' ': {
          setFocusedIndexState((prev) => {
            if (prev === null) return null;
            const item = list[prev];
            if (item) {
              event.preventDefault();
              onSpaceRef.current?.(item);
            }
            return prev;
          });
          break;
        }
        case 'Escape': {
          setFocusedIndexState((prev) => {
            if (prev !== null) {
              event.preventDefault();
              return null;
            }
            onEscapeRef.current?.();
            return prev;
          });
          break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [disabled]);

  useEffect(() => {
    if (disabled || !deactivateOnPointer) return;
    const handlePointerDown = () => setFocusedIndexState(null);
    document.addEventListener('pointerdown', handlePointerDown);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown);
  }, [disabled, deactivateOnPointer]);

  const focusedId =
    focusedIndex !== null && focusedIndex < items.length
      ? items[focusedIndex].id
      : null;

  return {
    focusedId,
    focusedIndex,
    setFocusedIndex,
    clearFocus,
  };
}
