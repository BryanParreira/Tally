import { parseItem, type ParsedItem } from "./parse";

/** "[ ] call the bank tomorrow", "- [ ] read ch. 5", "/task book flights by friday" */
const TASK_LINE = /^(\s*(?:[-*]\s+)?)(\[ \]|\/task)\s+(.+)$/i;
const PLANNED_MARK = "[→]";

export interface NoteTask {
  line: number;
  item: ParsedItem;
}

/** Lines in a note that are waiting to become tasks. */
export function findNoteTasks(body: string, today: string): NoteTask[] {
  const out: NoteTask[] = [];
  body.split("\n").forEach((line, i) => {
    const m = line.match(TASK_LINE);
    if (!m) return;
    const item = parseItem(m[3], today);
    if (item) out.push({ line: i, item });
  });
  return out;
}

/** Mark task lines as planned so they aren't added twice. */
export function markPlanned(body: string): string {
  return body
    .split("\n")
    .map((line) => line.replace(TASK_LINE, (_all, indent: string, _mark: string, rest: string) => `${indent}${PLANNED_MARK} ${rest}`))
    .join("\n");
}

export function noteTitle(title: string, body: string): string {
  if (title.trim()) return title.trim();
  const first = body.split("\n").find((l) => l.trim());
  return first ? first.replace(/^#+\s*/, "").slice(0, 60) : "Untitled";
}

export function noteExcerpt(body: string, max = 120): string {
  const text = body.replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
