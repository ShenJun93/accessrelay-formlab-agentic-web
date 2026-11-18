import test from "node:test";
import assert from "node:assert/strict";
import {FIXES, createInitialState, getIssues, snapshot, previewFix, applyFix, undoLast} from "../form-core.mjs";

test("baseline has three targeted findings and no private values", () => {
  const s = createInitialState();
  assert.equal(getIssues(s).length, 3);
  assert.equal(snapshot(s).version, 0);
  assert.equal(JSON.stringify(snapshot(s)).includes("emailAddress"), false);
});
test("every listed fix has a preview that does not mutate", () => {
  const s = createInitialState();
  for (const fix of FIXES) {
    const p = previewFix(s, fix.id);
    assert.equal(p.ok, true);
    assert.equal(p.beforeRemaining, 3);
    assert.equal(p.afterRemaining, 2);
    assert.equal(p.requiresConfirmation, true);
  }
  assert.equal(getIssues(s).length, 3);
});
test("unknown fix refused", () => assert.equal(previewFix(createInitialState(), "script_injection").ok, false));
test("stale write is refused", () => assert.equal(applyFix(createInitialState(), FIXES[0].id, 99).ok, false));
test("apply changes only targeted signal with monotonic version", () => {
  const s = createInitialState();
  const r = applyFix(s, FIXES[0].id, 0);
  assert.equal(r.ok, true);
  assert.equal(r.afterVersion, 1);
  assert.equal(r.remaining, 2);
  assert.equal(getIssues(s).length, 3);
});
test("duplicate apply is refused", () => {
  const s = applyFix(createInitialState(), FIXES[0].id, 0).state;
  assert.equal(applyFix(s, FIXES[0].id, 1).ok, false);
});
test("undo refuses stale versions", () => {
  const s = applyFix(createInitialState(), FIXES[0].id, 0).state;
  assert.equal(undoLast(s, 0).ok, false);
});
test("undo restores a finding while version increases", () => {
  const s = applyFix(createInitialState(), FIXES[0].id, 0).state;
  const r = undoLast(s, 1);
  assert.equal(r.ok, true); assert.equal(r.afterVersion, 2);
  assert.deepEqual(r.state.applied, []);
  assert.equal(getIssues(r.state).length, 3);
});
test("undo with no applied fix refuses", () => assert.equal(undoLast(createInitialState(), 0).ok, false));
test("all three changes can be applied then undone with exact stack", () => {
  let s=createInitialState();
  for(const f of FIXES) s=applyFix(s,f.id,s.version).state;
  assert.equal(getIssues(s).length,0);
  for(let i=0;i<FIXES.length;i++) s=undoLast(s,s.version).state;
  assert.equal(getIssues(s).length,3);
  assert.equal(s.version,6);
});
test("prototype pollution IDs are not valid operations", () => {
  for(const id of ["__proto__", "constructor", "toString", "<script>"]) {
    assert.equal(previewFix(createInitialState(),id).ok,false);
  }
});
