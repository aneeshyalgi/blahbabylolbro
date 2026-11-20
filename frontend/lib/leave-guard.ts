/**
 * Why leaving the current tab would lose work (an unsaved draft, unsaved edits, an agent still running), set by that
 * tab while it applies. The page asks before switching tabs; the texts come from the tab, in its own language.
 */
export type LeaveGuard = { title: string; message: string; stay: string; leave: string };

let current: LeaveGuard | null = null;

export function setLeaveGuard(guard: LeaveGuard | null): void {
  current = guard;
}

export function getLeaveGuard(): LeaveGuard | null {
  return current;
}
