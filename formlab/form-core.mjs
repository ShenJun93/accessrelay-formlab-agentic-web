// P761: deterministic, side-effect-free accessibility improvement state machine.
// This is a focused demonstration, NOT WCAG certification or a full axe-core audit.
export const FIXES = Object.freeze([
  { id: "associate_label", title: "Associate the email label", signal: "label_linked",
    change: "Set the visible label's for attribute to the email input ID." },
  { id: "announce_errors", title: "Announce validation errors", signal: "errors_announced",
    change: "Give validation feedback role=alert so assistive technology can announce it." },
  { id: "increase_contrast", title: "Improve helper text contrast", signal: "contrast_improved",
    change: "Replace the low-contrast text color with the verified dark token." },
]);

export function createInitialState() {
  return { version: 0, applied: [], history: [] };
}
export function getIssues(state) {
  return FIXES.filter(fix => !state.applied.includes(fix.id)).map(fix => ({
    id: fix.id, title: fix.title, result: "needs_review", method: "targeted deterministic signal"
  }));
}
export function snapshot(state) {
  return {
    version: state.version, applied: [...state.applied],
    remainingSignals: getIssues(state), fixedCount: FIXES.length - getIssues(state).length,
    disclaimer: "Targeted checks only; not a WCAG or complete accessibility audit. No form input values enter the agent context."
  };
}
function knownFix(id) { return FIXES.find(fix => fix.id === id); }
function refusal(state, reason) { return { ok: false, reason, version: state.version, state }; }
export function previewFix(state, fixId) {
  const fix = knownFix(fixId);
  if (!fix) return refusal(state, "Unknown fix ID.");
  if (state.applied.includes(fixId)) return refusal(state, "Already applied; no change.");
  return {
    ok: true, fixId, title: fix.title, diff: fix.change, expectedVersion: state.version,
    beforeRemaining: getIssues(state).length, afterRemaining: getIssues(state).length - 1,
    requiresConfirmation: true, verified: false
  };
}
export function applyFix(state, fixId, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== state.version) {
    return refusal(state, "Stale version. Re-read the form before changing it.");
  }
  const pre = previewFix(state, fixId);
  if (!pre.ok) return pre;
  const next = {
    version: state.version + 1,
    applied: [...state.applied, fixId],
    history: [...state.history, { fixId, appliedAtVersion: state.version + 1 }]
  };
  return { ok: true, result: "applied", fixId, beforeVersion: state.version,
    afterVersion: next.version, state: next, remaining: getIssues(next).length };
}
export function undoLast(state, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== state.version) {
    return refusal(state, "Stale version. Re-read the form before undoing.");
  }
  if (!state.history.length) return refusal(state, "Nothing to undo.");
  const last = state.history[state.history.length - 1];
  const next = {
    version: state.version + 1,
    applied: state.applied.filter(id => id !== last.fixId),
    history: state.history.slice(0, -1)
  };
  return { ok: true, result: "undone", fixId: last.fixId, afterVersion: next.version,
    state: next, remaining: getIssues(next).length };
}
