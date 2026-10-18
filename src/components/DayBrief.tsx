import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { ask, useAi, useAssistantReady } from "../lib/ai";
import { briefPrompt, dayContext } from "../lib/assistantContext";

/** One heads-up per day-state, kept for the session so switching tabs never re-asks the model. */
const cache = new Map<string, string>();

/**
 * A calm line at the top of Today, written by the assistant from your plan.
 * It refreshes quietly when the plan changes and never gets in the way.
 */
export function DayBrief({ planKey }: { planKey: string }) {
  const ready = useAssistantReady();
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const key = `${planKey}|${dayContext()}`;
    const hit = cache.get(key);
    if (hit && nonce === 0) return setText(hit);
    let alive = true;
    // Wait for the plan to settle (and for the user to stop clicking) before spending the model's time.
    const timer = setTimeout(async () => {
      if (useAi.getState().busy) return;
      setWorking(true);
      try {
        const out = await ask(briefPrompt(), { maxTokens: 90, temperature: 0.3, onText: (t) => alive && setText(t) });
        if (out.trim()) cache.set(key, out.trim());
        if (alive) setText(out.trim());
      } catch {
        /* the brief is a nicety; stay quiet when it can't be written */
      } finally {
        if (alive) setWorking(false);
      }
    }, 1500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [ready, planKey, nonce]);

  if (!ready || (!text && !working)) return null;
  return (
    <p className="day-brief" aria-live="polite">
      <Sparkles size={14} aria-hidden="true" />
      <span>{text || "Reading your day…"}</span>
      <button type="button" className="icon-btn" aria-label="Write a new heads-up" title="Write a new heads-up" disabled={working} onClick={() => setNonce((n) => n + 1)}>
        <RefreshCw size={13} />
      </button>
    </p>
  );
}
