import { useEffect, useId, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { fade, pop, spring } from "../lib/motion";
import type { Category } from "../lib/types";
import { useToast } from "../lib/hooks";

export const CATEGORY_LABEL: Record<Category, string> = { study: "Study", work: "Work", life: "Life" };

export function Logo({ size = 26 }: { size?: number }) {
  // The app icon itself: the day as time blocks, the current one checked.
  return <img className="logo" src={size < 40 ? "/logo-small.svg" : "/logo.svg"} width={size} height={size} alt="" aria-hidden="true" style={{ borderRadius: size * 0.22 }} />;
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
    <motion.button type="button" className="check" role="checkbox" aria-checked={checked} aria-label={label} onClick={onToggle} whileTap={{ scale: 0.82 }} transition={spring}>
      <motion.span initial={false} animate={{ scale: checked ? 1 : 0.4, opacity: checked ? 1 : 0 }} transition={pop} style={{ display: "grid" }}>
        <Check size={12} strokeWidth={3.2} />
      </motion.span>
    </motion.button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

/** A choice of a few options; the highlight slides to the one you pick. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const id = useId();
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${id}`} className="seg-thumb" transition={spring} />}
          <span className="seg-label">{o.label}</span>
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
    <motion.div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={pop}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function Toast() {
  const message = useToast((s) => s.message);
  const action = useToast((s) => s.action);
  const dismiss = useToast((s) => s.dismiss);
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message}
          className="toast"
          role="status"
          style={{ x: "-50%" }}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98, transition: fade }}
          transition={pop}
        >
          <span className="tick" aria-hidden="true">
            <Check size={12} strokeWidth={3} />
          </span>
          {message}
          {action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                action.run();
                dismiss();
              }}
            >
              {action.label}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\s]/gu, "")
    .trim()
    .split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const AVATAR_HUES = [211, 262, 330, 14, 32, 142, 172, 190];

/** A round initial in a soft colour that's always the same for the same person. */
export function Avatar({ name, size = 30, icon }: { name: string; size?: number; icon?: ReactNode }) {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = AVATAR_HUES[h % AVATAR_HUES.length];
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, ["--hue" as string]: hue }} aria-hidden="true">
      {icon ?? initials(name)}
    </span>
  );
}
