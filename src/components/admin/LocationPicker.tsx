"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { SATELLITE_ATTRIBUTION, SATELLITE_TILES } from "@/geo/tiles";
import type { LatLng } from "@/posts/types";
import styles from "./editor.module.css";

export type LocationSource = "photo" | "device" | "pin";

const pointIcon = (n: number) =>
  L.divIcon({
    className: styles.pin,
    html: `<span data-testid="route-point">${n}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

/**
 * The post's places in travel order. Tap the map to add a point at the end, drag a point to move it,
 * tap a point to remove it. Most posts have one point; a travel day has several.
 */
export default function LocationPicker({
  points,
  onChange,
}: {
  points: LatLng[];
  onChange: (points: LatLng[], source: LocationSource) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const latest = useRef({ points, onChange });
  const hadPoints = useRef(false);
  // Set when the change came from this map (tap, drag, remove): never reframe under the admin's finger.
  const changedHere = useRef(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    latest.current = {
      points,
      onChange: (next: LatLng[], source: LocationSource) => {
        changedHere.current = source === "pin";
        onChange(next, source);
      },
    };
  });

  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, { zoomControl: true, attributionControl: true }).setView([20, 0], 2);
    L.tileLayer(SATELLITE_TILES, { attribution: SATELLITE_ATTRIBUTION, maxZoom: 18 }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      const { points: current, onChange: change } = latest.current;
      change([...current, { lat: e.latlng.lat, lng: e.latlng.lng }], "pin");
    });
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    if (points.length > 1) {
      L.polyline(
        points.map((p) => [p.lat, p.lng] as L.LatLngTuple),
        { color: "#ffffff", weight: 3, opacity: 0.9, interactive: false },
      ).addTo(group);
    }
    points.forEach((p, i) => {
      const marker = L.marker([p.lat, p.lng], { draggable: true, icon: pointIcon(i + 1) }).addTo(group);
      marker.on("click", () => {
        const { points: current, onChange: change } = latest.current;
        change(
          current.filter((_, j) => j !== i),
          "pin",
        );
      });
      marker.on("dragend", () => {
        const { points: current, onChange: change } = latest.current;
        const moved = marker.getLatLng();
        change(
          current.map((q, j) => (j === i ? { lat: moved.lat, lng: moved.lng } : q)),
          "pin",
        );
      });
    });

    // Frame points that arrive from outside (a loaded post, photo GPS). Taps never move the map, and a
    // point that lands off-screen (current location) is panned into view.
    const fromHere = changedHere.current;
    changedHere.current = false;
    if (points.length > 0 && !hadPoints.current && !fromHere) {
      if (points.length === 1) m.setView([points[0].lat, points[0].lng], 11);
      else m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [30, 30] });
    } else if (points.length > 0) {
      const last = L.latLng(points.at(-1)!.lat, points.at(-1)!.lng);
      if (!m.getBounds().contains(last)) m.panTo(last);
    }
    hadPoints.current = points.length > 0;
  }, [points]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("This browser can't share its location.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { points: current, onChange: change } = latest.current;
        change([...current, { lat: pos.coords.latitude, lng: pos.coords.longitude }], "device");
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Tap the map to drop a pin instead.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className={styles.locationPicker}>
      <div ref={container} className={styles.map} data-testid="location-map" />
      <p className={styles.hint}>Tap the map to add a place. For a travel day, tap each stop in order.</p>
      <button type="button" className={styles.secondaryButton} onClick={useCurrentLocation} disabled={locating}>
        {locating ? "Finding you…" : "Use my current location"}
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
