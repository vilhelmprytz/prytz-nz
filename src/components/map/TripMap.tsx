"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { unwrapLongitudes } from "@/geo/unwrap";
import { BASEMAPS } from "@/geo/tiles";
import type { RoutePoint } from "@/posts/types";
import styles from "./map.module.css";
import { MapStyleToggle, useMapStyle } from "./MapStyleToggle";

const FIT_PADDING: L.PointExpression = [50, 50];
/** Two posts in the same town shouldn't open the map at street level. */
const OPEN_MAX_ZOOM = 10;

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
  const tiles = useRef<L.TileLayer | null>(null);
  const line = useRef<L.Polyline | null>(null);
  const [mapStyle, setMapStyle] = useMapStyle();
  const onSelectRef = useRef(onSelect);
  /** Set when the map opens framed on the active post, so the first follow doesn't move it. */
  const justOpened = useRef(false);

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

  /** The post's places plus the place before them: where the trip is, and where it just came from. */
  const fitRecent = (postId: string | null) => {
    const m = map.current;
    if (!m) return;
    const first = markers.current.findIndex((e) => e.postId === postId);
    if (first === -1) return fitAll();
    const recent = markers.current.filter((e, i) => e.postId === postId || i === first - 1);
    m.fitBounds(L.latLngBounds(recent.map(({ marker }) => marker.getLatLng())), {
      padding: FIT_PADDING,
      maxZoom: OPEN_MAX_ZOOM,
    });
  };

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const m = L.map(el, { zoomControl: false });
    map.current = m;
    L.control.zoom({ position: "bottomright", zoomInTitle: "Zooma in", zoomOutTitle: "Zooma ut" }).addTo(m);

    // Unwrapped longitudes keep every hop on the short side of the globe (LA → NZ crosses the Pacific).
    const route = unwrapLongitudes(points);
    if (route.length >= 2) {
      line.current = L.polyline(
        route.map((p) => [p.lat, p.lng] as L.LatLngTuple),
        { weight: 3, opacity: 0.9, interactive: false },
      ).addTo(m);
    }
    for (const p of route) {
      const marker = L.marker([p.lat, p.lng], { icon: dotIcon(p.postId), keyboard: false })
        .bindTooltip(`${p.title} · ${p.dateLabel}`, { className: styles.label, direction: "right", offset: [12, 0] })
        .on("click", () => onSelectRef.current(p.postId))
        .addTo(m);
      markers.current.push({ postId: p.postId, marker });
    }
    // Open close in on the latest hop; "Hela resan" zooms out to everything.
    fitRecent(activeId);
    justOpened.current = true;

    // The layout resizes the map (show/hide, phone rotation); Leaflet needs to be told.
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(el);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
      markers.current = [];
      tiles.current = null;
      line.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the route is fixed for the page's lifetime
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const basemap = BASEMAPS[mapStyle];
    tiles.current?.remove();
    tiles.current = L.tileLayer(basemap.url, basemap.options).addTo(m);
    line.current?.setStyle({ color: basemap.routeColor });
  }, [mapStyle]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const active = markers.current.filter((e) => e.postId === activeId);
    for (const { postId, marker } of markers.current) {
      marker.getElement()?.querySelector(".trip-dot")?.classList.toggle("active", postId === activeId);
      marker.closeTooltip();
    }
    const opening = justOpened.current;
    justOpened.current = false;
    if (active.length === 0) return;
    // One label per post, on the place where its day ended.
    active.at(-1)!.marker.openTooltip();
    // fitRecent already framed this post; panning now could push the previous place off the map.
    if (opening) return;
    const latlngs = active.map(({ marker }) => marker.getLatLng());
    if (latlngs.every((ll) => m.getBounds().pad(-0.15).contains(ll))) return;
    if (latlngs.length === 1) m.panTo(latlngs[0]);
    // Zoom out just enough to show the whole travel day, never in.
    else m.fitBounds(L.latLngBounds(latlngs), { padding: FIT_PADDING, maxZoom: m.getZoom() });
  }, [activeId]);

  return (
    <div className={styles.wrap} data-map-style={mapStyle}>
      <div ref={container} className={styles.map} />
      <MapStyleToggle lang="sv" value={mapStyle} onChange={setMapStyle} className={styles.styleToggle} />
      <div className={styles.controls}>
        <button type="button" onClick={fitAll}>
          Hela resan
        </button>
        <button type="button" onClick={onHide}>
          Dölj kartan
        </button>
      </div>
    </div>
  );
}
