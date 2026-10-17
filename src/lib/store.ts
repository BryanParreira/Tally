import { create } from "zustand";
import { addDays, dateKey, minutesOfDay } from "./date";
import { loadData, onRemoteData, saveData } from "./native";
import { parseBrainDump, type ParsedItem } from "./parse";
import { planDay } from "./schedule";
import { findNoteTasks, markPlanned } from "./notes";
import { eventsOn } from "./ics";
import { assignmentNote, courseRef, courseTag, plannedDay, reconcileAssignments, type Assignment } from "./courses";
import { firstName, suggestFromMail, type MailSuggestion } from "./mail";
import type { AppData, CalDavAccount, CalEvent, CalendarSource, MailAccount, MailMessage, Note, Settings, Snippet, Task } from "./types";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const today = () => dateKey(new Date());

let lastDeleted: Task | null = null;

/** Put back the most recently deleted task (for Undo). */
export function restoreDeletedTask() {
  const t = lastDeleted;
  if (!t) return;
  lastDeleted = null;
  useStore.setState((s) => (s.tasks.some((x) => x.id === t.id) ? s : { tasks: [...s.tasks, t] }));
}

export const DEFAULT_SETTINGS: Settings = {
  dayStart: 8 * 60,
  dayEnd: 22 * 60,
  breakEvery: 90,
  breakLength: 10,
  theme: "system",
  reminders: true,
  hiddenCalendars: [],
};

/** Kindred's own calendar for events you create in the app. Never synced anywhere. */
export const LOCAL_CALENDAR: CalendarSource = { id: "local", name: "My calendar", url: "", color: "#d9730d", lastSync: null };

/** Starter templates for the ; menu in notes. {{date}} becomes today's date. */
export const DEFAULT_SNIPPETS: Snippet[] = [
  { id: "lecture", name: "Lecture notes", body: "{{date}}\n\nKey ideas\n• \n\nExamples\n• \n\nQuestions to ask\n• \n\n[ ] review these notes tomorrow for 20 min\n" },
  { id: "meeting", name: "Meeting notes", body: "{{date}}\n\nWho\n• \n\nWhat we discussed\n• \n\nDecisions\n• \n\nNext steps\n[ ] \n" },
  { id: "weekly", name: "Weekly review", body: "Week of {{date}}\n\nWhat went well\n• \n\nWhat got in the way\n• \n\nTop three for next week\n[ ] \n[ ] \n[ ] \n" },
  { id: "journal", name: "Daily journal", body: "{{date}}\n\nOne thing that would make today great:\n\nI'm grateful for:\n\nWhat I learned:\n" },
  { id: "reading", name: "Reading notes", body: "Author: \n\nThe whole thing in three sentences\n\n\nKey terms\nTerm: definition\n\nMy questions\n• \n" },
];

export const CALENDAR_COLORS = ["#2383e2", "#d9730d", "#0f7b6c", "#9065b0", "#c14c8a", "#4f6d7a"];

export function emptyData(): AppData {
  return {
    version: 1,
    onboarded: false,
    name: "",
    settings: { ...DEFAULT_SETTINGS },
    tasks: [],
    mail: { accounts: [], messages: [], handled: [], waiting: {}, senders: {}, lastSync: null },
    notes: [],
    snippets: DEFAULT_SNIPPETS.map((s) => ({ ...s })),
    calendars: [],
    calAccounts: [],
    events: [],
    triageDone: [],
  };
}

export const MAIL_COLORS = ["#2383e2", "#0f7b6c", "#d9730d", "#9065b0", "#c14c8a", "#4f6d7a"];

/** Older versions had one email account; turn it into the first of many. */
function normalizeMail(raw: unknown): AppData["mail"] {
  const base: AppData["mail"] = { accounts: [], messages: [], handled: [], waiting: {}, senders: {}, lastSync: null };
  if (!raw || typeof raw !== "object") return base;
  const m = raw as Partial<AppData["mail"]> & { account?: Omit<MailAccount, "id" | "color"> | null };
  let accounts = Array.isArray(m.accounts) ? m.accounts : [];
  let messages = Array.isArray(m.messages) ? m.messages : [];
  if (!accounts.length && m.account) {
    const legacy: MailAccount = { ...m.account, id: m.account.username, color: MAIL_COLORS[0] };
    accounts = [legacy];
    messages = messages.map((msg) => ({ ...msg, accountId: msg.accountId ?? legacy.id }));
  }
  const waiting = m.waiting && typeof m.waiting === "object" && !Array.isArray(m.waiting) ? m.waiting : {};
  const senders = m.senders && typeof m.senders === "object" && !Array.isArray(m.senders) ? m.senders : {};
  return { accounts, messages, handled: Array.isArray(m.handled) ? m.handled : [], waiting, senders, lastSync: m.lastSync ?? null };
}

function normalize(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<AppData>;
  // Older versions had courses, flashcards, a focus timer and a floating Now Bar; none of them are kept.
  const { courses: _c, cards: _k, focus: _f, stats: _s, ...rest } = d as Partial<AppData> & { courses?: unknown; cards?: unknown; focus?: unknown; stats?: unknown };
  const { nowBar: _n, ...savedSettings } = (d.settings ?? {}) as Partial<Settings> & { nowBar?: unknown };
  return {
    ...base,
    ...rest,
    settings: { ...base.settings, ...savedSettings },
    mail: normalizeMail(d.mail),
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    notes: Array.isArray(d.notes) ? d.notes : [],
    snippets: Array.isArray(d.snippets) ? d.snippets : base.snippets,
    calendars: Array.isArray(d.calendars) ? d.calendars : [],
    calAccounts: Array.isArray(d.calAccounts) ? d.calAccounts : [],
    events: Array.isArray(d.events) ? d.events : [],
    triageDone: Array.isArray(d.triageDone) ? d.triageDone : [],
  };
}

interface Actions {
  finishOnboarding(name: string, dayStart: number, dayEnd: number, example: boolean): void;
  planDump(text: string, date: string): number;
  addTask(item: ParsedItem & { source?: Task["source"]; sourceRef?: string }, date: string): Task;
  updateTask(id: string, patch: Partial<Task>): void;
  toggleDone(id: string, plannedStart: number | null): void;
  deleteTask(id: string): void;
  moveTasks(ids: string[], date: string): void;
  updateSettings(patch: Partial<Settings>): void;
  setName(name: string): void;
  addMailAccount(account: Omit<MailAccount, "id" | "color"> & { color?: string }): MailAccount;
  updateMailAccount(id: string, patch: Partial<Omit<MailAccount, "id">>): void;
  removeMailAccount(id: string): void;
  /** Replace one inbox's recent messages after a sync. */
  setMessages(accountId: string, messages: MailMessage[]): void;
  handleMail(id: string): void;
  addMailTask(s: MailSuggestion): void;
  /** Turn an email into a task on `date` (or the backlog when null), linked back to the email. */
  planMail(message: MailMessage, date: string | null): Task;
  /** Wait for a reply until `until`; the email comes back to the inbox that day. `null` stops waiting. */
  setWaiting(messageId: string, until: string | null): void;
  /** Mark a sender important or not important; `null` goes back to Kindred's guess. */
  setSenderRule(address: string, rule: "important" | "other" | null): void;
  addNote(): string;
  updateNote(id: string, patch: Partial<Pick<Note, "title" | "body">>): void;
  deleteNote(id: string): void;
  planNoteTasks(id: string): number;
  addSnippet(): string;
  updateSnippet(id: string, patch: Partial<Pick<Snippet, "name" | "body">>): void;
  deleteSnippet(id: string): void;
  addCalendar(name: string, url: string, extra?: Partial<CalendarSource>): CalendarSource;
  addCalAccount(account: Omit<CalDavAccount, "id">, id: string): CalDavAccount;
  removeCalAccount(id: string): void;
  removeCalendar(id: string): void;
  setCalendarEvents(id: string, events: CalEvent[] | null, error?: string): void;
  /** Turn a course feed's deadlines into tasks. Returns how many were added. */
  syncAssignments(calendarId: string, assignments: Assignment[]): number;
  addEvent(event: Omit<CalEvent, "uid" | "calendarId">): CalEvent;
  updateEvent(uid: string, patch: Partial<CalEvent>): void;
  deleteEvent(uid: string): void;
  toggleCalendar(id: string): void;
  markTriaged(id: string): void;
  untriage(id: string): void;
  replaceData(data: AppData): void;
}

export type Store = AppData & { ready: boolean } & Actions;

export const useStore = create<Store>()((set, get) => ({
  ...emptyData(),
  ready: false,

  finishOnboarding(name, dayStart, dayEnd, example) {
    set((s) => ({ onboarded: true, name: name.trim(), settings: { ...s.settings, dayStart, dayEnd } }));
    if (example) {
      const d = today();
      const now = minutesOfDay(new Date());
      const sample = parseBrainDump(
        "study for the biology quiz for 1h, reply to the group chat about the project, 30 min walk, plan next week for 20 min, read 20 pages of my book",
        d,
      );
      sample.forEach((item) => get().addTask({ ...item, source: "dump" }, d));
      if (now < dayEnd - 120) {
        const meeting = Math.min(dayEnd - 60, Math.ceil((now + 150) / 30) * 30);
        get().addTask({ title: "Team check-in", category: "work", duration: 30, start: meeting, date: null, due: null, source: "manual" }, d);
      }
    }
  },

  planDump(text, date) {
    const items = parseBrainDump(text, date);
    items.forEach((item) => get().addTask({ ...item, source: "dump" }, date));
    return items.length;
  },

  addTask(item, date) {
    const t: Task = {
      id: uid(),
      title: item.title,
      category: item.category,
      date: item.date ?? date,
      start: item.start,
      fixed: item.start !== null,
      duration: Math.max(5, item.duration),
      done: false,
      due: item.due ?? undefined,
      source: item.source ?? "manual",
      sourceRef: item.sourceRef,
      createdAt: Date.now() + Math.random(),
      ...(item.priority && item.priority !== "normal" ? { priority: item.priority } : {}),
      ...(item.tags?.length ? { tags: item.tags } : {}),
      ...(item.someday ? { someday: true } : {}),
    };
    set((s) => ({ tasks: [...s.tasks, t] }));
    return t;
  },

  updateTask(id, patch) {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  },

  toggleDone(id, plannedStart) {
    const s = get();
    const t = s.tasks.find((x) => x.id === id);
    if (!t) return;
    if (t.done) {
      s.updateTask(id, { done: false, doneAt: undefined, start: t.fixed ? t.start : null });
    } else {
      const now = minutesOfDay(new Date());
      // Remember where it sat in the day so finished work stays on the timeline.
      // Finished early? Then it ends now instead of floating in the future.
      let start = t.fixed ? t.start : plannedStart;
      if (!t.fixed && t.date === today() && (start === null || start > now)) start = Math.max(0, now - t.duration);
      s.updateTask(id, { done: true, doneAt: Date.now(), start });
    }
  },

  deleteTask(id) {
    const task = get().tasks.find((t) => t.id === id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    if (task) lastDeleted = task;
  },

  moveTasks(ids, date) {
    set((s) => ({ tasks: s.tasks.map((t) => (ids.includes(t.id) ? { ...t, date, start: t.fixed ? t.start : null } : t)) }));
  },

  updateSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
  },

  setName(name) {
    set({ name });
  },

  addMailAccount(account) {
    const s = get();
    const existing = s.mail.accounts.find((a) => a.username === account.username && a.host === account.host);
    if (existing) return existing;
    const used = new Set(s.mail.accounts.map((a) => a.color));
    const color = account.color ?? MAIL_COLORS.find((c) => !used.has(c)) ?? MAIL_COLORS[s.mail.accounts.length % MAIL_COLORS.length];
    const full: MailAccount = { ...account, id: uid(), color };
    set({ mail: { ...s.mail, accounts: [...s.mail.accounts, full] } });
    return full;
  },

  updateMailAccount(id, patch) {
    set((s) => ({ mail: { ...s.mail, accounts: s.mail.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) } }));
  },

  removeMailAccount(id) {
    set((s) => ({ mail: { ...s.mail, accounts: s.mail.accounts.filter((a) => a.id !== id), messages: s.mail.messages.filter((m) => m.accountId !== id) } }));
  },

  setMessages(accountId, messages) {
    set((s) => ({
      mail: {
        ...s.mail,
        messages: [...s.mail.messages.filter((m) => m.accountId !== accountId), ...messages.map((m) => ({ ...m, accountId }))],
        accounts: s.mail.accounts.map((a) => (a.id === accountId ? { ...a, lastSync: Date.now(), error: null, count: messages.length } : a)),
        lastSync: Date.now(),
      },
    }));
  },

  handleMail(id) {
    set((s) => ({ mail: { ...s.mail, handled: s.mail.handled.includes(id) ? s.mail.handled : [...s.mail.handled, id] } }));
  },

  planMail(message, date) {
    const d = today();
    const sug = suggestFromMail(message, d);
    const who = firstName(message.fromName, message.fromAddress);
    const subject = (message.subject || "(no subject)").replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim();
    const title = sug?.title ?? `Reply to ${who}: ${subject}`;
    const task = get().addTask(
      { title, category: sug?.category ?? "work", duration: sug?.duration ?? 15, start: null, date: null, due: sug?.due ?? null, source: "email", sourceRef: message.id },
      date ?? d,
    );
    if (!date) get().updateTask(task.id, { someday: true });
    get().handleMail(message.id);
    get().setWaiting(message.id, null);
    return task;
  },

  setSenderRule(address, rule) {
    const key = address.trim().toLowerCase();
    if (!key) return;
    set((s) => {
      const senders = { ...s.mail.senders };
      if (rule) senders[key] = rule;
      else delete senders[key];
      return { mail: { ...s.mail, senders } };
    });
  },

  setWaiting(messageId, until) {
    set((s) => {
      const waiting = { ...s.mail.waiting };
      if (until) waiting[messageId] = until;
      else delete waiting[messageId];
      return { mail: { ...s.mail, waiting } };
    });
  },

  addMailTask(sug) {
    const d = today();
    get().addTask(
      { title: sug.title, category: sug.category, duration: sug.duration, start: null, date: null, due: sug.due, source: "email", sourceRef: sug.messageId },
      d,
    );
    get().handleMail(sug.messageId);
  },

  addNote() {
    const now = Date.now();
    const note: Note = { id: uid(), title: "", body: "", createdAt: now, updatedAt: now };
    set((s) => ({ notes: [note, ...s.notes] }));
    return note.id;
  },

  updateNote(id, patch) {
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)) }));
  },

  deleteNote(id) {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
  },

  planNoteTasks(id) {
    const note = get().notes.find((n) => n.id === id);
    if (!note) return 0;
    const d = today();
    const found = findNoteTasks(note.body, d);
    found.forEach((f) => get().addTask({ ...f.item, source: "note", sourceRef: id }, d));
    if (found.length) get().updateNote(id, { body: markPlanned(note.body) });
    return found.length;
  },

  addSnippet() {
    const snippet: Snippet = { id: uid(), name: "", body: "" };
    set((s) => ({ snippets: [...s.snippets, snippet] }));
    return snippet.id;
  },

  updateSnippet(id, patch) {
    set((s) => ({ snippets: s.snippets.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  },

  deleteSnippet(id) {
    set((s) => ({ snippets: s.snippets.filter((x) => x.id !== id) }));
  },

  addCalendar(name, url, extra) {
    const s = get();
    const cal: CalendarSource = {
      id: uid(),
      name: name.trim() || "Calendar",
      url: url.trim(),
      color: CALENDAR_COLORS[s.calendars.length % CALENDAR_COLORS.length],
      lastSync: null,
      ...extra,
    };
    set({ calendars: [...s.calendars, cal] });
    return cal;
  },

  addCalAccount(account, id) {
    const full: CalDavAccount = { ...account, id };
    set((s) => ({ calAccounts: [...s.calAccounts.filter((a) => a.id !== id), full] }));
    return full;
  },

  removeCalAccount(id) {
    set((s) => {
      const gone = new Set(s.calendars.filter((c) => c.accountId === id).map((c) => c.id));
      return {
        calAccounts: s.calAccounts.filter((a) => a.id !== id),
        calendars: s.calendars.filter((c) => !gone.has(c.id)),
        events: s.events.filter((e) => !gone.has(e.calendarId)),
      };
    });
  },

  removeCalendar(id) {
    set((s) => ({ calendars: s.calendars.filter((c) => c.id !== id), events: s.events.filter((e) => e.calendarId !== id) }));
  },

  setCalendarEvents(id, events, error) {
    set((s) => ({
      calendars: s.calendars.map((c) => (c.id === id ? { ...c, lastSync: events ? Date.now() : c.lastSync, error } : c)),
      events: events ? [...s.events.filter((e) => e.calendarId !== id), ...events] : s.events,
    }));
  },

  syncAssignments(calendarId, assignments) {
    const s = get();
    const cal = s.calendars.find((c) => c.id === calendarId);
    if (!cal) return 0;
    const d = today();
    const plan = reconcileAssignments(s.tasks, assignments, cal.imported ?? [], d);
    const patches = new Map(plan.update.map((u) => [u.id, u.patch]));
    const added: Task[] = plan.add.map((a) => {
      const tag = courseTag(a.course);
      return {
        id: uid(),
        title: a.title,
        category: "study",
        date: plannedDay(a.due, d),
        start: null,
        fixed: false,
        duration: 45,
        done: false,
        due: a.due,
        source: "study",
        sourceRef: courseRef(a.uid),
        createdAt: Date.now() + Math.random(),
        notes: assignmentNote(a),
        ...(tag ? { tags: [tag] } : {}),
      };
    });
    set((st) => ({
      tasks: [...st.tasks.map((t) => (patches.has(t.id) ? { ...t, ...patches.get(t.id) } : t)), ...added],
      calendars: st.calendars.map((c) => (c.id === calendarId ? { ...c, imported: plan.imported } : c)),
    }));
    return added.length;
  },

  addEvent(event) {
    const ev: CalEvent = { ...event, uid: `local-${uid()}`, calendarId: LOCAL_CALENDAR.id };
    set((s) => ({ events: [...s.events, ev] }));
    return ev;
  },

  updateEvent(id, patch) {
    set((s) => ({ events: s.events.map((e) => (e.uid === id && e.calendarId === LOCAL_CALENDAR.id ? { ...e, ...patch } : e)) }));
  },

  deleteEvent(id) {
    set((s) => ({ events: s.events.filter((e) => !(e.uid === id && e.calendarId === LOCAL_CALENDAR.id)) }));
  },

  toggleCalendar(id) {
    set((s) => {
      const hidden = s.settings.hiddenCalendars;
      return { settings: { ...s.settings, hiddenCalendars: hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id] } };
    });
  },

  markTriaged(id) {
    set((s) => ({ triageDone: s.triageDone.includes(id) ? s.triageDone : [...s.triageDone.slice(-500), id] }));
  },

  untriage(id) {
    set((s) => ({ triageDone: s.triageDone.filter((x) => x !== id) }));
  },

  replaceData(data) {
    set({ ...normalize(data) });
  },
}));

/** Everything Kindred knows, as one JSON document (passwords are never included). */
export function exportData(): string {
  return JSON.stringify({ ...snapshot(useStore.getState()), exportedAt: new Date().toISOString(), app: "Kindred" }, null, 2);
}

/** Check a backup file before it replaces anything. */
export function parseBackup(text: string): AppData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Kindred backup.");
  }
  const d = raw as Partial<AppData>;
  if (!d || typeof d !== "object" || d.version !== 1 || !Array.isArray(d.tasks)) throw new Error("That file isn't a Kindred backup.");
  return normalize(d);
}

function snapshot(s: Store): AppData {
  const { version, onboarded, name, settings, tasks, mail, notes, snippets, calendars, calAccounts, events, triageDone } = s;
  return { version, onboarded, name, settings, tasks, mail, notes, snippets, calendars, calAccounts, events, triageDone };
}

let applyingRemote = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = "";

/** Load saved data, then keep it saved and in sync with other windows. */
export async function initStore(): Promise<void> {
  try {
    const raw = await loadData();
    if (raw) {
      lastSaved = raw;
      useStore.setState({ ...normalize(JSON.parse(raw)) });
    }
  } catch (err) {
    console.error("Could not load saved data", err);
  }
  rollOverUnfinished();
  useStore.setState({ ready: true });

  useStore.subscribe((s) => {
    if (applyingRemote || !s.ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const json = JSON.stringify(snapshot(useStore.getState()));
      if (json === lastSaved) return;
      lastSaved = json;
      saveData(json).catch((err) => console.error("Could not save", err));
    }, 200);
  });

  await onRemoteData((json) => {
    if (json === lastSaved) return;
    lastSaved = json;
    applyingRemote = true;
    try {
      useStore.setState({ ...normalize(JSON.parse(json)) });
    } finally {
      applyingRemote = false;
    }
  });
}

/** Unfinished flexible tasks from past days move to today automatically. No guilt, no red lists. */
export function rollOverUnfinished() {
  const d = today();
  const stale = useStore.getState().tasks.filter((t) => !t.done && t.date < d && !t.fixed && !t.someday);
  if (!stale.length) return;
  const ids = new Set(stale.map((t) => t.id));
  useStore.setState((s) => ({
    tasks: s.tasks.map((t) => (ids.has(t.id) ? { ...t, date: d, start: null, carriedFrom: t.carriedFrom ?? t.date } : t)),
  }));
}

export function planFor(s: Pick<AppData, "tasks" | "settings" | "events">, date: string, nowDate = new Date()) {
  const d = dateKey(nowDate);
  const tasks = s.tasks.filter((t) => t.date === date && !t.someday);
  return planDay(
    tasks,
    s.settings,
    {
      now: date === d ? minutesOfDay(nowDate) : null,
      past: date < d,
    },
    eventsOn(s.events, date),
  );
}

export const tomorrowOf = (key: string) => addDays(key, 1);
