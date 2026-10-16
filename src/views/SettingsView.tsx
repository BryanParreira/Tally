import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink, Lock, RefreshCw, Trash2, Upload } from "lucide-react";
import { connectCalDav, importIcsFile, syncCalendar } from "../lib/calendarSync";
import { CALDAV_PRESETS } from "../lib/caldav";
import { relativeTime } from "../lib/hooks";
import { caldavForget, isDesktop, isMac, dataLocation, eraseAllData, mailForget, openExternal, revealFile, saveBackup, setNowBarVisible, showNotice } from "../lib/native";
import { timeOptions, useToast } from "../lib/hooks";
import { emptyData, exportData, parseBackup, useStore } from "../lib/store";
import { Modal, Segmented, Switch } from "../components/ui";
import { ConnectForm } from "./InboxView";
import type { Settings } from "../lib/types";

const TIMES = timeOptions(30);

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const name = useStore((s) => s.name);
  const accounts = useStore((s) => s.mail.accounts);
  const [addingInbox, setAddingInbox] = useState(false);
  const { updateSettings, setName, removeMailAccount, replaceData } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [location, setLocation] = useState("");
  const [confirmErase, setConfirmErase] = useState(false);
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [restore, setRestore] = useState<{ name: string; text: string } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const calendars = useStore((s) => s.calendars);

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
          {accounts.map((a) => (
            <div className="setting" key={a.id}>
              <div>
                <div className="name row" style={{ gap: 8 }}>
                  <span className="dot" style={{ background: a.color }} aria-hidden="true" />
                  {a.username}
                </div>
                <div className="desc">Signed in through {a.host}. The app password is in your system keychain.</div>
              </div>
              <button
                type="button"
                className="btn sm danger"
                onClick={async () => {
                  await mailForget(a).catch(() => undefined);
                  removeMailAccount(a.id);
                  toast(`${a.username} disconnected`);
                }}
              >
                Disconnect
              </button>
            </div>
          ))}
          <div className="setting">
            <div>
              <div className="name">{accounts.length ? "Add another inbox" : "Connect your email"}</div>
              <div className="desc">Personal, school and work accounts all flow into one Inbox, each with its own colour.</div>
            </div>
            <button type="button" className="btn sm" onClick={() => setAddingInbox(true)}>
              Add inbox
            </button>
          </div>
        </section>
        {addingInbox && (
          <Modal onClose={() => setAddingInbox(false)} labelledBy="connect-title">
            <ConnectForm onDone={() => setAddingInbox(false)} />
          </Modal>
        )}

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
              <div className="name">What Kindred connects to</div>
              <div className="desc">Only what you set up. Nothing else, ever: no analytics, no crash reports, no Kindred servers.</div>
              <ul className="connect-list">
                <li>{accounts.length ? `Your email servers (${[...new Set(accounts.map((a) => a.host))].join(", ")}), to read recent mail` : "Email: not connected"}</li>
                <li>{calendars.some((c) => c.kind !== "file") ? `Your calendars (${calendars.filter((c) => c.kind !== "file").map((c) => c.name).join(", ")}), every 30 minutes` : "Calendars: none connected"}</li>
              </ul>
            </div>
          </div>
          <div className="setting">
            <div>
              <div className="name">Back up</div>
              <div className="desc">Save everything to a file you control: tasks, notes, snippets, calendars and settings. Email passwords are never included.</div>
              {backupPath && (
                <div className="small" style={{ marginTop: 6 }}>
                  Saved to <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", wordBreak: "break-all" }}>{backupPath}</span>{" "}
                  <button type="button" className="btn ghost sm" style={{ height: 22 }} onClick={() => revealFile(backupPath)}>
                    Show
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn sm"
              onClick={async () => {
                try {
                  const path = await saveBackup(exportData());
                  setBackupPath(path);
                  toast("Backup saved");
                } catch {
                  toast("Couldn't save the backup");
                }
              }}
            >
              Export backup
            </button>
          </div>
          <div className="setting">
            <div>
              <div className="name">Restore</div>
              <div className="desc">Replace what's here with a Kindred backup file.</div>
              {restoreError && (
                <p className="error" role="alert" style={{ margin: "6px 0 0" }}>
                  {restoreError}
                </p>
              )}
            </div>
            {restore ? (
              <div className="row">
                <button
                  type="button"
                  className="btn sm danger"
                  onClick={() => {
                    try {
                      replaceData(parseBackup(restore.text));
                      toast("Backup restored");
                    } catch (err) {
                      setRestoreError(err instanceof Error ? err.message : String(err));
                    }
                    setRestore(null);
                  }}
                >
                  Replace with {restore.name}
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setRestore(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <label className="btn sm" style={{ cursor: "pointer" }}>
                Choose file…
                <input
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setRestoreError(null);
                    const text = await file.text();
                    try {
                      parseBackup(text);
                      setRestore({ name: file.name, text });
                    } catch (err) {
                      setRestoreError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                />
              </label>
            )}
          </div>
          <div className="setting">
            <div>
              <div className="name">Erase everything</div>
              <div className="desc">Deletes all tasks, notes, calendars and email data from this computer.</div>
            </div>
            {confirmErase ? (
              <div className="row">
                <button
                  type="button"
                  className="btn sm danger"
                  onClick={async () => {
                    for (const a of accounts) await mailForget(a).catch(() => undefined);
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
  const calAccounts = useStore((s) => s.calAccounts);
  const { addCalendar, removeCalendar, removeCalAccount } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [mode, setMode] = useState<"account" | "link" | "file">("account");
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

  const row = (c: (typeof calendars)[number]) => (
    <div className="setting cal-row" key={c.id}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="name row" style={{ gap: 8 }}>
          <span className="dot" style={{ background: c.color }} aria-hidden="true" />
          {c.name}
        </div>
        <div className={`desc${c.error ? " error" : ""}`}>
          {c.error ?? (c.kind === "file" ? "Imported file" : c.lastSync ? `Synced ${relativeTime(c.lastSync)}` : "Not synced yet")}
        </div>
      </div>
      <div className="row">
        {c.kind !== "file" && (
          <button type="button" className="btn sm" onClick={() => sync(c.id)} disabled={busy === c.id}>
            <RefreshCw size={13} className={busy === c.id ? "spin" : undefined} /> Sync
          </button>
        )}
        {c.kind !== "caldav" && (
          <button type="button" className="icon-btn" aria-label={`Remove ${c.name}`} title="Remove" onClick={() => removeCalendar(c.id)}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );

  const standalone = calendars.filter((c) => c.kind !== "caldav");

  return (
    <section className="card settings-section" aria-label="Calendars">
      <h2 className="section">Calendars</h2>
      <div className="setting" style={{ borderTop: 0 }}>
        <div>
          <div className="name">Plan around your classes and meetings</div>
          <div className="desc">Kindred reads your calendars directly from your provider and never plans tasks on top of your events. Nothing passes through a Kindred server.</div>
        </div>
      </div>

      {calAccounts.map((acc) => (
        <div key={acc.id} className="cal-account">
          <div className="setting">
            <div>
              <div className="name">{CALDAV_PRESETS.find((p) => p.id === acc.provider)?.label ?? "Calendar account"}</div>
              <div className="desc">{acc.username}</div>
            </div>
            <button
              type="button"
              className="btn sm danger"
              onClick={async () => {
                await caldavForget(acc.id, acc.username).catch(() => undefined);
                removeCalAccount(acc.id);
                toast("Calendar account removed");
              }}
            >
              Disconnect
            </button>
          </div>
          {calendars.filter((c) => c.accountId === acc.id).map(row)}
        </div>
      ))}
      {standalone.map(row)}

      <div className="add-calendar">
        <Segmented
          label="Add a calendar"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: "account", label: "Apple iCloud & CalDAV" },
            { value: "link", label: "Calendar link" },
            { value: "file", label: "Import a file" },
          ]}
        />
        {mode === "account" && <CalDavForm onError={setError} />}
        {mode === "link" && <IcsLinkForm onAdd={async (name, url) => {
          setError(null);
          const cal = addCalendar(name, url, { kind: "ics" });
          await sync(cal.id);
        }} />}
        {mode === "file" && (
          <div className="stack" style={{ gap: 10, marginTop: 14 }}>
            <p className="hint">Export a calendar from Apple Calendar (File → Export), Outlook or any app as an .ics file, then choose it here.</p>
            <label className="btn" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
              <Upload size={15} /> Choose .ics file…
              <input
                type="file"
                accept=".ics,text/calendar"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const n = importIcsFile(file.name, await file.text());
                    toast(`Imported ${n} ${n === 1 ? "event" : "events"}`);
                    setError(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  }
                }}
              />
            </label>
          </div>
        )}
        {error && (
          <p className="error" role="alert" style={{ marginTop: 10 }}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function CalDavForm({ onError }: { onError: (e: string | null) => void }) {
  const [providerId, setProviderId] = useState("icloud");
  const preset = CALDAV_PRESETS.find((p) => p.id === providerId)!;
  const [server, setServer] = useState(preset.server);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast((s) => s.show);
  const custom = providerId === "nextcloud" || providerId === "other";
  const ready = username.trim() && password && /^https:\/\/.+/.test(server);

  return (
    <div className="stack" style={{ gap: 12, marginTop: 14 }}>
      <div className="providers" role="group" aria-label="Calendar provider">
        {CALDAV_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="provider"
            aria-pressed={p.id === providerId}
            onClick={() => {
              setProviderId(p.id);
              setServer(p.server);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="hint">
        {preset.hint}{" "}
        {preset.help && (
          <button type="button" className="btn ghost sm" style={{ height: 22, padding: "0 4px" }} onClick={() => openExternal(preset.help)}>
            Open <ExternalLink size={12} />
          </button>
        )}
      </p>
      {custom && (
        <div className="field">
          <label htmlFor="dav-server">Server address</label>
          <input id="dav-server" className="input" value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://cloud.example.com/remote.php/dav" />
        </div>
      )}
      <div className="row wrap" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="dav-user">{providerId === "icloud" ? "Apple Account email" : "Username"}</label>
          <input id="dav-user" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 200 }}>
          <label htmlFor="dav-pass">App-specific password</label>
          <input id="dav-pass" className="input" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={!ready || busy || !isDesktop}
          onClick={async () => {
            setBusy(true);
            onError(null);
            try {
              const n = await connectCalDav(providerId, server.trim(), username.trim(), password);
              setPassword("");
              toast(`Added ${n} ${n === 1 ? "calendar" : "calendars"}`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              onError(/login/i.test(msg) ? "Sign-in failed. Check the email and use an app-specific password, not your normal one." : msg);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <RefreshCw size={15} className="spin" /> : <Lock size={15} />} {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      {!isDesktop && <p className="hint">Calendar accounts work in the desktop app.</p>}
    </div>
  );
}

function IcsLinkForm({ onAdd }: { onAdd: (name: string, url: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  return (
    <div className="stack" style={{ gap: 10, marginTop: 14 }}>
      <div className="row wrap" style={{ alignItems: "flex-end" }}>
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
            await onAdd(name, url);
            setName("");
            setUrl("");
          }}
        >
          <CalendarDays size={15} /> Add
        </button>
      </div>
      <details className="cal-help">
        <summary>Where do I find my calendar link?</summary>
        <ul>
          <li>
            <strong>Google Calendar:</strong> Settings → your calendar → Integrate calendar → <em>Secret address in iCal format</em>.
          </li>
          <li>
            <strong>Outlook / Microsoft 365:</strong> Settings → Calendar → Shared calendars → <em>Publish a calendar</em> → ICS link.
          </li>
          <li>
            <strong>Proton, Zoho, Notion Calendar and others:</strong> look for "Subscribe", "Share" or "iCal link".
          </li>
          <li>
            <strong>Canvas, Moodle, Blackboard:</strong> look for "Calendar feed".
          </li>
        </ul>
      </details>
    </div>
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
