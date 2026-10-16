import { test } from "node:test";
import assert from "node:assert/strict";
import { describeChange, patternSentence, symptomLevel } from "./insightsDisplay.js";

test("comparison change reads as words, with the right tone", () => {
  assert.deepEqual(describeChange(5, 11, true), { text: "6 more", tone: "worse" });
  assert.deepEqual(describeChange(9, 4, true), { text: "5 fewer", tone: "better" });
  assert.deepEqual(describeChange(3, 3, true), { text: "Same", tone: "neutral" });
  assert.deepEqual(describeChange(22, 25, null), { text: "3 more", tone: "neutral" });
});

test("pattern sentences carry the real counts", () => {
  const base = { harder_with: 5, days_with: 8, harder_without: 8, days_without: 66 };
  assert.equal(
    patternSentence({ ...base, kind: "plan", label: "Skating practice" }),
    "Harder breathing on 5 of 8 days with “Skating practice”, vs 8 of 66 other days."
  );
  assert.equal(
    patternSentence({ ...base, kind: "trigger", label: "Cold air" }),
    "Harder breathing on 5 of 8 days you noted cold air, vs 8 of 66 other days."
  );
});

test("calendar symptom level", () => {
  assert.equal(symptomLevel(null), null);
  assert.equal(symptomLevel({ symptoms_logged: false, puffs_today: 0 }), null);
  assert.equal(symptomLevel({ symptoms_logged: true, puffs_today: 0 }), "none");
  assert.equal(symptomLevel({ symptoms_logged: true, daily_night_symp: true }), "mild");
  assert.equal(symptomLevel({ symptoms_logged: true, details: { breathing: { wheezing: 5 } } }), "moderate");
  assert.equal(symptomLevel({ symptoms_logged: true, details: { breathing: { wheezing: 8 } } }), "severe");
});
