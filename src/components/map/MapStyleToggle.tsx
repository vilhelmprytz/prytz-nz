"use client";

import { MAP_STYLES, type MapStyle } from "@/geo/tiles";
import { useStoredChoice } from "./use-stored-choice";
import styles from "./map-style.module.css";

/** Satellite or street map; one choice per browser, shared by the trip map and the editor's picker. */
export function useMapStyle() {
  return useStoredChoice<MapStyle>("pz:mapStyle", MAP_STYLES, "satellite");
}

const LABEL: Record<MapStyle, string> = { satellite: "Satellite", map: "Map" };

export function MapStyleToggle({
  value,
  onChange,
  className,
}: {
  value: MapStyle;
  onChange: (style: MapStyle) => void;
  /** Where it sits on the map. */
  className: string;
}) {
  return (
    <div role="group" aria-label="Map style" className={`${styles.toggle} ${className}`}>
      {MAP_STYLES.map((style) => (
        <button key={style} type="button" aria-pressed={value === style} onClick={() => onChange(style)}>
          {LABEL[style]}
        </button>
      ))}
    </div>
  );
}
