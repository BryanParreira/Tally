import { useMemo } from "react";
import { Archive, CalendarDays, CheckCircle2, FolderKanban, Hash, Inbox, Sun } from "lucide-react";
import { CATEGORY_LABEL } from "./ui";
import { projectName } from "../lib/projects";
import { today, useStore } from "../lib/store";
import { useTaskFilter } from "../lib/taskFilter";
import { allTags, filterTasks, type TaskView } from "../lib/taskViews";
import type { Category } from "../lib/types";

export const TASK_VIEWS: { id: TaskView; label: string; icon: typeof Sun; key: string }[] = [
  { id: "open", label: "All tasks", icon: Inbox, key: "1" },
  { id: "today", label: "Today", icon: Sun, key: "2" },
  { id: "upcoming", label: "Upcoming", icon: CalendarDays, key: "3" },
  { id: "someday", label: "Someday", icon: Archive, key: "4" },
  { id: "done", label: "Done", icon: CheckCircle2, key: "5" },
];
const AREAS: Category[] = ["study", "work", "life"];

/** The Tasks page's views, areas, projects and tags, listed under Tasks in the sidebar. */
export function TasksNav() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const { view, tag, area, projectId, setView, setTag, setArea, setProject } = useTaskFilter();
  const d = today();
  const counts = useMemo(() => Object.fromEntries(TASK_VIEWS.map((v) => [v.id, filterTasks(tasks, { view: v.id }, d).length])), [tasks, d]);
  const tags = useMemo(() => allTags(tasks), [tasks]);
  const open = projects.filter((p) => p.status !== "done");
  const plain = !tag && !area && !projectId;

  const item = (key: string, active: boolean, onClick: () => void, icon: React.ReactNode, label: string, count?: number, title?: string) => (
    <button key={key} type="button" className="subnav-item" aria-current={active ? "page" : undefined} onClick={onClick} title={title}>
      {icon}
      <span className="truncate">{label}</span>
      {!!count && <span className="subnav-count">{count}</span>}
    </button>
  );

  return (
    <div className="subnav" aria-label="Task views">
      {TASK_VIEWS.map((v) => item(v.id, view === v.id && plain, () => setView(v.id), <v.icon size={14} strokeWidth={1.8} aria-hidden="true" />, v.label, v.id === "done" ? 0 : counts[v.id], `${v.label} (${v.key})`))}
      <h2 className="subnav-head">Areas</h2>
      {AREAS.map((a) => item(a, area === a, () => setArea(area === a ? null : a), <span className={`dot ${a}`} aria-hidden="true" />, CATEGORY_LABEL[a], tasks.filter((t) => !t.done && t.category === a).length))}
      {open.length > 0 && (
        <>
          <h2 className="subnav-head">Projects</h2>
          {open.map((p) => item(p.id, projectId === p.id, () => setProject(projectId === p.id ? null : p.id), <FolderKanban size={14} strokeWidth={1.8} aria-hidden="true" />, projectName(p), tasks.filter((t) => t.projectId === p.id && !t.done).length))}
        </>
      )}
      {tags.length > 0 && (
        <>
          <h2 className="subnav-head">Tags</h2>
          {tags.slice(0, 12).map(({ tag: t, count }) => item(t, tag === t, () => setTag(tag === t ? null : t), <Hash size={14} strokeWidth={1.8} aria-hidden="true" />, t, count))}
        </>
      )}
    </div>
  );
}
