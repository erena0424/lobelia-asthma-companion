import { test } from "node:test";
import assert from "node:assert/strict";
import { axisLines, conditionSummary, describeChange, symptomLevel } from "./insightsDisplay.js";

test("comparison change reads as +n / −n, with the right tone", () => {
  assert.deepEqual(describeChange(5, 11, true), { text: "+6", tone: "worse" });
  assert.deepEqual(describeChange(9, 4, true), { text: "−5", tone: "better" });
  assert.deepEqual(describeChange(3, 3, true), { text: "0", tone: "neutral" });
  assert.deepEqual(describeChange(22, 25, null), { text: "+3", tone: "neutral" });
});

test("condition summaries read plainly, and only when there's a clear rise", () => {
  const pollen = { key: "pollen", summary: { from: { level: "Low", avg: 1.5 }, to: { level: "High", avg: 6 } } };
  assert.equal(conditionSummary(pollen), "Your symptoms tend to be higher on high pollen days (average 6 vs 1.5 on low pollen days).");
  const cold = { key: "low_temp", summary: { from: { level: "60°F+", avg: 2 }, to: { level: "Below 40°F", avg: 5.5 } } };
  assert.equal(
    conditionSummary(cold),
    "Your symptoms tend to be higher after nights below 40°F (average 5.5 vs 2 after nights with lows of 60°F or more)."
  );
  assert.equal(conditionSummary({ key: "air", summary: null }), null);
});

test("long axis labels wrap onto two lines", () => {
  assert.deepEqual(axisLines("Moderate"), ["Moderate"]);
  assert.deepEqual(axisLines("Unhealthy for sensitive groups"), ["Unhealthy", "(sensitive)"]);
  assert.deepEqual(axisLines("Very unhealthy"), ["Very", "unhealthy"]);
});

test("calendar symptom level", () => {
  assert.equal(symptomLevel(null), null);
  assert.equal(symptomLevel({ symptoms_logged: false, puffs_today: 0 }), null);
  assert.equal(symptomLevel({ symptoms_logged: true, puffs_today: 0 }), "none");
  assert.equal(symptomLevel({ symptoms_logged: true, daily_night_symp: true }), "mild");
  assert.equal(symptomLevel({ symptoms_logged: true, details: { breathing: { wheezing: 5 } } }), "moderate");
  assert.equal(symptomLevel({ symptoms_logged: true, details: { breathing: { wheezing: 8 } } }), "severe");
});
