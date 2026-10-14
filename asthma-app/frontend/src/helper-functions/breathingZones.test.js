import { test } from "node:test";
import assert from "node:assert/strict";
import { assessZone, hasDangerSign, peakFlowZone } from "./breathingZones.js";

const calm = {
  breathing: "None", cough: false, wheeze: false, chest_tightness: false,
  usual_activities: "Yes", woke_at_night: false, reliever: "No", peak_flow: "",
};

test("any danger sign bypasses the zones", () => {
  assert.equal(hasDangerSign({ cant_talk_or_walk: false, blue_or_gray: true }), true);
  assert.equal(hasDangerSign({ cant_talk_or_walk: false, blue_or_gray: false, confused_or_drowsy: false }), false);
});

test("no symptoms is green", () => {
  assert.deepEqual(assessZone(calm), { zone: "green", reasons: [] });
});

test("mild symptoms or needing the reliever is yellow", () => {
  assert.equal(assessZone({ ...calm, wheeze: true }).zone, "yellow");
  assert.equal(assessZone({ ...calm, breathing: "Moderate" }).zone, "yellow");
  assert.equal(assessZone({ ...calm, reliever: "Yes, it helped" }).zone, "yellow");
  assert.equal(assessZone({ ...calm, woke_at_night: true }).zone, "yellow");
});

test("red wins over yellow", () => {
  const result = assessZone({ ...calm, wheeze: true, reliever: "Yes, but not enough" });
  assert.equal(result.zone, "red");
  assert.deepEqual(result.reasons, ["Reliever isn't helping enough"]);
  assert.equal(assessZone({ ...calm, breathing: "Severe" }).zone, "red");
  assert.equal(assessZone({ ...calm, usual_activities: "No" }).zone, "red");
});

test("peak flow uses saved thresholds, else % of personal best", () => {
  assert.equal(peakFlowZone("200", { red_below: 225, yellow_below: 360 }), "red");
  assert.equal(peakFlowZone("300", { red_below: 225, yellow_below: 360 }), "yellow");
  assert.equal(peakFlowZone("400", { personal_best: 450 }), "green");
  assert.equal(peakFlowZone("300", { personal_best: 450 }), "yellow");
  assert.equal(peakFlowZone("200", { personal_best: 450 }), "red");
  assert.equal(peakFlowZone("300", null), null);
  assert.equal(peakFlowZone("", { personal_best: 450 }), null);
  assert.equal(assessZone({ ...calm, peak_flow: "200" }, { personal_best: 450 }).zone, "red");
});
