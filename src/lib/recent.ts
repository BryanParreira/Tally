import { create } from "zustand";
import type { RefKind } from "./links";

export interface RecentItem {
  kind: RefKind | "project";
  id: string;
}

const KEY = "tally:recent";
const MAX = 12;

function read(): RecentItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string" && typeof x.kind === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** The last things you opened, newest first, kept on this device. */
export const useRecent = create<{ items: RecentItem[]; touch(item: RecentItem): void }>((set, get) => ({
  items: read(),
  touch(item) {
    const items = [item, ...get().items.filter((x) => !(x.kind === item.kind && x.id === item.id))].slice(0, MAX);
    set({ items });
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* a short history is only a convenience */
    }
  },
}));
