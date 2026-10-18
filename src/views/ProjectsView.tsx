import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronRight, CircleDot, FolderKanban, Plus, Trash2 } from "lucide-react";
import { OptionList, Popover } from "../components/Popover";
import { Segmented } from "../components/ui";
import { PriorityIcon, StatusIcon, TaskTable } from "../components/TaskTable";
import { TaskDetail } from "../components/TaskDetail";
import { FavoriteButton } from "../components/Favorite";
import { addDays, formatDay } from "../lib/date";
import { useAutosize, useToast } from "../lib/hooks";
import { isTyping, useNav } from "../lib/nav";
import { useRecent } from "../lib/recent";
import { parseBrainDump } from "../lib/parse";
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_ORDER, progressOf, projectDue, projectName } from "../lib/projects";
import { today, useStore } from "../lib/store";
import { filterTasks, groupTasks, sortTasks, type SortBy } from "../lib/taskViews";
import type { Project, ProjectStatus } from "../lib/types";

export function ProjectsView() {
  const target = useNav((s) => s.target);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (target?.kind === "project") setOpenId(target.id);
  }, [target]);

  // Leaving a project that was never filled in removes it, so "New project" doesn't leave blanks behind.
  const leave = (id: string) => {
    const s = useStore.getState();
    const p = s.projects.find((x) => x.id === id);
    if (p && !p.name.trim() && !p.description.trim() && !s.tasks.some((t) => t.projectId === id)) s.deleteProject(id);
    setOpenId(null);
  };

  const project = useStore((s) => s.projects.find((p) => p.id === openId));
  return project ? <ProjectPage key={project.id} project={project} onBack={() => leave(project.id)} /> : <ProjectList onOpen={setOpenId} />;
}

/** A project's state of play as a quiet icon: a ring for active, dashes for paused, a tick when finished. */
function StatusDot({ status }: { status: ProjectStatus }) {
  return <StatusIcon status={status === "active" ? "doing" : status === "paused" ? "waiting" : "done"} size={14} />;
}

function ProgressBar({ ratio, label }: { ratio: number; label: string }) {
  return (
    <span className="pj-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={label}>
      <span style={{ width: `${Math.round(ratio * 100)}%` }} />
    </span>
  );
}

function ProjectList({ onOpen }: { onOpen(id: string): void }) {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const d = today();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");

  const groups = useMemo(
    () =>
      PROJECT_STATUS_ORDER.map((status) => ({
        status,
        items: projects.filter((p) => p.status === status).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.createdAt - b.createdAt),
      })).filter((g) => g.items.length),
    [projects],
  );

  // Blank projects left over from an abandoned "new project" are cleared away.
  useEffect(() => {
    const st = useStore.getState();
    st.projects.filter((p) => !p.name.trim() && !p.description.trim() && !st.tasks.some((t) => t.projectId === p.id)).forEach((p) => st.deleteProject(p.id));
  }, []);

  const create = () => {
    const n = name.trim();
    onOpen(useStore.getState().addProject(n));
    setName("");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector(".modal")) return;
      if (e.key === "n") {
        e.preventDefault();
        document.getElementById("project-new")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lateTotal = tasks.filter((t) => t.projectId && !t.done && !t.someday && t.date < d).length;

  return (
    <div className="pj-page">
      <div className="pj-inner">
        <header className="tasks-head">
          <div>
            <h1 className="title">Projects</h1>
            <p className="subtitle">
              {projects.length ? [`${projects.filter((p) => p.status === "active").length} active`, lateTotal ? `${lateTotal} late tasks` : ""].filter(Boolean).join(" · ") : "Bigger things made of smaller tasks"}
            </p>
          </div>
        </header>

        <div className="capture tasks-add">
          <div className="capture-row">
            <Plus size={16} color="var(--ink-3)" aria-hidden="true" />
            <label htmlFor="project-new" className="sr-only">
              New project
            </label>
            <input id="project-new" placeholder="New project… name it and press Enter (N)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.key === "Enter" && name.trim() ? create() : e.key === "Escape" && (e.target as HTMLInputElement).blur())} />
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="td-empty">
            <h3>No projects yet</h3>
            <p>Use a project for anything with an end in sight: a course, a thesis, a trip. Tasks join it from their details, and you see how far along it is.</p>
          </div>
        ) : (
          <div className="tk-table pj-table" role="table" aria-label="Projects">
            <div className="pj-row tk-head" role="row">
              <span className="tk-col">Project</span>
              <span className="tk-col">Tasks</span>
              <span className="tk-col">Target</span>
              <span className="tk-col">Progress</span>
            </div>
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.status);
              return (
                <section key={g.status} className="tk-group">
                  <button
                    type="button"
                    className="tk-group-head"
                    data-tint={g.status === "paused" ? "waiting" : g.status === "done" ? "done" : undefined}
                    aria-expanded={!isCollapsed}
                    onClick={() =>
                      setCollapsed((c) => {
                        const n = new Set(c);
                        n.has(g.status) ? n.delete(g.status) : n.add(g.status);
                        return n;
                      })
                    }
                  >
                    <ChevronRight size={12} className={isCollapsed ? "" : "open"} aria-hidden="true" />
                    <StatusDot status={g.status} />
                    <span>{PROJECT_STATUS_LABEL[g.status]}</span>
                    <span className="tk-pill">{g.items.length}</span>
                  </button>
                  {!isCollapsed &&
                    g.items.map((p) => {
                      const pr = progressOf(p, tasks, d);
                      const due = projectDue(p, d);
                      const late = due.endsWith("late");
                      return (
                        <div key={p.id} role="row" className="pj-row tk-task" tabIndex={0} onClick={() => onOpen(p.id)} onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}>
                          <span className="tk-title truncate">
                            <FolderKanban size={15} aria-hidden="true" className="pj-icon" />
                            <span className="tk-title-text truncate">{projectName(p)}</span>
                          </span>
                          <span className="tk-cell tk-label-cell">
                            {pr.total ? (
                              <>
                                {pr.open} open{pr.overdue > 0 && <span className="pj-late"> · {pr.overdue} late</span>}
                              </>
                            ) : (
                              <span className="pj-none">—</span>
                            )}
                          </span>
                          <span className={`tk-cell${late ? " tk-when is-overdue" : ""}`} title={p.due ? formatDay(p.due, d) : undefined}>
                            <span className="truncate">{due || (p.due ? formatDay(p.due, d) : <span className="pj-none">—</span>)}</span>
                          </span>
                          <span className="tk-cell pj-progress">
                            {pr.total ? (
                              <>
                                <ProgressBar ratio={pr.ratio} label={`${projectName(p)} progress`} />
                                <span className="pj-count">{Math.round(pr.ratio * 100)}%</span>
                              </>
                            ) : (
                              <span className="pj-none">No tasks</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = "overview" | "tasks";

function ProjectPage({ project, onBack }: { project: Project; onBack(): void }) {
  const tasks = useStore((s) => s.tasks);
  const toast = useToast((s) => s.show);
  const { updateProject, deleteProject } = useStore.getState();
  const d = today();
  const [tab, setTab] = useState<Tab>("overview");
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [reversed, setReversed] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(titleRef, project.name);
  useAutosize(descRef, project.description);

  useEffect(() => useRecent.getState().touch({ kind: "project", id: project.id }), [project.id]);
  const progress = progressOf(project, tasks, d);
  const mine = useMemo(() => filterTasks(tasks, { view: "open", projectId: project.id }, d).concat(filterTasks(tasks, { view: "done", projectId: project.id }, d)), [tasks, project.id, d]);
  const groups = useMemo(() => groupTasks(mine, "status", d, sortBy, reversed), [mine, sortBy, reversed, d]);
  const loose = useMemo(() => tasks.filter((t) => !t.done && !t.projectId).slice(0, 50), [tasks]);
  const upNext = useMemo(() => sortTasks(mine.filter((t) => !t.done), "date").slice(0, 6), [mine]);
  const due = projectDue(project, d);

  const add = () => {
    const items = parseBrainDump(newTitle, d);
    if (!items.length) return;
    const s = useStore.getState();
    items.forEach((it) => s.addTask({ ...it, source: "manual", projectId: project.id }, d));
    setNewTitle("");
    toast(items.length === 1 ? "Task added" : `${items.length} tasks added`);
  };

  const dateOptions = [
    { value: "week", label: "In a week", hint: formatDay(addDays(d, 7), d) },
    { value: "two", label: "In two weeks", hint: formatDay(addDays(d, 14), d) },
    { value: "month", label: "In a month", hint: formatDay(addDays(d, 30), d) },
    ...(project.due ? [{ value: "none", label: "No target date" }] : []),
  ];

  return (
    <div className="pj-page">
      <div className="pj-inner">
        <nav className="crumbs" aria-label="Breadcrumb">
          <button type="button" className="crumb" onClick={onBack}>
            Projects
          </button>
          <ChevronRight size={12} aria-hidden="true" />
          <span className="truncate">{projectName(project)}</span>
          <span className="spacer" />
          <FavoriteButton item={{ kind: "project", id: project.id }} />
          <Segmented<Tab>
            label="Project view"
            value={tab}
            onChange={setTab}
            options={[
              { value: "overview", label: "Overview" },
              { value: "tasks", label: `Tasks${progress.total ? ` · ${progress.total}` : ""}` },
            ]}
          />
        </nav>

        {tab === "overview" && (
          <div className="pj-overview">
            <label htmlFor="project-name" className="sr-only">
              Project name
            </label>
            <textarea
              id="project-name"
              ref={titleRef}
              className="paper-title"
              rows={1}
              placeholder="Project name"
              autoFocus={!project.name}
              value={project.name}
              onChange={(e) => updateProject(project.id, { name: e.target.value.replace(/\n/g, " ") })}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), descRef.current?.focus())}
            />

            <div className="chip-row">
              <Popover label="Status" trigger={<><StatusDot status={project.status} />{PROJECT_STATUS_LABEL[project.status]}</>}>
                {(close) => (
                  <OptionList<ProjectStatus>
                    value={project.status}
                    options={PROJECT_STATUS_ORDER.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s], icon: <StatusDot status={s} /> }))}
                    onPick={(status) => (updateProject(project.id, { status }), close())}
                  />
                )}
              </Popover>
              <Popover label="Target date" className={project.due ? "" : "is-empty"} trigger={<><CalendarDays size={14} aria-hidden="true" />{project.due ? formatDay(project.due, d) : "Target date"}</>}>
                {(close) => (
                  <>
                    <OptionList<string>
                      value=""
                      options={dateOptions}
                      onPick={(v) => {
                        updateProject(project.id, { due: v === "none" ? undefined : addDays(d, v === "week" ? 7 : v === "two" ? 14 : 30) });
                        close();
                      }}
                    />
                    <input type="date" className="input pop-date" aria-label="Pick a date" value={project.due ?? ""} onChange={(e) => updateProject(project.id, { due: e.target.value || undefined })} />
                  </>
                )}
              </Popover>
              {due && <span className={`pj-due${due.endsWith("late") ? " is-late" : ""}`}>{due}</span>}
            </div>

            <textarea
              id="project-description"
              ref={descRef}
              className="pj-description"
              aria-label="Description"
              placeholder="What is this, and what does finished look like?"
              value={project.description}
              onChange={(e) => updateProject(project.id, { description: e.target.value })}
            />

            <div className="pj-stats">
              <div>
                <span className="pj-stat-n">{progress.open}</span>
                <span className="pj-stat-k">Open</span>
              </div>
              <div>
                <span className="pj-stat-n">{progress.done}</span>
                <span className="pj-stat-k">Done</span>
              </div>
              <div className={progress.overdue ? "is-late" : ""}>
                <span className="pj-stat-n">{progress.overdue}</span>
                <span className="pj-stat-k">Late</span>
              </div>
              <div className="pj-stat-bar">
                <ProgressBar ratio={progress.ratio} label="Progress" />
                <span className="pj-stat-k">{progress.total ? `${Math.round(progress.ratio * 100)}% done` : "No tasks yet"}</span>
              </div>
            </div>

            <section className="pj-section">
              <h2 className="contact-head">
                Up next <span className="muted">{progress.open > upNext.length ? `${upNext.length} of ${progress.open}` : ""}</span>
              </h2>
              {upNext.length === 0 ? (
                <p className="muted small" style={{ margin: "6px 0 0" }}>
                  {progress.total ? "Everything here is done." : "No tasks yet."}{" "}
                  <button type="button" className="link-btn" onClick={() => setTab("tasks")}>
                    Add one
                  </button>
                </p>
              ) : (
                upNext.map((t) => (
                  <button key={t.id} type="button" className="contact-row" onClick={() => (setTab("tasks"), setSelected(t.id), setOpen(t.id))}>
                    <PriorityIcon priority={t.priority ?? "normal"} size={14} />
                    <span className="truncate">{t.title}</span>
                    <span className={`muted small${t.date < d ? " pj-late" : ""}`}>{t.someday ? "Someday" : formatDay(t.date, d)}</span>
                  </button>
                ))
              )}
            </section>

            <div className="row" style={{ marginTop: 28 }}>
              <button type="button" className="btn sm" onClick={() => setTab("tasks")}>
                <CircleDot size={14} /> All tasks
              </button>
              <span className="spacer" />
              {confirm ? (
                <>
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => {
                      deleteProject(project.id);
                      toast("Project deleted. Its tasks are still there.");
                      onBack();
                    }}
                  >
                    Delete project
                  </button>
                  <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" className="btn ghost sm danger" onClick={() => setConfirm(true)}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <>
            <div className="capture tasks-add" style={{ marginTop: 4 }}>
              <div className="capture-row">
                <Plus size={16} color="var(--ink-3)" aria-hidden="true" />
                <label htmlFor="project-add" className="sr-only">
                  New task in this project
                </label>
                <input id="project-add" placeholder="New task in this project…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
                {loose.length > 0 && (
                  <select
                    className="pj-attach"
                    aria-label="Add an existing task"
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      useStore.getState().updateTask(e.target.value, { projectId: project.id });
                      toast("Added to the project");
                    }}
                  >
                    <option value="">Add existing…</option>
                    {loose.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            {mine.length ? (
              <TaskTable
                groups={groups}
                groupBy="status"
                selected={selected}
                today={d}
                sortBy={sortBy}
                reversed={reversed}
                collapsed={collapsed}
                onSort={(by) => (by === sortBy ? setReversed(!reversed) : (setSortBy(by), setReversed(false)))}
                onToggleGroup={(k) =>
                  setCollapsed((c) => {
                    const n = new Set(c);
                    n.has(k) ? n.delete(k) : n.add(k);
                    return n;
                  })
                }
                onSelect={setSelected}
                onOpen={setOpen}
              />
            ) : (
              <div className="td-empty">
                <h3>No tasks in this project</h3>
                <p>Add one above, or set the project from any task's details.</p>
              </div>
            )}
          </>
        )}
        {open && (
          <div className="drawer">
            <TaskDetail taskId={open} onClose={() => setOpen(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
