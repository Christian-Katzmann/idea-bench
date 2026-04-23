/**
 * Smoke tests for the vendored useListKeyboardNav hook. Verifies the
 * core contract: j/k cycles through the focused index, Enter invokes
 * onEnter with the focused item, Escape clears focus before calling
 * onEscape.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useListKeyboardNav } from '../useListKeyboardNav.js';

function keyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true });
}

describe('useListKeyboardNav', () => {
  const items = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
  ];

  it('focuses the first item on initial j and advances downward', () => {
    const { result } = renderHook(() => useListKeyboardNav({ items }));
    expect(result.current.focusedIndex).toBeNull();

    act(() => {
      document.dispatchEvent(keyEvent('j'));
    });
    expect(result.current.focusedIndex).toBe(0);

    act(() => {
      document.dispatchEvent(keyEvent('j'));
    });
    expect(result.current.focusedIndex).toBe(1);
  });

  it('invokes onEnter with the focused item', () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() =>
      useListKeyboardNav({ items, onEnter }),
    );
    act(() => {
      document.dispatchEvent(keyEvent('j'));
    });
    act(() => {
      document.dispatchEvent(keyEvent('Enter'));
    });
    expect(onEnter).toHaveBeenCalledWith({ id: 'a' });
    expect(result.current.focusedId).toBe('a');
  });

  it('Escape clears focus first, then invokes onEscape on second press', () => {
    const onEscape = vi.fn();
    const { result } = renderHook(() =>
      useListKeyboardNav({ items, onEscape }),
    );
    act(() => {
      document.dispatchEvent(keyEvent('j'));
    });
    expect(result.current.focusedIndex).toBe(0);

    act(() => {
      document.dispatchEvent(keyEvent('Escape'));
    });
    expect(result.current.focusedIndex).toBeNull();
    expect(onEscape).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(keyEvent('Escape'));
    });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('noops when disabled', () => {
    const onEnter = vi.fn();
    const { result } = renderHook(() =>
      useListKeyboardNav({ items, onEnter, disabled: true }),
    );
    act(() => {
      document.dispatchEvent(keyEvent('j'));
      document.dispatchEvent(keyEvent('Enter'));
    });
    expect(result.current.focusedIndex).toBeNull();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it('auto-corrects focus when the list shrinks', () => {
    const { result, rerender } = renderHook(
      ({ list }: { list: { id: string }[] }) =>
        useListKeyboardNav({ items: list }),
      { initialProps: { list: items } },
    );

    act(() => {
      document.dispatchEvent(keyEvent('j'));
      document.dispatchEvent(keyEvent('j'));
      document.dispatchEvent(keyEvent('j'));
    });
    expect(result.current.focusedIndex).toBe(2);

    rerender({ list: [{ id: 'a' }] });
    expect(result.current.focusedIndex).toBe(0);
  });
});
