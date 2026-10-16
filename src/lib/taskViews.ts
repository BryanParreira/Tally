import { addDays, daysBetween, formatDay } from "./date";
import type { Priority, Task, TaskStatus } from "./types";

export type TaskView = "open" | "today" | "upcoming" | "someday" | "done";
export type GroupBy = "date" | "status" | "priority" | "category" | "none";

export const STATUS_LABEL: Record<TaskStatus | "done", string> = { todo: "To do", doing: "In progress", waiting: "Waiting", done: "Done" };
export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };
const PRIORITY_ORDER: Priority[] = ["urgent", "high", "normal", "low"];
const STATUS_ORDER: (TaskStatus | "done")[] = ["doing", "todo", "waiting", "done"];

export function statusOf(t: Task): TaskStatus | "done" {
  return t.done ? "done" : (t.status ?? "todo");
}

export interface TaskFilter {
  view: TaskView;
  tag?: string | null;
  query?: string;
}

export function filterTasks(tasks: Task[], f: TaskFilter, today: string): Task[] {
  const q = f.query?.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.tag && !t.tags?.includes(f.tag)) return false;
    if (q && !`${t.title} ${t.notes ?? ""} ${(t.tags ?? []).map((x) => `#${x}`).join(" ")}`.toLowerCase().includes(q)) return false;
    switch (f.view) {
      case "open":
        return !t.done;
      case "today":
        return !t.someday && t.date === today && !t.done;
      case "upcoming":
        return !t.someday && !t.done && t.date > today;
      case "someday":
        return !!t.someday && !t.done;
      case "done":
        return t.done && daysBetween(t.date, today) <= 30;
    }
  });
}

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.someday ? 1 : 0) - (b.someday ? 1 : 0) ||
      a.date.localeCompare(b.date) ||
      PRIORITY_ORDER.indexOf(a.priority ?? "normal") - PRIORITY_ORDER.indexOf(b.priority ?? "normal") ||
      (a.start ?? 9999) - (b.start ?? 9999) ||
      a.createdAt - b.createdAt,
  );
}

export function dateBucket(t: Task, today: string): { key: string; label: string } {
  if (t.someday) return { key: "9-someday", label: "Someday" };
  const diff = daysBetween(today, t.date);
  if (diff < 0) return { key: "0-earlier", label: "Earlier" };
  if (diff === 0) return { key: "1-today", label: "Today" };
  if (diff === 1) return { key: "2-tomorrow", label: "Tomorrow" };
  if (diff < 7) return { key: `3-${t.date}`, label: formatDay(t.date, today) };
  if (t.date < addDays(today, 14)) return { key: "4-next-week", label: "Next week" };
  return { key: "5-later", label: "Later" };
}

export function groupTasks(tasks: Task[], by: GroupBy, today: string): TaskGroup[] {
  const sorted = sortTasks(tasks);
  if (by === "none") return [{ key: "all", label: "All tasks", tasks: sorted }];
  const groups = new Map<string, TaskGroup>();
  const add = (key: string, label: string, t: Task) => {
    const g = groups.get(key) ?? { key, label, tasks: [] };
    g.tasks.push(t);
    groups.set(key, g);
  };
  for (const t of sorted) {
    if (by === "date") {
      const b = dateBucket(t, today);
      add(b.key, b.label, t);
    } else if (by === "status") {
      const s = statusOf(t);
      add(`${STATUS_ORDER.indexOf(s)}`, STATUS_LABEL[s], t);
    } else if (by === "priority") {
      const p = t.priority ?? "normal";
      add(`${PRIORITY_ORDER.indexOf(p)}`, PRIORITY_LABEL[p], t);
    } else {
      add(t.category, t.category.charAt(0).toUpperCase() + t.category.slice(1), t);
    }
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Every tag in use on unfinished tasks, most used first. */
export function allTags(tasks: Task[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tasks) if (!t.done) for (const tag of t.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
