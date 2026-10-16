import { addDays, formatDay, formatTime, fromKey } from "./date";
import type { Settings } from "./types";

export interface Busy {
  start: number;
  end: number;
}

export interface DaySlots {
  date: string;
  slots: Busy[];
}

/**
 * Open time between commitments that can't move (calendar events and pinned
 * tasks). Flexible tasks don't count: Kindred will plan around a new meeting.
 */
export function freeSlots(busy: Busy[], settings: Pick<Settings, "dayStart" | "dayEnd">, from: number, minLength = 30): Busy[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const out: Busy[] = [];
  let cursor = Math.max(settings.dayStart, Math.ceil(from / 15) * 15);
  for (const b of sorted) {
    if (b.end <= cursor) continue;
    if (b.start > cursor && b.start - cursor >= minLength) out.push({ start: cursor, end: Math.min(b.start, settings.dayEnd) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= settings.dayEnd) break;
  }
  if (settings.dayEnd - cursor >= minLength) out.push({ start: cursor, end: settings.dayEnd });
  return out.filter((s) => s.end - s.start >= minLength);
}

/** The next few working days, starting today. */
export function nextDays(today: string, count: number, skipWeekends: boolean): string[] {
  const out: string[] = [];
  for (let d = today; out.length < count; d = addDays(d, 1)) {
    const wd = fromKey(d).getDay();
    if (skipWeekends && (wd === 0 || wd === 6)) continue;
    out.push(d);
  }
  return out;
}

function range(s: Busy): string {
  const a = formatTime(s.start);
  const b = formatTime(s.end);
  // "3:00 – 5:30 PM" when both ends share AM/PM.
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/** Ready-to-paste text, e.g. for replying to "when are you free?" */
export function formatAvailability(days: DaySlots[], today: string, timeZoneName: string): string {
  const lines = days
    .filter((d) => d.slots.length)
    .map((d) => `• ${formatDay(d.date, today)}: ${d.slots.map(range).join(", ")}`);
  if (!lines.length) return "I'm fully booked for the next few days. Could we look at next week?";
  return [`Here's when I'm free (${timeZoneName}):`, ...lines].join("\n");
}
