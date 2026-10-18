import { describe, expect, it } from "vitest";
import { recallFor, rank, tokens, type Doc } from "./search";

const docs: Doc[] = [
  { kind: "email", id: "e1", title: "Quarterly budget", text: "Quarterly budget. Sam Rivera: please send the budget spreadsheet before Friday" },
  { kind: "note", id: "n1", title: "Bio lecture", text: "Bio lecture. Mitochondria produce ATP; exam covers chapters 4 to 6" },
  { kind: "task", id: "t1", title: "Call the dentist", text: "Call the dentist" },
];

describe("local recall", () => {
  it("drops filler words", () => {
    expect(tokens("What did Sam ask me for?")).toEqual(["sam", "ask"]);
  });
  it("finds the email a question is about", () => {
    expect(rank("what did Sam ask for", docs)[0].id).toBe("e1");
  });
  it("matches plurals and titles", () => {
    expect(rank("dentists", docs)[0].id).toBe("t1");
  });
  it("shows the passage around the match", () => {
    const [r] = recallFor("which chapters does the exam cover", docs);
    expect(r.hit.id).toBe("n1");
    expect(r.excerpt).toContain("chapters 4 to 6");
  });
  it("stays quiet when nothing matches well", () => {
    expect(recallFor("what is the capital of France", docs)).toEqual([]);
    expect(recallFor("explain budget chapters dentist", docs, 3).every((r) => r.hit.matched >= 2)).toBe(true);
  });
});
