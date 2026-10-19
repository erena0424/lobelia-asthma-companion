import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingFor, lastMoodLabel, outlookHeadline, outlookImplication, temperatureReadout } from "./outlookCopy.js";

test("headline names only what code flagged", () => {
  const env = { pollen: "High", aqi_band: 1, aqi_label: "Good", temperature_high_f: 45, temperature_low_f: 31 };
  assert.equal(outlookHeadline(env, [{ key: "pollen" }]), "Pollen is high today.");
  assert.equal(
    outlookHeadline({ ...env, aqi_label: "Unhealthy for sensitive groups" }, [{ key: "air_quality" }, { key: "pollen" }]),
    "Air quality is unhealthy for sensitive groups today. Pollen is high.",
  );
  assert.equal(outlookHeadline(env, [{ key: "cold" }, { key: "pollen" }]), "Temperatures drop below freezing tonight. Pollen is high today.");
  assert.equal(
    outlookHeadline({ aqi_band: 3, aqi_label: "Unhealthy for sensitive groups" }, [{ key: "air_quality" }]),
    "Air quality is unhealthy for sensitive groups today."
  );
  assert.equal(outlookHeadline(null), "Here's how today looks.");
});

test("an unflagged day is never called calm, clean or safe", () => {
  const text = outlookHeadline({ pollen: "Low", aqi_band: 1, aqi_label: "Good" }, []);
  assert.equal(text, "Air quality is good today. Nothing you picked in your Profile is flagged.");
  assert.doesNotMatch(text, /calm|clean|safe/i);
});

test("headline never recommends anything", () => {
  const env = { pollen: "Very High", aqi_band: 4, aqi_label: "Unhealthy", temperature_high_f: 80, temperature_low_f: 30 };
  const text = outlookHeadline(env, [{ key: "air_quality" }, { key: "pollen" }]);
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

test("implication line only explains flagged air quality, without advice", () => {
  assert.equal(outlookImplication({ aqi_band: 3 }, [{ key: "air_quality" }]), "Poorer air can irritate sensitive airways, especially during outdoor exercise.");
  assert.equal(outlookImplication({ pollen: "High" }, [{ key: "pollen" }]), null);
  assert.doesNotMatch(outlookImplication({ aqi_band: 4 }, [{ key: "air_quality" }]), /inhaler|take|use|medic|controller/i);
});
