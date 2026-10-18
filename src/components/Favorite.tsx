import { useMemo } from "react";
import { CheckCircle2, FolderKanban, NotebookPen, Pin } from "lucide-react";
import { useNav } from "../lib/nav";
import { noteTitle } from "../lib/notes";
import { projectName } from "../lib/projects";
import { useStore } from "../lib/store";
import type { Favorite } from "../lib/types";

/** Pin or unpin one item. */
export function FavoriteButton({ item }: { item: Favorite }) {
  const on = useStore((s) => s.favorites.some((f) => f.kind === item.kind && f.id === item.id));
  return (
    <button type="button" className={`icon-btn${on ? " is-pinned" : ""}`} aria-pressed={on} aria-label={on ? "Unpin from sidebar" : "Pin to sidebar"} title={on ? "Unpin from sidebar" : "Pin to sidebar"} onClick={() => useStore.getState().toggleFavorite(item)}>
      <Pin size={15} fill={on ? "currentColor" : "none"} />
    </button>
  );
}

const VIEW = { task: "tasks", note: "notes", project: "projects" } as const;
const ICON = { task: CheckCircle2, note: NotebookPen, project: FolderKanban } as const;

/** Pinned items, listed in the sidebar. Items that no longer exist are skipped. */
export function FavoritesNav() {
  const favorites = useStore((s) => s.favorites);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const projects = useStore((s) => s.projects);
  const rows = useMemo(
    () =>
      favorites.flatMap((f) => {
        const title =
          f.kind === "task" ? tasks.find((t) => t.id === f.id)?.title : f.kind === "note" ? (() => { const n = notes.find((x) => x.id === f.id); return n && noteTitle(n.title, n.body); })() : (() => { const p = projects.find((x) => x.id === f.id); return p && projectName(p); })();
        return title ? [{ ...f, title }] : [];
      }),
    [favorites, tasks, notes, projects],
  );
  if (!rows.length) return null;
  return (
    <div className="subnav favs" aria-label="Pinned">
      <h2 className="subnav-head">Pinned</h2>
      {rows.map((r) => {
        const Icon = ICON[r.kind];
        return (
          <button key={`${r.kind}:${r.id}`} type="button" className="subnav-item" onClick={() => useNav.getState().go(VIEW[r.kind], { kind: r.kind, id: r.id })}>
            <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
            <span className="truncate">{r.title}</span>
          </button>
        );
      })}
    </div>
  );
}
