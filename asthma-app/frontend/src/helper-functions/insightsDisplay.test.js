import { test } from "node:test";
import assert from "node:assert/strict";
import { axisLines, conditionSummary, describeChange, symptomLevel } from "./insightsDisplay.js";

test("comparison change reads as +n / −n, with the right tone", () => {
  assert.deepEqual(describeChange(5, 11, true), { text: "+6", tone: "worse" });
  assert.deepEqual(describeChange(9, 4, true), { text: "−5", tone: "better" });
  assert.deepEqual(describeChange(3, 3, true), { text: "0", tone: "neutral" });
  assert.deepEqual(describeChange(22, 25, null), { text: "+3", tone: "neutral" });
});

test("condition summaries compare days with real counts, and never claim a cause", () => {
  const pollen = { key: "pollen", summary: { from: { level: "Low", avg: 1.1, days: 29 }, to: { level: "Very High", avg: 6.6, days: 7 } } };
  assert.equal(
    conditionSummary(pollen),
    "Average symptom level 6.6 on 7 very high pollen days, compared with 1.1 on 29 low pollen days."
  );
  const cold = { key: "low_temp", summary: { from: { level: "60°F+", avg: 0.5, days: 22 }, to: { level: "Below 40°F", avg: 7.8, days: 4 } } };
  assert.equal(
    conditionSummary(cold),
    "Average symptom level 7.8 on 4 days after lows below 40°F, compared with 0.5 on 22 days after lows of 60°F or more."
  );
  assert.equal(conditionSummary({ key: "air", summary: null }), null);
  assert.doesNotMatch(conditionSummary(pollen), /tend|cause|because|higher/);
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
