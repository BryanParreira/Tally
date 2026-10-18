/** The conversation with Tally: asks about the day and inbox, and adds tasks when asked. */
import { create } from "zustand";
import { ask, listItems, useAi } from "./ai";
import { CHAT_SYSTEM, chatIntent, chatPrompt, routeMessage, type ChatTurn } from "./assistantContext";
import { parseCommand, matchTasks, type Command } from "./commands";
import { formatDay, formatTime } from "./date";
import { parseBrainDump } from "./parse";
import type { Task } from "./types";
import { today, useStore } from "./store";

export interface ChatMessage {
  id: string;
  role: "user" | "tally";
  text: string;
  /** Tasks this reply added, so they can be undone. */
  added?: string[];
  /** True while the reply is still being written. */
  pending?: boolean;
  failed?: boolean;
  /** An action on the plan that can be taken back. */
  undoable?: boolean;
  /** The answer is a plan, so its list can become tasks. */
  offerTasks?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  send(text: string): Promise<void>;
  clear(): void;
  undo(messageId: string): void;
  /** Turn the list in a reply into tasks. */
  addSteps(messageId: string): void;
}

// Tests (and any non-browser host) have no animation frames.
const nextFrame = (fn: () => void): number => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : (setTimeout(fn, 16) as unknown as number));
const dropFrame = (id: number) => (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id));

/** How to take back each action Tally ran on the plan. */
const reverts = new Map<string, () => void>();

interface Done {
  text: string;
  revert?: () => void;
}

const where = (date: string | null, start: number | null, d: string) => [date ? formatDay(date, d).toLowerCase() : "", start !== null ? `at ${formatTime(start)}` : ""].filter(Boolean).join(" ");

/** Carry out a chat command. Null means "that wasn't about my tasks", so the message goes on to the assistant. */
function runCommand(cmd: Command): Done | null {
  const st = useStore.getState();
  const d = today();
  const snap = (t: Task) => ({ date: t.date, start: t.start, fixed: t.fixed });

  if (cmd.kind === "pushAll") {
    const moving = st.tasks.filter((t) => !t.done && !t.someday && t.date === d);
    if (!moving.length) return { text: "There's nothing left on today's plan to move." };
    const before = moving.map((t) => [t.id, snap(t)] as const);
    st.moveTasks(moving.map((t) => t.id), cmd.date);
    return {
      text: `Moved ${moving.length === 1 ? "1 task" : `${moving.length} tasks`} to ${formatDay(cmd.date, d).toLowerCase()}.`,
      revert: () => before.forEach(([id, b]) => useStore.getState().updateTask(id, b)),
    };
  }

  const open = cmd.kind === "done" ? st.tasks.filter((t) => !t.done) : st.tasks;
  const found = matchTasks(cmd.query, open, d);
  if (!found.length) return null;
  if (found.length > 1 && new Set(found.map((t) => t.title.toLowerCase())).size > 1)
    return { text: `Which one did you mean?
${found.slice(0, 4).map((t) => `- ${t.title}`).join("\n")}` };
  const t = found[0];

  if (cmd.kind === "done") {
    st.toggleDone(t.id, null);
    return { text: `Nice. Marked "${t.title}" as done.`, revert: () => useStore.getState().toggleDone(t.id, null) };
  }
  if (cmd.kind === "delete") {
    st.deleteTask(t.id);
    return { text: `Removed "${t.title}".`, revert: () => useStore.setState((s) => ({ tasks: [...s.tasks, t] })) };
  }
  const before = snap(t);
  const date = cmd.date ?? t.date;
  st.updateTask(t.id, { date, start: cmd.start ?? (cmd.date ? (t.fixed ? t.start : null) : t.start), fixed: cmd.start !== null ? true : t.fixed, someday: false });
  return { text: `Moved "${t.title}" to ${where(cmd.date ?? t.date, cmd.start, d)}.`, revert: () => useStore.getState().updateTask(t.id, { ...before, someday: t.someday }) };
}

let seq = 0;
const mid = () => `m${Date.now()}-${seq++}`;

export const useChat = create<ChatState>((set, get) => {
  const patch = (id: string, p: Partial<ChatMessage>) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...p } : m)) }));

  return {
    messages: [],

    clear() {
      set({ messages: [] });
    },

    undo(messageId) {
      const revert = reverts.get(messageId);
      if (revert) {
        revert();
        reverts.delete(messageId);
        return patch(messageId, { undoable: false, text: "Okay, undone." });
      }
      const m = get().messages.find((x) => x.id === messageId);
      m?.added?.forEach((id) => useStore.getState().deleteTask(id));
      patch(messageId, { added: undefined, text: "Okay, took those back out." });
    },

    addSteps(messageId) {
      const m = get().messages.find((x) => x.id === messageId);
      if (!m) return;
      const d = today();
      const items = parseBrainDump(listItems(m.text).join("\n"), d);
      const added = items.map((it) => useStore.getState().addTask({ ...it, source: "manual" }, it.date ?? d));
      if (added.length) patch(messageId, { added: added.map((t) => t.id), text: `${m.text}\n\nAdded ${added.length === 1 ? "it" : `those ${added.length}`} to your plan.` });
    },

    async send(raw) {
      const text = raw.trim();
      if (!text || useAi.getState().busy) return;
      const history = get().messages.filter((m) => !m.pending && !m.failed);
      const reply: ChatMessage = { id: mid(), role: "tally", text: "", pending: true };
      set((s) => ({ messages: [...s.messages, { id: mid(), role: "user", text }, reply] }));

      // "mark essay done", "move gym to friday", "push everything to tomorrow"
      const cmd = parseCommand(text, today());
      const did = cmd ? runCommand(cmd) : null;
      if (did) {
        if (did.revert) reverts.set(reply.id, did.revert);
        patch(reply.id, { pending: false, text: did.text, undoable: !!did.revert });
        return;
      }

      // Anything that isn't a question is a brain dump: the planner already understands it, no model needed.
      const route = routeMessage(text, today(), useAi.getState().phase === "ready");
      const items = route.kind === "add" ? parseBrainDump(route.text, today()) : [];
      if (items.length) {
        const d = today();
        const added = items.map((it) => useStore.getState().addTask({ ...it, source: "manual" }, it.date ?? d));
        const list = added.map((t) => `- ${t.title}`).join("\n");
        patch(reply.id, { pending: false, added: added.map((t) => t.id), text: `${added.length === 1 ? "Added to your plan" : `Added ${added.length} tasks to your plan`}:\n${list}` });
        return;
      }

      // Tokens arrive far faster than the screen refreshes: show the latest text once per frame.
      let latest = "";
      let frame = 0;
      const flush = () => {
        frame = 0;
        patch(reply.id, { text: latest });
      };
      const turns: ChatTurn[] = history.map((m) => ({ role: m.role, text: m.text }));
      const intent = chatIntent(turns, text);
      const prompt = chatPrompt(turns, text);
      const show = (soFar: string) => {
        latest = soFar;
        if (!frame) frame = nextFrame(flush);
      };
      try {
        let out = await ask(prompt, { system: CHAT_SYSTEM, maxTokens: intent.think ? 1100 : 500, temperature: 0.6, think: intent.think, onText: show });
        // Reasoning that ran out of room leaves no answer: ask again, quickly.
        if (!out.trim() && intent.think) out = await ask(prompt, { system: CHAT_SYSTEM, maxTokens: 500, temperature: 0.6, onText: show });
        patch(reply.id, { offerTasks: intent.steps });
        dropFrame(frame);
        patch(reply.id, { pending: false, text: out.trim() || "I don't have an answer for that." });
      } catch (e) {
        dropFrame(frame);
        patch(reply.id, { pending: false, failed: true, text: String(e).replace(/^Error: /, "") });
      }
    },
  };
});
