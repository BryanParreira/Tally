/** The two moments that bookend a day: a calm start and a calm finish. Plain facts, no model needed. */
import { formatTime } from "./date";
import { blockTitle, type DayPlan } from "./schedule";
import type { Task } from "./types";

export interface Card {
  title: string;
  body: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function morningCard(plan: DayPlan, tasks: Task[], today: string, name: string): Card | null {
  const blocks = plan.blocks.filter((b) => b.kind !== "break" && !(b.kind === "task" && b.task?.done));
  const due = tasks.filter((t) => !t.done && !t.someday && t.due && t.due <= today);
  const late = tasks.filter((t) => !t.done && !t.someday && t.carriedFrom).length;
  if (!blocks.length && !due.length) return null;
  const lines: string[] = [];
  if (blocks.length) lines.push(`${plural(blocks.length, "thing")} planned, starting with ${blockTitle(blocks[0])} at ${formatTime(blocks[0].start)}.`);
  if (due.length) lines.push(`${due.length === 1 ? `"${due[0].title}" is` : `${plural(due.length, "deadline")} are`} due today.`);
  else if (late) lines.push(`${plural(late, "task")} rolled over from yesterday.`);
  if (plan.overflow.length) lines.push(`${plan.overflow.length} won't fit, so one will need to move.`);
  return { title: `Good morning${name ? `, ${name}` : ""}`, body: lines.join(" ") };
}

export function eveningCard(tasks: Task[], today: string): Card | null {
  const todays = tasks.filter((t) => t.date === today && !t.someday);
  if (!todays.length) return null;
  const left = todays.filter((t) => !t.done).length;
  const done = todays.length - left;
  return {
    title: left ? "Time to wrap up" : "Everything's done",
    body: left ? `${done} done, ${left} still open. Roll the rest to tomorrow and close out the day?` : `You finished all ${todays.length}. Take a moment before tomorrow.`,
  };
}
