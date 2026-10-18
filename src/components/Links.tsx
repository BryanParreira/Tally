import { useMemo, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { CheckCircle2, Link2, Mail, NotebookPen } from "lucide-react";
import { caretCoordinates } from "../lib/caret";
import { allRefs, linksFor, toLink, type Ref, type RefKind } from "../lib/links";
import { useNav, type View } from "../lib/nav";
import { useStore } from "../lib/store";

const VIEW_OF: Record<RefKind, View> = { task: "tasks", note: "notes", email: "inbox" };
const ICON = { task: CheckCircle2, note: NotebookPen, email: Mail } as const;
const KIND_LABEL: Record<RefKind, string> = { task: "Task", note: "Note", email: "Email" };

export function openRef(r: Ref) {
  useNav.getState().go(VIEW_OF[r.kind], { kind: r.kind, id: r.id });
}

/** What this page links to, and what links back to it. */
export function LinkChips({ kind, id }: { kind: RefKind; id: string }) {
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const messages = useStore((s) => s.mail.messages);
  const { links, backlinks } = useMemo(() => linksFor(kind, id, { tasks, notes, mail: { messages } }), [kind, id, tasks, notes, messages]);
  if (!links.length && !backlinks.length) return null;
  const row = (label: string, refs: Ref[]) =>
    refs.length > 0 && (
      <div className="link-row">
        <span className="link-label">{label}</span>
        {refs.map((r) => {
          const Icon = ICON[r.kind];
          return (
            <button key={`${r.kind}:${r.id}`} type="button" className="link-chip" title={`${KIND_LABEL[r.kind]}: ${r.title}`} onClick={() => openRef(r)}>
              <Icon size={12} aria-hidden="true" />
              <span className="truncate">{r.title}</span>
            </button>
          );
        })}
      </div>
    );
  return (
    <div className="link-chips" aria-label="Links">
      {row("Links", links)}
      {row("Linked from", backlinks)}
    </div>
  );
}

interface Menu {
  start: number;
  query: string;
  top: number;
  left: number;
}

/**
 * Type [[ in a text box to link to a task, note or email. Hook the three
 * pieces into the textarea: call `update` after each edit, `onKeyDown` first
 * in its key handler (it returns true when it used the key), and render `menu`
 * next to it inside a position: relative wrapper.
 */
export function useLinkMenu(ref: RefObject<HTMLTextAreaElement | null>, value: string, onChange: (value: string) => void, self?: { kind: RefKind; id: string }) {
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const messages = useStore((s) => s.mail.messages);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    if (!menu) return [];
    const q = menu.query.trim().toLowerCase();
    return allRefs({ tasks, notes, mail: { messages } })
      .filter((r) => !(self && r.kind === self.kind && r.id === self.id) && (!q || r.title.toLowerCase().includes(q)))
      .filter((r) => !(r.kind === "task" && !q && tasks.find((t) => t.id === r.id)?.done))
      .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)))
      .slice(0, 7);
  }, [menu, tasks, notes, messages, self?.kind, self?.id]);

  const update = (el: HTMLTextAreaElement) => {
    const before = el.value.slice(0, el.selectionStart);
    const m = before.match(/\[\[([^[\]\n]{0,40})$/);
    if (!m) return setMenu(null);
    const start = el.selectionStart - m[1].length - 2;
    const pos = caretCoordinates(el, start);
    setMenu({ start, query: m[1], top: pos.top + pos.height, left: pos.left });
    setActive(0);
  };

  const insert = (r: Ref) => {
    const el = ref.current;
    if (!el || !menu) return;
    const end = value.slice(el.selectionStart).startsWith("]]") ? el.selectionStart + 2 : el.selectionStart;
    const link = toLink(r.title);
    onChange(value.slice(0, menu.start) + link + value.slice(end));
    setMenu(null);
    const caret = menu.start + link.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (!menu || !matches.length) return false;
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % matches.length);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + matches.length) % matches.length);
    else if (e.key === "Enter" || e.key === "Tab") insert(matches[active]);
    else if (e.key === "Escape") setMenu(null);
    else return false;
    e.preventDefault();
    return true;
  };

  const element: ReactNode =
    menu && matches.length > 0 ? (
      <div className="snippet-menu" role="listbox" aria-label="Link to" style={{ top: menu.top + 6, left: Math.max(0, menu.left - 8) }}>
        <div className="palette-group" style={{ padding: "8px 10px 4px" }}>
          <Link2 size={11} aria-hidden="true" style={{ verticalAlign: -1 }} /> Link to
        </div>
        {matches.map((r, i) => {
          const Icon = ICON[r.kind];
          return (
            <div
              key={`${r.kind}:${r.id}`}
              role="option"
              aria-selected={i === active}
              className="palette-item"
              onMouseDown={(e) => {
                e.preventDefault();
                insert(r);
              }}
              onMouseMove={() => setActive(i)}
            >
              <Icon size={14} aria-hidden="true" />
              <span className="label">{r.title}</span>
              <span className="hint">{KIND_LABEL[r.kind]}</span>
            </div>
          );
        })}
      </div>
    ) : null;

  return { update, onKeyDown, menu: element, close: () => setMenu(null) };
}
