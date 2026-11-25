"use client";

import { MAP_STYLES, type MapStyle } from "@/geo/tiles";
import type { Lang } from "@/site";
import { useStoredChoice } from "./use-stored-choice";
import styles from "./map-style.module.css";

/** Satellite or street map; one choice per browser, shared by the trip map and the editor's picker. */
export function useMapStyle() {
  return useStoredChoice<MapStyle>("pz:mapStyle", MAP_STYLES, "satellite");
}

/** The trip map is in Swedish for readers; the editor's picker stays in English. */
const LABELS: Record<Lang, Record<MapStyle | "group", string>> = {
  sv: { group: "Kartvy", satellite: "Satellit", map: "Karta" },
  en: { group: "Map style", satellite: "Satellite", map: "Map" },
};

export function MapStyleToggle({
  lang,
  value,
  onChange,
  className,
}: {
  lang: Lang;
  value: MapStyle;
  onChange: (style: MapStyle) => void;
  /** Where it sits on the map. */
  className: string;
}) {
  return (
    <div role="group" aria-label={LABELS[lang].group} className={`${styles.toggle} ${className}`}>
      {MAP_STYLES.map((style) => (
        <button key={style} type="button" aria-pressed={value === style} onClick={() => onChange(style)}>
          {LABELS[lang][style]}
        </button>
      ))}
    </div>
  );
}
