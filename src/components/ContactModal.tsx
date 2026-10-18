import { useMemo } from "react";
import { CheckCircle2, Mail, NotebookPen } from "lucide-react";
import { Avatar, Modal } from "./ui";
import { contactFor } from "../lib/contacts";
import { formatDay } from "../lib/date";
import { relativeTime } from "../lib/hooks";
import { useNav } from "../lib/nav";
import { noteTitle } from "../lib/notes";
import { today, useStore } from "../lib/store";

const SHOWN = 8;

/** Everything about one person in one place: their mail, and the tasks and notes that involve them. */
export function ContactModal({ address }: { address: string }) {
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const messages = useStore((s) => s.mail.messages);
  const c = useMemo(() => contactFor(address, { tasks, notes, mail: { messages } }), [address, tasks, notes, messages]);
  const d = today();
  const nav = useNav.getState();
  const close = () => nav.setContact(null);
  const go = (view: Parameters<typeof nav.go>[0], target: Parameters<typeof nav.go>[1]) => {
    close();
    nav.go(view, target);
  };
  const openTasks = c.tasks.filter((t) => !t.done);
  const doneTasks = c.tasks.filter((t) => t.done);

  const section = (title: string, count: number, rows: React.ReactNode) =>
    count > 0 && (
      <section className="contact-section">
        <h3 className="contact-head">
          {title} <span className="muted">{count}</span>
        </h3>
        {rows}
      </section>
    );

  return (
    <Modal onClose={close} labelledBy="contact-title">
      <div className="contact">
        <div className="row" style={{ gap: 12, marginBottom: 14 }}>
          <Avatar name={c.name} size={40} />
          <div style={{ minWidth: 0 }}>
            <h2 id="contact-title" className="truncate" style={{ margin: 0 }}>
              {c.name}
            </h2>
            <div className="muted small truncate">{c.address}</div>
          </div>
        </div>

        {section(
          "Email",
          c.messages.length,
          c.messages.slice(0, SHOWN).map((m) => (
            <button key={m.id} type="button" className="contact-row" onClick={() => go("inbox", { kind: "email", id: m.id })}>
              <Mail size={14} aria-hidden="true" />
              <span className="truncate">{m.subject || "(no subject)"}</span>
              <span className="muted small">{relativeTime(m.date)}</span>
            </button>
          )),
        )}
        {c.messages.length > SHOWN && <p className="muted small contact-more">and {c.messages.length - SHOWN} older</p>}

        {section(
          "Tasks",
          c.tasks.length,
          [...openTasks, ...doneTasks.slice(0, 3)].map((t) => (
            <button key={t.id} type="button" className={`contact-row${t.done ? " is-done" : ""}`} onClick={() => go("tasks", { kind: "task", id: t.id })}>
              <CheckCircle2 size={14} aria-hidden="true" />
              <span className="truncate">{t.title}</span>
              <span className="muted small">{t.done ? "Done" : t.someday ? "Someday" : formatDay(t.date, d)}</span>
            </button>
          )),
        )}

        {section(
          "Notes",
          c.notes.length,
          c.notes.map((n) => (
            <button key={n.id} type="button" className="contact-row" onClick={() => go("notes", { kind: "note", id: n.id })}>
              <NotebookPen size={14} aria-hidden="true" />
              <span className="truncate">{noteTitle(n.title, n.body)}</span>
              <span className="muted small">{relativeTime(n.updatedAt)}</span>
            </button>
          )),
        )}

        {!c.messages.length && !c.tasks.length && !c.notes.length && <p className="muted">Nothing with this person yet.</p>}
        <div className="row" style={{ marginTop: 18 }}>
          <span className="spacer" />
          <button type="button" className="btn ghost sm" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
