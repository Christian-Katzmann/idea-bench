// Vendored from /Users/christiankatzmann/Dev/reuse-kit/ready/reduced-motion-cue-scheduler/src/useScheduledCues.ts
//
// Dispatches an ordered list of typed actions at scheduled offsets.
// When prefers-reduced-motion is set, short-circuits to the terminal
// state via `onReducedMotion` — the accessibility escape hatch.

import { useCallback, useEffect, useMemo, useRef } from 'react';

export interface TimelineCue<A> {
  at: number;
  action: A;
}

export interface UseScheduledCuesOptions<A> {
  cues: readonly TimelineCue<A>[];
  dispatch: (action: A) => void;
  prefersReducedMotion?: boolean;
  onReducedMotion?: (dispatch: (action: A) => void) => void;
  speed?: number;
}

export interface UseScheduledCuesResult {
  restart: () => void;
}

const isBrowser = (): boolean => typeof window !== 'undefined';

export function useScheduledCues<A>({
  cues,
  dispatch,
  prefersReducedMotion = false,
  onReducedMotion,
  speed = 1,
}: UseScheduledCuesOptions<A>): UseScheduledCuesResult {
  const timersRef = useRef<number[]>([]);

  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const shortcutRef = useRef(onReducedMotion);
  shortcutRef.current = onReducedMotion;

  const safeSpeed = speed > 0 ? speed : 1;

  const scaledCues = useMemo(
    () =>
      cues.map((cue) => ({
        at: Math.max(0, Math.round(cue.at / safeSpeed)),
        action: cue.action,
      })),
    [cues, safeSpeed],
  );

  const clear = useCallback(() => {
    if (!isBrowser()) return;
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const run = useCallback(() => {
    if (!isBrowser()) return;
    clear();
    if (prefersReducedMotion) {
      shortcutRef.current?.(dispatchRef.current);
      return;
    }
    for (const cue of scaledCues) {
      const id = window.setTimeout(
        () => dispatchRef.current(cue.action),
        cue.at,
      );
      timersRef.current.push(id);
    }
  }, [clear, prefersReducedMotion, scaledCues]);

  useEffect(() => {
    run();
    return clear;
  }, [run, clear]);

  return { restart: run };
}
