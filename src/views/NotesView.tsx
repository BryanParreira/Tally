import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, NotebookPen, Plus, Sparkles, Trash2 } from "lucide-react";
import { Segmented } from "../components/ui";
import { caretCoordinates } from "../lib/caret";
import { formatLongDate } from "../lib/date";
import { relativeTime, useToast } from "../lib/hooks";
import { useNav } from "../lib/nav";
import { findNoteTasks, noteExcerpt, noteTitle } from "../lib/notes";
import { extractTags } from "../lib/parse";
import { today, useStore } from "../lib/store";
import type { Snippet } from "../lib/types";

type Mode = "notes" | "snippets";

export function NotesView() {
  const notes = useStore((s) => s.notes);
  const snippets = useStore((s) => s.snippets);
  const { addNote, addSnippet } = useStore.getState();
  const target = useNav((s) => s.target);
  const [mode, setMode] = useState<Mode>("notes");
  const [selected, setSelected] = useState<string | null>(notes[0]?.id ?? null);
  const [selectedSnippet, setSelectedSnippet] = useState<string | null>(snippets[0]?.id ?? null);

  useEffect(() => {
    if (target?.kind === "note") {
      setMode("notes");
      setSelected(target.id);
    } else if (target?.kind === "snippet") {
      setMode("snippets");
      setSelectedSnippet(target.id);
    }
  }, [target]);

  const sorted = useMemo(() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt), [notes]);
  const note = notes.find((n) => n.id === selected) ?? sorted[0];
  const snippet = snippets.find((s) => s.id === selectedSnippet) ?? snippets[0];

  return (
    <div className="notes-layout">
      <aside className="notes-list" aria-label={mode === "notes" ? "Notes" : "Snippets"}>
        <div className="row" style={{ padding: "0 4px 14px" }}>
          <Segmented<Mode>
            label="Show"
            value={mode}
            onChange={setMode}
            options={[
              { value: "notes", label: "Notes" },
              { value: "snippets", label: "Snippets" },
            ]}
          />
          <span className="spacer" />
          <button
            type="button"
            className="icon-btn"
            aria-label={mode === "notes" ? "New note" : "New snippet"}
            title={mode === "notes" ? "New note" : "New snippet"}
            onClick={() => (mode === "notes" ? setSelected(addNote()) : setSelectedSnippet(addSnippet()))}
          >
            <Plus size={17} />
          </button>
        </div>

        {mode === "notes" &&
          sorted.map((n) => {
            const tags = extractTags(`${n.title} ${n.body}`).slice(0, 3);
            return (
              <button key={n.id} type="button" className="note-item" aria-current={note?.id === n.id} onClick={() => setSelected(n.id)}>
                <span className="note-item-title truncate">{noteTitle(n.title, n.body)}</span>
                <span className="note-item-excerpt">{noteExcerpt(n.body, 90) || "Empty page"}</span>
                <span className="note-item-time">
                  {relativeTime(n.updatedAt)}
                  {tags.map((t) => (
                    <span key={t} className="note-tag">
                      #{t}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        {mode === "notes" && sorted.length === 0 && <p className="muted small" style={{ padding: "0 6px" }}>No notes yet.</p>}

        {mode === "snippets" && (
          <>
            <p className="hint" style={{ padding: "0 6px 10px" }}>
              Type <span className="kbd">;</span> in any note to insert one.
            </p>
            {snippets.map((s) => (
              <button key={s.id} type="button" className="note-item" aria-current={snippet?.id === s.id} onClick={() => setSelectedSnippet(s.id)}>
                <span className="note-item-title truncate">{s.name || "Untitled snippet"}</span>
                <span className="note-item-excerpt">{noteExcerpt(s.body.replace(/\{\{date\}\}/g, "today's date"), 80)}</span>
              </button>
            ))}
          </>
        )}
      </aside>

      <div className="notes-page-wrap">
        {mode === "snippets" ? (
          snippet ? (
            <SnippetPage key={snippet.id} snippet={snippet} />
          ) : null
        ) : note ? (
          <NotePage key={note.id} noteId={note.id} />
        ) : (
          <div className="empty" style={{ marginTop: 80 }}>
            <span className="glyph">
              <NotebookPen size={20} aria-hidden="true" />
            </span>
            <h3>A quiet place to think</h3>
            <p>
              Write class notes, meeting notes or plans. Start a line with <strong>[ ]</strong> or <strong>/task</strong> to make it a task, add <strong>#tags</strong>, and type{" "}
              <strong>;</strong> for templates.
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

function NotePage({ noteId }: { noteId: string }) {
  const note = useStore((s) => s.notes.find((n) => n.id === noteId))!;
  const { updateNote, deleteNote, planNoteTasks } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [confirm, setConfirm] = useState(false);
  const pending = useMemo(() => findNoteTasks(note.body, today()), [note.body]);
  const words = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const tags = extractTags(`${note.title} ${note.body}`);

  return (
    <article className="paper-page">
      <div className="page-tools">
        <span className="muted small">
          {words} {words === 1 ? "word" : "words"} · saved on this computer
        </span>
        {tags.map((t) => (
          <button key={t} type="button" className="chip link-chip tag-chip" onClick={() => useNav.getState().setPalette(true, `#${t}`)}>
            #{t}
          </button>
        ))}
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

      <PaperBody
        id="note-body"
        value={note.body}
        autoFocus={!note.title && !note.body}
        placeholder={"Start writing…\n\n[ ] a line like this becomes a task\nType ; for a template, and #tag anything"}
        onChange={(body) => updateNote(note.id, { body })}
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

function SnippetPage({ snippet }: { snippet: Snippet }) {
  const { updateSnippet, deleteSnippet } = useStore.getState();
  const [confirm, setConfirm] = useState(false);
  return (
    <article className="paper-page">
      <div className="page-tools">
        <span className="muted small row" style={{ gap: 6 }}>
          <Sparkles size={13} aria-hidden="true" /> Snippet · <span className="kbd">{"{{date}}"}</span> becomes today's date
        </span>
        <span className="spacer" />
        {confirm ? (
          <>
            <button type="button" className="btn sm danger" onClick={() => deleteSnippet(snippet.id)}>
              Delete snippet
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setConfirm(false)}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" className="icon-btn" aria-label="Delete snippet" title="Delete snippet" onClick={() => setConfirm(true)}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <label htmlFor="snippet-name" className="sr-only">
        Snippet name
      </label>
      <input id="snippet-name" className="paper-title" placeholder="Snippet name" value={snippet.name} autoFocus={!snippet.name} onChange={(e) => updateSnippet(snippet.id, { name: e.target.value })} />
      <PaperBody id="snippet-body" value={snippet.body} placeholder="What should this snippet insert?" snippets={false} onChange={(body) => updateSnippet(snippet.id, { body })} />
    </article>
  );
}

interface BodyProps {
  id: string;
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  /** Offer the ; snippet menu while typing. */
  snippets?: boolean;
  onChange(value: string): void;
}

/** A page that grows like paper, with a ; menu for inserting snippets. */
function PaperBody({ id, value, placeholder, autoFocus, snippets: enableSnippets = true, onChange }: BodyProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const snippets = useStore((s) => s.snippets);
  const [menu, setMenu] = useState<{ start: number; query: string; top: number; left: number } | null>(null);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const matches = menu ? snippets.filter((s) => (s.name || "").toLowerCase().includes(menu.query.toLowerCase())).slice(0, 6) : [];

  const updateMenu = (el: HTMLTextAreaElement) => {
    if (!enableSnippets) return;
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/(^|\s);([\p{L}\p{N} ]{0,24})$/u);
    if (!m) return setMenu(null);
    const start = el.selectionStart - m[2].length - 1;
    const pos = caretCoordinates(el, start);
    setMenu({ start, query: m[2], top: pos.top + pos.height, left: pos.left });
    setActive(0);
  };

  const insert = (s: Snippet) => {
    const el = ref.current;
    if (!el || !menu) return;
    const text = s.body.replace(/\{\{date\}\}/g, formatLongDate(today()));
    const next = value.slice(0, menu.start) + text + value.slice(el.selectionStart);
    onChange(next);
    setMenu(null);
    const caret = menu.start + text.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="paper-body-wrap">
      <label htmlFor={id} className="sr-only">
        Page
      </label>
      <textarea
        id={id}
        ref={ref}
        className="paper-body"
        placeholder={placeholder}
        value={value}
        spellCheck
        onChange={(e) => {
          onChange(e.target.value);
          updateMenu(e.target);
        }}
        onClick={(e) => updateMenu(e.currentTarget)}
        onBlur={() => setTimeout(() => setMenu(null), 150)}
        onKeyDown={(e) => {
          if (!menu || !matches.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insert(matches[active]);
          } else if (e.key === "Escape") {
            setMenu(null);
          }
        }}
      />
      {menu && matches.length > 0 && (
        <div className="snippet-menu" role="listbox" aria-label="Snippets" style={{ top: menu.top + 6, left: Math.max(0, menu.left - 8) }}>
          <div className="palette-group" style={{ padding: "8px 10px 4px" }}>
            Insert snippet
          </div>
          {matches.map((s, i) => (
            <div
              key={s.id}
              role="option"
              aria-selected={i === active}
              className="palette-item"
              onMouseDown={(e) => {
                e.preventDefault();
                insert(s);
              }}
              onMouseMove={() => setActive(i)}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span className="label">{s.name || "Untitled snippet"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
