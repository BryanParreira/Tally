/**
 * Local recall: ranks your tasks, notes and email against a question so the
 * assistant can answer "what did Sam ask me for?" from your own words.
 * Plain word matching (BM25), all on this computer, nothing indexed on disk.
 */
import { noteTitle } from "./notes";
import type { RefKind } from "./links";
import type { AppData } from "./types";

export interface Doc {
  kind: RefKind;
  id: string;
  title: string;
  text: string;
}

export interface Hit extends Doc {
  score: number;
  /** Query words that were found. */
  matched: number;
}

const STOP = new Set(
  "a an and are as at be but by can did do does for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to was we were what when where which who why will with you your about any all anything tell show give find".split(" "),
);

export const tokens = (text: string): string[] =>
  (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).map((w) => w.replace(/^['-]+|['-]+$/g, "").replace(/'s$/, "")).filter((w) => w.length > 1 && !STOP.has(w));

/** Light stemming so "emails" finds "email" and "meeting" finds "meet". */
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w.replace(/s$/, ""));

export function buildDocs(s: Pick<AppData, "tasks" | "notes"> & { mail: Pick<AppData["mail"], "messages"> }): Doc[] {
  const docs: Doc[] = [];
  for (const t of s.tasks) {
    if (t.done && !t.notes) continue;
    docs.push({ kind: "task", id: t.id, title: t.title, text: `${t.title} ${(t.tags ?? []).join(" ")} ${t.notes ?? ""} ${(t.checklist ?? []).map((c) => c.text).join(" ")}` });
  }
  for (const n of s.notes) docs.push({ kind: "note", id: n.id, title: noteTitle(n.title, n.body), text: `${n.title} ${n.body}` });
  for (const m of s.mail.messages) docs.push({ kind: "email", id: m.id, title: m.subject, text: `${m.subject} ${m.fromName} ${m.fromAddress} ${m.text.slice(0, 1500)}` });
  return docs;
}

const K1 = 1.4;
const B = 0.75;

export function rank(query: string, docs: Doc[], limit = 4): Hit[] {
  const q = [...new Set(tokens(query).map(stem))];
  if (!q.length || !docs.length) return [];
  const bags = docs.map((d) => {
    const bag = new Map<string, number>();
    const titleWords = new Set(tokens(d.title).map(stem));
    let len = 0;
    for (const w of tokens(d.text)) {
      const s = stem(w);
      bag.set(s, (bag.get(s) ?? 0) + 1);
      len++;
    }
    // A word in the title counts extra.
    for (const w of titleWords) bag.set(w, (bag.get(w) ?? 0) + 3);
    return { bag, len: Math.max(len, 1) };
  });
  const avg = bags.reduce((n, b) => n + b.len, 0) / bags.length;
  const df = new Map<string, number>();
  for (const w of q) df.set(w, bags.filter((b) => b.bag.has(w)).length);

  const hits: Hit[] = [];
  bags.forEach((b, i) => {
    let score = 0;
    let matched = 0;
    for (const w of q) {
      const f = b.bag.get(w);
      if (!f) continue;
      matched++;
      const n = df.get(w)!;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * b.len) / avg));
    }
    if (matched) hits.push({ ...docs[i], score, matched });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** A short excerpt around the first query word, so the model sees why this matched. */
export function excerpt(text: string, query: string, max = 260): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const q = new Set(tokens(query).map(stem));
  const re = /[\p{L}\p{N}][\p{L}\p{N}'-]*/gu;
  let at = 0;
  for (let m = re.exec(flat); m; m = re.exec(flat)) {
    if (q.has(stem(m[0].toLowerCase()))) {
      at = Math.max(0, m.index - 70);
      break;
    }
  }
  const piece = flat.slice(at, at + max);
  return `${at > 0 ? "…" : ""}${piece}${at + max < flat.length ? "…" : ""}`;
}

/**
 * Passages worth showing the assistant for this question. Needs at least half of
 * the question's words to appear, so general questions don't pull in unrelated notes.
 */
export function recallFor(question: string, docs: Doc[], limit = 3): { hit: Hit; excerpt: string }[] {
  const need = Math.max(1, Math.ceil([...new Set(tokens(question).map(stem))].length / 2));
  return rank(question, docs, limit * 2)
    .filter((h) => h.matched >= need)
    .slice(0, limit)
    .map((hit) => ({ hit, excerpt: excerpt(hit.text, question) }));
}
