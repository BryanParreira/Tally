/**
 * Tally's built-in assistant. The engine runs inside the app and the model
 * (NVIDIA Nemotron 3 Nano, 4B) lives on this computer: it comes with the
 * installer when bundled, otherwise it downloads itself once in the background.
 * Nothing you ask ever leaves the machine.
 */
import { create } from "zustand";
import { useStore } from "./store";
import { aiCancelDownload, aiDownload, aiGenerate, aiRemove, aiStatus, aiStop, isDesktop, onAiProgress, onAiToken } from "./native";

type Phase = "unknown" | "unavailable" | "missing" | "downloading" | "ready" | "error";

interface AiState {
  phase: Phase;
  bundled: boolean;
  /** 0..1 while downloading. */
  progress: number;
  bytes: number;
  name: string;
  error: string | null;
  busy: boolean;
  /** Seconds left in the download, once there is enough data to guess. */
  eta: number | null;
  /** Seconds until the next automatic retry after a failed download. */
  retryIn: number | null;
}

export const useAi = create<AiState>(() => ({ phase: "unknown", bundled: false, progress: 0, bytes: 0, name: "NVIDIA Nemotron 3 Nano 4B", error: null, busy: false, eta: null, retryIn: null }));

let listening = false;

/** Learn whether the model is on disk. Safe to call often. */
export async function refreshAi(): Promise<void> {
  if (!isDesktop) {
    useAi.setState({ phase: "unavailable" });
    return;
  }
  if (!listening) {
    listening = true;
    let last = { done: 0, at: 0 };
    let speed = 0; // bytes per second, smoothed
    onAiProgress((done, total) => {
      const now = Date.now();
      if (last.at && now > last.at && done >= last.done) {
        const inst = ((done - last.done) / (now - last.at)) * 1000;
        speed = speed ? speed * 0.8 + inst * 0.2 : inst;
      }
      last = { done, at: now };
      useAi.setState({ progress: total ? Math.min(1, done / total) : 0, eta: speed > 50_000 && total ? Math.max(1, Math.round((total - done) / speed)) : null });
    }).catch(() => undefined);
  }
  const s = await aiStatus().catch(() => null);
  if (!s) return;
  useAi.setState((cur) => ({
    bundled: s.bundled,
    bytes: s.bytes,
    name: s.name,
    phase: s.ready ? "ready" : s.downloading || cur.phase === "downloading" ? "downloading" : cur.phase === "error" ? "error" : "missing",
  }));
}

/** Fetch the model (resumes a partial download). Resolves when it is ready. */
export async function downloadModel(): Promise<void> {
  const { phase } = useAi.getState();
  if (!isDesktop || phase === "ready" || phase === "downloading") return;
  paused = false;
  useAi.setState({ phase: "downloading", progress: 0, error: null, eta: null, retryIn: null });
  try {
    await aiDownload();
    useAi.setState({ phase: "ready", progress: 1 });
  } catch (err) {
    const msg = String(err).replace(/^Error: /, "");
    useAi.setState(msg === "cancelled" ? { phase: "missing", progress: 0 } : { phase: "error", error: msg });
  }
}

export async function cancelDownload(): Promise<void> {
  paused = true;
  await aiCancelDownload();
}

/** The user paused: don't start it again behind their back this session. */
let paused = false;
let installing = false;
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

/**
 * Get the model quietly the first time Tally opens, and keep trying: wait for the
 * network to come back, retry with growing pauses, and always resume where it stopped.
 */
export async function installAssistant(): Promise<void> {
  if (!isDesktop || installing || paused) return;
  installing = true;
  try {
    for (const wait of [5, 30, 120, 0]) {
      if (useAi.getState().phase === "ready" || paused) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await new Promise<void>((r) => window.addEventListener("online", () => r(), { once: true }));
      }
      await downloadModel();
      const { phase } = useAi.getState();
      if (phase === "ready" || phase === "missing" || !wait) return;
      for (let left = wait; left > 0 && !paused; left--) {
        useAi.setState({ retryIn: left });
        await sleep(1);
      }
      useAi.setState({ retryIn: null });
    }
  } finally {
    installing = false;
    useAi.setState({ retryIn: null });
  }
}

export async function removeModel(): Promise<void> {
  await aiRemove();
  useAi.setState({ phase: "missing", progress: 0 });
  await refreshAi();
}

export function stopAsking(): void {
  aiStop().catch(() => undefined);
}

export interface AskOptions {
  system?: string;
  maxTokens?: number;
  /** 0 = most predictable. */
  temperature?: number;
  /** Let the model reason before it answers (slower, better for judgement calls). The reasoning is never shown. */
  think?: boolean;
  /** Called with the answer so far as it is written. */
  onText?: (soFar: string) => void;
}

const BASE_SYSTEM =
  "You are Tally's built-in assistant, running privately on the user's own computer. " +
  "Use plain text only: no markdown headings, no bold. For lists, put one item per line starting with '- '.";

let counter = 0;

/** Ask the model. Streams into `onText` and resolves with the full answer. */
export async function ask(prompt: string, opts: AskOptions = {}): Promise<string> {
  if (useAi.getState().phase !== "ready") throw new Error("The assistant isn't ready yet.");
  const id = `ask-${Date.now()}-${counter++}`;
  let soFar = "";
  const off = await onAiToken((tid, text) => {
    if (tid !== id) return;
    soFar += text;
    opts.onText?.(clean(soFar, opts.think));
  });
  useAi.setState({ busy: true });
  try {
    const out = await aiGenerate(id, opts.system ? `${BASE_SYSTEM} ${opts.system}` : BASE_SYSTEM, prompt, opts.maxTokens ?? 400, opts.temperature ?? 0.4, opts.think ?? false);
    return clean(out, opts.think);
  } finally {
    off();
    useAi.setState({ busy: false });
  }
}

/** Tidy model output: no stray reasoning tags or markdown emphasis. */
export function clean(text: string, thinking = false): string {
  // In thinking mode the prompt already opened the think block: everything up to </think> is reasoning.
  if (thinking) {
    const end = text.lastIndexOf("</think>");
    text = end < 0 ? "" : text.slice(end + "</think>".length);
  }
  return text
    .replace(/<think>[\s\S]*?(<\/think>|$)/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .trimStart();
}

/** Pull the list items out of an answer ("- x", "1. x") as plain lines. */
export function listItems(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.+)$/)?.[1]?.trim())
    .filter((l): l is string => !!l);
}

/** True when the assistant is switched on in Settings and its model is on this computer. */
export function useAssistantReady(): boolean {
  const on = useStore((s) => s.settings.assistant);
  return useAi((s) => s.phase === "ready") && on;
}
