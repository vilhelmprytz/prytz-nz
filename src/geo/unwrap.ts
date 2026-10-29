/**
 * Shifts each longitude by a multiple of 360° so every hop takes the short way round the globe.
 * Input is in travel order (oldest first). LA → Auckland becomes -118 → -185 (west across the Pacific),
 * not -118 → 175 (east across America, the Atlantic and Asia).
 */
export function unwrapLongitudes<T extends { lat: number; lng: number }>(points: T[]): T[] {
  const out: T[] = [];
  for (const p of points) {
    const prev = out.at(-1);
    if (!prev) {
      out.push({ ...p });
      continue;
    }
    const lng = p.lng + 360 * Math.round((prev.lng - p.lng) / 360);
    out.push({ ...p, lng });
  }
  return out;
}
