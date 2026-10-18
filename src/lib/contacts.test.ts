import { describe, expect, it } from "vitest";
import { contactFor, people } from "./contacts";
import type { MailMessage, Note, Task } from "./types";

const mail = (id: string, from: string, name: string, date: number, bulk = false): MailMessage => ({ id, fromName: name, fromAddress: from, subject: `s${id}`, date, text: "", bulk });
const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({ id, title, category: "life", date: "2026-01-01", start: null, fixed: false, duration: 30, done: false, source: "manual", createdAt: 1, ...extra });
const note = (id: string, body: string): Note => ({ id, title: "", body, createdAt: 1, updatedAt: 1 });

describe("contacts", () => {
  const messages = [mail("1", "Sam@Acme.com", "Sam Rivera", 5), mail("2", "sam@acme.com", "", 9), mail("3", "x@y.com", "X", 1)];
  it("gathers a person's mail, newest first, ignoring address case", () => {
    const c = contactFor("sam@acme.com", { tasks: [], notes: [], mail: { messages } });
    expect(c.messages.map((m) => m.id)).toEqual(["2", "1"]);
    expect(c.name).toBe("Sam Rivera");
  });
  it("finds tasks from their email and tasks or notes that name them", () => {
    const c = contactFor("sam@acme.com", {
      tasks: [task("a", "Reply", { source: "email", sourceRef: "1" }), task("b", "Send Sam Rivera the deck"), task("c", "Call Sam"), task("d", "Unrelated")],
      notes: [note("n", "Lunch with Sam Rivera on Friday"), note("m", "nothing")],
      mail: { messages },
    });
    expect(c.tasks.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(c.notes.map((n) => n.id)).toEqual(["n"]);
  });
  it("lists people, skipping newsletters", () => {
    const list = people([...messages, mail("4", "no-reply@shop.com", "Shop", 20), mail("5", "news@x.com", "News", 30, true)]);
    expect(list.map((p) => p.address)).toEqual(["sam@acme.com", "x@y.com"]);
  });
});
