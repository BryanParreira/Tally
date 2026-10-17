import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Trash2, X } from "lucide-react";
import { Segmented } from "./ui";
import { formatDuration } from "../lib/date";
import { timeOptions, useAutosize, useToast } from "../lib/hooks";
import { useNav } from "../lib/nav";
import { restoreDeletedTask, useStore } from "../lib/store";
import { PRIORITY_LABEL, STATUS_LABEL, statusOf } from "../lib/taskViews";
import type { Category, Priority, Task, TaskStatus } from "../lib/types";

const TIMES = timeOptions(15);
const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240];

/** Every property of a task, editable in place. */
export function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const { updateTask, deleteTask, toggleDone } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState(task?.title ?? "");
  const [tags, setTags] = useState((task?.tags ?? []).map((t) => `#${t}`).join(" "));
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(titleRef, title);

  useEffect(() => {
    setTitle(task?.title ?? "");
    setTags((task?.tags ?? []).map((t) => `#${t}`).join(" "));
    setConfirm(false);
  }, [taskId]);

  if (!task) return null;
  const set = (patch: Partial<Task>) => updateTask(task.id, patch);
  const status = statusOf(task);

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

      <dl className="props">
        <dt>Status</dt>
        <dd>
          <Segmented<TaskStatus | "done">
            label="Status"
            value={status}
            onChange={(s) => (s === "done" ? !task.done && toggleDone(task.id, null) : set({ status: s, done: false, doneAt: undefined }))}
            options={(["todo", "doing", "waiting", "done"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
        </dd>

        <dt>Priority</dt>
        <dd>
          <Segmented<Priority>
            label="Priority"
            value={task.priority ?? "normal"}
            onChange={(priority) => set({ priority })}
            options={(["urgent", "high", "normal", "low"] as const).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
          />
        </dd>

        <dt>When</dt>
        <dd className="row wrap">
          <input
            type="date"
            className="input"
            style={{ width: 160 }}
            aria-label="Date"
            value={task.date}
            disabled={task.someday}
            onChange={(e) => e.target.value && set({ date: e.target.value, start: task.fixed ? task.start : null })}
          />
          <label className="row small" style={{ gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={!!task.someday} onChange={(e) => set({ someday: e.target.checked })} style={{ accentColor: "var(--brand)" }} />
            Someday
          </label>
        </dd>

        <dt>Time</dt>
        <dd>
          <select
            className="input"
            style={{ width: 200 }}
            aria-label="Time"
            value={task.fixed && task.start !== null ? String(task.start) : "auto"}
            onChange={(e) => (e.target.value === "auto" ? set({ fixed: false, start: null }) : set({ fixed: true, start: Number(e.target.value) }))}
          >
            <option value="auto">Kindred picks the time</option>
            {TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </dd>

        <dt>Length</dt>
        <dd>
          <select className="input" style={{ width: 200 }} aria-label="Length" value={task.duration} onChange={(e) => set({ duration: Number(e.target.value) })}>
            {[...new Set([...DURATIONS, task.duration])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m)}
                </option>
              ))}
          </select>
        </dd>

        <dt>Area</dt>
        <dd>
          <Segmented<Category>
            label="Area"
            value={task.category}
            onChange={(category) => set({ category })}
            options={[
              { value: "study", label: "Study" },
              { value: "work", label: "Work" },
              { value: "life", label: "Life" },
            ]}
          />
        </dd>

        <dt>Tags</dt>
        <dd>
          <input
            className="input"
            aria-label="Tags"
            placeholder="#bio #lab"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            onBlur={() => {
              const list = [...new Set(tags.split(/[\s,]+/).map((t) => t.replace(/^#/, "").toLowerCase()).filter(Boolean))];
              set({ tags: list.length ? list : undefined });
              setTags(list.map((t) => `#${t}`).join(" "));
            }}
          />
        </dd>
      </dl>

      <label htmlFor="detail-notes" className="label" style={{ display: "block", margin: "18px 0 8px" }}>
        Notes
      </label>
      <textarea id="detail-notes" className="input" style={{ minHeight: 120 }} placeholder="Details, links, anything…" value={task.notes ?? ""} onChange={(e) => set({ notes: e.target.value || undefined })} />

      <div className="row wrap" style={{ marginTop: 18 }}>
        {source && (
          <button type="button" className="btn sm" onClick={source.go}>
            <ArrowUpRight size={14} /> {source.label}
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
