import type { Occurrence } from "./ics";
import type { FocusSession, Priority, Settings, Task } from "./types";

export interface PlannedBlock {
  kind: "task" | "break" | "event";
  task?: Task;
  event?: Occurrence;
  start: number;
  end: number;
}

export interface DayPlan {
  blocks: PlannedBlock[];
  /** Unfinished tasks that no longer fit before the end of the day. */
  overflow: Task[];
  /** Planned minutes of unfinished work left today. */
  remaining: number;
}

export interface PlanContext {
  /** Minutes after midnight, or null when planning a day that is not today. */
  now: number | null;
  /** True when the planned day is already over. */
  past: boolean;
  focus: FocusSession | null;
  nowMs?: number;
}

const SLOT = 5;
const roundUp = (m: number) => Math.ceil(m / SLOT) * SLOT;

function dueRank(t: Task): string {
  return t.due ?? "9999-12-31";
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const priorityRank = (t: Task) => PRIORITY_RANK[t.priority ?? "normal"];

/**
 * Lay out one day. Fixed and finished tasks keep their times; everything else
 * flows into the free gaps after "now", earliest deadline first, with short
 * breaks after long stretches of work. Re-running this as time passes is what
 * makes the plan heal itself when a task runs long or gets skipped.
 */
export function planDay(tasks: Task[], settings: Settings, ctx: PlanContext, events: Occurrence[] = []): DayPlan {
  const busy: { start: number; end: number }[] = [];
  const blocks: PlannedBlock[] = [];

  // Classes and meetings from subscribed calendars can't move.
  for (const e of events) {
    if (e.allDay || e.end <= e.start) continue;
    const block = { kind: "event" as const, event: e, start: e.start, end: e.end };
    blocks.push(block);
    busy.push(block);
  }

  const pinned = (t: Task, start: number) => {
    const block = { kind: "task" as const, task: t, start, end: start + t.duration };
    blocks.push(block);
    busy.push(block);
  };

  const focusTask = ctx.focus ? tasks.find((t) => t.id === ctx.focus!.taskId && !t.done) : undefined;
  let focusStart = -1;
  let focusEnd = -1;
  if (focusTask && ctx.now !== null) {
    const elapsedMin = (ctx.focus!.elapsed + (ctx.focus!.runningSince ? (ctx.nowMs ?? Date.now()) - ctx.focus!.runningSince : 0)) / 60000;
    const start = Math.max(settings.dayStart, Math.round(ctx.now - elapsedMin));
    const end = Math.max(start + focusTask.duration, ctx.now + 1);
    blocks.push({ kind: "task", task: focusTask, start, end });
    busy.push({ start, end });
    focusStart = start;
    focusEnd = end;
  }

  const flexible: Task[] = [];
  for (const t of tasks) {
    if (t === focusTask) continue;
    if (t.done) {
      const start = t.start ?? (t.doneAt ? Math.max(settings.dayStart, minutesFromMs(t.doneAt) - t.duration) : settings.dayStart);
      pinned(t, start);
    } else if (t.fixed && t.start !== null) {
      pinned(t, t.start);
    } else {
      flexible.push(t);
    }
  }

  flexible.sort((a, b) => priorityRank(a) - priorityRank(b) || dueRank(a).localeCompare(dueRank(b)) || a.createdAt - b.createdAt);

  if (ctx.past) {
    // A finished day: show what was left undone without inventing times for it.
    return { blocks: sortBlocks(blocks), overflow: flexible, remaining: 0 };
  }

  let cursor = roundUp(Math.max(settings.dayStart, ctx.now ?? settings.dayStart, focusEnd));
  let streak = focusEnd > 0 ? focusEnd - focusStart : 0;
  const overflow: Task[] = [];

  const nextFree = (from: number, length: number): number | null => {
    let s = from;
    for (;;) {
      if (s + length > settings.dayEnd) return null;
      const clash = busy.find((b) => s < b.end && b.start < s + length);
      if (!clash) return s;
      s = roundUp(clash.end);
    }
  };

  for (const t of flexible) {
    let from = cursor;
    if (streak >= settings.breakEvery) {
      const breakStart = nextFree(cursor, settings.breakLength);
      if (breakStart !== null) {
        const b = { kind: "break" as const, start: breakStart, end: breakStart + settings.breakLength };
        blocks.push(b);
        busy.push(b);
        from = b.end;
      }
      streak = 0;
    }
    const start = nextFree(roundUp(from), t.duration);
    if (start === null) {
      overflow.push(t);
      continue;
    }
    // Any real gap before this task counts as rest.
    if (start - cursor >= settings.breakLength) streak = 0;
    blocks.push({ kind: "task", task: t, start, end: start + t.duration });
    busy.push({ start, end: start + t.duration });
    streak += t.duration;
    cursor = start + t.duration;
  }

  const remaining = blocks
    .filter((b) => b.kind === "task" && b.task && !b.task.done)
    .reduce((sum, b) => sum + (b.end - Math.max(b.start, ctx.now ?? b.start)), 0);

  return { blocks: sortBlocks(blocks), overflow, remaining: Math.max(0, remaining) };
}

function sortBlocks(blocks: PlannedBlock[]): PlannedBlock[] {
  const order = { event: 0, break: 1, task: 2 };
  return blocks.sort((a, b) => a.start - b.start || order[a.kind] - order[b.kind]);
}

function minutesFromMs(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** The block happening at `now`, and the next task after it. */
export function currentAndNext(plan: DayPlan, now: number): { current: PlannedBlock | null; next: PlannedBlock | null } {
  const tasks = plan.blocks.filter((b) => !(b.kind === "task" && b.task?.done));
  const current = tasks.find((b) => b.start <= now && now < b.end) ?? null;
  const next = tasks.find((b) => b.kind !== "break" && b.start > now && b !== current) ?? null;
  return { current, next };
}

export function blockTitle(b: PlannedBlock | null | undefined): string {
  return b?.task?.title ?? b?.event?.title ?? "Break";
}
