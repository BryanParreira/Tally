import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Play, Plus, X } from "lucide-react";
import { Logo } from "./components/ui";
import { useTheme } from "./lib/hooks";
import { hideNotice, isDesktop, onNotice, showMainWindow, type Notice } from "./lib/native";
import { initStore, useStore } from "./lib/store";
import "@fontsource-variable/literata/opsz.css";
import "./styles/app.css";

const VISIBLE_MS = 12_000;

/** Lets the card be previewed in a browser with ?preview */
const PREVIEW: Notice | null =
  !isDesktop && new URLSearchParams(location.search).has("preview")
    ? { id: "preview", kind: "focus-done", title: "Finish history essay", body: "You focused for 1 h 30 min. Mark it done, or give it a few more minutes.", taskId: "" }
    : null;

/** Kindred's own notification card: calm, on-brand, with real actions. */
function NoticeCard() {
  const [notice, setNotice] = useState<Notice | null>(PREVIEW);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const theme = useStore((s) => s.settings.theme);
  const { toggleDone, startFocus, updateTask } = useStore.getState();
  useTheme(theme);

  const dismiss = useCallback(() => {
    setLeaving(true);
    clearTimeout(timer.current);
    setTimeout(() => {
      setNotice(null);
      setLeaving(false);
      hideNotice().catch(() => undefined);
    }, 280);
  }, []);

  useEffect(() => {
    let off: (() => void) | undefined;
    onNotice((n) => {
      setLeaving(false);
      setNotice({ ...n });
    }).then((fn) => (off = fn));
    return () => off?.();
  }, []);

  useEffect(() => {
    if (!notice || PREVIEW) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(dismiss, VISIBLE_MS);
    return () => clearTimeout(timer.current);
  }, [notice, dismiss]);

  if (!notice) return null;

  const act = (fn: () => void) => () => {
    fn();
    dismiss();
  };

  return (
    <div
      className={`notice${leaving ? " leaving" : ""}`}
      role="alert"
      onMouseEnter={() => clearTimeout(timer.current)}
      onMouseLeave={() => {
        if (!PREVIEW) timer.current = setTimeout(dismiss, 4000);
      }}
    >
      <div className="notice-head">
        <Logo size={20} />
        Kindred · {notice.kind === "focus-done" ? "Time's up" : "Up now"}
        <span className="when">now</span>
      </div>
      <button type="button" className="icon-btn notice-close" aria-label="Dismiss" onClick={dismiss}>
        <X size={14} />
      </button>
      <p className="notice-title">{notice.title}</p>
      <p className="notice-body">{notice.body}</p>
      <div className="notice-actions">
        {notice.kind === "focus-done" ? (
          <>
            <button type="button" className="btn sm" onClick={act(() => updateTask(notice.taskId, { duration: (useStore.getState().tasks.find((t) => t.id === notice.taskId)?.duration ?? 0) + 10 }))}>
              <Plus size={14} /> 10 more min
            </button>
            <button type="button" className="btn primary sm" onClick={act(() => toggleDone(notice.taskId, null))}>
              <Check size={14} /> Done
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn sm" onClick={act(() => showMainWindow())}>
              Open plan
            </button>
            <button type="button" className="btn primary sm" onClick={act(() => startFocus(notice.taskId))}>
              <Play size={13} /> Start focus
            </button>
          </>
        )}
      </div>
      {!PREVIEW && <div key={notice.id} className="notice-timer" style={{ animationDuration: `${VISIBLE_MS}ms` }} />}
    </div>
  );
}

initStore().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <NoticeCard />
    </StrictMode>,
  );
});
