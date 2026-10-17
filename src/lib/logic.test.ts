import { describe, expect, it } from "vitest";
import { resolveDayPhrase, formatTime, formatDuration } from "./date";
import { parseBrainDump } from "./parse";
import { planDay } from "./schedule";
import { suggestFromMail } from "./mail";
import type { MailMessage, Settings, Task } from "./types";

const TODAY = "2026-10-16"; // a Friday

const settings: Settings = { dayStart: 8 * 60, dayEnd: 22 * 60, breakEvery: 90, breakLength: 10, theme: "system", reminders: true, hiddenCalendars: [] };

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
    const plan = planDay([meeting, later, urgent], settings, { now: 8 * 60, past: false });

    const titles = plan.blocks.map((b) => (b.kind === "break" ? "break" : b.task!.title));
    expect(titles).toEqual(["Urgent", "Meeting", "Later"]);
    expect(plan.blocks[0].start).toBe(8 * 60);
    expect(plan.blocks[2].start).toBe(10 * 60);
  });

  it("never schedules into the past and heals when time moves on", () => {
    const a = task({ title: "A", duration: 60 });
    const plan = planDay([a], settings, { now: 14 * 60 + 7, past: false });
    expect(plan.blocks[0].start).toBe(14 * 60 + 10);
  });

  it("adds a break after a long stretch of work", () => {
    const tasks = [task({ duration: 60 }), task({ duration: 60 }), task({ duration: 30 })];
    const plan = planDay(tasks, settings, { now: 8 * 60, past: false });
    expect(plan.blocks.map((b) => b.kind)).toEqual(["task", "task", "break", "task"]);
  });

  it("reports tasks that no longer fit today", () => {
    const tasks = [task({ title: "Big", duration: 120 }), task({ title: "Small", duration: 30 })];
    const plan = planDay(tasks, settings, { now: 21 * 60, past: false });
    expect(plan.overflow.map((t) => t.title)).toEqual(["Big"]);
    expect(plan.blocks.map((b) => b.task?.title)).toEqual(["Small"]);
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

import { extractTags } from "./parse";
import { eventsOn, parseICS } from "./ics";
import { courseRef, looksLikeCourseFeed, plannedDay, reconcileAssignments, splitCourseFeed } from "./courses";
import { formatAvailability, freeSlots, nextDays } from "./availability";

describe("tags and priority", () => {
  it("pulls #tags and priority out of the text", () => {
    const [a, b, c] = parseBrainDump("!! pay rent #home, finish lab report #bio #lab important, clean garage someday, low priority tidy desk", TODAY);
    expect(a).toMatchObject({ title: "Pay rent", priority: "urgent", tags: ["home"], category: "life" });
    expect(b).toMatchObject({ title: "Finish lab report", priority: "high", tags: ["bio", "lab"], category: "study" });
    expect(c).toMatchObject({ title: "Clean garage", someday: true });
    expect(c.priority).toBeUndefined();
    expect(parseBrainDump("low priority tidy desk", TODAY)[0]).toMatchObject({ title: "Tidy desk", priority: "low" });
    expect(extractTags("notes on #Cells and #cells, not a#tag")).toEqual(["cells"]);
  });

  it("schedules urgent work first", () => {
    const calm = task({ title: "Calm", duration: 30 });
    const fire = task({ title: "Fire", duration: 30, priority: "urgent" });
    const plan = planDay([calm, fire], settings, { now: 9 * 60, past: false });
    expect(plan.blocks.map((b) => b.task?.title)).toEqual(["Fire", "Calm"]);
  });
});

const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:lecture-1",
  "SUMMARY:Biology lecture",
  "LOCATION:Hall B\\, room 2",
  "DTSTART;TZID=America/New_York:20261005T100000",
  "DTEND;TZID=America/New_York:20261005T112000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261211T235959Z",
  "EXDATE;TZID=America/New_York:20261012T100000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:lecture-1",
  "RECURRENCE-ID;TZID=America/New_York:20261016T100000",
  "SUMMARY:Biology lecture (moved)",
  "DTSTART;TZID=America/New_York:20261016T130000",
  "DTEND;TZID=America/New_York:20261016T142000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:dentist",
  "SUMMARY:Dentist",
  "DTSTART:20261016T190000Z",
  "DURATION:PT45M",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:break",
  "SUMMARY:Fall break",
  "DTSTART;VALUE=DATE:20261019",
  "DTEND;VALUE=DATE:20261021",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:gone",
  "SUMMARY:Cancelled thing",
  "STATUS:CANCELLED",
  "DTSTART:20261016T120000Z",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("calendar import", () => {
  // vite.config.ts pins tests to New York time, 4 hours behind UTC in October.
  const events = parseICS(ICS, "cal");

  it("parses events, locations and skips cancelled ones", () => {
    expect(events.map((e) => e.title).sort()).toEqual(["Biology lecture", "Biology lecture (moved)", "Dentist", "Fall break"]);
    expect(events.find((e) => e.uid === "lecture-1")?.location).toBe("Hall B, room 2");
  });

  it("expands weekly classes and honours skipped and moved dates", () => {
    const mon = eventsOn(events, "2026-10-05");
    expect(mon).toHaveLength(1);
    expect(mon[0]).toMatchObject({ start: 600, end: 680 });
    expect(eventsOn(events, "2026-10-06")).toHaveLength(0); // Tuesday
    expect(eventsOn(events, "2026-10-12")).toHaveLength(0); // skipped
    const fri = eventsOn(events, "2026-10-16").map((e) => e.title);
    expect(fri).toContain("Biology lecture (moved)");
    expect(fri).not.toContain("Biology lecture");
    expect(fri).toContain("Dentist");
    expect(eventsOn(events, "2026-10-16").find((e) => e.title === "Dentist")).toMatchObject({ start: 900, end: 945 });
    expect(eventsOn(events, "2026-12-14")).toHaveLength(0); // after UNTIL
  });

  it("handles all-day events spanning several days", () => {
    expect(eventsOn(events, "2026-10-19").filter((e) => e.allDay).map((e) => e.title)).toEqual(["Fall break"]);
    expect(eventsOn(events, "2026-10-20")[0].allDay).toBe(true);
    expect(eventsOn(events, "2026-10-21").filter((e) => e.allDay)).toHaveLength(0);
  });

  it("plans tasks around calendar events", () => {
    const occ = [{ uid: "x", calendarId: "c", title: "Lecture", allDay: false, start: 9 * 60, end: 10 * 60 }];
    const plan = planDay([task({ title: "Essay", duration: 60 })], settings, { now: 8 * 60 + 30, past: false }, occ);
    expect(plan.blocks.map((b) => b.kind)).toEqual(["event", "task"]);
    expect(plan.blocks[1].start).toBe(10 * 60);
  });
});

describe("free time", () => {
  it("finds open slots between fixed commitments", () => {
    const slots = freeSlots([{ start: 600, end: 660 }, { start: 840, end: 900 }], { dayStart: 540, dayEnd: 1080 }, 0);
    expect(slots).toEqual([
      { start: 540, end: 600 },
      { start: 660, end: 840 },
      { start: 900, end: 1080 },
    ]);
    expect(freeSlots([], { dayStart: 540, dayEnd: 1080 }, 1060)).toEqual([]);
  });

  it("writes a friendly message", () => {
    const text = formatAvailability([{ date: TODAY, slots: [{ start: 900, end: 1050 }] }, { date: "2026-10-19", slots: [{ start: 600, end: 780 }] }], TODAY, "Eastern Time");
    expect(text).toBe("Here's when I'm free (Eastern Time):\n• Today: 3:00 – 5:30 PM\n• Mon, Oct 19: 10:00 AM – 1:00 PM");
    expect(nextDays(TODAY, 3, true)).toEqual(["2026-10-16", "2026-10-19", "2026-10-20"]);
  });
});

import { buildTriage, groupByBucket, groupByDate } from "./triage";
import { emptyData, planFor } from "./store";

describe("unified inbox", () => {
  it("collects email, carried-over work and note tasks", () => {
    const data = emptyData();
    const at = (h: number) => new Date(2026, 9, 16, h).getTime();
    data.mail.messages = [
      { id: "1", fromName: "Prof. Lee", fromAddress: "lee@uni.edu", subject: "Lab report", date: at(9), text: "Please submit by Thursday.", bulk: false },
      { id: "2", fromName: "Deals", fromAddress: "news@deals.com", subject: "Sale", date: at(8), text: "Shop now", bulk: true },
      { id: "3", fromName: "Old", fromAddress: "a@b.com", subject: "Done already", date: at(7), text: "Can you check?", bulk: false },
    ];
    data.mail.handled = ["3"];
    data.tasks = [task({ id: "late", title: "Read ch. 3", carriedFrom: "2026-10-15" })];
    data.notes = [{ id: "n1", title: "Ideas", body: "[ ] call the bank", createdAt: 0, updatedAt: at(6) }];

    const { signal, noise } = buildTriage(data, TODAY);
    expect(signal.map((i) => i.kind).sort()).toEqual(["carried", "email", "note"]);
    expect(noise.map((i) => i.title)).toEqual(["Sale"]);

    data.triageDone = signal.filter((i) => i.kind !== "email").map((i) => i.id);
    expect(buildTriage(data, TODAY).signal.map((i) => i.kind)).toEqual(["email"]);
  });

  it("groups by day", () => {
    const at = (d: number) => new Date(2026, 9, d, 12).getTime();
    const mk = (id: string, time: number) => ({ id, kind: "email" as const, bucket: "reply" as const, signal: true, from: "", title: id, detail: "", time });
    const groups = groupByDate([mk("a", at(16)), mk("b", at(15)), mk("c", at(12)), mk("d", at(1))], TODAY);
    expect(groups.map((g) => `${g.label}:${g.items.map((i) => i.id).join("")}`)).toEqual(["Today:a", "Yesterday:b", "This week:c", "Earlier:d"]);
  });

  it("sorts email into what it asks of you", () => {
    const data = emptyData();
    const at = (h: number) => new Date(2026, 9, 16, h).getTime();
    const mail = (id: string, subject: string, text: string, bulk = false) => ({ id, fromName: "Sam Park", fromAddress: "sam@x.com", subject, date: at(9), text, bulk });
    data.mail.messages = [
      mail("q", "Lunch", "Are you free on Thursday?"),
      mail("d", "Essay", "Please submit the essay by Friday."),
      mail("f", "Notes from today", "Here are the slides from class."),
      mail("n", "Weekly digest", "Top stories this week", true),
    ];
    const { all } = buildTriage(data, TODAY);
    const bucketOf = (id: string) => all.find((i) => i.message?.id === id)?.bucket;
    expect([bucketOf("q"), bucketOf("d"), bucketOf("f"), bucketOf("n")]).toEqual(["reply", "deadline", "fyi", "newsletter"]);
    expect(groupByBucket(all, "important").map((g) => g.bucket)).toEqual(["reply", "deadline"]);
    expect(groupByBucket(all, "other").map((g) => g.bucket)).toEqual(["fyi", "newsletter"]);
  });

  it("lets your call on a sender beat Kindred's guess", () => {
    const data = emptyData();
    const mail = (id: string, from: string, text: string) => ({ id, fromName: from, fromAddress: `${from}@x.com`, subject: id, date: 0, text, bulk: false });
    data.mail.messages = [mail("a", "mom", "Love you, see you Sunday."), mail("b", "boss", "Can you send the report?")];
    data.mail.senders = { "mom@x.com": "important", "boss@x.com": "other" };
    const { all, signal } = buildTriage(data, TODAY);
    expect(all.find((i) => i.message?.id === "a")?.bucket).toBe("vip");
    expect(all.find((i) => i.message?.id === "b")?.bucket).toBe("fyi");
    expect(signal.map((i) => i.message?.id)).toEqual(["a"]);
    expect(groupByBucket(all, "all").flatMap((g) => g.items).length).toBe(2);
  });

  it("parks waiting email and brings it back on the day you picked", () => {
    const data = emptyData();
    data.mail.messages = [{ id: "w", fromName: "Prof. Lee", fromAddress: "lee@uni.edu", subject: "Extension?", date: 0, text: "I'll let you know.", bulk: false }];
    data.mail.waiting = { w: "2026-10-19" };
    expect(buildTriage(data, TODAY).all[0].bucket).toBe("waiting");
    const back = buildTriage(data, "2026-10-19").all[0];
    expect(back.bucket).toBe("reply");
    expect(back.detail).toMatch(/No reply yet/);
  });
});

import { allTags, filterTasks, groupTasks, planCandidates } from "./taskViews";

describe("task views", () => {
  const list = [
    task({ id: "a", title: "Today urgent", priority: "urgent", tags: ["bio"] }),
    task({ id: "b", title: "Today normal", status: "doing" }),
    task({ id: "c", title: "Tomorrow", date: "2026-10-17", tags: ["bio", "lab"] }),
    task({ id: "d", title: "Backlog", someday: true }),
    task({ id: "e", title: "Finished", done: true }),
    task({ id: "f", title: "Next month", date: "2026-11-20" }),
  ];

  it("filters by view, tag and text", () => {
    expect(filterTasks(list, { view: "today" }, TODAY).map((t) => t.id)).toEqual(["a", "b"]);
    expect(filterTasks(list, { view: "upcoming" }, TODAY).map((t) => t.id)).toEqual(["c", "f"]);
    expect(filterTasks(list, { view: "someday" }, TODAY).map((t) => t.id)).toEqual(["d"]);
    expect(filterTasks(list, { view: "done" }, TODAY).map((t) => t.id)).toEqual(["e"]);
    expect(filterTasks(list, { view: "open", tag: "bio" }, TODAY).map((t) => t.id)).toEqual(["a", "c"]);
    expect(filterTasks(list, { view: "open", query: "#lab" }, TODAY).map((t) => t.id)).toEqual(["c"]);
  });

  it("groups by date, status and priority", () => {
    const open = filterTasks(list, { view: "open" }, TODAY);
    expect(groupTasks(open, "date", TODAY).map((g) => `${g.label}:${g.tasks.map((t) => t.id).join("")}`)).toEqual(["Today:ab", "Tomorrow:c", "Later:f", "Someday:d"]);
    expect(groupTasks(list, "status", TODAY).map((g) => g.label)).toEqual(["In progress", "To do", "Done"]);
    expect(groupTasks(open, "priority", TODAY)[0]).toMatchObject({ label: "Urgent" });
    expect(allTags(list)).toEqual([
      { tag: "bio", count: 2 },
      { tag: "lab", count: 1 },
    ]);
  });

  it("keeps someday tasks out of the day plan", () => {
    const s = { tasks: list, settings, events: [] };
    const ids = planFor(s, TODAY, new Date(2026, 9, 16, 9)).blocks.map((b) => b.task?.id);
    expect(ids).not.toContain("d");
    expect(ids).toContain("a");
  });
});

import { parseBackup } from "./store";

describe("backups", () => {
  it("accepts a Kindred backup and rejects anything else", () => {
    const data = emptyData();
    data.tasks = [task({ title: "Kept" })];
    const restored = parseBackup(JSON.stringify({ ...data, exportedAt: "x" }));
    expect(restored.tasks[0].title).toBe("Kept");
    expect(restored.snippets.length).toBeGreaterThan(0);
    expect(() => parseBackup("{not json")).toThrow(/isn't a Kindred backup/);
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/isn't a Kindred backup/);
  });

  it("drops the old focus timer and Now Bar from saved data", () => {
    const old = { ...emptyData(), focus: { taskId: "x", runningSince: 1, elapsed: 0 }, stats: { "2026-10-16": { focusMinutes: 30 } }, settings: { ...emptyData().settings, nowBar: true } };
    const restored = parseBackup(JSON.stringify(old)) as unknown as Record<string, unknown> & { settings: Record<string, unknown> };
    expect(restored.focus).toBeUndefined();
    expect(restored.stats).toBeUndefined();
    expect(restored.settings.nowBar).toBeUndefined();
  });
});

import { layoutLanes, makeStamp, monthMatrix, shiftStamp, stampDuration, weekStart } from "./calendarGrid";

describe("calendar grid", () => {
  it("builds month and week frames starting on Monday", () => {
    expect(weekStart(TODAY)).toBe("2026-10-12");
    const m = monthMatrix(TODAY);
    expect(m).toHaveLength(6);
    expect(m[0][0]).toBe("2026-09-28");
    expect(m.flat()).toContain("2026-10-31");
  });

  it("moves and measures local times", () => {
    expect(makeStamp(TODAY, 9 * 60 + 30)).toBe("2026-10-16T09:30");
    expect(makeStamp(TODAY, 24 * 60 + 15)).toBe("2026-10-17T00:15");
    expect(shiftStamp("2026-10-16T23:30", 1, 45)).toBe("2026-10-18T00:15");
    expect(stampDuration("2026-10-16T23:00", "2026-10-17T01:30")).toBe(150);
  });

  it("puts overlapping items side by side", () => {
    const a = { start: 600, end: 660 };
    const b = { start: 630, end: 690 };
    const c = { start: 700, end: 720 };
    const lanes = layoutLanes([a, b, c]);
    expect(lanes.get(a)).toEqual({ lane: 0, of: 2, span: 1 });
    expect(lanes.get(b)).toEqual({ lane: 1, of: 2, span: 1 });
    expect(lanes.get(c)).toEqual({ lane: 0, of: 1, span: 1 });
  });

  it("widens an item into free lanes on its right", () => {
    // a and b overlap; c overlaps a only, so it can take b's lane too.
    const a = { start: 600, end: 720 };
    const b = { start: 610, end: 640 };
    const c = { start: 650, end: 700 };
    const d = { start: 615, end: 630 };
    const lanes = layoutLanes([a, b, c, d]);
    expect(lanes.get(d)).toEqual({ lane: 2, of: 3, span: 1 });
    expect(lanes.get(c)).toEqual({ lane: 1, of: 3, span: 2 });
  });

  it("keeps tiny back-to-back items apart when drawn taller than they are", () => {
    const a = { start: 840, end: 855 };
    const b = { start: 855, end: 870 };
    expect(layoutLanes([a, b]).get(b)).toEqual({ lane: 0, of: 1, span: 1 });
    expect(layoutLanes([a, b], 25).get(b)).toEqual({ lane: 1, of: 2, span: 1 });
  });
});

import { discoverCalendars, parseCalendarList, parseEventReport, type DavResult } from "./caldav";

const CAL_LIST = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
  <d:response><d:href>/123/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
  <d:response><d:href>/123/calendars/home/</d:href><d:propstat><d:prop>
    <d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Home &amp; Family</d:displayname>
    <a:calendar-color>#FF2968FF</a:calendar-color>
    <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
  </d:prop></d:propstat></d:response>
  <d:response><d:href>/123/calendars/reminders/</d:href><d:propstat><d:prop>
    <d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Reminders</d:displayname>
    <c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
  </d:prop></d:propstat></d:response>
</d:multistatus>`;

describe("CalDAV (Apple iCloud and others)", () => {
  it("lists event calendars with their names and colours", () => {
    expect(parseCalendarList(CAL_LIST, "https://p42-caldav.icloud.com/123/")).toEqual([
      { url: "https://p42-caldav.icloud.com/123/calendars/home/", name: "Home & Family", color: "#FF2968" },
    ]);
  });

  it("reads events out of a calendar report", () => {
    const report = `<multistatus xmlns="DAV:"><response><href>/c/1.ics</href><propstat><prop><calendar-data xmlns="urn:ietf:params:xml:ns:caldav">BEGIN:VCALENDAR&#13;
BEGIN:VEVENT&#13;
UID:abc&#13;
SUMMARY:Dentist &amp; checkup&#13;
DTSTART:20261016T190000Z&#13;
DTEND:20261016T200000Z&#13;
END:VEVENT&#13;
END:VCALENDAR</calendar-data></prop></propstat></response></multistatus>`;
    const events = parseEventReport(report, "cal-1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ uid: "abc", title: "Dentist & checkup", calendarId: "cal-1", start: "2026-10-16T15:00" });
  });

  it("discovers calendars through principal, home set and redirects", async () => {
    const calls: string[] = [];
    const send = async (url: string, method: string): Promise<DavResult> => {
      calls.push(`${method} ${url}`);
      if (url === "https://caldav.icloud.com/") return { status: 207, body: `<multistatus xmlns="DAV:"><response><href>/</href><propstat><prop><current-user-principal><href>/123/principal/</href></current-user-principal></prop></propstat></response></multistatus>` };
      if (url === "https://caldav.icloud.com/123/principal/") return { status: 301, body: "https://p42-caldav.icloud.com/123/principal/" };
      if (url === "https://p42-caldav.icloud.com/123/principal/") return { status: 207, body: `<multistatus xmlns="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><response><href>/123/principal/</href><propstat><prop><c:calendar-home-set><href>/123/calendars/</href></c:calendar-home-set></prop></propstat></response></multistatus>` };
      return { status: 207, body: CAL_LIST };
    };
    const cals = await discoverCalendars(send, "https://caldav.icloud.com/");
    expect(cals.map((c) => c.name)).toEqual(["Home & Family"]);
    expect(calls.at(-1)).toBe("PROPFIND https://p42-caldav.icloud.com/123/calendars/");
  });
});

describe("course calendars", () => {
  const feed = [
    "BEGIN:VCALENDAR",
    // Brightspace: a deadline as a zero-length event, the course in LOCATION
    "BEGIN:VEVENT", "UID:d2l-1", "SUMMARY:Lab Report 2 - Due", "LOCATION:CHEM 201-02 General Chemistry", "DTSTART:20261020T235900", "DTEND:20261020T235900", "END:VEVENT",
    "BEGIN:VEVENT", "UID:d2l-2", "SUMMARY:Quiz 3 - Available", "DTSTART:20261019T080000", "DTEND:20261019T080000", "END:VEVENT",
    // Canvas: an all-day assignment with the course in brackets
    "BEGIN:VEVENT", "UID:event-assignment-881", "SUMMARY:Essay 1 [ENG-101-01 Fall 2026]", "DTSTART;VALUE=DATE:20261023", "DTEND;VALUE=DATE:20261024", "END:VEVENT",
    // A class and an exam stay on the calendar
    "BEGIN:VEVENT", "UID:class-1", "SUMMARY:CHEM 201 Lecture", "DTSTART:20261019T100000", "DTEND:20261019T111500", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "END:VEVENT",
    "BEGIN:VEVENT", "UID:exam-1", "SUMMARY:Midterm Exam", "DTSTART:20261028T130000", "DTEND:20261028T150000", "END:VEVENT",
    // Already past: never imported
    "BEGIN:VEVENT", "UID:old-1", "SUMMARY:Homework 1 due", "DTSTART;VALUE=DATE:20261001", "DTEND;VALUE=DATE:20261002", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("keeps classes on the calendar and turns deadlines into assignments", () => {
    const { events, assignments } = splitCourseFeed(parseICS(feed, "c1"));
    expect(events.map((e) => e.uid).sort()).toEqual(["class-1", "exam-1"]);
    expect(assignments.map((a) => a.title)).toEqual(["Lab Report 2", "Essay 1", "Homework 1"]);
    expect(assignments[0]).toMatchObject({ course: "CHEM 201", due: "2026-10-20", time: 23 * 60 + 59 });
    expect(assignments[1]).toMatchObject({ course: "ENG 101", due: "2026-10-23", time: null });
  });

  it("adds each assignment once, the day before it's due, and follows date changes", () => {
    const { assignments } = splitCourseFeed(parseICS(feed, "c1"));
    const first = reconcileAssignments([], assignments, [], TODAY);
    expect(first.add.map((a) => a.uid)).toEqual(["d2l-1", "event-assignment-881"]);
    expect(plannedDay("2026-10-20", TODAY)).toBe("2026-10-19");
    expect(plannedDay("2026-10-16", TODAY)).toBe(TODAY);

    // Deleted by you: stays gone on the next sync.
    expect(reconcileAssignments([], assignments, first.imported, TODAY).add).toEqual([]);

    // The teacher moves the deadline: the task moves with it.
    const t = task({ id: "a", title: "Lab Report 2", due: "2026-10-20", date: "2026-10-19", sourceRef: courseRef("d2l-1") });
    const moved = assignments.map((a) => (a.uid === "d2l-1" ? { ...a, due: "2026-10-22" } : a));
    const next = reconcileAssignments([t], moved, first.imported, TODAY);
    expect(next.update).toEqual([{ id: "a", patch: { due: "2026-10-22", date: "2026-10-21", notes: "Due 11:59 PM · CHEM 201" } }]);
  });

  it("spots LMS links", () => {
    expect(looksLikeCourseFeed("https://mnsu.learn.minnstate.edu/d2l/le/calendar/feed/user/feed.ics?token=x")).toBe(true);
    expect(looksLikeCourseFeed("https://school.instructure.com/feeds/calendars/user_abc.ics")).toBe(true);
    expect(looksLikeCourseFeed("https://calendar.google.com/calendar/ical/x/basic.ics")).toBe(false);
  });
});

describe("plan my day", () => {
  it("offers deadlines in the next few days first, then a few backlog items", () => {
    const tasks = [
      task({ id: "soon", title: "Essay", date: "2026-10-18", due: "2026-10-18" }),
      task({ id: "later", title: "Project", date: "2026-10-30", due: "2026-10-30" }),
      task({ id: "today", title: "Already today", due: "2026-10-17" }),
      task({ id: "idea", title: "Read a book", someday: true, createdAt: 2 }),
      task({ id: "done", title: "Old", someday: true, done: true }),
    ];
    expect(planCandidates(tasks, TODAY).map((p) => `${p.group}:${p.task.id}`)).toEqual(["due:soon", "backlog:idea"]);
  });
});
