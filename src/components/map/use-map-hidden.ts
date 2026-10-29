"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "pz:mapHidden";
const EVENT = "pz:map-hidden";
// Fallback when storage is blocked (private mode, disabled site data): the choice lasts for the page.
let memoryHidden = false;

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return memoryHidden;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** Whether the reader has hidden the map; remembered per browser. */
export function useMapHidden(): [boolean, (hidden: boolean) => void] {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const setHidden = useCallback((value: boolean) => {
    memoryHidden = value;
    try {
      localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      // Storage unavailable: memoryHidden carries it.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [hidden, setHidden];
}
