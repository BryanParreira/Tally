import { create } from "zustand";

export type View = "today" | "inbox" | "tasks" | "calendar" | "notes" | "settings";

/** Something to bring into view after navigating: an @-link between items. */
export interface Target {
  kind: "task" | "email" | "note" | "snippet";
  id: string;
  /** Changes on every jump so the same item can be revealed twice. */
  nonce: number;
}

interface NavState {
  view: View;
  target: Target | null;
  palette: boolean;
  /** Text the command menu opens with, e.g. "#bio" from a tag chip. */
  paletteQuery: string;
  help: boolean;
  launcher: boolean;
  /** Sidebar folded down to icons (⌘. / Ctrl .). */
  collapsed: boolean;
  captureNonce: number;
  go(view: View, target?: Omit<Target, "nonce">): void;
  capture(): void;
  setPalette(open: boolean, query?: string): void;
  setHelp(open: boolean): void;
  setLauncher(open: boolean): void;
  toggleSidebar(): void;
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem("kindred:sidebar") === "collapsed";
  } catch {
    return false;
  }
}

export const useNav = create<NavState>((set) => ({
  view: "today",
  target: null,
  palette: false,
  paletteQuery: "",
  help: false,
  launcher: false,
  collapsed: readCollapsed(),
  captureNonce: 0,
  go(view, target) {
    set({ view, target: target ? { ...target, nonce: Date.now() } : null, palette: false });
  },
  capture() {
    set((s) => ({ view: "today", palette: false, captureNonce: s.captureNonce + 1 }));
  },
  setPalette(palette, query = "") {
    set({ palette, paletteQuery: query });
  },
  setHelp(help) {
    set({ help });
  },
  setLauncher(launcher) {
    set({ launcher });
  },
  toggleSidebar() {
    set((s) => {
      try {
        localStorage.setItem("kindred:sidebar", s.collapsed ? "open" : "collapsed");
      } catch {
        /* per-device preference only */
      }
      return { collapsed: !s.collapsed };
    });
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
