import { useEffect, useRef, useState } from "react";
import { Archive, ArrowRight, ArrowUpRight, CalendarDays, Clock, FolderKanban, Hourglass, ListTree, Plus, Repeat2, Sun, Trash2, X } from "lucide-react";
import { ask, listItems, useAi, useAssistantReady } from "../lib/ai";
import { stepsPrompt } from "../lib/assistantContext";
import { CATEGORY_LABEL } from "./ui";
import { OptionList, Popover } from "./Popover";
import { PriorityIcon, StatusIcon } from "./TaskTable";
import { LinkChips, useLinkMenu } from "./Links";
import { addDays, formatDay, formatDuration, formatTime } from "../lib/date";
import { timeOptions, useAutosize, useToast } from "../lib/hooks";
import { useNav } from "../lib/nav";
import { restoreDeletedTask, today, useStore } from "../lib/store";
import { projectName } from "../lib/projects";
import { PRIORITY_LABEL, STATUS_LABEL, statusOf } from "../lib/taskViews";
import { REPEAT_LABEL, type Repeat } from "../lib/repeat";
import type { Category, ChecklistItem, Priority, Task, TaskStatus } from "../lib/types";

const TIMES = timeOptions(15);
const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240];

/** Every property of a task, editable in place. */
export function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const projects = useStore((s) => s.projects);
  const { updateTask, deleteTask, toggleDone } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [confirm, setConfirm] = useState(false);
  const aiReady = useAssistantReady();
  const aiBusy = useAi((s) => s.busy);
  const [title, setTitle] = useState(task?.title ?? "");
  const [tags, setTags] = useState((task?.tags ?? []).map((t) => `#${t}`).join(" "));
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const link = useLinkMenu(notesRef, task?.notes ?? "", (notes) => updateTask(taskId, { notes: notes || undefined }), { kind: "task", id: taskId });
  useAutosize(titleRef, title);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setTags((task?.tags ?? []).map((t) => `#${t}`).join(" "));
    setConfirm(false);
  }, [taskId]);

  if (!task) return null;
  const set = (patch: Partial<Task>) => updateTask(task.id, patch);
  const status = statusOf(task);

  /** Ask the assistant for steps and add them as tasks beside this one. */
  const breakDown = async () => {
    try {
      const out = await ask(stepsPrompt(task.title, task.notes), { maxTokens: 300, temperature: 0.2 });
      const steps = listItems(out).map((t) => t.replace(/\s*[(\[]?\d+\s*(?:min|mins|minutes|h|hr|hours?)[)\]]?\s*$/i, "").trim()).filter(Boolean);
      if (!steps.length) return toast("Couldn't find clear steps. Try rewording the task.");
      const before = task.checklist;
      set({ checklist: [...(before ?? []), ...steps.map((text) => ({ id: Math.random().toString(36).slice(2, 9), text, done: false }))] });
      toast(`Added ${steps.length} steps`, { label: "Undo", run: () => useStore.getState().updateTask(task.id, { checklist: before }) });
    } catch (e) {
      toast(String(e).replace(/^Error: /, ""));
    }
  };

  const source =
    task.source === "email" && task.sourceRef
      ? { label: "Open the email", go: () => useNav.getState().go("inbox", { kind: "email", id: task.sourceRef! }) }
      : task.source === "note" && task.sourceRef
        ? { label: "Open the note", go: () => useNav.getState().go("notes", { kind: "note", id: task.sourceRef! }) }
        : null;

  return (
    <aside className="detail-panel" aria-label="Task details">
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="eyebrow" style={{ margin: 0 }}>
          Task
        </span>
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label="Close details" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <label htmlFor="detail-title" className="sr-only">
        Title
      </label>
      <textarea
        id="detail-title"
        ref={titleRef}
        className="detail-title"
        rows={1}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title.trim() !== task.title && set({ title: title.trim() })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />

      <div className="chip-row">
        <Popover label="Status" trigger={<><StatusIcon status={status} size={14} />{STATUS_LABEL[status]}</>}>
          {(close) => (
            <OptionList<TaskStatus | "done">
              value={status}
              options={(["todo", "doing", "waiting", "done"] as const).map((v) => ({ value: v, label: STATUS_LABEL[v], icon: <StatusIcon status={v} size={14} /> }))}
              onPick={(v) => {
                if (v === "done") !task.done && toggleDone(task.id, null);
                else set({ status: v, done: false, doneAt: undefined });
                close();
              }}
            />
          )}
        </Popover>

        <Popover label="Priority" trigger={<><PriorityIcon priority={task.priority ?? "normal"} size={14} />{PRIORITY_LABEL[task.priority ?? "normal"]}</>}>
          {(close) => (
            <OptionList<Priority>
              value={task.priority ?? "normal"}
              options={(["urgent", "high", "normal", "low"] as const).map((v) => ({ value: v, label: PRIORITY_LABEL[v], icon: <PriorityIcon priority={v} size={14} /> }))}
              onPick={(v) => (set({ priority: v }), close())}
            />
          )}
        </Popover>

        <Popover label="When" trigger={<><CalendarDays size={14} aria-hidden="true" />{task.someday ? "Someday" : formatDay(task.date, today())}{task.fixed && task.start !== null ? ` · ${formatTime(task.start)}` : ""}</>}>
          {(close) => (
            <>
              <OptionList<string>
                value={task.someday ? "someday" : task.date === today() ? "today" : task.date === addDays(today(), 1) ? "tomorrow" : ""}
                options={[
                  { value: "today", label: "Today", icon: <Sun size={14} /> },
                  { value: "tomorrow", label: "Tomorrow", icon: <ArrowRight size={14} /> },
                  { value: "week", label: "Next week", icon: <CalendarDays size={14} /> },
                  { value: "someday", label: "Someday", icon: <Archive size={14} /> },
                ]}
                onPick={(v) => {
                  const keep = task.fixed ? task.start : null;
                  if (v === "someday") set({ someday: true });
                  else set({ someday: false, date: v === "today" ? today() : v === "tomorrow" ? addDays(today(), 1) : addDays(today(), 7), start: keep });
                  close();
                }}
              />
              <input type="date" className="input pop-date" aria-label="Pick a date" value={task.date} onChange={(e) => e.target.value && set({ date: e.target.value, someday: false, start: task.fixed ? task.start : null })} />
            </>
          )}
        </Popover>

        <Popover label="Time" className={task.fixed && task.start !== null ? "" : "is-empty"} trigger={<><Clock size={14} aria-hidden="true" />{task.fixed && task.start !== null ? formatTime(task.start) : "Time"}</>}>
          {(close) => (
            <OptionList<number>
              searchable
              value={task.fixed && task.start !== null ? task.start : -1}
              options={[{ value: -1, label: "Tally picks the time" }, ...TIMES.map((t) => ({ value: t.value, label: t.label }))]}
              onPick={(v) => (v === -1 ? set({ fixed: false, start: null }) : set({ fixed: true, start: v }), close())}
            />
          )}
        </Popover>

        <Popover label="Length" trigger={<><Hourglass size={14} aria-hidden="true" />{formatDuration(task.duration)}</>}>
          {(close) => (
            <OptionList<number>
              value={task.duration}
              options={[...new Set([...DURATIONS, task.duration])].sort((a, b) => a - b).map((m) => ({ value: m, label: formatDuration(m) }))}
              onPick={(v) => (set({ duration: v }), close())}
            />
          )}
        </Popover>

        <Popover label="Repeat" className={task.repeat ? "" : "is-empty"} trigger={<><Repeat2 size={14} aria-hidden="true" />{task.repeat ? REPEAT_LABEL[task.repeat] : "Repeat"}</>}>
          {(close) => (
            <OptionList<string>
              value={task.repeat ?? ""}
              options={[{ value: "", label: "Doesn't repeat" }, ...(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => ({ value: r, label: REPEAT_LABEL[r] }))]}
              onPick={(v) => (set({ repeat: (v || undefined) as Repeat | undefined, spawnedNext: undefined }), close())}
            />
          )}
        </Popover>

        <Popover label="Area" trigger={<><span className={`dot ${task.category}`} aria-hidden="true" />{CATEGORY_LABEL[task.category]}</>}>
          {(close) => (
            <OptionList<Category>
              value={task.category}
              options={(["study", "work", "life"] as const).map((v) => ({ value: v, label: CATEGORY_LABEL[v], icon: <span className={`dot ${v}`} /> }))}
              onPick={(v) => (set({ category: v }), close())}
            />
          )}
        </Popover>

        {(projects.length > 0 || task.projectId) && (
          <Popover label="Project" className={task.projectId ? "" : "is-empty"} trigger={<><FolderKanban size={14} aria-hidden="true" />{task.projectId ? projectName(projects.find((p) => p.id === task.projectId) ?? { name: "" }) : "Project"}</>}>
            {(close) => (
              <OptionList<string>
                searchable={projects.length > 6}
                value={task.projectId ?? ""}
                options={[{ value: "", label: "No project" }, ...projects.map((p) => ({ value: p.id, label: projectName(p) }))]}
                onPick={(v) => (set({ projectId: v || undefined }), close())}
              />
            )}
          </Popover>
        )}
      </div>

      <label htmlFor="detail-tags" className="sr-only">
        Tags
      </label>
      <input
        id="detail-tags"
        className="input detail-tags"
        placeholder="Add #tags"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        onBlur={() => {
          const list = [...new Set(tags.split(/[\s,]+/).map((t) => t.replace(/^#/, "").toLowerCase()).filter(Boolean))];
          set({ tags: list.length ? list : undefined });
          setTags(list.map((t) => `#${t}`).join(" "));
        }}
      />

      <Checklist items={task.checklist ?? []} onChange={(checklist) => set({ checklist: checklist.length ? checklist : undefined })} />

      <label htmlFor="detail-notes" className="label" style={{ display: "block", margin: "18px 0 8px" }}>
        Notes
      </label>
      <div className="notes-field-wrap">
        <textarea
          id="detail-notes"
          ref={notesRef}
          className="input"
          style={{ minHeight: 120 }}
          placeholder="Details, anything… type [[ to link a note, task or email"
          value={task.notes ?? ""}
          onChange={(e) => (set({ notes: e.target.value || undefined }), link.update(e.target))}
          onKeyDown={(e) => link.onKeyDown(e)}
          onBlur={() => setTimeout(link.close, 150)}
        />
        {link.menu}
      </div>

      <LinkChips kind="task" id={task.id} />

      <div className="row wrap" style={{ marginTop: 18 }}>
        {source && (
          <button type="button" className="btn sm" onClick={source.go}>
            <ArrowUpRight size={14} /> {source.label}
          </button>
        )}
        {aiReady && !task.done && (
          <button type="button" className="btn sm" disabled={aiBusy} onClick={breakDown} title="Split this into smaller steps">
            <ListTree size={14} /> {aiBusy ? "Thinking…" : "Break into steps"}
          </button>
        )}
        <span className="spacer" />
        {confirm ? (
          <>
            <button
              type="button"
              className="btn sm danger"
              onClick={() => {
                deleteTask(task.id);
                toast("Task deleted", { label: "Undo", run: restoreDeletedTask });
                onClose();
              }}
            >
              Delete task
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
    </aside>
  );
}

/** Small steps inside a task: tick them off, rename, remove, or add more. */
function Checklist({ items, onChange }: { items: ChecklistItem[]; onChange(items: ChecklistItem[]): void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onChange([...items, { id: Math.random().toString(36).slice(2, 9), text: t, done: false }]);
    setText("");
  };
  const patch = (id: string, p: Partial<ChecklistItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const done = items.filter((i) => i.done).length;
  return (
    <div className="checklist">
      <div className="label" style={{ margin: "18px 0 8px" }}>
        Checklist{items.length > 0 && <span className="muted"> · {done} of {items.length}</span>}
      </div>
      {items.map((i) => (
        <div key={i.id} className={`check-row${i.done ? " is-done" : ""}`}>
          <input type="checkbox" checked={i.done} onChange={(e) => patch(i.id, { done: e.target.checked })} aria-label={`Mark "${i.text}" ${i.done ? "not done" : "done"}`} style={{ accentColor: "var(--brand)" }} />
          <input className="check-text" value={i.text} aria-label="Step" onChange={(e) => patch(i.id, { text: e.target.value })} onBlur={() => !i.text.trim() && onChange(items.filter((x) => x.id !== i.id))} />
          <button type="button" className="icon-btn" aria-label={`Remove "${i.text}"`} onClick={() => onChange(items.filter((x) => x.id !== i.id))}>
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="check-row">
        <Plus size={14} color="var(--ink-3)" aria-hidden="true" />
        <input className="check-text" value={text} placeholder="Add a step" aria-label="New step" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} onBlur={add} />
      </div>
    </div>
  );
}
