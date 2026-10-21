import { test } from "node:test";
import assert from "node:assert/strict";
import { quickLogSummary, toQuickLogPayload } from "./quickLogDisplay.js";

const zero = { shortness_of_breath: 0, chest_tightness: 0, wheezing: 0, coughing: 0 };

test("a quick log reads as one plain line, strongest symptom first", () => {
  const line = quickLogSummary({
    breathing: { ...zero, wheezing: 5, coughing: 2 },
    reliever_puffs: 2,
    triggers: ["Exercise"],
  });
  assert.equal(line, "Noticeable wheezing, slight coughing · 2 reliever puffs · Exercise");
  assert.equal(quickLogSummary({ breathing: zero, reliever_puffs: 0, triggers: [] }), "No symptoms");
  assert.equal(quickLogSummary({ breathing: zero, limiting_activity: true, reliever_puffs: 1 }), "No symptoms · limiting what I was doing · 1 reliever puff");
});

test("the payload carries the local day and only sends limiting when ticked", () => {
  const now = new Date(2026, 9, 21, 23, 50);
  const body = toQuickLogPayload({ breathing: { ...zero, coughing: 3 }, limiting: false, puffs: "2", triggers: [], note: "  " }, now);
  assert.equal(body.local_date, "2026-10-21");
  assert.equal(body.logged_at, now.toISOString());
  assert.equal(body.limiting_activity, null);
  assert.equal(body.reliever_puffs, 2);
  assert.equal(body.note, null);
});
