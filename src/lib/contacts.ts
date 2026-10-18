/** A person you correspond with, gathered from your own mail, tasks and notes. Nothing is stored; it is worked out on demand. */
import type { MailMessage, Note, Task } from "./types";

export interface Contact {
  address: string;
  name: string;
  /** Mail from this person, newest first. */
  messages: MailMessage[];
  tasks: Task[];
  notes: Note[];
}

interface Source {
  tasks: Task[];
  notes: Note[];
  mail: { messages: MailMessage[] };
}

const norm = (a: string) => a.trim().toLowerCase();

/** The most recent real name used for this address, falling back to the address. */
function nameFor(messages: MailMessage[], address: string): string {
  return messages.find((m) => m.fromName.trim() && norm(m.fromName) !== address)?.fromName.trim() || address;
}

/** Whole-word, case-insensitive mention of a full name (two words or more) or an address. */
function mentions(text: string, name: string, address: string): boolean {
  const t = text.toLowerCase();
  if (t.includes(address)) return true;
  const n = name.toLowerCase();
  return n !== address && n.includes(" ") && n.length >= 5 && new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(t);
}

export function contactFor(address: string, s: Source): Contact {
  const addr = norm(address);
  const messages = s.mail.messages.filter((m) => norm(m.fromAddress) === addr).sort((a, b) => b.date - a.date);
  const name = nameFor(messages, addr);
  const ids = new Set(messages.map((m) => m.id));
  const tasks = s.tasks.filter((t) => (t.source === "email" && t.sourceRef && ids.has(t.sourceRef)) || mentions(`${t.title}\n${t.notes ?? ""}`, name, addr));
  const notes = s.notes.filter((n) => mentions(`${n.title}\n${n.body}`, name, addr));
  return { address: addr, name, messages, tasks, notes };
}

export interface Person {
  address: string;
  name: string;
  count: number;
  last: number;
}

/** People who have written to you, most recent first. Newsletters and no-reply senders are left out. */
export function people(messages: MailMessage[], limit = 40): Person[] {
  const byAddr = new Map<string, MailMessage[]>();
  for (const m of messages) {
    const a = norm(m.fromAddress);
    if (!a || m.bulk || /(^|[._-])(no-?reply|donotreply|notifications?|mailer-daemon)([._-]|@)/.test(a)) continue;
    byAddr.set(a, [...(byAddr.get(a) ?? []), m]);
  }
  return [...byAddr.entries()]
    .map(([address, list]) => ({ address, name: nameFor(list, address), count: list.length, last: Math.max(...list.map((m) => m.date)) }))
    .sort((a, b) => b.last - a.last)
    .slice(0, limit);
}
