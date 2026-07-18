"use client";

import * as React from "react";

/**
 * Local, mutable copy of a server-provided value (e.g. for optimistic drag
 * state) that resets whenever the source value changes — typically after a
 * router.refresh(). Implemented as a render-time adjustment (React's
 * recommended pattern for "state derived from props") rather than a
 * useEffect, which would cause an extra render on every sync.
 */
export function useSyncedState<T>(value: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [prev, setPrev] = React.useState(value);
  const [state, setState] = React.useState(value);

  if (value !== prev) {
    setPrev(value);
    setState(value);
  }

  return [state, setState];
}
