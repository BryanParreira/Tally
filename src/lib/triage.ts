/**
 * One inbox for everything that needs a decision: email, work that rolled over
 * from yesterday and tasks waiting in notes. Every item lands in a plain bucket
 * so it's obvious what to do with it: reply, meet a deadline, do it, wait, or skim.
 */
import { formatDay, fromKey } from "./date";
import { suggestFromMail, type MailSuggestion } from "./mail";
import { findNoteTasks, noteTitle } from "./notes";
import type { AppData, MailMessage } from "./types";

export type TriageKind = "email" | "carried" | "note";

/** What an item asks of you. */
export type Bucket = "reply" | "deadline" | "todo" | "vip" | "waiting" | "fyi" | "newsletter";

export const BUCKET_LABEL: Record<Bucket, string> = {
  reply: "Needs a reply",
  deadline: "Deadlines",
  todo: "To do",
  vip: "From people you marked important",
  waiting: "Waiting on someone",
  fyi: "FYI",
  newsletter: "Newsletters and updates",
};

/** The inbox views. "All" hides nothing; the others are Kindred's suggestions, which you can correct. */
export type InboxView = "all" | "important" | "waiting" | "other";
export const VIEW_BUCKETS: Record<InboxView, Bucket[]> = {
  all: ["reply", "deadline", "todo", "vip", "fyi", "newsletter", "waiting"],
  important: ["reply", "deadline", "todo", "vip"],
  waiting: ["waiting"],
  other: ["fyi", "newsletter"],
};

export interface TriageItem {
  id: string;
  kind: TriageKind;
  bucket: Bucket;
  /** Needs a decision from you (reply, deadline or to-do). */
  signal: boolean;
  /** Who or what it comes from: a sender or a note. */
  from: string;
  title: string;
  detail: string;
  /** Epoch ms used for sorting. */
  time: number;
  message?: MailMessage;
  suggestion?: MailSuggestion | null;
  taskId?: string;
  noteId?: string;
  /** For waiting emails: the day they come back. */
  waitingUntil?: string;
  /** You marked this sender important or not important. */
  rule?: "important" | "other";
}

type Source = Pick<AppData, "mail" | "tasks" | "notes" | "triageDone">;

function emailBucket(m: MailMessage, suggestion: MailSuggestion | null, rule?: "important" | "other"): Bucket {
  // Your call always wins over Kindred's guess.
  if (rule === "other") return m.bulk ? "newsletter" : "fyi";
  if (rule === "important" && !suggestion) return "vip";
  if (suggestion?.kind === "request") return "reply";
  if (suggestion?.kind === "deadline") return "deadline";
  if (suggestion?.kind === "event") return "todo";
  return m.bulk ? "newsletter" : "fyi";
}

export function buildTriage(data: Source, today: string): { signal: TriageItem[]; noise: TriageItem[]; all: TriageItem[] } {
  const done = new Set(data.triageDone);
  const handled = new Set(data.mail.handled);
  const waiting = data.mail.waiting ?? {};
  const senders = data.mail.senders ?? {};
  const startOfToday = fromKey(today).getTime();
  const items: TriageItem[] = [];

  for (const m of data.mail.messages) {
    const id = `mail:${m.id}`;
    if (done.has(id) || handled.has(m.id)) continue;
    const suggestion = suggestFromMail(m, today);
    const until = waiting[m.id];
    // Still waiting: parked. Past the day you picked: back on top, asking for a nudge.
    const stillWaiting = !!until && until > today;
    const rule = senders[m.fromAddress.trim().toLowerCase()];
    const bucket: Bucket = stillWaiting ? "waiting" : until ? "reply" : emailBucket(m, suggestion, rule);
    items.push({
      id,
      kind: "email",
      bucket,
      signal: VIEW_BUCKETS.important.includes(bucket),
      from: m.fromName || m.fromAddress,
      title: m.subject || "(no subject)",
      detail: until && !stillWaiting ? `No reply yet. Follow up?` : suggestion && rule !== "other" ? suggestion.reason : m.text.replace(/\s+/g, " ").slice(0, 140),
      time: m.date,
      message: m,
      suggestion,
      waitingUntil: until,
      rule,
    });
  }

  for (const t of data.tasks) {
    if (!t.carriedFrom || t.done || t.someday || t.date !== today) continue;
    const id = `carried:${t.id}:${today}`;
    if (done.has(id)) continue;
    items.push({
      id,
      kind: "carried",
      bucket: "todo",
      signal: true,
      from: "Carried over",
      title: t.title,
      detail: `Planned for ${formatDay(t.carriedFrom, today).toLowerCase()} but not finished.`,
      time: startOfToday,
      taskId: t.id,
    });
  }

  for (const n of data.notes) {
    const pending = findNoteTasks(n.body, today);
    if (!pending.length) continue;
    const id = `note:${n.id}:${pending.map((p) => p.item.title).join("|")}`;
    if (done.has(id)) continue;
    items.push({
      id,
      kind: "note",
      bucket: "todo",
      signal: true,
      from: noteTitle(n.title, n.body),
      title: pending.length === 1 ? pending[0].item.title : `${pending.length} tasks in a note`,
      detail: pending.length === 1 ? "From your note" : pending.map((p) => p.item.title).join(", "),
      time: n.updatedAt,
      noteId: n.id,
    });
  }

  items.sort((a, b) => b.time - a.time);
  return { signal: items.filter((i) => i.signal), noise: items.filter((i) => !i.signal), all: items };
}

/** Items for one inbox view, grouped by bucket in a fixed, sensible order. */
export function groupByBucket(items: TriageItem[], view: InboxView): { bucket: Bucket; label: string; items: TriageItem[] }[] {
  return VIEW_BUCKETS[view]
    .map((bucket) => ({ bucket, label: BUCKET_LABEL[bucket], items: items.filter((i) => i.bucket === bucket) }))
    .filter((g) => g.items.length);
}

/** "Today", "Yesterday", "This week", "Earlier": keeps a long list scannable. */
export function groupByDate(items: TriageItem[], today: string): { label: string; items: TriageItem[] }[] {
  const start = fromKey(today).getTime();
  const day = 86_400_000;
  const label = (t: number) => (t >= start ? "Today" : t >= start - day ? "Yesterday" : t >= start - 6 * day ? "This week" : "Earlier");
  const groups: { label: string; items: TriageItem[] }[] = [];
  for (const it of items) {
    const l = label(it.time);
    const g = groups.find((x) => x.label === l);
    if (g) g.items.push(it);
    else groups.push({ label: l, items: [it] });
  }
  return groups;
}
