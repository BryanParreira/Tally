/**
 * One motion language for the whole app: quick, springy and never in the way.
 * Everything respects the system's "reduce motion" setting through MotionConfig.
 */
import type { Transition } from "motion/react";

/** Things that slide into place: highlights, rows, panels. */
export const spring: Transition = { type: "spring", stiffness: 520, damping: 40, mass: 0.7 };

/** Things that pop in: menus, dialogs, toasts. */
export const pop: Transition = { type: "spring", stiffness: 420, damping: 32, mass: 0.8 };

/** Plain fades and page changes. */
export const fade: Transition = { duration: 0.16, ease: [0.2, 0.8, 0.2, 1] };
