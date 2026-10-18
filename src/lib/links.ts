/**
 * @-links: type [[ in a note or a task's details to link to a task, note or email.
 * Links are plain text ([[Title]]), so they survive backups and exports; the graph
 * (what a page links to, what links back to it) is worked out from the text on demand.
 */
import { noteTitle } from "./notes";
import type { AppData, MailMessage, Note, Task } from "./types";

export type RefKind = "task" | "note" | "email";

export interface Ref {
  kind: RefKind;
  id: string;
  title: string;
}

type Source = Pick<AppData, "tasks" | "notes"> & { mail: Pick<AppData["mail"], "messages"> };

const LINK = /\[\[([^[\]\n]{1,120})\]\]/g;
const MAX_EMAILS = 300;
const KIND_RANK: Record<RefKind, number> = { note: 0, task: 1, email: 2 };

/** Keep a title safe to sit inside [[ ]]. */
export const linkText = (title: string) => title.replace(/[[\]\n]/g, " ").replace(/\s+/g, " ").trim();
export const toLink = (title: string) => `[[${linkText(title)}]]`;

/** Everything that can be linked to. Finished tasks stay linkable; old email is capped. */
export function allRefs(s: Source): Ref[] {
  const refs: Ref[] = [];
  for (const n of s.notes) refs.push({ kind: "note", id: n.id, title: linkText(noteTitle(n.title, n.body)) });
  for (const t of s.tasks) refs.push({ kind: "task", id: t.id, title: linkText(t.title) });
  [...s.mail.messages]
    .sort((a, b) => b.date - a.date)
    .slice(0, MAX_EMAILS)
    .forEach((m: MailMessage) => m.subject.trim() && refs.push({ kind: "email", id: m.id, title: linkText(m.subject) }));
  return refs.filter((r) => r.title);
}

/** Titles written as [[Title]] in a piece of text. */
export function linkTitles(text: string): string[] {
  return [...text.matchAll(LINK)].map((m) => linkText(m[1]).toLowerCase()).filter(Boolean);
}

/** The text of a note or task that can hold links. */
export function textOf(item: Note | Task): string {
  if ("body" in item) return `${item.title}\n${item.body}`;
  return `${item.notes ?? ""}\n${(item.checklist ?? []).map((c) => c.text).join("\n")}`;
}

function lookup(refs: Ref[]): Map<string, Ref> {
  const byTitle = new Map<string, Ref>();
  for (const r of [...refs].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])) {
    const key = r.title.toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, r);
  }
  return byTitle;
}

/** Where a task came from counts as a link too, so old email tasks and note tasks are connected from day one. */
function sourceRef(t: Task, byId: Map<string, Ref>): Ref | undefined {
  if (!t.sourceRef || (t.source !== "email" && t.source !== "note")) return undefined;
  return byId.get(`${t.source === "email" ? "email" : "note"}:${t.sourceRef}`);
}

export interface LinkGraph {
  /** What this item links to. */
  links: Ref[];
  /** What links to this item. */
  backlinks: Ref[];
}

export function linksFor(kind: RefKind, id: string, s: Source): LinkGraph {
  const refs = allRefs(s);
  const byTitle = lookup(refs);
  const byId = new Map(refs.map((r) => [`${r.kind}:${r.id}`, r]));
  const self = byId.get(`${kind}:${id}`);

  const links = new Map<string, Ref>();
  const note = kind === "note" ? s.notes.find((n) => n.id === id) : undefined;
  const task = kind === "task" ? s.tasks.find((t) => t.id === id) : undefined;
  const mine = note ?? task;
  if (mine)
    for (const title of linkTitles(textOf(mine))) {
      const r = byTitle.get(title);
      if (r && !(r.kind === kind && r.id === id)) links.set(`${r.kind}:${r.id}`, r);
    }
  if (task) {
    const src = sourceRef(task, byId);
    if (src) links.set(`${src.kind}:${src.id}`, src);
  }

  const backlinks = new Map<string, Ref>();
  const title = self?.title.toLowerCase();
  const consider = (item: Note | Task, ref: Ref | undefined) => {
    if (!ref || (ref.kind === kind && ref.id === id)) return;
    if (title && linkTitles(textOf(item)).includes(title)) backlinks.set(`${ref.kind}:${ref.id}`, ref);
  };
  for (const n of s.notes) consider(n, byId.get(`note:${n.id}`));
  for (const t of s.tasks) {
    consider(t, byId.get(`task:${t.id}`));
    const src = sourceRef(t, byId);
    if (src && src.kind === kind && src.id === id) backlinks.set(`task:${t.id}`, byId.get(`task:${t.id}`)!);
  }
  return { links: [...links.values()], backlinks: [...backlinks.values()] };
}

/** Rewrite links after a title changes so nothing silently breaks. */
export function renameLinks(text: string, from: string, to: string): string {
  const a = linkText(from).toLowerCase();
  if (!a || a === linkText(to).toLowerCase()) return text;
  return text.replace(LINK, (all, t: string) => (linkText(t).toLowerCase() === a ? toLink(to) : all));
}
