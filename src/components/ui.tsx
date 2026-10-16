import { useEffect, type ReactNode } from "react";
import { Check } from "lucide-react";
import type { Category } from "../lib/types";
import { useToast } from "../lib/hooks";

export const CATEGORY_LABEL: Record<Category, string> = { study: "Study", work: "Work", life: "Life" };

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size, borderRadius: size * 0.31 }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M4 15c2.5 0 3.5-6 6-6s3.5 6 6 6 3-3 4-3" />
      </svg>
    </span>
  );
}

export function CategoryTag({ category }: { category: Category }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className={`dot ${category}`} />
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function CheckButton({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className="check" role="checkbox" aria-checked={checked} aria-label={label} onClick={onToggle}>
      <Check size={13} strokeWidth={3} />
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ onClose, children, labelledBy }: { onClose: () => void; children: ReactNode; labelledBy: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}

export function Toast() {
  const message = useToast((s) => s.message);
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span className="tick" aria-hidden="true">
        <Check size={12} strokeWidth={3} />
      </span>
      {message}
    </div>
  );
}

export function Ring({ progress, size = 84 }: { progress: number; size?: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  return (
    <svg className="ring" style={{ width: size, height: size }} viewBox="0 0 84 84" aria-hidden="true">
      <circle className="track" cx="42" cy="42" r={r} />
      <circle className="bar" cx="42" cy="42" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
    </svg>
  );
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
