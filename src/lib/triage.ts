/**
 * One inbox for everything that needs a decision: email, work that rolled
 * over from yesterday, tasks waiting in notes, flashcards that are due and
 * study that isn't planned yet. Split into Signal and Noise.
 */
import { formatDay, fromKey } from "./date";
import { suggestFromMail, type MailSuggestion } from "./mail";
import { findNoteTasks, noteTitle } from "./notes";
import { dueCards, topicsForToday } from "./study";
import type { AppData, MailMessage } from "./types";

export type TriageKind = "email" | "carried" | "note" | "cards" | "study";

export interface TriageItem {
  id: string;
  kind: TriageKind;
  signal: boolean;
  /** Who or what it comes from: a sender, a note, a course. */
  from: string;
  title: string;
  detail: string;
  /** Epoch ms used for date grouping and sorting. */
  time: number;
  message?: MailMessage;
  suggestion?: MailSuggestion | null;
  taskId?: string;
  noteId?: string;
  courseId?: string;
}

type Source = Pick<AppData, "mail" | "tasks" | "notes" | "courses" | "cards" | "triageDone">;

export function buildTriage(data: Source, today: string): { signal: TriageItem[]; noise: TriageItem[] } {
  const done = new Set(data.triageDone);
  const handled = new Set(data.mail.handled);
  const startOfToday = fromKey(today).getTime();
  const items: TriageItem[] = [];

  for (const m of data.mail.messages) {
    const id = `mail:${m.id}`;
    if (done.has(id) || handled.has(m.id)) continue;
    const suggestion = suggestFromMail(m, today);
    items.push({
      id,
      kind: "email",
      signal: !!suggestion,
      from: m.fromName || m.fromAddress,
      title: m.subject || "(no subject)",
      detail: suggestion ? suggestion.reason : m.text.replace(/\s+/g, " ").slice(0, 140),
      time: m.date,
      message: m,
      suggestion,
    });
  }

  for (const t of data.tasks) {
    if (!t.carriedFrom || t.done || t.date !== today) continue;
    const id = `carried:${t.id}:${today}`;
    if (done.has(id)) continue;
    items.push({
      id,
      kind: "carried",
      signal: true,
      from: "Carried over",
      title: t.title,
      detail: `Planned for ${formatDay(t.carriedFrom, today).toLowerCase()} but not finished. It's on today's plan now.`,
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
      signal: true,
      from: noteTitle(n.title, n.body),
      title: pending.length === 1 ? `1 task waiting in a note` : `${pending.length} tasks waiting in a note`,
      detail: pending.map((p) => p.item.title).join(", "),
      time: n.updatedAt,
      noteId: n.id,
    });
  }

  for (const c of data.courses) {
    if (c.examDate < today) continue;
    const due = dueCards(
      data.cards.filter((card) => card.courseId === c.id),
      today,
    ).length;
    const cardsId = `cards:${c.id}:${today}`;
    if (due > 0 && !done.has(cardsId)) {
      items.push({
        id: cardsId,
        kind: "cards",
        signal: true,
        from: c.name,
        title: `${due} ${due === 1 ? "flashcard is" : "flashcards are"} ready for review`,
        detail: "A few minutes now keeps them from slipping away.",
        time: startOfToday,
        courseId: c.id,
      });
    }

    const { topics, daysLeft } = topicsForToday(c, today);
    const planned = new Set(data.tasks.filter((t) => t.date === today && t.source === "study").map((t) => t.sourceRef));
    const studyId = `study:${c.id}:${today}`;
    if (topics.length && !topics.every((t) => planned.has(t.id)) && !done.has(studyId)) {
      items.push({
        id: studyId,
        kind: "study",
        signal: true,
        from: c.name,
        title: `Plan today's study: ${topics.map((t) => t.name).join(", ")}`,
        detail: `Exam in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}. Staying on pace covers everything in time.`,
        time: startOfToday,
        courseId: c.id,
      });
    }
  }

  items.sort((a, b) => b.time - a.time);
  return { signal: items.filter((i) => i.signal), noise: items.filter((i) => !i.signal) };
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
