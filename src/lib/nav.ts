import { create } from "zustand";

export type View = "today" | "inbox" | "study" | "notes" | "settings";

/** Something to bring into view after navigating: an @-link between items. */
export interface Target {
  kind: "task" | "email" | "note" | "course";
  id: string;
  /** Changes on every jump so the same item can be revealed twice. */
  nonce: number;
}

interface NavState {
  view: View;
  target: Target | null;
  palette: boolean;
  help: boolean;
  captureNonce: number;
  go(view: View, target?: Omit<Target, "nonce">): void;
  capture(): void;
  setPalette(open: boolean): void;
  setHelp(open: boolean): void;
}

export const useNav = create<NavState>((set) => ({
  view: "today",
  target: null,
  palette: false,
  help: false,
  captureNonce: 0,
  go(view, target) {
    set({ view, target: target ? { ...target, nonce: Date.now() } : null, palette: false });
  },
  capture() {
    set((s) => ({ view: "today", palette: false, captureNonce: s.captureNonce + 1 }));
  },
  setPalette(palette) {
    set({ palette });
  },
  setHelp(help) {
    set({ help });
  },
}));

/** True while the user is typing somewhere, so single-key shortcuts stay out of the way. */
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Scroll an element into view and give it a short highlight. */
export function reveal(domId: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(domId);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.remove("flash-highlight");
    void el.offsetWidth;
    el.classList.add("flash-highlight");
  });
}
