/**
 * A small iCalendar (.ics) reader for subscribed calendars: Google, iCloud and
 * Outlook all publish one. Handles time zones, all-day events, weekly classes
 * (RRULE), skipped dates (EXDATE) and moved instances (RECURRENCE-ID).
 */
import { addDays, dateKey, daysBetween, fromKey } from "./date";
import type { CalEvent, Recurrence } from "./types";

export interface Occurrence {
  uid: string;
  calendarId: string;
  title: string;
  location?: string;
  allDay: boolean;
  /** Minutes after midnight on the requested day (clipped to the day). */
  start: number;
  end: number;
}

const WEEKDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function tzOffset(timeZone: string, utcMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(utcMs));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return asUtc - utcMs;
  } catch {
    return null;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localStamp(d: Date): string {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse an iCal date or date-time into this computer's local time. */
export function parseIcsTime(value: string, params: Record<string, string>): { stamp: string; allDay: boolean } | null {
  const v = value.trim();
  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly || params.VALUE === "DATE") {
    const m = dateOnly ?? v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return { stamp: `${m[1]}-${m[2]}-${m[3]}`, allDay: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])];
  if (m[7]) return { stamp: localStamp(new Date(Date.UTC(y, mo, d, h, mi))), allDay: false };
  if (params.TZID) {
    const guess = Date.UTC(y, mo, d, h, mi);
    const off = tzOffset(params.TZID.replace(/^"|"$/g, ""), guess);
    if (off !== null) {
      // Second pass gets the offset right around daylight-saving changes.
      const off2 = tzOffset(params.TZID.replace(/^"|"$/g, ""), guess - off) ?? off;
      return { stamp: localStamp(new Date(guess - off2)), allDay: false };
    }
  }
  return { stamp: localStamp(new Date(y, mo, d, h, mi)), allDay: false };
}

function parseDuration(v: string): number {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const mins = Number(m[2] ?? 0) * 10080 + Number(m[3] ?? 0) * 1440 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0);
  return m[1] === "-" ? -mins : mins;
}

function stampToMs(stamp: string): number {
  const [d, t] = stamp.split("T");
  const base = fromKey(d);
  if (t) {
    const [h, mi] = t.split(":").map(Number);
    base.setHours(h, mi, 0, 0);
  }
  return base.getTime();
}

function msToStamp(ms: number, allDay: boolean): string {
  const d = new Date(ms);
  return allDay ? dateKey(d) : localStamp(d);
}

function parseRrule(v: string, params: Record<string, string>): Recurrence | undefined {
  const parts = Object.fromEntries(v.split(";").map((p) => p.split("=") as [string, string]));
  const freq = parts.FREQ as Recurrence["freq"];
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return undefined;
  const rule: Recurrence = { freq, interval: Math.max(1, Number(parts.INTERVAL ?? 1)) };
  if (parts.COUNT) rule.count = Number(parts.COUNT);
  if (parts.UNTIL) {
    const until = parseIcsTime(parts.UNTIL, params);
    if (until) rule.until = until.stamp.slice(0, 10);
  }
  if (parts.BYDAY && freq === "WEEKLY") {
    rule.byday = parts.BYDAY.split(",")
      .map((d) => WEEKDAY[d.replace(/^[+-]?\d+/, "")])
      .filter((d) => d !== undefined);
  }
  return rule;
}

/** Turn the text of an .ics file into events. */
export function parseICS(text: string, calendarId: string): CalEvent[] {
  const events: CalEvent[] = [];
  const overrides: { uid: string; recurrenceDate: string; event: CalEvent | null }[] = [];
  let cur: Record<string, { value: string; params: Record<string, string> }[]> | null = null;

  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT" && cur) {
      const one = (k: string) => cur![k]?.[0];
      const status = one("STATUS")?.value.toUpperCase();
      const dtstart = one("DTSTART");
      const start = dtstart && parseIcsTime(dtstart.value, dtstart.params);
      if (start && status !== "CANCELLED") {
        let endStamp: string;
        const dtend = one("DTEND");
        const parsedEnd = dtend && parseIcsTime(dtend.value, dtend.params);
        if (parsedEnd) endStamp = parsedEnd.stamp;
        else if (one("DURATION")) endStamp = msToStamp(stampToMs(start.stamp) + parseDuration(one("DURATION")!.value) * 60000, start.allDay);
        else endStamp = start.allDay ? addDays(start.stamp, 1) : start.stamp;

        const event: CalEvent = {
          uid: one("UID")?.value ?? `${calendarId}:${start.stamp}:${one("SUMMARY")?.value ?? ""}`,
          calendarId,
          title: unescapeText(one("SUMMARY")?.value ?? "Busy"),
          allDay: start.allDay,
          start: start.stamp,
          end: endStamp,
        };
        const loc = one("LOCATION")?.value;
        if (loc) event.location = unescapeText(loc);
        const rr = one("RRULE");
        if (rr) event.rrule = parseRrule(rr.value, dtstart!.params);
        const ex = (cur.EXDATE ?? []).flatMap((e) => e.value.split(",").map((v) => parseIcsTime(v, e.params)?.stamp.slice(0, 10)));
        if (ex.length) event.exdates = ex.filter((x): x is string => !!x);

        const rid = one("RECURRENCE-ID");
        const ridParsed = rid && parseIcsTime(rid.value, rid.params);
        if (ridParsed) overrides.push({ uid: event.uid, recurrenceDate: ridParsed.stamp.slice(0, 10), event: { ...event, uid: `${event.uid}#${ridParsed.stamp}` } });
        else events.push(event);
      } else if (status === "CANCELLED") {
        const rid = one("RECURRENCE-ID");
        const ridParsed = rid && parseIcsTime(rid.value, rid.params);
        const uid = one("UID")?.value;
        if (ridParsed && uid) overrides.push({ uid, recurrenceDate: ridParsed.stamp.slice(0, 10), event: null });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const [name, ...paramParts] = line.slice(0, colon).split(";");
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const [k, val] = p.split("=");
      if (k && val) params[k.toUpperCase()] = val;
    }
    const key = name.toUpperCase();
    (cur[key] ??= []).push({ value: line.slice(colon + 1), params });
  }

  // A moved or cancelled instance replaces that date in its series.
  for (const o of overrides) {
    const master = events.find((e) => e.uid === o.uid);
    if (master) master.exdates = [...(master.exdates ?? []), o.recurrenceDate];
    if (o.event) events.push(o.event);
  }
  return events;
}

function occursOn(e: CalEvent, day: string): boolean {
  const first = e.start.slice(0, 10);
  if (day < first) return false;
  const rule = e.rrule;
  if (!rule) return false;
  if (rule.until && day > rule.until) return false;
  if (e.exdates?.includes(day)) return false;

  const matches = (d: string): boolean => {
    const diff = daysBetween(first, d);
    const a = fromKey(first);
    const b = fromKey(d);
    switch (rule.freq) {
      case "DAILY":
        return diff % rule.interval === 0;
      case "WEEKLY": {
        const days = rule.byday?.length ? rule.byday : [a.getDay()];
        if (!days.includes(b.getDay())) return false;
        const weekA = addDays(first, -a.getDay());
        const weekB = addDays(d, -b.getDay());
        return (daysBetween(weekA, weekB) / 7) % rule.interval === 0;
      }
      case "MONTHLY": {
        const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
        return b.getDate() === a.getDate() && months % rule.interval === 0;
      }
      case "YEARLY":
        return b.getMonth() === a.getMonth() && b.getDate() === a.getDate() && (b.getFullYear() - a.getFullYear()) % rule.interval === 0;
    }
  };

  if (!matches(day)) return false;
  if (rule.count) {
    // Count occurrences up to this day (bounded so a long series stays cheap).
    let n = 0;
    for (let d = first, i = 0; d <= day && i < 3700; d = addDays(d, 1), i++) {
      if (matches(d) && !e.exdates?.includes(d)) n++;
      if (n > rule.count) return false;
    }
  }
  return true;
}

/** Everything from these calendars that happens on a given day. */
export function eventsOn(events: CalEvent[], day: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    const startDay = e.start.slice(0, 10);
    if (e.allDay) {
      const endDay = e.end.slice(0, 10);
      const lengthDays = Math.max(1, daysBetween(startDay, endDay));
      const single = day >= startDay && day < addDays(startDay, lengthDays);
      if (single || occursOn(e, day)) out.push({ uid: e.uid, calendarId: e.calendarId, title: e.title, location: e.location, allDay: true, start: 0, end: 1440 });
      continue;
    }
    const startMs = stampToMs(e.start);
    const length = Math.max(0, (stampToMs(e.end) - startMs) / 60000);
    const startMin = Number(e.start.slice(11, 13)) * 60 + Number(e.start.slice(14, 16));
    const instanceDay = occursOn(e, day) ? day : null;
    if (instanceDay || (!e.rrule && startDay === day)) {
      out.push({ uid: e.uid, calendarId: e.calendarId, title: e.title, location: e.location, allDay: false, start: startMin, end: Math.min(1440, startMin + length) });
    } else if (!e.rrule && startDay < day && stampToMs(e.end) > fromKey(day).getTime()) {
      // A timed event that started on an earlier day and runs into this one.
      const endMin = Math.min(1440, (stampToMs(e.end) - fromKey(day).getTime()) / 60000);
      out.push({ uid: e.uid, calendarId: e.calendarId, title: e.title, location: e.location, allDay: false, start: 0, end: endMin });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
