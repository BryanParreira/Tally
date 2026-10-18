/** Plain-language commands for the chat: "mark essay done", "move gym to friday", "push everything to tomorrow". */
import { DAY_PHRASE, resolveDayPhrase } from "./date";
import type { Task } from "./types";

export type Command =
  | { kind: "done"; query: string }
  | { kind: "delete"; query: string }
  | { kind: "move"; query: string; date: string | null; start: number | null }
  | { kind: "pushAll"; date: string };

const FILLER = /^(?:please\s+|can you\s+|could you\s+|hey\s+)?/i;
const DAY = new RegExp(`\\b(${DAY_PHRASE})\\b`, "i");
const TIME = /(?:\bat\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b|\bnoon\b|\bat\s+(\d{1,2})(?::(\d{2}))?\b/i;

/** "3pm", "at 15:30", "noon" -> minutes after midnight. */
function readTime(text: string): { start: number; rest: string } | null {
  const m = text.match(TIME);
  if (!m) return null;
  let start: number;
  if (/noon/i.test(m[0])) start = 12 * 60;
  else if (m[1]) {
    let h = Number(m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    start = h * 60 + Number(m[2] ?? 0);
  } else {
    start = Number(m[4]) * 60 + Number(m[5] ?? 0);
  }
  if (start >= 24 * 60) return null;
  return { start, rest: text.replace(m[0], " ") };
}

/** "friday at 3pm" / "tomorrow" / "7pm" -> a day, a time, or both. */
export function readWhen(text: string, today: string): { date: string | null; start: number | null } | null {
  const time = readTime(text);
  const rest = time ? time.rest : text;
  const dayWord = rest.match(DAY)?.[1];
  const date = dayWord ? resolveDayPhrase(dayWord, today) : null;
  if (!date && !time) return null;
  return { date, start: time?.start ?? null };
}

const clean = (s: string) => s.replace(/^(?:the|my|that|this)\s+/i, "").replace(/\s+(?:task|todo)$/i, "").replace(/[.!?]+$/, "").trim();

/** Turn a chat message into an action on the plan, or null when it isn't one. */
export function parseCommand(message: string, today: string): Command | null {
  const t = message.trim().replace(FILLER, "").replace(/[.!]+$/, "");

  // Everything today, somewhere else.
  const all = t.match(/^(?:move|push|postpone|reschedule|shift)\s+(?:everything|all(?: of)?(?: my)?(?: tasks?)?|the rest(?: of (?:my day|today))?|what'?s left|my day)\s+(?:to|until|till|for)\s+(.+)$/i) ?? t.match(/^clear (?:my day|today)(?:\s+(?:to|until|for)\s+(.+))?$/i);
  if (all) {
    const when = readWhen(all[1] ?? "tomorrow", today);
    return when?.date ? { kind: "pushAll", date: when.date } : null;
  }

  const done = t.match(/^(?:mark|check off|tick off)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished)$/i) ?? t.match(/^(?:finish(?:ed)?|complete(?:d)?|done with|i(?:'ve| have)? (?:finished|done|completed))\s+(.+)$/i) ?? t.match(/^(.+?)\s+(?:is|are)\s+(?:done|finished|complete|completed)$/i);
  if (done) return { kind: "done", query: clean(done[1]) };

  const del = t.match(/^(?:delete|remove|cancel|drop)\s+(.+)$/i);
  if (del) return { kind: "delete", query: clean(del[1]) };

  const move = t.match(/^(?:move|push|postpone|reschedule|shift|bump)\s+(.+?)\s+(?:to|until|till|for|by)\s+(.+)$/i) ?? t.match(/^(?:postpone|push back|put off|bump)\s+(.+)$/i);
  if (move) {
    const when = move[2] ? readWhen(move[2], today) : { date: resolveDayPhrase("tomorrow", today), start: null };
    if (!when) return null;
    return { kind: "move", query: clean(move[1]), date: when.date, start: when.start };
  }
  return null;
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((w) => w.length > 2 || /^\d+$/.test(w)) ?? [];

/** Open tasks that fit what the user called one, best match first. Today's tasks win ties. */
export function matchTasks(query: string, tasks: Task[], today: string): Task[] {
  const q = words(query);
  if (!q.length) return [];
  return tasks
    .filter((t) => !t.someday)
    .map((t) => {
      const title = words(t.title);
      const hit = q.filter((w) => title.some((x) => x === w || x.startsWith(w) || w.startsWith(x))).length;
      const score = hit / q.length;
      return { t, score: score + (t.date === today ? 0.05 : 0) - (t.done ? 0.2 : 0) };
    })
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
}
