"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { SATELLITE_ATTRIBUTION, SATELLITE_TILES } from "@/geo/tiles";
import styles from "./editor.module.css";

export type LocationSource = "photo" | "device" | "pin";
export type PickedLocation = { lat: number; lng: number; source: LocationSource };

const pinIcon = L.divIcon({ className: styles.pin, iconSize: [18, 18], iconAnchor: [9, 9] });

export default function LocationPicker({
  value,
  onChange,
}: {
  value: { lat: number | null; lng: number | null };
  onChange: (v: PickedLocation) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, { zoomControl: true, attributionControl: true }).setView([20, 0], 2);
    L.tileLayer(SATELLITE_TILES, { attribution: SATELLITE_ATTRIBUTION, maxZoom: 18 }).addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng, source: "pin" }));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || value.lat === null || value.lng === null) return;
    const latlng = L.latLng(value.lat, value.lng);
    if (!marker.current) {
      marker.current = L.marker(latlng, { draggable: true, icon: pinIcon }).addTo(m);
      marker.current.on("dragend", () => {
        const p = marker.current!.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng, source: "pin" });
      });
      m.setView(latlng, 11);
    } else {
      marker.current.setLatLng(latlng);
      if (!m.getBounds().contains(latlng)) m.panTo(latlng);
    }
  }, [value.lat, value.lng]);

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
        onChangeRef.current({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: "device" });
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Drop a pin on the map instead.");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className={styles.locationPicker}>
      <div ref={container} className={styles.map} />
      <button type="button" className={styles.secondaryButton} onClick={useCurrentLocation} disabled={locating}>
        {locating ? "Finding you…" : "Use my current location"}
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
