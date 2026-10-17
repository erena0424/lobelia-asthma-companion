import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingFor, lastMoodLabel, outlookHeadline, outlookImplication, temperatureReadout } from "./outlookCopy.js";

test("headline describes conditions in at most two clauses", () => {
  assert.equal(
    outlookHeadline({ pollen: "Moderate", aqi_band: 1, temperature_high_f: 68, temperature_low_f: 49 }),
    "Pollen is elevated today, and temperatures will drop this evening."
  );
  assert.equal(
    outlookHeadline({ pollen: "High", aqi_band: 3, temperature_high_f: 70, temperature_low_f: 40 }),
    "Pollen is high today, and the air quality is poor."
  );
  assert.equal(outlookHeadline({ pollen: "Low", aqi_band: 1 }), "Pollen is low today.");
  assert.equal(outlookHeadline({ aqi_band: 1 }), "The air is clean and conditions look calm today.");
  assert.equal(outlookHeadline(null), "Here's how today looks.");
});

test("headline never recommends anything", () => {
  const text = outlookHeadline({ pollen: "Very High", aqi_band: 4, temperature_high_f: 80, temperature_low_f: 30 });
  assert.doesNotMatch(text, /inhaler|take|use|medic|controller/i);
});

test("readouts and labels", () => {
  assert.equal(temperatureReadout({ temperature_high_f: 68, temperature_low_f: 52 }), "68° → 52°F");
  assert.equal(temperatureReadout({ temperature_f: 60 }), "60°F");
  assert.equal(lastMoodLabel([{ date: "2026-10-13", details: { mood: 3 } }, { date: "2026-10-12", details: { mood: 5 } }]), "Feeling okay");
  assert.equal(lastMoodLabel([{ date: "2026-10-13" }]), null);
  assert.equal(greetingFor(new Date(2026, 9, 15, 9)), "Good morning");
  assert.equal(greetingFor(new Date(2026, 9, 15, 19)), "Good evening");
});

test("implication line explains conditions without advice", () => {
  assert.equal(
    outlookImplication({ pollen: "Moderate", aqi_band: 1, temperature_high_f: 68, temperature_low_f: 49 }),
    "Together, these can make airways more sensitive than usual."
  );
  assert.equal(outlookImplication({ pollen: "Low", aqi_band: 1, temperature_high_f: 70, temperature_low_f: 60 }), null);
  for (const env of [{ pollen: "High" }, { aqi_band: 3 }, { temperature_high_f: 50, temperature_low_f: 30 }]) {
    assert.doesNotMatch(outlookImplication(env), /inhaler|take|use|medic|controller/i);
  }
});
