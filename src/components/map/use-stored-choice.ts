"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "pz:stored-choice";
// Fallback when storage is blocked (private mode, disabled site data): the choice lasts for the page.
const memory = new Map<string, string>();

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** One of `choices`, remembered per browser under `key`; `fallback` until the reader picks. */
export function useStoredChoice<T extends string>(
  key: string,
  choices: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const read = () => {
    let raw: string | null | undefined;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = memory.get(key);
    }
    return choices.find((c) => c === raw) ?? fallback;
  };
  const value = useSyncExternalStore(subscribe, read, () => fallback);
  const setValue = useCallback(
    (next: T) => {
      memory.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Storage unavailable: `memory` carries it.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, setValue];
}
