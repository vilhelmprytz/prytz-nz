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
  /** Published posts, oldest first. */
  points: RoutePoint[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onHide: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  const fitAll = () => {
    const m = map.current;
    if (!m) return;
    const latlngs = [...markers.current.values()].map((mk) => mk.getLatLng());
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
      const marker = L.marker([p.lat, p.lng], { icon: dotIcon(p.id), keyboard: false })
        .bindTooltip(`${p.title} · ${p.dateLabel}`, { className: styles.label, direction: "right", offset: [12, 0] })
        .on("click", () => onSelectRef.current(p.id))
        .addTo(m);
      markers.current.set(p.id, marker);
    }
    fitAll();

    // The layout resizes the map (show/hide, phone rotation); Leaflet needs to be told.
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el);
    const registry = markers.current;
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      registry.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the route is fixed for the page's lifetime
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const [id, marker] of markers.current) {
      const dot = marker.getElement()?.querySelector(".trip-dot");
      dot?.classList.toggle("active", id === activeId);
      if (id === activeId) {
        marker.openTooltip();
        if (!m.getBounds().pad(-0.15).contains(marker.getLatLng())) m.panTo(marker.getLatLng());
      } else {
        marker.closeTooltip();
      }
    }
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
