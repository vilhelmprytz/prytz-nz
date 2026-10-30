"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { unwrapLongitudes } from "@/geo/unwrap";
import { SATELLITE_ATTRIBUTION, SATELLITE_TILES } from "@/geo/tiles";
import type { RoutePoint } from "@/posts/types";
import styles from "./map.module.css";

const FIT_PADDING: L.PointExpression = [50, 50];

function dotIcon(id: string) {
  return L.divIcon({
    className: styles.marker,
    html: `<div class="trip-dot" data-post-id="${id}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function TripMap({
  points,
  activeId,
  onSelect,
  onHide,
}: {
  /** Every place of every published post, in travel order (a travel day contributes several). */
  points: RoutePoint[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onHide: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<{ postId: string; marker: L.Marker }[]>([]);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  const fitAll = () => {
    const m = map.current;
    if (!m) return;
    const latlngs = markers.current.map(({ marker }) => marker.getLatLng());
    if (latlngs.length === 0) m.setView([20, 0], 2);
    else if (latlngs.length === 1) m.setView(latlngs[0], 8);
    else m.fitBounds(L.latLngBounds(latlngs), { padding: FIT_PADDING });
  };

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const m = L.map(el, { zoomControl: false });
    map.current = m;
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.tileLayer(SATELLITE_TILES, { attribution: SATELLITE_ATTRIBUTION, maxZoom: 18 }).addTo(m);

    // Unwrapped longitudes keep every hop on the short side of the globe (LA → NZ crosses the Pacific).
    const route = unwrapLongitudes(points);
    if (route.length >= 2) {
      L.polyline(
        route.map((p) => [p.lat, p.lng] as L.LatLngTuple),
        { color: "#ffffff", weight: 3, opacity: 0.9, interactive: false },
      ).addTo(m);
    }
    for (const p of route) {
      const marker = L.marker([p.lat, p.lng], { icon: dotIcon(p.postId), keyboard: false })
        .bindTooltip(`${p.title} · ${p.dateLabel}`, { className: styles.label, direction: "right", offset: [12, 0] })
        .on("click", () => onSelectRef.current(p.postId))
        .addTo(m);
      markers.current.push({ postId: p.postId, marker });
    }
    fitAll();

    // The layout resizes the map (show/hide, phone rotation); Leaflet needs to be told.
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      markers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the route is fixed for the page's lifetime
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const active = markers.current.filter((e) => e.postId === activeId);
    for (const { postId, marker } of markers.current) {
      marker.getElement()?.querySelector(".trip-dot")?.classList.toggle("active", postId === activeId);
      marker.closeTooltip();
    }
    if (active.length === 0) return;
    // One label per post, on the place where its day ended.
    active.at(-1)!.marker.openTooltip();
    const latlngs = active.map(({ marker }) => marker.getLatLng());
    if (latlngs.every((ll) => m.getBounds().pad(-0.15).contains(ll))) return;
    if (latlngs.length === 1) m.panTo(latlngs[0]);
    // Zoom out just enough to show the whole travel day, never in.
    else m.fitBounds(L.latLngBounds(latlngs), { padding: FIT_PADDING, maxZoom: m.getZoom() });
  }, [activeId]);

  return (
    <div className={styles.wrap}>
      <div ref={container} className={styles.map} />
      <div className={styles.controls}>
        <button type="button" onClick={fitAll}>
          Whole trip
        </button>
        <button type="button" onClick={onHide}>
          Hide map
        </button>
      </div>
    </div>
  );
}
