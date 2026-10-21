import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answersFromSaved,
  prefillAnswers,
  emptyCheckIn,
  missingBasics,
  severityLabel,
  toCheckInPayload,
  triggerOptions,
  isProfileTrigger,
  userNoteFrom,
} from "./checkInMapping.js";

const allNo = { breathingSet: true, nightSymptoms: false, activityLimited: false, relieverUsed: false };

test("the sliders and three yes/no basics are required; the face is not", () => {
  assert.deepEqual(missingBasics(emptyCheckIn()), ["breathing", "nightSymptoms", "activityLimited", "relieverUsed"]);
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

test("any slider above 0 answers day symptoms; the yes answers map straight to the model fields", () => {
  const answers = {
    ...emptyCheckIn(),
    breathingSet: true,
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
  assert.equal(puffsOnly.breathingSet, false);
  assert.equal(puffsOnly.relieverUsed, true);
});

test("trigger options merge common, profile and custom triggers without duplicates", () => {
  const options = triggerOptions(["pollen", "Mold"], ["paint fumes"]);
  assert.equal(options.filter((item) => item.toLowerCase() === "pollen").length, 1);
  assert.ok(options.includes("Mold") && options.includes("paint fumes"));
});

test("the user's own Profile picks come first", () => {
  const options = triggerOptions(["Mold", "pollen"], []);
  assert.deepEqual(options.slice(0, 2), ["Mold", "pollen"]);
  assert.equal(isProfileTrigger(["Mold", "pollen"], "Pollen"), true);
  assert.equal(isProfileTrigger(["Mold"], "Dust"), false);
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

test("an older check-in with day symptoms but no scores asks for the sliders again", () => {
  const old = answersFromSaved({ symptoms_logged: true, daily_day_symp: true, puffs_today: 0 });
  assert.equal(old.breathingSet, false);
  const none = answersFromSaved({ symptoms_logged: true, daily_day_symp: false, puffs_today: 0 });
  assert.equal(none.breathingSet, true);
});

test("quick logs pre-fill the highest slider values, yes-only answers and puffs, with their sources", () => {
  const { answers, hints } = prefillAnswers(emptyCheckIn(), {
    log_count: 2,
    breathing: { shortness_of_breath: 0, chest_tightness: 0, wheezing: 5, coughing: 2 },
    breathing_from: { wheezing: "2026-10-21T21:10:00Z", coughing: "2026-10-21T15:05:00Z" },
    no_symptoms: false,
    night_symptoms: null,
    activity_limited: true,
    activity_from: "2026-10-21T21:10:00Z",
    puffs: 2,
    triggers: ["Exercise"],
  });
  assert.equal(answers.breathing.wheezing, 5);
  assert.equal(answers.breathingSet, true);
  assert.equal(answers.nightSymptoms, null);
  assert.equal(answers.activityLimited, true);
  assert.equal(answers.relieverUsed, true);
  assert.equal(answers.puffs, 2);
  assert.deepEqual(answers.triggers, ["Exercise"]);
  assert.match(hints.wheezing, /^From your .+ log$/);
  assert.deepEqual(missingBasics(answers), ["nightSymptoms"]);
});

test("no quick logs leave the Day check-in exactly as it was", () => {
  const start = emptyCheckIn();
  const { answers, hints } = prefillAnswers(start, { log_count: 0, breathing: null, puffs: 0 });
  assert.equal(answers, start);
  assert.deepEqual(hints, {});
});
