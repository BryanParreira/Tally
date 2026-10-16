import { addDays } from "./date";
import { discoverCalendars, fetchCalendarEvents, type DavSend } from "./caldav";
import { parseICS } from "./ics";
import { caldavConnect, caldavRequest, calendarFetch } from "./native";
import { CALENDAR_COLORS, today, uid, useStore } from "./store";
import type { CalDavAccount, CalendarSource, CalEvent } from "./types";

/** Keep what's relevant: recent history, the coming year, and series still running. */
export function relevant(events: CalEvent[]): CalEvent[] {
  const from = addDays(today(), -30);
  const to = addDays(today(), 400);
  return events.filter((e) => {
    const start = e.start.slice(0, 10);
    if (e.rrule) return start <= to && (!e.rrule.until || e.rrule.until >= from);
    return e.end.slice(0, 10) >= from && start <= to;
  });
}

function sender(account: CalDavAccount): DavSend {
  return (url, method, depth, body) => caldavRequest(account.id, account.server, account.username, url, method, depth, body);
}

export async function syncCalendar(cal: CalendarSource): Promise<number> {
  const s = useStore.getState();
  if (cal.kind === "file") return s.events.filter((e) => e.calendarId === cal.id).length;
  try {
    let events: CalEvent[];
    if (cal.kind === "caldav") {
      const account = s.calAccounts.find((a) => a.id === cal.accountId);
      if (!account) throw new Error("This calendar's account was removed.");
      events = await fetchCalendarEvents(sender(account), cal.url, cal.id);
    } else {
      events = parseICS(await calendarFetch(cal.url), cal.id);
    }
    const kept = relevant(events);
    s.setCalendarEvents(cal.id, kept);
    return kept.length;
  } catch (err) {
    s.setCalendarEvents(cal.id, null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function syncAllCalendars(): Promise<void> {
  await Promise.allSettled(useStore.getState().calendars.map(syncCalendar));
}

/**
 * Sign in to a CalDAV account (Apple iCloud and others), find its calendars,
 * and add them all. Returns how many calendars were added.
 */
export async function connectCalDav(provider: string, server: string, username: string, password: string): Promise<number> {
  const id = uid();
  const probe = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
  await caldavConnect(id, server, username, password, probe);
  const s = useStore.getState();
  const account = s.addCalAccount({ provider, server, username }, id);
  const found = await discoverCalendars(sender(account), server);
  if (!found.length) throw new Error("Signed in, but that account has no calendars yet.");
  const added = found.map((c, i) =>
    s.addCalendar(c.name, c.url, { kind: "caldav", accountId: id, color: c.color ?? CALENDAR_COLORS[(s.calendars.length + i) % CALENDAR_COLORS.length] }),
  );
  await Promise.allSettled(added.map(syncCalendar));
  return added.length;
}

/** Bring in a one-off .ics file (for example, exported from Apple Calendar or Outlook). */
export function importIcsFile(name: string, text: string): number {
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("That file isn't a calendar (.ics) file.");
  const s = useStore.getState();
  const cal = s.addCalendar(name.replace(/\.ics$/i, ""), "", { kind: "file" });
  const events = relevant(parseICS(text, cal.id));
  s.setCalendarEvents(cal.id, events);
  return events.length;
}
