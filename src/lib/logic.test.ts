import { describe, expect, it } from "vitest";
import { resolveDayPhrase, formatTime, formatDuration } from "./date";
import { parseBrainDump } from "./parse";
import { planDay } from "./schedule";
import { suggestFromMail } from "./mail";
import { cardsFromNotes, newCard, reviewCard, topicsForToday } from "./study";
import type { MailMessage, Settings, Task } from "./types";

const TODAY = "2026-10-16"; // a Friday

const settings: Settings = { dayStart: 8 * 60, dayEnd: 22 * 60, breakEvery: 90, breakLength: 10, theme: "system", nowBar: true, reminders: true };

let seq = 0;
function task(partial: Partial<Task>): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: "Task",
    category: "life",
    date: TODAY,
    start: null,
    fixed: false,
    duration: 30,
    done: false,
    source: "manual",
    createdAt: seq,
    ...partial,
  };
}

describe("dates", () => {
  it("resolves common day phrases", () => {
    expect(resolveDayPhrase("today", TODAY)).toBe(TODAY);
    expect(resolveDayPhrase("tomorrow", TODAY)).toBe("2026-10-17");
    expect(resolveDayPhrase("friday", TODAY)).toBe(TODAY);
    expect(resolveDayPhrase("monday", TODAY)).toBe("2026-10-19");
    expect(resolveDayPhrase("thu", TODAY)).toBe("2026-10-22");
    expect(resolveDayPhrase("next friday", TODAY)).toBe("2026-10-23");
    expect(resolveDayPhrase("oct 22", TODAY)).toBe("2026-10-22");
    expect(resolveDayPhrase("22nd october", TODAY)).toBe("2026-10-22");
    expect(resolveDayPhrase("jan 5", TODAY)).toBe("2027-01-05");
    expect(resolveDayPhrase("banana", TODAY)).toBeNull();
    expect(resolveDayPhrase("end of day Monday", TODAY)).toBe("2026-10-19");
  });

  it("formats times and durations", () => {
    expect(formatTime(870)).toBe("2:30 PM");
    expect(formatTime(0)).toBe("12:00 AM");
    expect(formatDuration(95)).toBe("1 h 35 min");
    expect(formatDuration(45)).toBe("45 min");
  });
});

describe("brain dump parser", () => {
  it("splits a messy dump into structured tasks", () => {
    const items = parseBrainDump("finish history essay by friday, study bio chapter 4 for 2h, gym at 6pm, call mom tomorrow", TODAY);
    expect(items).toHaveLength(4);

    expect(items[0]).toMatchObject({ title: "Finish history essay", category: "study", due: TODAY, duration: 90 });
    expect(items[1]).toMatchObject({ title: "Study bio chapter 4", category: "study", duration: 120, start: null });
    expect(items[2]).toMatchObject({ title: "Gym", start: 18 * 60, duration: 60, category: "life" });
    expect(items[3]).toMatchObject({ title: "Call mom", date: "2026-10-17", duration: 20 });
  });

  it("understands work items, 24h times and filler words", () => {
    const [a, b] = parseBrainDump("I need to send the Q3 report to Dana by oct 20\nteam sync 13:30 for 15 min", TODAY);
    expect(a).toMatchObject({ title: "Send the Q3 report to Dana", category: "work", due: "2026-10-20" });
    expect(b).toMatchObject({ title: "Team sync", start: 13 * 60 + 30, duration: 15, category: "work" });
  });

  it("keeps quick verbs short and doesn't treat 'next week' as a day", () => {
    const [a, b] = parseBrainDump("reply to the group chat about the project, plan next week for 20 min", TODAY);
    expect(a).toMatchObject({ duration: 15, category: "work" });
    expect(b).toMatchObject({ title: "Plan next week", date: null, duration: 20 });
  });

  it("ignores empty pieces and bullets", () => {
    const items = parseBrainDump("- groceries\n\n* laundry ;", TODAY);
    expect(items.map((i) => i.title)).toEqual(["Groceries", "Laundry"]);
  });
});

describe("scheduler", () => {
  it("fills free time around fixed events, earliest deadline first", () => {
    const meeting = task({ title: "Meeting", fixed: true, start: 9 * 60, duration: 60 });
    const later = task({ title: "Later", duration: 60, due: "2026-10-20" });
    const urgent = task({ title: "Urgent", duration: 30, due: TODAY });
    const plan = planDay([meeting, later, urgent], settings, { now: 8 * 60, past: false, focus: null });

    const titles = plan.blocks.map((b) => (b.kind === "break" ? "break" : b.task!.title));
    expect(titles).toEqual(["Urgent", "Meeting", "Later"]);
    expect(plan.blocks[0].start).toBe(8 * 60);
    expect(plan.blocks[2].start).toBe(10 * 60);
  });

  it("never schedules into the past and heals when time moves on", () => {
    const a = task({ title: "A", duration: 60 });
    const plan = planDay([a], settings, { now: 14 * 60 + 7, past: false, focus: null });
    expect(plan.blocks[0].start).toBe(14 * 60 + 10);
  });

  it("adds a break after a long stretch of work", () => {
    const tasks = [task({ duration: 60 }), task({ duration: 60 }), task({ duration: 30 })];
    const plan = planDay(tasks, settings, { now: 8 * 60, past: false, focus: null });
    expect(plan.blocks.map((b) => b.kind)).toEqual(["task", "task", "break", "task"]);
  });

  it("reports tasks that no longer fit today", () => {
    const tasks = [task({ title: "Big", duration: 120 }), task({ title: "Small", duration: 30 })];
    const plan = planDay(tasks, settings, { now: 21 * 60, past: false, focus: null });
    expect(plan.overflow.map((t) => t.title)).toEqual(["Big"]);
    expect(plan.blocks.map((b) => b.task?.title)).toEqual(["Small"]);
  });

  it("keeps a running focus session anchored to now", () => {
    const a = task({ title: "Focus", duration: 50 });
    const b = task({ title: "After", duration: 30 });
    const nowMs = Date.UTC(2026, 9, 16, 15, 0);
    const plan = planDay([a, b], settings, {
      now: 15 * 60,
      past: false,
      nowMs,
      focus: { taskId: a.id, runningSince: nowMs - 20 * 60000, elapsed: 0 },
    });
    expect(plan.blocks[0]).toMatchObject({ start: 14 * 60 + 40, end: 15 * 60 + 30 });
    expect(plan.blocks[1].start).toBe(15 * 60 + 30);
  });
});

describe("email suggestions", () => {
  const base: MailMessage = { id: "m1", fromName: "Prof. Lee", fromAddress: "lee@bio.university.edu", subject: "", date: 0, text: "", bulk: false };

  it("turns a course deadline into a study task", () => {
    const s = suggestFromMail(
      { ...base, subject: "Assignment 3: cell respiration lab report", text: "Please submit your lab report by Thursday at 11:59 pm." },
      TODAY,
    );
    expect(s).toMatchObject({ kind: "deadline", category: "study", due: "2026-10-22", title: "Assignment 3: cell respiration lab report" });
  });

  it("turns a question into a reply task", () => {
    const s = suggestFromMail(
      { ...base, fromName: "Sam Ortiz", fromAddress: "sam@shop.com", subject: "Saturday shift?", text: "Any chance you can take my Saturday shift? Let me know." },
      TODAY,
    );
    expect(s).toMatchObject({ kind: "request", title: "Reply to Sam: Saturday shift?" });
  });

  it("reads 'by end of day Monday' as Monday", () => {
    const s = suggestFromMail({ ...base, fromName: "Dana", fromAddress: "dana@studio.co", subject: "Q3 numbers", text: "Could you send me the Q3 report by end of day Monday?" }, TODAY);
    expect(s?.due).toBe("2026-10-19");
  });

  it("skips newsletters", () => {
    const s = suggestFromMail({ ...base, fromAddress: "news@store.com", bulk: true, subject: "50% off this weekend", text: "Shop now, let me know what you think" }, TODAY);
    expect(s).toBeNull();
  });

  it("skips plain FYI mail", () => {
    expect(suggestFromMail({ ...base, fromAddress: "friend@mail.com", subject: "Photos", text: "Here are the photos from the trip." }, TODAY)).toBeNull();
  });
});

describe("study", () => {
  it("makes flashcards from notes", () => {
    const cards = cardsFromNotes(
      "Krebs cycle: a series of reactions in the mitochondrial matrix\nATP - the cell's energy currency\nQ: Final electron acceptor?\nA: Oxygen\nGlycolysis is the breakdown of glucose into pyruvate.",
    );
    expect(cards.map((c) => c.front)).toEqual(["What is Krebs cycle?", "What is ATP?", "Final electron acceptor?", "What is Glycolysis?"]);
    expect(cards[2].back).toBe("Oxygen");
  });

  it("spaces reviews further apart as you remember", () => {
    let card = newCard({ front: "a", back: "b" }, null, TODAY, "c1");
    card = reviewCard(card, "good", TODAY);
    expect(card.due).toBe("2026-10-17");
    card = reviewCard(card, "good", card.due);
    expect(card.interval).toBe(6);
    const third = reviewCard(card, "good", card.due);
    expect(third.interval).toBeGreaterThan(6);
    expect(reviewCard(third, "again", TODAY).due).toBe(TODAY);
  });

  it("spreads topics over the days before the exam", () => {
    const course = {
      id: "c",
      name: "Bio",
      examDate: "2026-10-20",
      minutesPerDay: 60,
      topics: ["1", "2", "3", "4", "5", "6", "7", "8"].map((n) => ({ id: n, name: `Ch ${n}`, done: false })),
    };
    const { topics, daysLeft } = topicsForToday(course, TODAY);
    expect(daysLeft).toBe(4);
    expect(topics.map((t) => t.name)).toEqual(["Ch 1", "Ch 2"]);
  });
});

import { findNoteTasks, markPlanned } from "./notes";

describe("notes", () => {
  it("finds task lines and marks them planned", () => {
    const body = "Ideas for the week\n[ ] call the bank tomorrow\n- [ ] read chapter 5 for 45 min\n/task book flights by friday\n[→] already planned";
    const found = findNoteTasks(body, TODAY);
    expect(found.map((f) => f.item.title)).toEqual(["Call the bank", "Read chapter 5", "Book flights"]);
    expect(found[0].item.date).toBe("2026-10-17");
    expect(found[1].item.duration).toBe(45);
    expect(found[2].item.due).toBe(TODAY);
    const marked = markPlanned(body);
    expect(findNoteTasks(marked, TODAY)).toHaveLength(0);
    expect(marked).toContain("- [→] read chapter 5 for 45 min");
  });
});
