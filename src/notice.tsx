import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, Check, X } from "lucide-react";
import { Logo } from "./components/ui";
import { useTheme } from "./lib/hooks";
import { hideNotice, isDesktop, onNotice, openView, showMainWindow, type Notice } from "./lib/native";
import { initStore, useStore } from "./lib/store";
import "./styles/app.css";

const VISIBLE_MS = 12_000;

/** Lets the card be previewed in a browser with ?preview */
const PREVIEW: Notice | null =
  !isDesktop && new URLSearchParams(location.search).has("preview")
    ? { id: "preview", kind: "task", title: "Finish history essay", body: "Until 3:30 PM. Then Team standup.", taskId: "" }
    : null;

/** Kindred's own notification card: calm, on-brand, with real actions. */
function NoticeCard() {
  const [notice, setNotice] = useState<Notice | null>(PREVIEW);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const theme = useStore((s) => s.settings.theme);
  const { toggleDone } = useStore.getState();
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
        Kindred · {notice.kind === "event" ? "Starting now" : "Up now"}
        <span className="when">now</span>
      </div>
      <button type="button" className="icon-btn notice-close" aria-label="Dismiss" onClick={dismiss}>
        <X size={14} />
      </button>
      <p className="notice-title">{notice.title}</p>
      <p className="notice-body">{notice.body}</p>
      <div className="notice-actions">
        {notice.kind === "task" ? (
          <>
            <button type="button" className="btn sm" onClick={act(() => showMainWindow())}>
              Open plan
            </button>
            <button type="button" className="btn primary sm" onClick={act(() => toggleDone(notice.taskId, null))}>
              <Check size={14} /> Done
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn sm" onClick={act(() => openView("calendar"))}>
              <CalendarDays size={14} /> Open calendar
            </button>
            <button type="button" className="btn primary sm" onClick={dismiss}>
              Got it
            </button>
          </>
        )}
      </div>
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
