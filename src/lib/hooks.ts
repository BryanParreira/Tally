import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { create } from "zustand";
import type { Settings } from "./types";

/**
 * Grows a textarea to fit its text, and re-measures when its width changes
 * (a resized window or a folded sidebar rewraps the lines).
 */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, value]);
}

/** Re-renders on an interval so the time and the plan stay live. */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

const THEME_KEY = "kindred:theme";

export function isDarkTheme(theme: Settings["theme"]): boolean {
  return theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
}

/** Cross-fade colours instead of snapping, for both a manual switch and the system's own. */
function fadeTheme(change: () => void) {
  const root = document.documentElement;
  // Hidden windows (the tray, the reminder card) just switch; nobody is looking.
  if (document.visibilityState !== "visible" || matchMedia("(prefers-reduced-motion: reduce)").matches) return change();
  type Transition = { ready: Promise<void>; finished: Promise<void> };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => Transition };
  if (doc.startViewTransition) {
    const t = doc.startViewTransition(change);
    // A skipped transition still applies the change; it just doesn't animate.
    t.ready.catch(() => undefined);
    t.finished.catch(() => undefined);
    return;
  }
  root.classList.add("theme-fade");
  change();
  setTimeout(() => root.classList.remove("theme-fade"), 450);
}

/**
 * Apply the light / dark / system theme. It's remembered for the next launch
 * (public/theme.js applies it before the first paint) and changes fade smoothly.
 */
export function useTheme(theme: Settings["theme"], onApplied?: (dark: boolean) => void) {
  const first = useRef(true);
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => (theme === "system" ? root.removeAttribute("data-theme") : root.setAttribute("data-theme", theme));
    if (first.current) apply();
    else fadeTheme(apply);
    first.current = false;
    onApplied?.(isDarkTheme(theme));
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* not remembered: the app still themes itself once it loads */
    }
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      root.classList.add("theme-fade");
      setTimeout(() => root.classList.remove("theme-fade"), 450);
      onApplied?.(mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
}

export interface ToastAction {
  label: string;
  run(): void;
}

interface ToastState {
  message: string | null;
  action: ToastAction | null;
  show(message: string, action?: ToastAction): void;
  dismiss(): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useToast = create<ToastState>((set) => ({
  message: null,
  action: null,
  show(message, action) {
    clearTimeout(toastTimer);
    set({ message, action: action ?? null });
    // Toasts with an Undo stay a little longer so there's time to use it.
    toastTimer = setTimeout(() => set({ message: null, action: null }), action ? 6000 : 2600);
  },
  dismiss() {
    clearTimeout(toastTimer);
    set({ message: null, action: null });
  },
}));


export function timeOptions(step = 30): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    const h = Math.floor(m / 60);
    const label = `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
    out.push({ value: m, label });
  }
  return out;
}

export function relativeTime(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
