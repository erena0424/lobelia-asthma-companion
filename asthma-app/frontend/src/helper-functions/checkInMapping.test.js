import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answersFromSaved,
  emptyCheckIn,
  missingBasics,
  severityLabel,
  toCheckInPayload,
  triggerOptions,
  userNoteFrom,
} from "./checkInMapping.js";

const allNo = { daySymptoms: false, nightSymptoms: false, activityLimited: false, relieverUsed: false };

test("the four basics are required; the face is not", () => {
  assert.deepEqual(missingBasics(emptyCheckIn()), ["daySymptoms", "nightSymptoms", "activityLimited", "relieverUsed"]);
  assert.deepEqual(missingBasics({ ...emptyCheckIn(), ...allNo }), []);
  assert.deepEqual(missingBasics({ ...emptyCheckIn(), ...allNo, relieverUsed: true, puffs: "" }), ["puffs"]);
});

test("an all-no check-in maps to no symptoms and zero puffs", () => {
  const { body, puffs } = toCheckInPayload({ ...emptyCheckIn(), ...allNo }, "2026-10-13");

  assert.equal(body.date, "2026-10-13");
  assert.equal(body.daily_day_symp, false);
  assert.equal(body.daily_night_symp, false);
  assert.equal(body.daily_limit_activity, false);
  assert.equal(puffs, 0);
  assert.deepEqual(body.details.context, []);
  assert.equal(body.details.mood, undefined);
});

test("yes answers map straight to the model fields, independent of the optional scores", () => {
  const answers = {
    ...emptyCheckIn(),
    daySymptoms: true,
    nightSymptoms: true,
    activityLimited: true,
    relieverUsed: true,
    puffs: 3,
    mood: 2,
    breathing: { shortness_of_breath: 0, chest_tightness: 0, wheezing: 1, coughing: 0 },
    triggers: ["Pollen", "paint fumes"],
    note: "Bad night",
  };
  const { body, puffs } = toCheckInPayload(answers, "2026-10-14");

  assert.equal(body.daily_day_symp, true);
  assert.equal(body.daily_night_symp, true);
  assert.equal(body.daily_limit_activity, true);
  assert.equal(puffs, 3);
  assert.deepEqual(body.triggers, ["Pollen", "paint fumes"]);
  assert.deepEqual(body.details.context, ["night_waking", "activity_limitation", "reliever_use"]);
  assert.match(body.notes, /Possible triggers: Pollen, paint fumes/);
  assert.match(body.notes, /\nBad night$/);
});

test("a saved check-in prefills the basics; puffs logged from Today count as reliever use", () => {
  const saved = answersFromSaved({
    symptoms_logged: true,
    daily_day_symp: false,
    daily_night_symp: true,
    daily_limit_activity: false,
    puffs_today: 2,
    triggers: ["Cold air"],
    notes: "[Check-in] Feeling: Okay.\nmy words",
    details: { mood: 3 },
  });
  assert.equal(saved.nightSymptoms, true);
  assert.equal(saved.relieverUsed, true);
  assert.equal(saved.puffs, 2);
  assert.equal(saved.note, "my words");

  const puffsOnly = answersFromSaved({ symptoms_logged: false, puffs_today: 1 });
  assert.equal(puffsOnly.daySymptoms, null);
  assert.equal(puffsOnly.relieverUsed, true);
});

test("trigger options merge common, profile and custom triggers without duplicates", () => {
  const options = triggerOptions(["pollen", "Mold"], ["paint fumes"]);
  assert.equal(options.filter((item) => item.toLowerCase() === "pollen").length, 1);
  assert.ok(options.includes("Mold") && options.includes("paint fumes"));
});

test("userNoteFrom strips only the generated summary line", () => {
  assert.equal(userNoteFrom("[Check-in] Feeling: Okay.\nmy words"), "my words");
  assert.equal(userNoteFrom("[Check-in] Feeling: Okay."), "");
  assert.equal(userNoteFrom("written in the calendar"), "written in the calendar");
  assert.equal(userNoteFrom(null), "");
});

test("severity labels", () => {
  assert.deepEqual([0, 1, 3, 4, 6, 7, 10].map(severityLabel), [
    "No symptoms", "Slight", "Slight", "Noticeable", "Noticeable", "Strong", "Strong",
  ]);
});
