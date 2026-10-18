import { beforeEach, describe, expect, it, vi } from "vitest";

// The real bridge talks to Rust; here it is a scriptable fake.
const native = vi.hoisted(() => ({
  tokenCb: null as null | ((id: string, text: string) => void),
  off: vi.fn(),
  isDesktop: true,
  aiStatus: vi.fn(),
  aiDownload: vi.fn(),
  aiCancelDownload: vi.fn(),
  aiRemove: vi.fn(),
  aiStop: vi.fn(),
  aiGenerate: vi.fn(),
  onAiProgress: vi.fn(),
  onAiToken: vi.fn(),
}));
vi.mock("./native", () => ({
  get isDesktop() {
    return native.isDesktop;
  },
  aiStatus: native.aiStatus,
  aiDownload: native.aiDownload,
  aiCancelDownload: native.aiCancelDownload,
  aiRemove: native.aiRemove,
  aiStop: native.aiStop,
  aiGenerate: native.aiGenerate,
  onAiProgress: native.onAiProgress,
  onAiToken: native.onAiToken,
}));

import { ask, clean, downloadModel, listItems, refreshAi, removeModel, useAi } from "./ai";
import { dayContext, inboxContext, noteAddition, notePrompt, promptFor } from "./assistantContext";
import { emptyData, today, useStore } from "./store";
import type { Task } from "./types";

const setPhase = (phase: "ready" | "missing" | "downloading") => useAi.setState({ phase, busy: false, error: null, progress: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  native.isDesktop = true;
  native.tokenCb = null;
  native.onAiToken.mockImplementation(async (cb) => {
    native.tokenCb = cb;
    return native.off;
  });
  native.onAiProgress.mockResolvedValue(() => undefined);
  native.aiStop.mockResolvedValue(undefined);
  setPhase("missing");
});

describe("cleaning model output", () => {
  it("drops reasoning blocks, finished or still open", () => {
    expect(clean("<think>hmm</think>Do the essay first.")).toBe("Do the essay first.");
    expect(clean("<think>still thinking about")).toBe("");
  });

  it("removes markdown emphasis and headings but keeps the words", () => {
    expect(clean("## Plan\n**Read** chapter 5")).toBe("Plan\nRead chapter 5");
  });

  it("leaves plain text alone", () => {
    expect(clean("  Start with the lab report.")).toBe("Start with the lab report.");
  });
});

describe("reading lists from answers", () => {
  it("takes dashes, bullets and numbers, and skips prose", () => {
    const text = "Here you go:\n- outline the essay (30 min)\n• draft intro\n1. cite sources\n2) proofread\nGood luck!";
    expect(listItems(text)).toEqual(["outline the essay (30 min)", "draft intro", "cite sources", "proofread"]);
  });

  it("returns nothing when there is no list", () => {
    expect(listItems("none")).toEqual([]);
    expect(listItems("")).toEqual([]);
  });
});

describe("asking the model", () => {
  it("refuses until the model is on disk", async () => {
    await expect(ask("hi")).rejects.toThrow("isn't ready");
    expect(native.aiGenerate).not.toHaveBeenCalled();
  });

  it("streams only its own tokens, cleaned, and tidies up", async () => {
    setPhase("ready");
    native.aiGenerate.mockImplementation(async (id: string) => {
      expect(useAi.getState().busy).toBe(true);
      native.tokenCb!("someone-else", "ignored");
      native.tokenCb!(id, "<think>x</think>**Start**");
      native.tokenCb!(id, " now");
      return "<think>x</think>**Start** now";
    });
    const seen: string[] = [];
    const out = await ask("what first?", { onText: (t) => seen.push(t) });
    expect(out).toBe("Start now");
    expect(seen).toEqual(["Start", "Start now"]);
    expect(native.off).toHaveBeenCalledOnce();
    expect(useAi.getState().busy).toBe(false);
  });

  it("adds the caller's instructions to the base ones and passes defaults", async () => {
    setPhase("ready");
    native.aiGenerate.mockResolvedValue("ok");
    await ask("hello", { system: "Answer in French." });
    const [, system, prompt, maxTokens, temperature] = native.aiGenerate.mock.calls[0];
    expect(system).toContain("built-in assistant");
    expect(system).toContain("Answer in French.");
    expect([prompt, maxTokens, temperature]).toEqual(["hello", 400, 0.4]);
  });

  it("gives every request its own id", async () => {
    setPhase("ready");
    native.aiGenerate.mockResolvedValue("ok");
    await ask("a");
    await ask("b");
    expect(native.aiGenerate.mock.calls[0][0]).not.toBe(native.aiGenerate.mock.calls[1][0]);
  });

  it("frees the assistant when the model fails", async () => {
    setPhase("ready");
    native.aiGenerate.mockRejectedValue(new Error("Couldn't load the model"));
    await expect(ask("hi")).rejects.toThrow("Couldn't load");
    expect(useAi.getState().busy).toBe(false);
    expect(native.off).toHaveBeenCalledOnce();
  });
});

describe("model setup", () => {
  it("is unavailable in a plain browser", async () => {
    native.isDesktop = false;
    await refreshAi();
    expect(useAi.getState().phase).toBe("unavailable");
  });

  it("reads the status from the desktop app", async () => {
    native.aiStatus.mockResolvedValue({ ready: true, bundled: true, loaded: false, downloading: false, bytes: 123, name: "Nemotron" });
    await refreshAi();
    expect(useAi.getState()).toMatchObject({ phase: "ready", bundled: true, bytes: 123, name: "Nemotron" });
  });

  it("reports a download in flight, and a missing model", async () => {
    native.aiStatus.mockResolvedValue({ ready: false, bundled: false, loaded: false, downloading: true, bytes: 1, name: "n" });
    await refreshAi();
    expect(useAi.getState().phase).toBe("downloading");
    native.aiStatus.mockResolvedValue({ ready: false, bundled: false, loaded: false, downloading: false, bytes: 1, name: "n" });
    setPhase("missing");
    await refreshAi();
    expect(useAi.getState().phase).toBe("missing");
  });

  it("downloads once, and not when already ready", async () => {
    native.aiDownload.mockResolvedValue(undefined);
    await downloadModel();
    expect(useAi.getState()).toMatchObject({ phase: "ready", progress: 1 });
    await downloadModel();
    expect(native.aiDownload).toHaveBeenCalledOnce();
  });

  it("treats a pause as missing, and a failure as an error to retry", async () => {
    native.aiDownload.mockRejectedValueOnce("cancelled");
    await downloadModel();
    expect(useAi.getState().phase).toBe("missing");
    native.aiDownload.mockRejectedValueOnce("Couldn't reach the download server: timeout");
    await downloadModel();
    expect(useAi.getState()).toMatchObject({ phase: "error", error: "Couldn't reach the download server: timeout" });
  });

  it("goes back to missing after removing the model", async () => {
    native.aiRemove.mockResolvedValue(undefined);
    native.aiStatus.mockResolvedValue({ ready: false, bundled: false, loaded: false, downloading: false, bytes: 1, name: "n" });
    setPhase("ready");
    await removeModel();
    expect(useAi.getState().phase).toBe("missing");
  });
});

describe("what the assistant is told", () => {
  const d = today();
  const t = (p: Partial<Task>): Task => ({ id: p.title!, title: "x", category: "life", date: d, start: null, fixed: false, duration: 30, done: false, source: "manual", createdAt: 1, ...p });

  beforeEach(() => {
    useStore.setState({ ...emptyData() });
  });

  it("lists deadlines and later work, but not finished or someday tasks", () => {
    useStore.setState({
      tasks: [
        t({ title: "Lab report", due: "2099-01-02" }),
        t({ title: "Read ch. 5", date: "2099-01-05" }),
        t({ title: "Already done", due: "2099-01-01", done: true }),
        t({ title: "Learn piano", someday: true, due: "2099-01-01" }),
      ],
    });
    const ctx = dayContext();
    expect(ctx).toContain("Lab report (due 2099-01-02)");
    expect(ctx).toContain("Read ch. 5 (planned 2099-01-05)");
    expect(ctx).not.toContain("Already done");
    expect(ctx).not.toContain("Learn piano");
  });

  it("only shares unhandled, non-bulk mail, newest first, trimmed", () => {
    const m = (id: string, date: number, extra = {}) => ({ id, fromName: `Sender ${id}`, fromAddress: `${id}@x.com`, subject: `Subject ${id}`, date, text: "a  long\nbody ".repeat(100), bulk: false, ...extra });
    useStore.setState({
      mail: { ...emptyData().mail, messages: [m("old", 1), m("new", 3), m("promo", 4, { bulk: true }), m("done", 5)], handled: ["done"] },
    });
    const out = inboxContext();
    expect(out.indexOf("Subject new")).toBeLessThan(out.indexOf("Subject old"));
    expect(out).not.toContain("promo");
    expect(out).not.toContain("Subject done");
    expect(out.split("\n\n").every((b) => b.length < 520)).toBe(true);
  });

  it("builds a prompt for every quick action", () => {
    expect(promptFor("plan", "").prompt).toContain("Under 8 lines");
    expect(promptFor("focus", "").prompt).toContain("single most important");
    expect(promptFor("break", "write my essay").prompt).toContain("write my essay");
    expect(promptFor("ask", "am I free at 3?").prompt).toContain("Question: am I free at 3?");
  });

  it("doesn't ask the model to summarize an empty inbox", () => {
    expect(promptFor("inbox", "").prompt).toContain("inbox is empty");
  });
});

describe("assistant on a note", () => {
  it("cuts very long notes to what the model can read", () => {
    expect(notePrompt("summary", "Title", "x".repeat(20000)).length).toBeLessThan(6200);
  });

  it("turns a summary into bullets, falling back to the raw answer", () => {
    expect(noteAddition("summary", "", ["one", "two"])).toBe("\n\nSummary\n• one\n• two");
    expect(noteAddition("summary", "Just prose.", [])).toBe("\n\nSummary\nJust prose.");
  });

  it("turns found action items into task lines, and ignores 'none'", () => {
    expect(noteAddition("tasks", "", ["call the bank", "email Prof. Lee"])).toBe("\n\n[ ] call the bank\n[ ] email Prof. Lee");
    expect(noteAddition("tasks", "none", [])).toBe("");
    expect(noteAddition("tasks", "- none", ["none"])).toBe("");
  });
});

describe("ambient prompts", () => {
  it("keeps the user's words in the tidy and steps prompts", async () => {
    const { tidyPrompt, stepsPrompt } = await import("./assistantContext");
    expect(tidyPrompt("gym at 6pm #health")).toContain("gym at 6pm #health");
    expect(stepsPrompt("Write essay", "due Friday")).toContain("Task: Write essay");
    expect(stepsPrompt("Write essay", "x".repeat(5000)).length).toBeLessThan(1200);
  });
});

describe("chat", () => {
  it("recognises 'add this' requests and ignores questions", async () => {
    const { addRequest } = await import("./assistantContext");
    expect(addRequest("add call mom tomorrow")).toBe("call mom tomorrow");
    expect(addRequest("Please add a task: finish essay by friday")).toBe("finish essay by friday");
    expect(addRequest("remind me to email Prof. Lee")).toBe("email Prof. Lee");
    expect(addRequest("I need to buy groceries")).toBe("buy groceries");
    expect(addRequest("put gym at 6pm on my list")).toBe("gym at 6pm");
    expect(addRequest("add up my spending this week")).toBeNull();
    expect(addRequest("what's due tomorrow?")).toBeNull();
    expect(addRequest("plan my day")).toBeNull();
    expect(addRequest("add")).toBeNull();
  });

  it("adds tasks without the model, and can take them back", async () => {
    const { useChat } = await import("./chat");
    useStore.setState({ ...emptyData() });
    useChat.getState().clear();
    await useChat.getState().send("add call mom, finish essay by friday");
    const [, reply] = useChat.getState().messages;
    expect(reply.added).toHaveLength(2);
    expect(useStore.getState().tasks.map((t) => t.title.toLowerCase())).toEqual(expect.arrayContaining([expect.stringContaining("call mom")]));
    expect(native.aiGenerate).not.toHaveBeenCalled();
    useChat.getState().undo(reply.id);
    expect(useStore.getState().tasks).toHaveLength(0);
  });

  it("answers questions with the day and inbox in the prompt, and remembers the talk", async () => {
    const { useChat } = await import("./chat");
    useStore.setState({ ...emptyData() });
    useChat.getState().clear();
    setPhase("ready");
    native.aiGenerate.mockResolvedValue("You have nothing due.");
    await useChat.getState().send("what's due?");
    await useChat.getState().send("and tomorrow?");
    const prompt = native.aiGenerate.mock.calls[1][2] as string;
    expect(prompt).toContain("Today is");
    expect(prompt).toContain("User: what's due?");
    expect(prompt).toContain("Tally: You have nothing due.");
    expect(prompt.trimEnd().endsWith("Tally:")).toBe(true);
    expect(useChat.getState().messages.at(-1)?.text).toBe("You have nothing due.");
  });

  it("shows the problem in the chat when the model isn't ready", async () => {
    const { useChat } = await import("./chat");
    useChat.getState().clear();
    setPhase("missing");
    await useChat.getState().send("what's due?");
    expect(useChat.getState().messages.at(-1)).toMatchObject({ failed: true, pending: false });
  });
});

describe("talking to Tally", () => {
  it("sends plain to-dos to the planner and everything else to the model", async () => {
    const { routeMessage } = await import("./assistantContext");
    const d = "2026-10-16";
    expect(routeMessage("add call mom", d, true).kind).toBe("add");
    expect(routeMessage("groceries", d, true).kind).toBe("add");
    expect(routeMessage("finish essay by friday, gym at 6pm", d, true).kind).toBe("add");
    expect(routeMessage("read ch. 5 tomorrow", d, true).kind).toBe("add");
    expect(routeMessage("what's the capital of France?", d, true).kind).toBe("ask");
    expect(routeMessage("explain photosynthesis simply", d, true).kind).toBe("ask");
    expect(routeMessage("I'm feeling overwhelmed with school lately", d, true).kind).toBe("ask");
    // Without a model, anything that parses is planned.
    expect(routeMessage("I'm feeling overwhelmed with school lately", d, false).kind).toBe("add");
  });

  it("only hands over the user's day when the question is about it", async () => {
    const { chatPrompt, CHAT_SYSTEM } = await import("./assistantContext");
    expect(chatPrompt([], "What's the capital of France?")).not.toContain("Today is");
    expect(chatPrompt([], "what's on my plate today?")).toContain("Today is");
    expect(chatPrompt([{ role: "user", text: "what's due tomorrow?" }, { role: "tally", text: "Nothing." }], "and friday?")).toContain("Today is");
    expect(CHAT_SYSTEM).toContain("general questions");
  });
});

describe("smarter answers", () => {
  it("gives feedback on email without offering tasks, and plans with them", async () => {
    const { chatIntent, chatPrompt } = await import("./assistantContext");
    const mail = chatIntent([], "Can you give me feedback on my inbox?");
    expect(mail).toMatchObject({ mail: true, steps: false, personal: true, think: true });
    expect(chatPrompt([], "what do you think of my emails?")).toContain("Do not turn it into a to-do list");
    const plan = chatIntent([], "Help me plan my week");
    expect(plan).toMatchObject({ steps: true, mail: false });
    expect(chatPrompt([], "Help me plan my week")).toContain("steps as '- ' lines");
    expect(chatIntent([], "What's the capital of France?")).toMatchObject({ personal: false, think: false, steps: false });
  });

  it("only thinks first when asked to, and hides the reasoning", async () => {
    const { clean } = await import("./ai");
    expect(clean("let me weigh these</think>Reply to Prof. Lee first.", true)).toBe("Reply to Prof. Lee first.");
    expect(clean("still reasoning about the emails", true)).toBe("");
    expect(clean("plain answer", false)).toBe("plain answer");
  });

  it("asks the model to think for judgement calls, and falls back if it runs out of room", async () => {
    const { useChat } = await import("./chat");
    useStore.setState({ ...emptyData() });
    useChat.getState().clear();
    setPhase("ready");
    native.aiGenerate.mockResolvedValueOnce("endless reasoning with no end").mockResolvedValueOnce("Reply to Prof. Lee first.");
    await useChat.getState().send("what should I prioritize in my inbox?");
    expect(native.aiGenerate.mock.calls[0][5]).toBe(true);
    expect(native.aiGenerate.mock.calls[1][5]).toBe(false);
    const reply = useChat.getState().messages.at(-1)!;
    expect(reply.text).toBe("Reply to Prof. Lee first.");
    expect(reply.offerTasks).toBe(false);
  });
});

describe("chat actions", () => {
  const d = today();
  const t = (id: string, title: string, p: Partial<Task> = {}): Task => ({ id, title, category: "life", date: d, start: null, fixed: false, duration: 30, done: false, source: "manual", createdAt: 1, ...p });

  beforeEach(async () => {
    const { useChat } = await import("./chat");
    useChat.getState().clear();
    useStore.setState({ ...emptyData(), tasks: [t("e", "Finish history essay"), t("g", "Gym", { fixed: true, start: 18 * 60 }), t("c", "Call mom")] });
  });

  it("reads commands and leaves other messages alone", async () => {
    const { parseCommand } = await import("./commands");
    expect(parseCommand("mark the essay as done", d)).toEqual({ kind: "done", query: "essay" });
    expect(parseCommand("I finished the gym", d)).toEqual({ kind: "done", query: "gym" });
    expect(parseCommand("push everything to tomorrow", d)).toMatchObject({ kind: "pushAll" });
    expect(parseCommand("move gym to 7pm", d)).toMatchObject({ kind: "move", query: "gym", start: 19 * 60, date: null });
    expect(parseCommand("postpone call mom", d)).toMatchObject({ kind: "move", query: "call mom" });
    expect(parseCommand("delete the essay", d)).toEqual({ kind: "delete", query: "essay" });
    expect(parseCommand("what's the best way to finish an essay?", d)).toBeNull();
    expect(parseCommand("move to Paris advice", d)).toBeNull();
  });

  it("finishes, moves and removes tasks, and takes each back", async () => {
    const { useChat } = await import("./chat");
    const chat = useChat.getState();
    await chat.send("mark the essay done");
    expect(useStore.getState().tasks.find((x) => x.id === "e")?.done).toBe(true);
    chat.undo(useChat.getState().messages.at(-1)!.id);
    expect(useStore.getState().tasks.find((x) => x.id === "e")?.done).toBe(false);

    await chat.send("move gym to 7pm");
    expect(useStore.getState().tasks.find((x) => x.id === "g")).toMatchObject({ start: 19 * 60, fixed: true });
    await chat.send("push everything to tomorrow");
    expect(useStore.getState().tasks.every((x) => x.date > d)).toBe(true);
    chat.undo(useChat.getState().messages.at(-1)!.id);
    expect(useStore.getState().tasks.every((x) => x.date === d)).toBe(true);

    await chat.send("delete call mom");
    expect(useStore.getState().tasks.some((x) => x.id === "c")).toBe(false);
    chat.undo(useChat.getState().messages.at(-1)!.id);
    expect(useStore.getState().tasks.some((x) => x.id === "c")).toBe(true);
    expect(native.aiGenerate).not.toHaveBeenCalled();
  });

  it("asks which task when more than one fits, and passes on commands about nothing", async () => {
    const { useChat } = await import("./chat");
    useStore.setState((s) => ({ tasks: [...s.tasks, t("e2", "Finish history reading")] }));
    await useChat.getState().send("mark history done");
    expect(useChat.getState().messages.at(-1)?.text).toContain("Which one");
    expect(useStore.getState().tasks.some((x) => x.done)).toBe(false);
    setPhase("ready");
    native.aiGenerate.mockResolvedValue("Sure.");
    await useChat.getState().send("delete my worries");
    expect(native.aiGenerate).toHaveBeenCalled();
  });
});

describe("installing the assistant", () => {
  it("retries after a failure and finishes without help", async () => {
    vi.useFakeTimers();
    const { installAssistant } = await import("./ai");
    native.aiDownload.mockRejectedValueOnce("The download was interrupted").mockResolvedValueOnce(undefined);
    const done = installAssistant();
    await vi.advanceTimersByTimeAsync(6000);
    await done;
    expect(native.aiDownload).toHaveBeenCalledTimes(2);
    expect(useAi.getState()).toMatchObject({ phase: "ready", retryIn: null });
    vi.useRealTimers();
  });

  it("does nothing outside the desktop app, and nothing once ready", async () => {
    const { installAssistant } = await import("./ai");
    native.isDesktop = false;
    await installAssistant();
    native.isDesktop = true;
    setPhase("ready");
    await installAssistant();
    expect(native.aiDownload).not.toHaveBeenCalled();
  });

  it("says how long is left in plain words", async () => {
    const { timeLeft } = await import("../components/Assistant");
    expect(timeLeft(20)).toBe("less than a minute left");
    expect(timeLeft(240)).toBe("about 4 min left");
  });
});
