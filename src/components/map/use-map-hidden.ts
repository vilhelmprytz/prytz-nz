"use client";

import { useCallback } from "react";
import { useStoredChoice } from "./use-stored-choice";

const STATES = ["0", "1"] as const;

/** Whether the reader has hidden the map; remembered per browser. */
export function useMapHidden(): [boolean, (hidden: boolean) => void] {
  const [stored, setStored] = useStoredChoice("pz:mapHidden", STATES, "0");
  const setHidden = useCallback((hidden: boolean) => setStored(hidden ? "1" : "0"), [setStored]);
  return [stored === "1", setHidden];
}
