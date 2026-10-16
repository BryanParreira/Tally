import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, NotebookPen, Plus, Trash2 } from "lucide-react";
import { relativeTime, useToast } from "../lib/hooks";
import { useNav } from "../lib/nav";
import { findNoteTasks, noteExcerpt, noteTitle } from "../lib/notes";
import { today, useStore } from "../lib/store";
import type { Note } from "../lib/types";

export function NotesView() {
  const notes = useStore((s) => s.notes);
  const addNote = useStore((s) => s.addNote);
  const target = useNav((s) => s.target);
  const [selected, setSelected] = useState<string | null>(notes[0]?.id ?? null);

  useEffect(() => {
    if (target?.kind === "note") setSelected(target.id);
  }, [target]);

  const sorted = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes]);
  const note = notes.find((n) => n.id === selected) ?? sorted[0];

  return (
    <div className="notes-layout">
      <aside className="notes-list" aria-label="Notes">
        <div className="row" style={{ padding: "0 6px 14px" }}>
          <h2 className="section" style={{ margin: 0 }}>
            Notes
          </h2>
          <span className="spacer" />
          <button type="button" className="icon-btn" aria-label="New note" title="New note" onClick={() => setSelected(addNote())}>
            <Plus size={17} />
          </button>
        </div>
        {sorted.map((n) => (
          <button key={n.id} type="button" className="note-item" aria-current={note?.id === n.id} onClick={() => setSelected(n.id)}>
            <span className="note-item-title truncate">{noteTitle(n.title, n.body)}</span>
            <span className="note-item-excerpt">{noteExcerpt(n.body, 90) || "Empty page"}</span>
            <span className="note-item-time">{relativeTime(n.updatedAt)}</span>
          </button>
        ))}
        {sorted.length === 0 && <p className="muted small" style={{ padding: "0 6px" }}>No notes yet.</p>}
      </aside>

      <div className="notes-page-wrap">
        {note ? (
          <Page key={note.id} note={note} />
        ) : (
          <div className="empty" style={{ marginTop: 80 }}>
            <span className="glyph">
              <NotebookPen size={20} aria-hidden="true" />
            </span>
            <h3>A quiet place to think</h3>
            <p>
              Write class notes, meeting notes or plans. Start any line with <strong>[ ]</strong> or <strong>/task</strong> and Kindred turns it into a task on your day.
            </p>
            <button type="button" className="btn primary" style={{ marginTop: 20 }} onClick={() => setSelected(addNote())}>
              <Plus size={15} /> New note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Page({ note }: { note: Note }) {
  const { updateNote, deleteNote, planNoteTasks } = useStore.getState();
  const toast = useToast((s) => s.show);
  const body = useRef<HTMLTextAreaElement>(null);
  const [confirm, setConfirm] = useState(false);
  const pending = useMemo(() => findNoteTasks(note.body, today()), [note.body]);
  const words = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;

  // Grow the page with the writing, like paper.
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [note.body]);

  useEffect(() => {
    if (!note.title && !note.body) body.current?.focus();
  }, [note.id]);

  return (
    <article className="paper-page">
      <div className="page-tools">
        <span className="muted small">
          {words} {words === 1 ? "word" : "words"} · saved on this computer
        </span>
        <span className="spacer" />
        {confirm ? (
          <>
            <button type="button" className="btn sm danger" onClick={() => deleteNote(note.id)}>
              Delete note
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" className="icon-btn" aria-label="Delete note" title="Delete note" onClick={() => setConfirm(true)}>
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <label htmlFor="note-title" className="sr-only">
        Title
      </label>
      <input id="note-title" className="paper-title" placeholder="Untitled" value={note.title} onChange={(e) => updateNote(note.id, { title: e.target.value })} />

      <label htmlFor="note-body" className="sr-only">
        Note
      </label>
      <textarea
        id="note-body"
        ref={body}
        className="paper-body"
        placeholder={"Start writing…\n\nTip: a line that starts with [ ] or /task becomes a task, like\n[ ] email Prof. Lee about the lab tomorrow"}
        value={note.body}
        spellCheck
        onChange={(e) => updateNote(note.id, { body: e.target.value })}
      />

      {pending.length > 0 && (
        <div className="note-tasks" role="status">
          <CalendarPlus size={16} aria-hidden="true" />
          <span style={{ flex: 1 }}>
            {pending.length} {pending.length === 1 ? "task" : "tasks"} in this note: {pending.map((p) => p.item.title).join(", ")}
          </span>
          <button
            type="button"
            className="btn primary sm"
            onClick={() => {
              const n = planNoteTasks(note.id);
              toast(n === 1 ? "Added to your plan" : `Planned ${n} tasks`);
            }}
          >
            Plan {pending.length === 1 ? "it" : "them"}
          </button>
        </div>
      )}
    </article>
  );
}
