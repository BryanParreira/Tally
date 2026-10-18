import { describe, expect, it } from "vitest";
import { suggestNext } from "./suggest";
import type { TriageItem } from "./triage";
import type { Project, Task } from "./types";

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, category: "life", date: "2026-10-17", start: null, fixed: false, duration: 30, done: false, source: "manual", createdAt: 1, ...extra });
const project = (id: string, status: Project["status"] = "active"): Project => ({ id, name: id, description: "", status, createdAt: 1 });
const mail = (id: string, due: string): TriageItem =>
  ({ id, kind: "email", bucket: "deadline", from: "Sam", title: `Re ${id}`, time: 1, message: { id, fromName: "Sam", fromAddress: "s@x.com", subject: id, date: 1, text: "", bulk: false }, suggestion: { kind: "deadline", due } }) as unknown as TriageItem;

const today = "2026-10-17";

describe("suggestNext", () => {
  it("is quiet when nothing is pressing", () => {
    expect(suggestNext({ signal: [], tasks: [task("a")], projects: [project("p")], today })).toBeNull();
  });
  it("puts a near email deadline first", () => {
    const s = suggestNext({ signal: [mail("m1", "2026-10-18")], tasks: [task("a", { projectId: "p", date: "2026-10-01" })], projects: [project("p")], today });
    expect(s?.go).toEqual({ view: "inbox", target: { kind: "email", id: "m1" } });
  });
  it("ignores deadlines that are far off", () => {
    expect(suggestNext({ signal: [mail("m1", "2026-12-01")], tasks: [], projects: [], today })).toBeNull();
  });
  it("then points at the active project with the most late tasks", () => {
    const tasks = [task("a", { projectId: "p", date: "2026-10-01" }), task("b", { projectId: "q", date: "2026-10-01" }), task("c", { projectId: "q", date: "2026-10-02" })];
    const s = suggestNext({ signal: [], tasks, projects: [project("p"), project("q"), project("r", "done")], today });
    expect(s?.go.target?.id).toBe("q");
    expect(s?.text).toContain("2 late tasks");
  });
  it("falls back to an overdue deadline task", () => {
    const s = suggestNext({ signal: [], tasks: [task("x", { due: "2026-10-10" })], projects: [], today });
    expect(s?.go).toEqual({ view: "tasks", target: { kind: "task", id: "x" } });
  });
});
