import { test } from "node:test";
import assert from "node:assert/strict";
import { environmentLine, formatEventTime, nextEvent } from "./dayPlanDisplay.js";

const events = [
  { title: "Lecture", start: "2026-10-15T10:00", end: "2026-10-15T11:15", all_day: false },
  { title: "Lab", start: "2026-10-15T14:30", end: "2026-10-15T16:30", all_day: false },
  { title: "Laundry", start: "2026-10-15", all_day: true },
];

test("formats wall-clock times", () => {
  assert.equal(formatEventTime("2026-10-15T14:30"), "2:30 PM");
  assert.equal(formatEventTime("2026-10-15T00:05"), "12:05 AM");
  assert.equal(formatEventTime("2026-10-15"), "All day");
});

test("next event skips finished and all-day events", () => {
  assert.equal(nextEvent(events, new Date(2026, 9, 15, 9, 0)).title, "Lecture");
  assert.equal(nextEvent(events, new Date(2026, 9, 15, 11, 0)).title, "Lecture");
  assert.equal(nextEvent(events, new Date(2026, 9, 15, 12, 0)).title, "Lab");
  assert.equal(nextEvent(events, new Date(2026, 9, 15, 17, 0)), null);
});

test("environment line", () => {
  assert.equal(
    environmentLine({ pollen: "Moderate", aqi_label: "Good", temperature_f: 68 }),
    "Pollen is moderate · Air quality: good · 68°F"
  );
  assert.equal(environmentLine(null), "");
});
