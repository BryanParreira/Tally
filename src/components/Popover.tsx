import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

interface Place {
  top: number;
  left: number;
  up: boolean;
}

/** A button that opens a small floating panel. Closes on Escape or a click outside. */
export function Popover({ trigger, label, className, children, width = 220 }: { trigger: ReactNode; label: string; className?: string; children: (close: () => void) => ReactNode; width?: number }) {
  const [place, setPlace] = useState<Place | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => {
    setPlace(null);
    button.current?.focus();
  };

  const toggle = () => {
    if (place) return setPlace(null);
    const r = button.current!.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 280 && r.top > 280;
    setPlace({ top: up ? r.top - 4 : r.bottom + 4, left: Math.min(r.left, window.innerWidth - width - 12), up });
  };

  useEffect(() => {
    if (!place) return;
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setPlace(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [place]);

  return (
    <>
      <button ref={button} type="button" className={`chip-btn${place ? " is-open" : ""}${className ? ` ${className}` : ""}`} aria-haspopup="listbox" aria-expanded={!!place} aria-label={label} onClick={toggle}>
        {trigger}
      </button>
      {place && (
        <div ref={panel} className="pop-menu" style={{ left: place.left, width, ...(place.up ? { bottom: window.innerHeight - place.top } : { top: place.top }) }}>
          {children(close)}
        </div>
      )}
    </>
  );
}

export interface Option<T extends string | number> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

/** A list of choices with arrow-key movement, Enter to pick, and typing to filter when it is long. */
export function OptionList<T extends string | number>({ options, value, onPick, searchable }: { options: Option<T>[]; value: T; onPick: (v: T) => void; searchable?: boolean }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const shown = options.filter((o) => !query || o.label.toLowerCase().includes(query.toLowerCase()));

  useLayoutEffect(() => {
    const i = Math.max(0, options.findIndex((o) => o.value === value));
    setActive(i);
  }, []);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, query]);
  useEffect(() => setActive(0), [query]);
  // Without a search box, the list itself takes the keys.
  useEffect(() => {
    if (!searchable) root.current?.focus();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(shown.length - 1, a + 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
    else if (e.key === "Enter" && shown[active]) (e.preventDefault(), onPick(shown[active].value));
  };

  return (
    <div ref={root} tabIndex={-1} className="pop-root" onKeyDown={onKey}>
      {searchable && <input className="pop-search" autoFocus placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />}
      <div ref={list} className="pop-list" role="listbox">
        {shown.map((o, i) => (
          <div
            key={String(o.value)}
            role="option"
            aria-selected={o.value === value}
            data-active={i === active}
            className="pop-item"
            onMouseMove={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(o.value);
            }}
          >
            {o.icon && <span className="pop-icon">{o.icon}</span>}
            <span className="truncate">{o.label}</span>
            {o.hint && <span className="pop-hint">{o.hint}</span>}
            {o.value === value && <Check size={13} className="pop-check" aria-hidden="true" />}
          </div>
        ))}
        {shown.length === 0 && <div className="pop-empty">No matches</div>}
      </div>
    </div>
  );
}
