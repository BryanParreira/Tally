import { dueLabel } from "./date";
import { projectName } from "./projects";
import type { TriageItem } from "./triage";
import type { Project, Task } from "./types";

export interface Suggestion {
  text: string;
  detail: string;
  /** Where to go to deal with it. */
  go: { view: "inbox" | "projects" | "tasks"; target?: { kind: "email" | "project" | "task"; id: string } };
}

/**
 * One quiet thing worth doing next, or null. An email deadline within two days wins, then the
 * project with the most late tasks, then a plain overdue task. Nothing is invented: every line
 * comes from something already in the planner.
 */
export function suggestNext(args: { signal: TriageItem[]; tasks: Task[]; projects: Project[]; today: string }): Suggestion | null {
  const { signal, tasks, projects, today } = args;
  const soon = new Date(`${today}T00:00`);
  soon.setDate(soon.getDate() + 2);
  const limit = soon.toISOString().slice(0, 10);

  const mail = signal
    .filter((i) => i.bucket === "deadline" && i.message && i.suggestion?.due && i.suggestion.due <= limit)
    .sort((a, b) => a.suggestion!.due!.localeCompare(b.suggestion!.due!))[0];
  if (mail) return { text: mail.title || "An email with a deadline", detail: `${mail.from} · ${dueLabel(mail.suggestion!.due!, today).toLowerCase()}`, go: { view: "inbox", target: { kind: "email", id: mail.message!.id } } };

  const late = projects
    .filter((p) => p.status === "active")
    .map((p) => ({ p, n: tasks.filter((t) => t.projectId === p.id && !t.done && !t.someday && t.date < today).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)[0];
  if (late) return { text: `${projectName(late.p)} has ${late.n} late ${late.n === 1 ? "task" : "tasks"}`, detail: "Project", go: { view: "projects", target: { kind: "project", id: late.p.id } } };

  const overdue = tasks.filter((t) => !t.done && !t.someday && t.due && t.due < today).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  if (overdue) return { text: overdue.title, detail: dueLabel(overdue.due!, today), go: { view: "tasks", target: { kind: "task", id: overdue.id } } };
  return null;
}
