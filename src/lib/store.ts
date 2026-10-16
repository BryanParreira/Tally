import { create } from "zustand";
import { addDays, dateKey, minutesOfDay } from "./date";
import { loadData, onRemoteData, saveData } from "./native";
import { parseBrainDump, type ParsedItem } from "./parse";
import { planDay } from "./schedule";
import { newCard, reviewCard, topicsForToday, type CardDraft, type Grade } from "./study";
import { findNoteTasks, markPlanned } from "./notes";
import type { MailSuggestion } from "./mail";
import type { AppData, Course, MailAccount, MailMessage, Note, Settings, Task } from "./types";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const today = () => dateKey(new Date());

export const DEFAULT_SETTINGS: Settings = {
  dayStart: 8 * 60,
  dayEnd: 22 * 60,
  breakEvery: 90,
  breakLength: 10,
  theme: "system",
  nowBar: true,
  reminders: true,
};

export function emptyData(): AppData {
  return {
    version: 1,
    onboarded: false,
    name: "",
    settings: { ...DEFAULT_SETTINGS },
    tasks: [],
    focus: null,
    stats: {},
    mail: { account: null, messages: [], handled: [], lastSync: null },
    courses: [],
    cards: [],
    notes: [],
  };
}

function normalize(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<AppData>;
  return {
    ...base,
    ...d,
    settings: { ...base.settings, ...(d.settings ?? {}) },
    mail: { ...base.mail, ...(d.mail ?? {}) },
    tasks: Array.isArray(d.tasks) ? d.tasks : [],
    courses: Array.isArray(d.courses) ? d.courses : [],
    cards: Array.isArray(d.cards) ? d.cards : [],
    notes: Array.isArray(d.notes) ? d.notes : [],
    stats: d.stats ?? {},
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
  startFocus(id: string): void;
  pauseFocus(): void;
  stopFocus(): void;
  updateSettings(patch: Partial<Settings>): void;
  setName(name: string): void;
  setMailAccount(account: MailAccount | null): void;
  setMessages(messages: MailMessage[]): void;
  handleMail(id: string): void;
  addMailTask(s: MailSuggestion): void;
  addCourse(course: Omit<Course, "id">): void;
  updateCourse(id: string, patch: Partial<Course>): void;
  deleteCourse(id: string): void;
  toggleTopic(courseId: string, topicId: string): void;
  planStudyToday(courseId: string): number;
  addCards(drafts: CardDraft[], courseId: string | null): void;
  gradeCard(id: string, grade: Grade): void;
  deleteCard(id: string): void;
  addNote(): string;
  updateNote(id: string, patch: Partial<Pick<Note, "title" | "body">>): void;
  deleteNote(id: string): void;
  planNoteTasks(id: string): number;
  replaceData(data: AppData): void;
}

export type Store = AppData & { ready: boolean } & Actions;

/** Ms of focus in the current session, including the part still running. */
export function focusElapsed(f: AppData["focus"], now = Date.now()): number {
  if (!f) return 0;
  return f.elapsed + (f.runningSince ? now - f.runningSince : 0);
}

function addFocusMinutes(stats: AppData["stats"], ms: number): AppData["stats"] {
  const key = today();
  const prev = stats[key]?.focusMinutes ?? 0;
  return { ...stats, [key]: { focusMinutes: prev + ms / 60000 } };
}

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
    if (s.focus?.taskId === id && !t.done) s.stopFocus();
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
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), focus: s.focus?.taskId === id ? null : s.focus }));
  },

  moveTasks(ids, date) {
    set((s) => ({ tasks: s.tasks.map((t) => (ids.includes(t.id) ? { ...t, date, start: t.fixed ? t.start : null } : t)) }));
  },

  startFocus(id) {
    const s = get();
    if (s.focus?.taskId === id) {
      if (!s.focus.runningSince) set({ focus: { ...s.focus, runningSince: Date.now() } });
      return;
    }
    if (s.focus) s.stopFocus();
    set({ focus: { taskId: id, runningSince: Date.now(), elapsed: 0 } });
  },

  pauseFocus() {
    const f = get().focus;
    if (!f?.runningSince) return;
    const ran = Date.now() - f.runningSince;
    set((s) => ({ focus: { ...f, runningSince: null, elapsed: f.elapsed + ran }, stats: addFocusMinutes(s.stats, ran) }));
  },

  stopFocus() {
    const f = get().focus;
    if (!f) return;
    const ran = f.runningSince ? Date.now() - f.runningSince : 0;
    set((s) => ({ focus: null, stats: addFocusMinutes(s.stats, ran) }));
  },

  updateSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
  },

  setName(name) {
    set({ name });
  },

  setMailAccount(account) {
    set((s) => ({ mail: account ? { ...s.mail, account } : { account: null, messages: [], handled: [], lastSync: null } }));
  },

  setMessages(messages) {
    set((s) => ({ mail: { ...s.mail, messages, lastSync: Date.now() } }));
  },

  handleMail(id) {
    set((s) => ({ mail: { ...s.mail, handled: s.mail.handled.includes(id) ? s.mail.handled : [...s.mail.handled, id] } }));
  },

  addMailTask(sug) {
    const d = today();
    get().addTask(
      { title: sug.title, category: sug.category, duration: sug.duration, start: null, date: null, due: sug.due, source: "email", sourceRef: sug.messageId },
      d,
    );
    get().handleMail(sug.messageId);
  },

  addCourse(course) {
    set((s) => ({ courses: [...s.courses, { ...course, id: uid() }] }));
  },

  updateCourse(id, patch) {
    set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },

  deleteCourse(id) {
    set((s) => ({ courses: s.courses.filter((c) => c.id !== id), cards: s.cards.filter((c) => c.courseId !== id) }));
  },

  toggleTopic(courseId, topicId) {
    set((s) => ({
      courses: s.courses.map((c) =>
        c.id === courseId ? { ...c, topics: c.topics.map((t) => (t.id === topicId ? { ...t, done: !t.done } : t)) } : c,
      ),
    }));
  },

  planStudyToday(courseId) {
    const s = get();
    const course = s.courses.find((c) => c.id === courseId);
    if (!course) return 0;
    const d = today();
    const { topics } = topicsForToday(course, d);
    const already = new Set(s.tasks.filter((t) => t.date === d && t.source === "study").map((t) => t.sourceRef));
    const fresh = topics.filter((t) => !already.has(t.id));
    const each = Math.max(20, Math.round(course.minutesPerDay / Math.max(1, topics.length)));
    fresh.forEach((topic) =>
      s.addTask(
        { title: `${course.name}: ${topic.name}`, category: "study", duration: each, start: null, date: null, due: course.examDate, source: "study", sourceRef: topic.id },
        d,
      ),
    );
    const due = s.cards.filter((c) => c.courseId === courseId && c.due <= d).length;
    if (due > 0 && !already.has(`review:${courseId}`)) {
      s.addTask(
        { title: `Review ${due} ${course.name} flashcards`, category: "study", duration: Math.min(30, 5 + due), start: null, date: null, due: d, source: "study", sourceRef: `review:${courseId}` },
        d,
      );
      return fresh.length + 1;
    }
    return fresh.length;
  },

  addCards(drafts, courseId) {
    const d = today();
    set((s) => ({ cards: [...s.cards, ...drafts.map((dr) => newCard(dr, courseId, d, uid()))] }));
  },

  gradeCard(id, grade) {
    const d = today();
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? reviewCard(c, grade, d) : c)) }));
  },

  deleteCard(id) {
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
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

  replaceData(data) {
    set({ ...normalize(data) });
  },
}));

function snapshot(s: Store): AppData {
  const { version, onboarded, name, settings, tasks, focus, stats, mail, courses, cards, notes } = s;
  return { version, onboarded, name, settings, tasks, focus, stats, mail, courses, cards, notes };
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
  const stale = useStore.getState().tasks.filter((t) => !t.done && t.date < d && !t.fixed);
  if (stale.length) useStore.getState().moveTasks(stale.map((t) => t.id), d);
}

export function planFor(s: Pick<AppData, "tasks" | "settings" | "focus">, date: string, nowDate = new Date()) {
  const d = dateKey(nowDate);
  const tasks = s.tasks.filter((t) => t.date === date);
  return planDay(tasks, s.settings, {
    now: date === d ? minutesOfDay(nowDate) : null,
    past: date < d,
    focus: date === d ? s.focus : null,
    nowMs: nowDate.getTime(),
  });
}

export const tomorrowOf = (key: string) => addDays(key, 1);
