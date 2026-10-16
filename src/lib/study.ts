import { addDays, daysBetween } from "./date";
import type { Card, Course } from "./types";

export type Grade = "again" | "hard" | "good" | "easy";

export interface CardDraft {
  front: string;
  back: string;
}

const MAX_TERM_WORDS = 7;

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[-*•\d.)\s]+/, "").trim();
}

/**
 * Build flashcards from the user's own notes. Understands "Term: definition",
 * "Term - definition", "Q: ... / A: ..." and simple "X is Y." sentences.
 */
export function cardsFromNotes(notes: string): CardDraft[] {
  const out: CardDraft[] = [];
  const seen = new Set<string>();
  const push = (front: string, back: string) => {
    const f = tidy(front);
    const b = tidy(back);
    if (!f || !b || b.length < 3) return;
    const key = f.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ front: f, back: b });
  };

  const lines = notes.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const q = line.match(/^q(?:uestion)?\s*[:.]\s*(.+)$/i);
    if (q) {
      const a = lines[i + 1]?.trim().match(/^a(?:nswer)?\s*[:.]\s*(.+)$/i);
      if (a) {
        push(q[1], a[1]);
        i++;
      }
      continue;
    }

    const pair = line.match(/^(.{2,80}?)\s*(?::|\s[-–—=]\s|\s?->\s?)\s*(.{3,})$/);
    if (pair && words(pair[1]) <= MAX_TERM_WORDS && !/^https?$/i.test(pair[1])) {
      const term = tidy(pair[1]);
      push(/\?$/.test(term) ? term : `What is ${term}?`, capitalize(pair[2]));
      continue;
    }

    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const m = sentence.match(/^(?:the\s+)?(.{2,60}?)\s+(is|are|refers to|means)\s+(.{6,})$/i);
      if (m && words(m[1]) <= MAX_TERM_WORDS && !/^(it|this|that|there|these|those|he|she|they|we|i)$/i.test(m[1])) {
        const verb = m[2].toLowerCase() === "are" ? "are" : "is";
        push(`What ${verb} ${tidy(m[1])}?`, capitalize(sentence.replace(/\.$/, "")));
      }
    }
  }
  return out;
}

function capitalize(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function newCard(draft: CardDraft, courseId: string | null, today: string, id: string): Card {
  return { id, courseId, front: draft.front, back: draft.back, ease: 2.5, interval: 0, reps: 0, due: today };
}

/** SM-2 style spaced repetition: answer well and the card comes back later. */
export function reviewCard(card: Card, grade: Grade, today: string): Card {
  let { ease, interval, reps } = card;
  if (grade === "again") {
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    const q = grade === "hard" ? 3 : grade === "good" ? 4 : 5;
    ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    reps += 1;
    if (reps === 1) interval = grade === "easy" ? 3 : 1;
    else if (reps === 2) interval = grade === "hard" ? 3 : 6;
    else interval = Math.round(interval * (grade === "hard" ? 1.2 : grade === "easy" ? ease * 1.3 : ease));
  }
  return { ...card, ease, interval, reps, due: addDays(today, interval) };
}

export function dueCards(cards: Card[], today: string): Card[] {
  return cards.filter((c) => c.due <= today);
}

/**
 * Which topics to study today so every topic is covered before the exam,
 * leaving the last day free for review.
 */
export function topicsForToday(course: Course, today: string): { topics: Course["topics"]; daysLeft: number } {
  const daysLeft = daysBetween(today, course.examDate);
  const remaining = course.topics.filter((t) => !t.done);
  if (daysLeft < 0 || remaining.length === 0) return { topics: [], daysLeft };
  const studyDays = Math.max(1, daysLeft);
  const perDay = Math.ceil(remaining.length / studyDays);
  return { topics: remaining.slice(0, perDay), daysLeft };
}
