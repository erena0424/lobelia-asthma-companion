import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyCheckIn, toCheckInPayload, userNoteFrom } from "./checkInMapping.js";

test("all-clear check-in maps to no symptoms and leaves puffs alone", () => {
  const { body, puffs } = toCheckInPayload({ ...emptyCheckIn(), mood: 4 }, "2026-10-13");

  assert.equal(body.date, "2026-10-13");
  assert.equal(body.daily_day_symp, false);
  assert.equal(body.daily_night_symp, false);
  assert.equal(body.daily_limit_activity, false);
  assert.equal(puffs, null);
  assert.match(body.notes, /^\[Check-in\] Feeling: Good\. Breathing: /);
});

test("any breathing symptom, night waking, activity limits and reliever use map to the model fields", () => {
  const answers = {
    ...emptyCheckIn(),
    mood: 2,
    breathing: { shortness_of_breath: 0, chest_tightness: 0, wheezing: 2, coughing: 0 },
    context: ["night_waking", "activity_limitation", "reliever_use"],
    puffs: 3,
    triggers: ["Pollen"],
    note: "Bad night",
  };
  const { body, puffs } = toCheckInPayload(answers, "2026-10-14");

  assert.equal(body.daily_day_symp, true);
  assert.equal(body.daily_night_symp, true);
  assert.equal(body.daily_limit_activity, true);
  assert.equal(puffs, 3);
  assert.deepEqual(body.triggers, ["Pollen"]);
  assert.match(body.notes, /wheezing moderate/);
  assert.match(body.notes, /\nBad night$/);
});

test("userNoteFrom strips only the generated summary line", () => {
  assert.equal(userNoteFrom("[Check-in] Feeling: Okay.\nmy words"), "my words");
  assert.equal(userNoteFrom("[Check-in] Feeling: Okay."), "");
  assert.equal(userNoteFrom("written in the calendar"), "written in the calendar");
  assert.equal(userNoteFrom(null), "");
});
