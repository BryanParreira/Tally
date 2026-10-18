import { describe, expect, it } from "vitest";
import { linksFor, linkTitles, renameLinks } from "./links";
import type { Note, Task } from "./types";

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({ id, title, category: "life", date: "2026-01-01", start: null, fixed: false, duration: 30, done: false, source: "manual", createdAt: 1, ...extra });
const note = (id: string, title: string, body: string): Note => ({ id, title, body, createdAt: 1, updatedAt: 1 });
const state = (tasks: Task[], notes: Note[]) => ({ tasks, notes, mail: { messages: [] } });

describe("@-links", () => {
  it("reads [[titles]] case-insensitively", () => {
    expect(linkTitles("see [[Bio Lecture]] and [[  budget  ]]")).toEqual(["bio lecture", "budget"]);
  });
  it("finds links and backlinks across notes and tasks", () => {
    const s = state([task("t1", "Study for exam", { notes: "from [[Bio lecture]]" })], [note("n1", "Bio lecture", "chapters 4-6")]);
    expect(linksFor("task", "t1", s).links.map((r) => r.id)).toEqual(["n1"]);
    expect(linksFor("note", "n1", s).backlinks.map((r) => r.id)).toEqual(["t1"]);
  });
  it("connects a task to the note it came from", () => {
    const s = state([task("t1", "Email Sam", { source: "note", sourceRef: "n1" })], [note("n1", "Meeting", "")]);
    expect(linksFor("task", "t1", s).links.map((r) => r.id)).toEqual(["n1"]);
    expect(linksFor("note", "n1", s).backlinks.map((r) => r.id)).toEqual(["t1"]);
  });
  it("keeps links working after a rename", () => {
    expect(renameLinks("a [[Old Name]] b [[Other]]", "old name", "New Name")).toBe("a [[New Name]] b [[Other]]");
  });
});
