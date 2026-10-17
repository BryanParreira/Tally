/**
 * Course calendars (Brightspace/D2L, Canvas, Moodle, Blackboard) mix two things:
 * classes, which belong on the calendar, and assignment deadlines, which are
 * really tasks. This splits a feed into the two so deadlines land in Tasks with
 * a due date instead of sitting on the calendar as zero-minute "events".
 */
import { addDays, formatTime } from "./date";
import type { CalEvent, Task } from "./types";

export interface Assignment {
  uid: string;
  title: string;
  /** Short course code such as "ENG 101", when the feed names one. */
  course?: string;
  /** Due day, YYYY-MM-DD. */
  due: string;
  /** Due time in minutes after midnight, or null for all-day deadlines. */
  time: number | null;
}

/** Links that look like an LMS calendar feed. */
export function looksLikeCourseFeed(url: string): boolean {
  return /d2l|brightspace|instructure|canvas|moodle|blackboard|schoology|sakai/i.test(url);
}

const WORK = /\b(due|deadline|assignments?|homework|hw\s?\d*|quiz(zes)?|essay|paper|project|lab|discussion|submissions?|submit|reading|worksheet|problem set|pset|journal|reflection|report)\b/i;
const EXPLICIT = /\b(due|deadline|submi(t|ssion))\b/i;
const OPENS = /\b(available|availability|opens?|start date|starts|unlocks?)\b/i;

function minutes(stamp: string): number {
  return Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16));
}

function length(e: CalEvent): number {
  if (e.allDay) return 24 * 60;
  const days = Math.round((Date.parse(e.end.slice(0, 10)) - Date.parse(e.start.slice(0, 10))) / 86_400_000);
  return days * 24 * 60 + minutes(e.end) - minutes(e.start);
}

/** "Opens" and "available from" markers are neither classes nor work. */
function isMarker(e: CalEvent): boolean {
  return OPENS.test(e.title) && !EXPLICIT.test(e.title) && (e.allDay || length(e) <= 15);
}

export function isAssignment(e: CalEvent): boolean {
  if (e.rrule) return false;
  if (/assignment/i.test(e.uid)) return true;
  if (OPENS.test(e.title) && !EXPLICIT.test(e.title)) return false;
  if (EXPLICIT.test(e.title)) return e.allDay || length(e) <= 60;
  return WORK.test(e.title) && (e.allDay || length(e) <= 15);
}

function courseOf(e: CalEvent): string | undefined {
  const source = e.title.match(/\[([^\]]+)\]\s*$/)?.[1] ?? e.location ?? "";
  const code = source.match(/\b([A-Z]{2,5})[\s-]?(\d{2,4}[A-Z]?)\b/);
  if (code) return `${code[1]} ${code[2]}`;
  return source.trim() ? source.trim().slice(0, 40) : undefined;
}

function cleanTitle(title: string): string {
  return (
    title
      .replace(/\s*\[[^\]]+\]\s*$/, "")
      .replace(/(\s*[-–:]\s*|\s+)(due|end date|deadline|due date)\s*$/i, "")
      .replace(/^(due|deadline)\s*[:-]\s*/i, "")
      .trim() || title.trim()
  );
}

export function toAssignment(e: CalEvent): Assignment {
  return {
    uid: e.uid,
    title: cleanTitle(e.title),
    course: courseOf(e),
    due: e.start.slice(0, 10),
    time: e.allDay ? null : minutes(e.start),
  };
}

/** Classes stay on the calendar; deadlines become assignments; "opens" markers are dropped. */
export function splitCourseFeed(events: CalEvent[]): { events: CalEvent[]; assignments: Assignment[] } {
  const kept: CalEvent[] = [];
  const assignments: Assignment[] = [];
  for (const e of events) {
    if (isAssignment(e)) assignments.push(toAssignment(e));
    else if (!isMarker(e)) kept.push(e);
  }
  return { events: kept, assignments };
}

export const courseRef = (uid: string) => `course:${uid}`;

/** Plan it the day before it's due, so it isn't left to the last minute. */
export function plannedDay(due: string, today: string): string {
  const before = addDays(due, -1);
  return before > today ? before : today;
}

export function assignmentNote(a: Assignment): string {
  return [a.time !== null ? `Due ${formatTime(a.time)}` : "Due that day", a.course].filter(Boolean).join(" · ");
}

export function courseTag(course: string | undefined): string | undefined {
  const tag = course?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return tag && tag.length <= 12 ? tag : undefined;
}

/**
 * Work out which tasks to add and which to update after a sync. Assignments
 * already imported once are never re-added, so deleting one keeps it gone.
 */
export function reconcileAssignments(
  tasks: Task[],
  assignments: Assignment[],
  imported: string[],
  today: string,
): { add: Assignment[]; update: { id: string; patch: Partial<Task> }[]; imported: string[] } {
  const seen = new Set(imported);
  const byRef = new Map(tasks.filter((t) => t.sourceRef?.startsWith("course:")).map((t) => [t.sourceRef!, t]));
  const add: Assignment[] = [];
  const update: { id: string; patch: Partial<Task> }[] = [];

  for (const a of assignments) {
    const existing = byRef.get(courseRef(a.uid));
    if (existing) {
      if (existing.done) continue;
      const patch: Partial<Task> = {};
      if (existing.due !== a.due) {
        patch.due = a.due;
        // Follow the new date only if you haven't moved it yourself.
        if (!existing.due || existing.date === addDays(existing.due, -1) || existing.date <= today) patch.date = plannedDay(a.due, today);
        patch.notes = assignmentNote(a);
      }
      if (Object.keys(patch).length) update.push({ id: existing.id, patch });
      continue;
    }
    if (seen.has(a.uid) || a.due < today) continue;
    add.push(a);
    seen.add(a.uid);
  }
  return { add, update, imported: [...seen] };
}
