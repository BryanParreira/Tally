import { addDays, dateKey, fromKey } from "./date";

/** Monday of the week that contains `key`. */
export function weekStart(key: string): string {
  const wd = fromKey(key).getDay();
  return addDays(key, -((wd + 6) % 7));
}

/** Six weeks of dates (Monday first) covering the month that contains `key`. */
export function monthMatrix(key: string): string[][] {
  const d = fromKey(key);
  const first = dateKey(new Date(d.getFullYear(), d.getMonth(), 1));
  const start = weekStart(first);
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function snap(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** "2026-10-16T09:30" -> minutes after midnight */
export function stampMinutes(stamp: string): number {
  return Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16));
}

export function makeStamp(day: string, minutes: number): string {
  const extra = Math.floor(minutes / 1440);
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${addDays(day, extra)}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Move a local time stamp by whole days and minutes. */
export function shiftStamp(stamp: string, days: number, minutes: number): string {
  return makeStamp(addDays(stamp.slice(0, 10), days), stampMinutes(stamp) + minutes);
}

export function stampDuration(start: string, end: string): number {
  const a = fromKey(start.slice(0, 10)).getTime() / 60000 + stampMinutes(start);
  const b = fromKey(end.slice(0, 10)).getTime() / 60000 + stampMinutes(end);
  return Math.round(b - a);
}

export interface Span {
  start: number;
  end: number;
}

/** Side-by-side columns for overlapping items, like a paper diary. */
export function layoutLanes<T extends Span>(items: T[]): Map<T, { lane: number; of: number }> {
  const out = new Map<T, { lane: number; of: number }>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: T[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const laneEnds: number[] = [];
    const placed = cluster.map((it) => {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = it.end;
      return { it, lane };
    });
    for (const { it, lane } of placed) out.set(it, { lane, of: laneEnds.length });
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}
