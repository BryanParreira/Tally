/** Plain-text snapshots of the user's day for the assistant. Only what is needed, only on this computer. */
import { formatLongDate, formatTime } from "./date";
import { planFor, today, useStore } from "./store";
import { blockTitle } from "./schedule";
import { noteTitle } from "./notes";
import { parseBrainDump } from "./parse";
import { buildDocs, recallFor } from "./search";
import type { MailMessage } from "./types";

export function dayContext(): string {
  const s = useStore.getState();
  const d = today();
  const plan = planFor(s, d);
  const lines = plan.blocks.filter((b) => b.kind !== "break" && !(b.kind === "task" && b.task?.done)).map((b) => `- ${formatTime(b.start)}-${formatTime(b.end)} ${b.kind === "event" ? "(calendar) " : ""}${blockTitle(b)}`);
  const open = s.tasks.filter((t) => !t.done && !t.someday);
  const due = open
    .filter((t) => t.due)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1))
    .slice(0, 8)
    .map((t) => `- ${t.title} (due ${t.due})`);
  const later = open.filter((t) => t.date > d).slice(0, 8).map((t) => `- ${t.title} (planned ${t.date})`);
  return [
    `Today is ${formatLongDate(d)}. The user works ${formatTime(s.settings.dayStart)} to ${formatTime(s.settings.dayEnd)}.`,
    `Today's schedule:\n${lines.join("\n") || "- nothing planned yet"}`,
    plan.overflow.length ? `Does not fit today:\n${plan.overflow.map((t) => `- ${t.title}`).join("\n")}` : "",
    due.length ? `Deadlines:\n${due.join("\n")}` : "",
    later.length ? `Coming later:\n${later.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function inboxContext(max = 8): string {
  const s = useStore.getState();
  const handled = new Set([...s.mail.handled, ...s.triageDone]);
  const msgs = s.mail.messages.filter((m) => !m.bulk && !handled.has(m.id)).sort((a, b) => b.date - a.date).slice(0, max);
  return msgs.map(briefMail).join("\n\n");
}

export function briefMail(m: MailMessage): string {
  return `From ${m.fromName || m.fromAddress}: ${m.subject}\n${m.text.replace(/\s+/g, " ").slice(0, 400)}`;
}

export function noteText(id: string): { title: string; body: string } | null {
  const n = useStore.getState().notes.find((x) => x.id === id);
  return n ? { title: noteTitle(n.title, n.body), body: n.body } : null;
}

/** The prompt for one of the assistant panel's actions. `text` is what the user typed. */
export function promptFor(id: string, text: string): { prompt: string; system?: string } {
  if (id === "plan")
    return {
      prompt: `${dayContext()}\n\nGive me a short, realistic plan for the rest of today: what order to do things in, where a break fits, and what to move to another day if it doesn't fit. Under 8 lines.`,
    };
  if (id === "focus") return { prompt: `${dayContext()}\n\nWhat is the single most important thing to do next, and why? Two or three sentences.` };
  if (id === "inbox") {
    const mail = inboxContext();
    return { prompt: mail ? `These emails need attention:\n\n${mail}\n\nSummarize each in one line, say what is being asked of me, and note any deadline.` : "My inbox is empty. Say so in one friendly line." };
  }
  if (id === "break")
    return { prompt: `Break this goal into 4 to 7 concrete steps, each doable in one sitting, with a time estimate like "30 min":\n\n${text}\n\nReply as a list, one step per line.` };
  return { prompt: `${dayContext()}\n\nQuestion: ${text}` };
}

/** Prompts for the note page's "Summarize" and "Find tasks". Long notes are cut to fit the model. */
export function notePrompt(kind: "summary" | "tasks", title: string, body: string): string {
  const text = `${title}\n${body}`.slice(0, 6000);
  return kind === "summary"
    ? `Summarize these notes in 3 to 5 short bullet points:\n\n${text}`
    : `List the action items hidden in these notes, one per line, each starting with '- ' and short enough to be a task. If there are none, reply with exactly: none\n\n${text}`;
}

/** What to append to a note after the assistant answered; "" when there is nothing to add. */
export function noteAddition(kind: "summary" | "tasks", answer: string, items: string[]): string {
  if (kind === "summary") return `\n\nSummary\n${items.length ? items.map((i) => `• ${i}`).join("\n") : answer}`;
  const real = items.filter((i) => !/^none\.?$/i.test(i));
  return real.length ? `\n\n${real.map((i) => `[ ] ${i}`).join("\n")}` : "";
}

/** A calm one-or-two sentence heads-up for the top of Today. */
export function briefPrompt(): string {
  return `${dayContext()}\n\nWrite a calm heads-up for today in one or two short sentences: what matters most, and any risk such as a deadline, an overlap or work that won't fit. No lists, no greeting.`;
}

/** Turn a messy brain dump into clean one-line tasks. */
export function tidyPrompt(text: string): string {
  return `Rewrite this brain dump as separate short tasks, one per line, each starting with '- '. Keep every day, time, duration and #tag exactly as written. Fix typos. Do not add, merge or invent anything.\n\n${text}`;
}

/** Split one task into steps. */
export function stepsPrompt(title: string, details?: string): string {
  return `Break this task into 3 to 6 concrete steps, each doable in one sitting, each ending with a time estimate like "30 min". Reply as a list, one step per line starting with '- '.\n\nTask: ${title}${details ? `\nDetails: ${details.slice(0, 800)}` : ""}`;
}

export interface ChatTurn {
  role: "user" | "tally";
  text: string;
}

export const CHAT_SYSTEM =
  "You are Tally, a warm, sharp personal assistant living inside the user's planner. Talk like a thoughtful friend who is good at getting things done: natural, direct, never robotic or scripted. " +
  "You can help with anything: general questions, explaining ideas, writing, brainstorming, study help, decisions. Answer those fully and well from your own knowledge. " +
  "When the user's day, deadlines or email are shown below and relevant, use them; when they aren't relevant, ignore them and don't mention the planner. Never invent details about their schedule or email. " +
  "Be concise by default and give more detail when asked. Plain text only. Put lists on separate lines starting with '- '. When you reason first, keep it brief. " +
  "You can't change their plan yourself in this reply; if they want something added, tell them they can just say it, like: call mom tomorrow at 6.";

const ABOUT_ME = /\b(my|me|i|i'm|i've|today|tonight|tomorrow|yesterday|week|weekend|plan|schedule|calendar|agenda|meeting|class|deadline|due|task|todo|to-do|inbox|email|emails|mail|reply|note|busy|free|first|next|late|overdue|focus|prioriti[sz]e)\b/i;
const ABOUT_MAIL = /\b(inbox|emails?|mail|messages?|replies|reply|respond|sender)\b/i;
/** Asking for a plan or steps to follow, where a list of tasks is what helps. */
const WANTS_STEPS = /\b(plan|break\s*(it|this|that)?\s*down|steps|step by step|organi[sz]e|schedule|prepare|action items|next steps|to-?do list|get (it|this|that|everything) done|how (do|can|should) i (start|finish|tackle|approach)|what should i do)\b/i;
/** Judgement calls the model should think about before answering. */
const NEEDS_THOUGHT = /\b(prioriti[sz]e|first|feedback|advice|should i|what matters|most important|urgent|worry|overwhelm|decide|which|compare|review|opinion|think|summari[sz]e|sum up|what'?s going on)\b/i;

export interface ChatIntent {
  /** Needs the user's day and inbox. */
  personal: boolean;
  /** Is about their email: give a take, not tasks. */
  mail: boolean;
  /** A plan or steps would help, so a list can be turned into tasks. */
  steps: boolean;
  /** Worth letting the model reason first. */
  think: boolean;
}

export function chatIntent(history: ChatTurn[], question: string): ChatIntent {
  const lastUser = [...history].reverse().find((t) => t.role === "user")?.text ?? "";
  const short = question.split(/\s+/).length < 5;
  const personal = ABOUT_ME.test(question) || (short && ABOUT_ME.test(lastUser));
  const mail = ABOUT_MAIL.test(question) || (short && ABOUT_MAIL.test(lastUser));
  const steps = WANTS_STEPS.test(question) && !mail;
  return { personal, mail, steps, think: personal && (NEEDS_THOUGHT.test(question) || mail || steps) };
}

/** Passages from the user's own notes, tasks and email that match the question; "" when none do. */
export function recallContext(question: string): string {
  const s = useStore.getState();
  const found = recallFor(question, buildDocs(s), 3);
  const label = { task: "Task", note: "Note", email: "Email" } as const;
  return found.map(({ hit, excerpt }) => `- ${label[hit.kind]} "${hit.title.slice(0, 80)}": ${excerpt}`).join("\n");
}

/** How the answer should be laid out for this kind of question. */
function shapeHint(i: ChatIntent): string {
  if (i.mail)
    return "Answer like a thoughtful chief of staff who just read their inbox. Open with one sentence of your overall take. Then write one '- ' line for each email that truly needs them, most urgent first: the sender's name, a colon, then in your own plain words what that person wants and what you would do about it. Skip receipts, confirmations, digests and newsletters unless something is wrong, and say in one closing sentence that the rest can wait. Give your opinion. Do not turn it into a to-do list.";
  if (i.steps) return "Give a short intro sentence, then the steps as '- ' lines in the order to do them, each with a rough time. End with one practical tip.";
  if (i.personal) return "Lead with the direct answer in a sentence or two. Add '- ' lines only if there are several distinct things.";
  return "";
}

/** The prompt for one chat message: what Tally can see (when it matters), the recent conversation, then the question. */
export function chatPrompt(history: ChatTurn[], question: string): string {
  const intent = chatIntent(history, question);
  const mail = intent.personal ? inboxContext(intent.mail ? 8 : 5) : "";
  const talk = history
    .slice(-6)
    .map((t) => `${t.role === "user" ? "User" : "Tally"}: ${t.text.slice(0, 500)}`)
    .join("\n");
  const hint = shapeHint(intent);
  const recalled = recallContext(question);
  return [
    intent.personal ? `What you know about the user right now:\n${dayContext()}` : "",
    intent.personal ? (mail ? `Recent email needing attention:\n${mail}` : "No email needs attention.") : "",
    recalled ? `From the user's own notes, tasks and email (use only if it answers the question):\n${recalled}` : "",
    talk ? `Conversation so far:\n${talk}` : "",
    hint ? `How to answer: ${hint}` : "",
    `User: ${question}`,
    "Tally:",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const ADD_VERB = /^(?:please\s+|can you\s+|could you\s+)?(?:(?:add|create|make|put|log|note)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:tasks?\s*:?\s*|to-?do\s*:?\s*|reminder\s*:?\s*(?:to\s+)?)?|remind me\s+(?:to\s+)?|to-?do\s*:?\s*|i (?:need|have|got) to\s+|(?:don'?t|do not) forget (?:to\s+)?|i should\s+)(.+)$/i;
const ADD_TAIL = /\s+(?:to|on|in|into)\s+(?:my\s+)?(?:tasks?|to-?do(?: list)?|list|plan|today(?:'s)?(?: plan| list)?)\s*[.!]?$/i;

/** "add call mom tomorrow" -> "call mom tomorrow". Null when the message isn't asking to add something. */
export function addRequest(message: string): string | null {
  const m = message.trim().match(ADD_VERB);
  if (!m) return null;
  const body = m[1].replace(ADD_TAIL, "").replace(/[.!]+$/, "").trim();
  // "add up my spending" and "make sense of this" are questions, not tasks.
  if (!body || /^(?:up|sense|sure|it|that|this)\b/i.test(body) || body.endsWith("?")) return null;
  return body;
}

const QUESTION = /^(?:what|what's|whats|when|where|who|why|how|which|am i|do i|did i|is|are|can|could|should|will|any|show|tell|list|summari[sz]e|sum up|plan my|explain|find|give|help|anything)\b/i;

/** Reads like something to ask rather than something to do. */
export function isQuestion(message: string): boolean {
  const t = message.trim();
  return t.endsWith("?") || QUESTION.test(t);
}

/** Text that is plainly a to-do: names a time, day, deadline, repeat, priority or tag, lists several things, or is just a few words. */
function looksLikeTasks(message: string, today: string): boolean {
  const items = parseBrainDump(message, today);
  if (!items.length) return false;
  if (items.length > 1) return true;
  const it = items[0];
  const signal = it.start !== null || it.date || it.due || it.repeat || it.priority || it.tags?.length || it.someday;
  return !!signal || message.trim().split(/\s+/).length <= 4;
}

/**
 * What a message should become: tasks to add (the text to parse), or something for the model.
 * Anything that isn't clearly a to-do goes to the model when it is available, so Tally can talk
 * about anything; without a model, everything that parses becomes a task.
 */
export function routeMessage(message: string, today: string, aiReady: boolean): { kind: "add"; text: string } | { kind: "ask" } {
  const explicit = addRequest(message);
  if (explicit) return { kind: "add", text: explicit };
  if (isQuestion(message) || (aiReady && /^(?:delete|remove|cancel|drop|move|push|postpone|reschedule|mark)\b/i.test(message.trim()))) return { kind: "ask" };
  if (looksLikeTasks(message, today) || !aiReady) return { kind: "add", text: message.trim() };
  return { kind: "ask" };
}
