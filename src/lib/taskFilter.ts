import { create } from "zustand";
import type { TaskView } from "./taskViews";
import type { Category } from "./types";

/** What the Tasks page is showing. Shared so the sidebar can list the views under Tasks. */
interface TaskFilterState {
  view: TaskView;
  tag: string | null;
  area: Category | null;
  projectId: string | null;
  setView(view: TaskView): void;
  setTag(tag: string | null): void;
  setArea(area: Category | null): void;
  setProject(id: string | null): void;
  /** Back to the plain "All tasks" list. */
  reset(): void;
}

export const useTaskFilter = create<TaskFilterState>((set) => ({
  view: "open",
  tag: null,
  area: null,
  projectId: null,
  // Each choice replaces the others, like picking one place in a list.
  setView: (view) => set({ view, tag: null, area: null, projectId: null }),
  setTag: (tag) => set({ tag, area: null, projectId: null, view: "open" }),
  setArea: (area) => set({ area, tag: null, projectId: null, view: "open" }),
  setProject: (projectId) => set({ projectId, tag: null, area: null, view: "open" }),
  reset: () => set({ view: "open", tag: null, area: null, projectId: null }),
}));
