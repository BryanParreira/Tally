import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CalendarPlus, Layers, Plus, Sparkles, Trash2, X } from "lucide-react";
import { CheckButton } from "../components/ui";
import { addDays, daysBetween, formatLongDate } from "../lib/date";
import { useToast } from "../lib/hooks";
import { cardsFromNotes, dueCards, reviewCard, topicsForToday, type CardDraft, type Grade } from "../lib/study";
import { today, uid, useStore } from "../lib/store";
import { useNav } from "../lib/nav";
import type { Course } from "../lib/types";

export function StudyView() {
  const courses = useStore((s) => s.courses);
  const [selected, setSelected] = useState<string | null>(courses[0]?.id ?? null);
  const [creating, setCreating] = useState(courses.length === 0);
  const target = useNav((s) => s.target);
  useEffect(() => {
    if (target?.kind === "course") {
      setSelected(target.id);
      setCreating(false);
    }
  }, [target]);
  const course = courses.find((c) => c.id === selected) ?? courses[0];
  const d = today();

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Study</p>
          <h1 className="title">Ready for every exam</h1>
          <p className="subtitle">Add a course and its exam date. Kindred spreads the work across your days and quizzes you just before you'd forget.</p>
        </div>
        {!creating && (
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> New course
          </button>
        )}
      </header>

      <div className="study-grid">
        <nav className="stack" style={{ gap: 8 }} aria-label="Courses">
          {courses.map((c) => {
            const done = c.topics.filter((t) => t.done).length;
            const days = daysBetween(d, c.examDate);
            return (
              <button
                key={c.id}
                type="button"
                className="course-btn"
                aria-current={course?.id === c.id && !creating}
                onClick={() => {
                  setSelected(c.id);
                  setCreating(false);
                }}
              >
                <span className="name">{c.name}</span>
                <span className="muted small">{days > 0 ? `Exam in ${days} ${days === 1 ? "day" : "days"}` : days === 0 ? "Exam today" : "Exam passed"}</span>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: `${c.topics.length ? (done / c.topics.length) * 100 : 0}%` }} />
                </span>
              </button>
            );
          })}
          {courses.length === 0 && !creating && <p className="muted small">No courses yet.</p>}
        </nav>

        <div>
          {creating ? (
            <NewCourse
              onDone={(id) => {
                setCreating(false);
                if (id) setSelected(id);
              }}
              canCancel={courses.length > 0}
            />
          ) : course ? (
            <CourseDetail key={course.id} course={course} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function NewCourse({ onDone, canCancel }: { onDone: (id: string | null) => void; canCancel: boolean }) {
  const [name, setName] = useState("");
  const [exam, setExam] = useState(addDays(today(), 14));
  const [minutes, setMinutes] = useState(60);
  const [topics, setTopics] = useState("");
  const addCourse = useStore((s) => s.addCourse);
  const toast = useToast((s) => s.show);
  const ready = name.trim() && exam && topics.trim();

  return (
    <div className="card" style={{ padding: 26 }}>
      <h2 className="section" style={{ fontSize: 15, color: "var(--ink)" }}>
        <BookOpen size={16} /> New course
      </h2>
      <div className="stack" style={{ gap: 16 }}>
        <div className="field">
          <label htmlFor="course-name">Course name</label>
          <input id="course-name" className="input" placeholder="Biology 201" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="row wrap" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="course-exam">Exam date</label>
            <input id="course-exam" className="input" type="date" value={exam} min={today()} onChange={(e) => setExam(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="course-minutes">Study time per day</label>
            <select id="course-minutes" className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} minutes` : `${m / 60} ${m === 60 ? "hour" : "hours"}`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="course-topics">Topics or chapters, one per line</label>
          <textarea id="course-topics" className="input" placeholder={"Chapter 1: Cells\nChapter 2: Membranes\nChapter 3: Metabolism"} value={topics} onChange={(e) => setTopics(e.target.value)} />
          <p className="hint">Tip: paste the list straight from your syllabus.</p>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            disabled={!ready}
            onClick={() => {
              const list = topics
                .split(/\r?\n/)
                .map((t) => t.replace(/^[-*•\d.)\s]+/, "").trim())
                .filter(Boolean);
              addCourse({ name: name.trim(), examDate: exam, minutesPerDay: minutes, topics: list.map((t) => ({ id: uid(), name: t, done: false })) });
              toast("Course added");
              onDone(useStore.getState().courses.at(-1)?.id ?? null);
            }}
          >
            Create course
          </button>
          {canCancel && (
            <button type="button" className="btn ghost" onClick={() => onDone(null)}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CourseDetail({ course }: { course: Course }) {
  const d = today();
  const allCards = useStore((s) => s.cards);
  const { toggleTopic, planStudyToday, deleteCourse } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [mode, setMode] = useState<"overview" | "review" | "notes">("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cards = useMemo(() => allCards.filter((c) => c.courseId === course.id), [allCards, course.id]);
  const due = useMemo(() => dueCards(cards, d), [cards, d]);
  const { topics: todays, daysLeft } = topicsForToday(course, d);
  const done = course.topics.filter((t) => t.done).length;

  if (mode === "review") return <Review courseId={course.id} onExit={() => setMode("overview")} />;
  if (mode === "notes") return <NotesToCards courseId={course.id} onExit={() => setMode("overview")} />;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card" style={{ padding: 22 }}>
        <div className="row wrap" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 22, letterSpacing: "-0.02em" }}>{course.name}</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              Exam on {formatLongDate(course.examDate)} · {done} of {course.topics.length} topics covered
            </p>
          </div>
          {confirmDelete ? (
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm danger" onClick={() => deleteCourse(course.id)}>
                Delete course and cards
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" className="icon-btn" aria-label="Delete course" title="Delete course" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} />
            </button>
          )}
        </div>
        <div className="bar" style={{ margin: "16px 0 18px" }} aria-hidden="true">
          <span style={{ width: `${course.topics.length ? (done / course.topics.length) * 100 : 0}%` }} />
        </div>
        <div className="suggest" style={{ marginTop: 0 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="what">{todays.length ? `Today: ${todays.map((t) => t.name).join(", ")}` : daysLeft < 0 ? "This exam is behind you" : "Every topic is covered. Review time"}</div>
            <div className="why">
              {todays.length ? `Staying on this pace covers everything ${daysLeft > 1 ? "with a day to spare for review" : "in time"}.` : "Keep your flashcards going until the exam."}
            </div>
          </div>
          <button
            type="button"
            className="btn primary sm"
            onClick={() => {
              const n = planStudyToday(course.id);
              toast(n ? `Added ${n} study ${n === 1 ? "block" : "blocks"} to today` : "Today's study is already planned");
            }}
          >
            <CalendarPlus size={14} /> Plan today's study
          </button>
        </div>
      </section>

      <div className="row wrap" style={{ alignItems: "stretch", gap: 16 }}>
        <section className="card pad" style={{ flex: "1 1 300px" }} aria-label="Topics">
          <h2 className="section">Topics</h2>
          <div>
            {course.topics.map((t) => (
              <div className={`topic${t.done ? " done" : ""}`} key={t.id}>
                <CheckButton checked={t.done} label={`${t.name} covered`} onToggle={() => toggleTopic(course.id, t.id)} />
                <span>{t.name}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card pad" style={{ flex: "1 1 260px", display: "flex", flexDirection: "column" }} aria-label="Flashcards">
          <h2 className="section">
            <Layers size={14} /> Flashcards
          </h2>
          <div className="countdown" style={{ fontSize: 34 }}>
            {due.length}
          </div>
          <p className="muted small" style={{ margin: "2px 0 16px" }}>
            {due.length === 1 ? "card" : "cards"} to review today · {cards.length} in total
          </p>
          <div className="row wrap" style={{ marginTop: "auto" }}>
            <button type="button" className="btn primary sm" disabled={!due.length} onClick={() => setMode("review")}>
              Start review
            </button>
            <button type="button" className="btn sm" onClick={() => setMode("notes")}>
              <Sparkles size={14} /> Make from notes
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function NotesToCards({ courseId, onExit }: { courseId: string; onExit: () => void }) {
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<CardDraft[] | null>(null);
  const addCards = useStore((s) => s.addCards);
  const toast = useToast((s) => s.show);

  return (
    <section className="card" style={{ padding: 24 }}>
      <div className="row">
        <h2 className="section" style={{ fontSize: 15, color: "var(--ink)", margin: 0 }}>
          <Sparkles size={16} /> Flashcards from your notes
        </h2>
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label="Close" onClick={onExit}>
          <X size={16} />
        </button>
      </div>
      {drafts === null ? (
        <div className="stack" style={{ marginTop: 16 }}>
          <label htmlFor="notes" className="sr-only">
            Notes
          </label>
          <textarea
            id="notes"
            className="input"
            style={{ minHeight: 220 }}
            placeholder={"Paste your notes here. Kindred understands lines like:\n\nMitochondria: the powerhouse of the cell\nATP - the cell's energy currency\nQ: What does glycolysis produce?\nA: Pyruvate and 2 ATP"}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="row">
            <button type="button" className="btn primary" disabled={!notes.trim()} onClick={() => setDrafts(cardsFromNotes(notes))}>
              Make flashcards
            </button>
            <p className="hint">Runs on this computer. Nothing is uploaded.</p>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 16 }}>
          {drafts.length === 0 ? (
            <p className="muted">
              No cards found. Try lines like <strong>Term: definition</strong> or <strong>Q: … / A: …</strong>.
            </p>
          ) : (
            <div className="list">
              {drafts.map((c, i) => (
                <div className="list-item" key={i} style={{ alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{c.front}</div>
                    <div className="muted small">{c.back}</div>
                  </div>
                  <button type="button" className="icon-btn" aria-label="Remove card" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={!drafts.length}
              onClick={() => {
                addCards(drafts, courseId);
                toast(`Added ${drafts.length} ${drafts.length === 1 ? "card" : "cards"}`);
                onExit();
              }}
            >
              Add {drafts.length} {drafts.length === 1 ? "card" : "cards"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setDrafts(null)}>
              Back to notes
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: "again", label: "Again", key: "1" },
  { grade: "hard", label: "Hard", key: "2" },
  { grade: "good", label: "Good", key: "3" },
  { grade: "easy", label: "Easy", key: "4" },
];

function Review({ courseId, onExit }: { courseId: string; onExit: () => void }) {
  const d = today();
  const cards = useStore((s) => s.cards);
  const gradeCard = useStore((s) => s.gradeCard);
  // Freeze the queue when the session starts so graded cards don't reshuffle it.
  const [queue] = useState(() => dueCards(cards.filter((c) => c.courseId === courseId), d).map((c) => c.id));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const stage = useRef<HTMLElement>(null);
  useEffect(() => stage.current?.focus(), []);
  const card = cards.find((c) => c.id === queue[index]);

  if (!card) {
    return (
      <section className="card" style={{ padding: 40, textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", margin: "0 0 6px" }}>Session complete</h2>
        <p className="muted" style={{ margin: "0 0 18px" }}>
          You reviewed {queue.length} {queue.length === 1 ? "card" : "cards"}. They'll come back right before you'd forget them.
        </p>
        <button type="button" className="btn primary" onClick={onExit}>
          Done
        </button>
      </section>
    );
  }

  const grade = (g: Grade) => {
    gradeCard(card.id, g);
    setFlipped(false);
    setIndex(index + 1);
  };

  return (
    <section
      aria-label="Flashcard review"
      tabIndex={-1}
      ref={stage}
      style={{ outline: "none" }}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          setFlipped(!flipped);
        }
        const g = GRADES.find((x) => x.key === e.key);
        if (g && flipped) grade(g.grade);
        if (e.key === "Escape") onExit();
      }}
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted small tabular">
          {index + 1} of {queue.length}
        </span>
        <span className="spacer" />
        <button type="button" className="btn ghost sm" onClick={onExit}>
          End session
        </button>
      </div>
      <div className="flash-stage">
        <button type="button" className={`flash${flipped ? " flipped" : ""}`} onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Show question" : "Show answer"}>
          <span className="face front">
            {card.front}
            <small>Click or press Space to see the answer</small>
          </span>
          <span className="face back">
            {card.back}
            <small>How well did you know it?</small>
          </span>
        </button>
      </div>
      <div className="grades" style={{ visibility: flipped ? "visible" : "hidden" }}>
        {GRADES.map((g) => {
          const next = reviewCard(card, g.grade, d);
          return (
            <button key={g.grade} type="button" className="btn" onClick={() => grade(g.grade)}>
              {g.label}
              <small>{next.interval === 0 ? "today" : next.interval === 1 ? "tomorrow" : `in ${next.interval} days`}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
