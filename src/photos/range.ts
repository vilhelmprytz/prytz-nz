/** An inclusive byte range. */
export type ByteRange = { start: number; end: number };

/**
 * One `Range: bytes=…` request against an object of `size` bytes. Anything we don't serve as a range
 * (no header, other units, several ranges, nonsense) is `null`, meaning send the whole object.
 */
export function parseRange(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  if (m[2] !== "" && Number(m[2]) < start) return null;
  if (start >= size) return "unsatisfiable";
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  return { start, end };
}
