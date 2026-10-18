import { useMemo } from "react";
import { CheckCircle2, FolderKanban, Mail, NotebookPen } from "lucide-react";
import { useNav } from "../lib/nav";
import { noteTitle } from "../lib/notes";
import { projectName } from "../lib/projects";
import { useRecent } from "../lib/recent";
import { useStore } from "../lib/store";

const SHOWN = 5;
const VIEW = { task: "tasks", note: "notes", email: "inbox", project: "projects" } as const;
const ICON = { task: CheckCircle2, note: NotebookPen, email: Mail, project: FolderKanban } as const;

/** Where you were last: the notes, tasks, projects and emails you opened most recently. */
export function Recent() {
  const items = useRecent((s) => s.items);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const projects = useStore((s) => s.projects);
  const messages = useStore((s) => s.mail.messages);

  const rows = useMemo(() => {
    const out: { kind: keyof typeof VIEW; id: string; title: string }[] = [];
    for (const it of items) {
      const title =
        it.kind === "task" ? tasks.find((t) => t.id === it.id)?.title : it.kind === "note" ? (() => { const n = notes.find((x) => x.id === it.id); return n && noteTitle(n.title, n.body); })() : it.kind === "project" ? (() => { const p = projects.find((x) => x.id === it.id); return p && projectName(p); })() : messages.find((m) => m.id === it.id)?.subject;
      if (title) out.push({ kind: it.kind, id: it.id, title });
      if (out.length === SHOWN) break;
    }
    return out;
  }, [items, tasks, notes, projects, messages]);

  if (!rows.length) return null;
  return (
    <section className="side-card" aria-label="Recent">
      <header className="side-head">
        <span className="side-title">Recent</span>
      </header>
      {rows.map((r) => {
        const Icon = ICON[r.kind];
        return (
          <button key={`${r.kind}:${r.id}`} type="button" className="contact-row" onClick={() => useNav.getState().go(VIEW[r.kind], { kind: r.kind, id: r.id })}>
            <Icon size={14} aria-hidden="true" />
            <span className="truncate">{r.title}</span>
          </button>
        );
      })}
    </section>
  );
}
