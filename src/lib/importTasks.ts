/** Bring tasks in from other apps: Todoist and other CSV exports, calendar to-dos (.ics), or a plain list. */
import { dateKey, resolveDayPhrase } from "./date";
import { parseItem, type ParsedItem } from "./parse";
import type { ChecklistItem, Priority } from "./types";

export interface ImportedTask extends Partial<Omit<ParsedItem, "title">> {
  title: string;
  notes?: string;
  done: boolean;
  checklist?: ChecklistItem[];
}

export interface ImportResult {
  format: "Todoist" | "CSV" | "calendar to-dos" | "text";
  tasks: ImportedTask[];
}

/** RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";" || c === "\t") (row.push(cell), (cell = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const uid = () => Math.random().toString(36).slice(2, 9);

/** "2026-10-20", "Oct 20 2026", "10/20/2026", "tomorrow", "20241020T090000" -> YYYY-MM-DD. */
export function readDate(raw: string | undefined, today: string): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-?(\d{2})-?(\d{2})(?:$|[T\s])/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const phrase = resolveDayPhrase(t, today);
  if (phrase) return phrase;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : dateKey(new Date(ms));
}

function readPriority(raw: string | undefined, todoist: boolean): Priority | undefined {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return undefined;
  if (/^(urgent|highest|critical)$/.test(t)) return "urgent";
  if (t === "high") return "high";
  if (t === "low") return "low";
  const n = Number(t.replace(/^p/, ""));
  if (!Number.isFinite(n)) return undefined;
  if (todoist || /^p/.test(t)) return n === 1 ? "urgent" : n === 2 ? "high" : n === 3 ? "normal" : undefined;
  return n >= 3 ? "urgent" : n === 2 ? "high" : undefined;
}

const DONE = /^(?:done|completed?|closed|finished|true|yes|x|1)$/i;
const pick = (header: string[], names: string[]) => header.findIndex((h) => names.includes(h));

function fromCSV(rows: string[][], today: string): ImportResult | null {
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {
    title: pick(header, ["title", "name", "task", "task name", "content", "summary", "subject", "todo"]),
    date: pick(header, ["date", "due", "due date", "due_date", "deadline", "start date"]),
    status: pick(header, ["status", "completed", "done", "state", "complete"]),
    priority: pick(header, ["priority"]),
    notes: pick(header, ["description", "notes", "note", "details", "body"]),
    tags: pick(header, ["labels", "label", "tags", "tag", "list", "project"]),
    type: pick(header, ["type"]),
    indent: pick(header, ["indent"]),
  };
  if (col.title < 0) return null;
  const todoist = col.type >= 0 && col.indent >= 0 && header.includes("content");
  const tasks: ImportedTask[] = [];
  let parent: ImportedTask | null = null;

  for (const r of rows.slice(1)) {
    if (todoist && r[col.type]?.trim().toLowerCase() !== "task") continue;
    const title = r[col.title]?.trim();
    if (!title) continue;
    // Todoist sub-tasks become a checklist on the task above.
    if (todoist && Number(r[col.indent]) > 1 && parent) {
      parent.checklist = [...(parent.checklist ?? []), { id: uid(), text: title, done: false }];
      continue;
    }
    const date = readDate(r[col.date], today);
    const tags = (r[col.tags] ?? "")
      .split(/[\s,]+/)
      .map((x) => x.replace(/^[@#]/, "").toLowerCase())
      .filter((x) => /^[\p{L}\p{N}_-]{1,30}$/u.test(x));
    const task: ImportedTask = {
      title,
      date,
      priority: readPriority(r[col.priority], todoist),
      notes: r[col.notes]?.trim() || undefined,
      tags: tags.length ? [...new Set(tags)] : undefined,
      done: col.status >= 0 && DONE.test(r[col.status]?.trim() ?? ""),
    };
    tasks.push(task);
    parent = task;
  }
  return { format: todoist ? "Todoist" : "CSV", tasks };
}

/** Calendar to-dos (VTODO), as exported by some reminder and task apps. */
function fromICS(text: string, today: string): ImportResult {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const tasks: ImportedTask[] = [];
  for (const block of unfolded.split("BEGIN:VTODO").slice(1)) {
    const body = block.split("END:VTODO")[0];
    const get = (k: string) => body.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, "im"))?.[1]?.trim().replace(/\\n/gi, "\n").replace(/\\,/g, ",");
    const title = get("SUMMARY");
    if (!title) continue;
    const p = Number(get("PRIORITY") ?? 0);
    tasks.push({
      title,
      date: readDate(get("DUE"), today),
      notes: get("DESCRIPTION") || undefined,
      priority: p >= 1 && p <= 4 ? "urgent" : p === 5 ? "high" : p >= 6 ? "low" : undefined,
      done: /COMPLETED/i.test(get("STATUS") ?? ""),
    });
  }
  return { format: "calendar to-dos", tasks };
}

/** One task per line, with the same shorthand as the chat ("call mom tomorrow", "- [ ] read ch. 5"). */
function fromText(text: string, today: string): ImportResult {
  const tasks: ImportedTask[] = [];
  for (const line of text.split(/\r?\n/)) {
    const done = /^\s*(?:[-*]\s*)?\[[xX]\]/.test(line);
    const item = parseItem(line.replace(/^\s*(?:[-*]\s*)?\[[ xX]\]\s*/, ""), today);
    if (item) tasks.push({ ...item, done });
  }
  return { format: "text", tasks };
}

export function parseImport(text: string, today: string): ImportResult {
  const t = text.trim();
  if (/BEGIN:VCALENDAR/i.test(t) && /BEGIN:VTODO/i.test(t)) return fromICS(t, today);
  const firstLine = t.split(/\r?\n/, 1)[0] ?? "";
  if (/(^|[,;\t])\s*"?(title|name|task|task name|content|summary|subject|todo)"?\s*([,;\t]|$)/i.test(firstLine)) {
    const csv = fromCSV(parseCSV(t), today);
    if (csv) return csv;
  }
  return fromText(t, today);
}
