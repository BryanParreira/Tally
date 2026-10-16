/**
 * Read-only CalDAV client for Apple Calendar (iCloud), Fastmail, Nextcloud and
 * other standard calendar servers. Requests go through the desktop shell, which
 * holds the app password in the OS keychain and only talks to that provider.
 */
import { addDays, dateKey } from "./date";
import { parseICS } from "./ics";
import type { CalEvent } from "./types";

export interface CalDavPreset {
  id: string;
  label: string;
  server: string;
  help: string;
  hint: string;
}

export const CALDAV_PRESETS: CalDavPreset[] = [
  { id: "icloud", label: "Apple iCloud", server: "https://caldav.icloud.com/", help: "https://account.apple.com", hint: "Use your Apple Account email and an app-specific password (account.apple.com → Sign-In and Security → App-Specific Passwords)." },
  { id: "fastmail", label: "Fastmail", server: "https://caldav.fastmail.com/dav/", help: "https://www.fastmail.com/settings/security/devicekeys", hint: "Create an app password with calendar access in Fastmail's settings." },
  { id: "nextcloud", label: "Nextcloud", server: "https://", help: "", hint: "Use https://your-server/remote.php/dav and an app password from Nextcloud → Settings → Security." },
  { id: "other", label: "Other CalDAV", server: "https://", help: "", hint: "Enter your provider's CalDAV address." },
];

export interface DavResult {
  status: number;
  body: string;
}

export interface CalDavCalendar {
  url: string;
  name: string;
  color: string | null;
}

// ---------- XML helpers (namespace prefixes vary by server, so match local names) ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()],
    );
}

function inner(xml: string, local: string): string | null {
  const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${local}\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${local}>)`, "i"));
  return m ? (m[1] ?? "") : null;
}

function hrefIn(xml: string | null): string | null {
  if (!xml) return null;
  const h = inner(xml, "href");
  return h ? decodeXml(h.trim()) : null;
}

export interface DavItem {
  href: string;
  xml: string;
}

/** Split a 207 Multi-Status reply into its <response> parts. */
export function multistatus(xml: string): DavItem[] {
  const out: DavItem[] = [];
  for (const m of xml.matchAll(/<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi)) {
    const href = hrefIn(m[1]);
    if (href) out.push({ href, xml: m[1] });
  }
  return out;
}

export function absolute(href: string, base: string): string {
  return new URL(href, base).toString();
}

// ---------- Requests ----------

const PRINCIPAL = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
const HOME = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
const CALENDARS = `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:resourcetype/><d:displayname/><a:calendar-color/><c:supported-calendar-component-set/></d:prop></d:propfind>`;

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function eventsQuery(from: Date, to: Date): string {
  return `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${stamp(from)}" end="${stamp(to)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
}

export type DavSend = (url: string, method: "PROPFIND" | "REPORT", depth: "0" | "1", body: string) => Promise<DavResult>;

/** Follow same-site redirects (iCloud sends users to their own server). */
async function request(send: DavSend, url: string, method: "PROPFIND" | "REPORT", depth: "0" | "1", body: string): Promise<{ url: string; body: string }> {
  let current = url;
  for (let i = 0; i < 4; i++) {
    const res = await send(current, method, depth, body);
    if (res.status >= 300 && res.status < 400 && res.body) {
      current = absolute(res.body, current);
      continue;
    }
    return { url: current, body: res.body };
  }
  throw new Error("The calendar server redirected too many times.");
}

/** Find every event calendar in the account. */
export async function discoverCalendars(send: DavSend, server: string): Promise<CalDavCalendar[]> {
  const p = await request(send, server, "PROPFIND", "0", PRINCIPAL);
  const principalHref = hrefIn(inner(p.body, "current-user-principal"));
  if (!principalHref) throw new Error("That server didn't respond like a calendar server. Check the address.");
  const principal = absolute(principalHref, p.url);

  const h = await request(send, principal, "PROPFIND", "0", HOME);
  const homeHref = hrefIn(inner(h.body, "calendar-home-set"));
  if (!homeHref) throw new Error("Couldn't find your calendars on that server.");
  const home = absolute(homeHref, h.url);

  const list = await request(send, home, "PROPFIND", "1", CALENDARS);
  return parseCalendarList(list.body, list.url);
}

export function parseCalendarList(xml: string, base: string): CalDavCalendar[] {
  return multistatus(xml)
    .filter((r) => {
      const type = inner(r.xml, "resourcetype") ?? "";
      if (!/<(?:[\w-]+:)?calendar\b/i.test(type)) return false;
      const comps = inner(r.xml, "supported-calendar-component-set");
      return !comps || /name=["']VEVENT["']/i.test(comps);
    })
    .map((r) => {
      const color = (inner(r.xml, "calendar-color") ?? "").trim().match(/^#[0-9a-f]{6}/i)?.[0] ?? null;
      const name = decodeXml((inner(r.xml, "displayname") ?? "").trim()) || "Calendar";
      return { url: absolute(r.href, base), name, color };
    });
}

/** Events from one calendar, from a month ago to a year ahead. */
export async function fetchCalendarEvents(send: DavSend, calendarUrl: string, calendarId: string, today = dateKey(new Date())): Promise<CalEvent[]> {
  const from = new Date(`${addDays(today, -30)}T00:00:00`);
  const to = new Date(`${addDays(today, 400)}T00:00:00`);
  const res = await request(send, calendarUrl, "REPORT", "1", eventsQuery(from, to));
  return parseEventReport(res.body, calendarId);
}

export function parseEventReport(xml: string, calendarId: string): CalEvent[] {
  return multistatus(xml).flatMap((r) => {
    const data = inner(r.xml, "calendar-data");
    return data ? parseICS(decodeXml(data), calendarId) : [];
  });
}
