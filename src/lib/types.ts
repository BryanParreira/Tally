export type Category = "study" | "work" | "life";
export type TaskSource = "manual" | "dump" | "email" | "study" | "note";
export type Priority = "low" | "normal" | "high" | "urgent";
/** Workflow state for unfinished tasks; finished tasks use `done`. */
export type TaskStatus = "todo" | "doing" | "waiting";

export interface Task {
  id: string;
  title: string;
  category: Category;
  /** Day the task is planned for, as YYYY-MM-DD (local time). */
  date: string;
  /** Minutes after midnight. Only meaningful when `fixed` or `done`. */
  start: number | null;
  /** Pinned to a time (a class, a meeting, "at 3pm"). The scheduler never moves it. */
  fixed: boolean;
  /** Minutes. */
  duration: number;
  done: boolean;
  doneAt?: number;
  /** Deadline as YYYY-MM-DD. Earlier deadlines are scheduled first. */
  due?: string;
  source: TaskSource;
  sourceRef?: string;
  createdAt: number;
  /** Higher priority work is scheduled first. */
  priority?: Priority;
  /** Lowercase tags without the "#". */
  tags?: string[];
  /** The day this task was originally planned for, when it rolled forward unfinished. */
  carriedFrom?: string;
  status?: TaskStatus;
  /** In the backlog: kept, but not planned into any day. */
  someday?: boolean;
  /** Free-form details. */
  notes?: string;
}

export interface Settings {
  /** Minutes after midnight. */
  dayStart: number;
  dayEnd: number;
  /** Insert a break after this many minutes of back-to-back work. */
  breakEvery: number;
  breakLength: number;
  theme: "system" | "light" | "dark";
  /** A gentle notification card when a task or event is about to start. */
  reminders: boolean;
  /** Calendars hidden in the Calendar tab ("tasks" = Kindred's plan, "local" = My calendar). */
  hiddenCalendars: string[];
}

export interface MailAccount {
  id: string;
  provider: string;
  host: string;
  port: number;
  username: string;
  /** Colour dot that marks this inbox's mail in the unified list. */
  color: string;
  /** A short name such as "School" or "Work". Falls back to the address. */
  name?: string;
  /** When this inbox last synced successfully (epoch ms). */
  lastSync?: number | null;
  /** Why the last sync failed, in plain words. Cleared by the next good sync. */
  error?: string | null;
  /** How many recent messages the last sync found. */
  count?: number;
}

export interface MailMessage {
  id: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  /** Epoch ms. */
  date: number;
  text: string;
  bulk: boolean;
  /** Which connected inbox this came from. */
  accountId?: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface Snippet {
  id: string;
  name: string;
  body: string;
}

/** A calendar the user subscribed to through its private iCal (.ics) link. */
export interface CalendarSource {
  id: string;
  name: string;
  /** The .ics link, or the CalDAV collection URL. Empty for imported files. */
  url: string;
  color: string;
  lastSync: number | null;
  error?: string;
  /** "ics" link (default), "caldav" account calendar, or a one-off imported "file". */
  kind?: "ics" | "caldav" | "file";
  /** For CalDAV calendars: the account they belong to. */
  accountId?: string;
  /** A course feed (Brightspace, Canvas…): assignment deadlines become tasks. */
  course?: boolean;
  /** Assignment ids already turned into tasks, so deleted ones don't come back. */
  imported?: string[];
}

/** A signed-in calendar account such as Apple iCloud. The password lives in the OS keychain. */
export interface CalDavAccount {
  id: string;
  provider: string;
  server: string;
  username: string;
}

export interface Recurrence {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  /** Last date (YYYY-MM-DD) an occurrence may fall on. */
  until?: string;
  count?: number;
  /** Weekdays, 0 = Sunday. */
  byday?: number[];
}

export interface CalEvent {
  uid: string;
  calendarId: string;
  title: string;
  location?: string;
  allDay: boolean;
  /** "YYYY-MM-DDTHH:MM" in local time, or "YYYY-MM-DD" for all-day events. */
  start: string;
  end: string;
  rrule?: Recurrence;
  /** Dates (YYYY-MM-DD) skipped in a recurring series. */
  exdates?: string[];
}

export interface AppData {
  version: 1;
  onboarded: boolean;
  name: string;
  settings: Settings;
  tasks: Task[];
  mail: {
    accounts: MailAccount[];
    messages: MailMessage[];
    handled: string[];
    /** Emails you're waiting to hear back on: message id → the day to bring them back (YYYY-MM-DD). */
    waiting: Record<string, string>;
    /** Your call on a sender (by email address), which always beats Kindred's guess. */
    senders: Record<string, "important" | "other">;
    lastSync: number | null;
  };
  notes: Note[];
  snippets: Snippet[];
  calendars: CalendarSource[];
  calAccounts: CalDavAccount[];
  events: CalEvent[];
  /** Inbox items the user marked done (e), so they stay out of the inbox. */
  triageDone: string[];
}
