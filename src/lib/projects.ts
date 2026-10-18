import { daysBetween } from "./date";
import type { Project, ProjectStatus, Task } from "./types";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = { active: "Active", paused: "Paused", done: "Done" };
export const PROJECT_STATUS_ORDER: ProjectStatus[] = ["active", "paused", "done"];

export interface Progress {
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** 0 to 1. */
  ratio: number;
}

export function progressOf(project: Project, tasks: Task[], today: string): Progress {
  const mine = tasks.filter((t) => t.projectId === project.id);
  const done = mine.filter((t) => t.done).length;
  const overdue = mine.filter((t) => !t.done && !t.someday && t.date < today).length;
  return { total: mine.length, done, open: mine.length - done, overdue, ratio: mine.length ? done / mine.length : 0 };
}

/** "3 days left", "Due today", "2 days late". */
export function projectDue(project: Project, today: string): string {
  if (!project.due) return "";
  const diff = daysBetween(today, project.due);
  if (project.status === "done") return "";
  if (diff < 0) return `${-diff} ${diff === -1 ? "day" : "days"} late`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `${diff} days left`;
}

export const projectName = (p: Pick<Project, "name">) => p.name.trim() || "Untitled project";
