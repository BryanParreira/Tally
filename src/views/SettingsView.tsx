import { useEffect, useState } from "react";
import { CalendarDays, RefreshCw, Trash2 } from "lucide-react";
import { syncCalendar } from "../lib/calendarSync";
import { relativeTime } from "../lib/hooks";
import { isMac, dataLocation, eraseAllData, mailForget, setNowBarVisible, showNotice } from "../lib/native";
import { timeOptions, useToast } from "../lib/hooks";
import { emptyData, useStore } from "../lib/store";
import { Segmented, Switch } from "../components/ui";
import type { Settings } from "../lib/types";

const TIMES = timeOptions(30);

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const name = useStore((s) => s.name);
  const account = useStore((s) => s.mail.account);
  const { updateSettings, setName, setMailAccount, replaceData } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [location, setLocation] = useState("");
  const [confirmErase, setConfirmErase] = useState(false);

  useEffect(() => {
    dataLocation().then(setLocation).catch(() => setLocation("Unknown"));
  }, []);

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="title">Make it yours</h1>
        </div>
      </header>

      <div className="stack" style={{ gap: 16 }}>
        <section className="card settings-section" aria-label="You">
          <div className="setting">
            <div>
              <div className="name">Your name</div>
              <div className="desc">Used in greetings and email replies.</div>
            </div>
            <label htmlFor="set-name" className="sr-only">
              Your name
            </label>
            <input id="set-name" className="input" style={{ width: 220 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
        </section>

        <section className="card settings-section" aria-label="Your day">
          <h2 className="section">Your day</h2>
          <div className="setting">
            <div>
              <div className="name">Day starts and ends</div>
              <div className="desc">Kindred only plans tasks inside these hours.</div>
            </div>
            <div className="row">
              <TimeSelect label="Day starts" value={settings.dayStart} onChange={(v) => updateSettings({ dayStart: Math.min(v, settings.dayEnd - 60) })} />
              <span className="muted">to</span>
              <TimeSelect label="Day ends" value={settings.dayEnd} onChange={(v) => updateSettings({ dayEnd: Math.max(v, settings.dayStart + 60) })} />
            </div>
          </div>
          <div className="setting">
            <div>
              <div className="name">Breaks</div>
              <div className="desc">A short break gets added after this much back-to-back work.</div>
            </div>
            <Segmented
              label="Break rhythm"
              value={String(settings.breakEvery)}
              onChange={(v) => updateSettings({ breakEvery: Number(v) })}
              options={[
                { value: "60", label: "60 min" },
                { value: "90", label: "90 min" },
                { value: "120", label: "2 h" },
                { value: "1440", label: "Off" },
              ]}
            />
          </div>
        </section>

        <section className="card settings-section" aria-label="Appearance">
          <h2 className="section">Appearance</h2>
          <div className="setting">
            <div>
              <div className="name">Theme</div>
            </div>
            <Segmented<Settings["theme"]>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </div>
          <div className="setting">
            <div>
              <div className="name">Now Bar</div>
              <div className="desc">A small floating bar that shows what to do right now, on top of any app.</div>
            </div>
            <Switch
              label="Show the Now Bar"
              checked={settings.nowBar}
              onChange={(nowBar) => {
                updateSettings({ nowBar });
                setNowBarVisible(nowBar);
              }}
            />
          </div>
          <div className="setting">
            <div>
              <div className="name">Reminders</div>
              <div className="desc">A small Kindred card in the corner of your screen when a task begins or a focus session ends.</div>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn ghost sm"
                onClick={async () => {
                  const shown = await showNotice({
                    id: `preview:${Date.now()}`,
                    kind: "up-next",
                    title: "Study bio chapter 4",
                    body: "Until 11:45 AM · 1 h. Then Lunch.",
                    taskId: "",
                  }).catch(() => false);
                  if (!shown) toast("Reminders appear in the desktop app");
                }}
              >
                Preview
              </button>
              <Switch label="Reminders" checked={settings.reminders} onChange={(reminders) => updateSettings({ reminders })} />
            </div>
          </div>
          <div className="setting">
            <div>
              <div className="name">Quick capture</div>
              <div className="desc">Open Kindred and start typing from anywhere.</div>
            </div>
            <span className="row" style={{ gap: 4 }}>
              <span className="kbd">{isMac ? "⌘" : "Ctrl"}</span>
              <span className="kbd">{isMac ? "⇧" : "Shift"}</span>
              <span className="kbd">Space</span>
            </span>
          </div>
        </section>

        <Calendars />

        <section className="card settings-section" aria-label="Email">
          <h2 className="section">Email</h2>
          <div className="setting">
            <div>
              <div className="name">{account ? account.username : "Not connected"}</div>
              <div className="desc">{account ? `Signed in through ${account.host}. The app password is in your system keychain.` : "Connect from the Inbox tab."}</div>
            </div>
            {account && (
              <button
                type="button"
                className="btn sm danger"
                onClick={async () => {
                  await mailForget(account).catch(() => undefined);
                  setMailAccount(null);
                  toast("Email disconnected");
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        </section>

        <section className="card settings-section" aria-label="Privacy and data">
          <h2 className="section">Privacy & data</h2>
          <div className="setting">
            <div>
              <div className="name">Everything stays on this computer</div>
              <div className="desc">Kindred has no account, no cloud and no tracking. Your plan is saved here:</div>
              <div className="small" style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", wordBreak: "break-all", userSelect: "text" }}>
                {location}
              </div>
            </div>
          </div>
          <div className="setting">
            <div>
              <div className="name">Erase everything</div>
              <div className="desc">Deletes all tasks, courses, flashcards and email data from this computer.</div>
            </div>
            {confirmErase ? (
              <div className="row">
                <button
                  type="button"
                  className="btn sm danger"
                  onClick={async () => {
                    if (account) await mailForget(account).catch(() => undefined);
                    await eraseAllData();
                    replaceData(emptyData());
                    setConfirmErase(false);
                  }}
                >
                  Yes, erase it all
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirmErase(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="btn sm danger" onClick={() => setConfirmErase(true)}>
                Erase…
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Calendars() {
  const calendars = useStore((s) => s.calendars);
  const { addCalendar, removeCalendar } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = async (id: string) => {
    const cal = useStore.getState().calendars.find((c) => c.id === id);
    if (!cal) return;
    setBusy(id);
    try {
      const n = await syncCalendar(cal);
      toast(`${cal.name}: ${n} ${n === 1 ? "event" : "events"} synced`);
    } catch {
      /* the error shows on the calendar row */
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card settings-section" aria-label="Calendars">
      <h2 className="section">Calendars</h2>
      <div className="setting" style={{ borderTop: 0 }}>
        <div>
          <div className="name">Plan around your classes and meetings</div>
          <div className="desc">
            Paste your calendar's private iCal link. Kindred downloads it directly from your calendar provider and never plans tasks on top of your events, including weekly
            classes.
          </div>
        </div>
      </div>
      {calendars.map((c) => (
        <div className="setting" key={c.id}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="name row" style={{ gap: 8 }}>
              <span className="dot" style={{ background: c.color }} aria-hidden="true" />
              {c.name}
            </div>
            <div className={`desc${c.error ? " error" : ""}`}>{c.error ?? (c.lastSync ? `Synced ${relativeTime(c.lastSync)}` : "Not synced yet")}</div>
          </div>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => sync(c.id)} disabled={busy === c.id}>
              <RefreshCw size={13} className={busy === c.id ? "spin" : undefined} /> Sync
            </button>
            <button type="button" className="icon-btn" aria-label={`Remove ${c.name}`} title="Remove" onClick={() => removeCalendar(c.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}
      <div className="setting" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ width: 170 }}>
          <label htmlFor="cal-name">Name</label>
          <input id="cal-name" className="input" placeholder="Classes" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 220 }}>
          <label htmlFor="cal-url">iCal link</label>
          <input id="cal-url" className="input" placeholder="https://… .ics or webcal://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={!url.trim()}
          onClick={async () => {
            setError(null);
            const cal = addCalendar(name, url);
            setName("");
            setUrl("");
            await sync(cal.id).catch(() => setError("Couldn't sync that calendar"));
          }}
        >
          <CalendarDays size={15} /> Add
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <details className="cal-help">
        <summary>Where do I find my iCal link?</summary>
        <ul>
          <li>
            <strong>Google Calendar:</strong> Settings → pick your calendar → Integrate calendar → <em>Secret address in iCal format</em>.
          </li>
          <li>
            <strong>iCloud:</strong> Calendar app → right-click a calendar → Share → <em>Public Calendar</em> → copy the webcal link.
          </li>
          <li>
            <strong>Outlook:</strong> Settings → Calendar → Shared calendars → <em>Publish a calendar</em> → copy the ICS link.
          </li>
          <li>
            <strong>School portals</strong> (Canvas, Moodle, Blackboard) usually offer a "Calendar feed" link too.
          </li>
        </ul>
      </details>
    </section>
  );
}

export function TimeSelect({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <select className="input" style={{ width: 120 }} aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {TIMES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
