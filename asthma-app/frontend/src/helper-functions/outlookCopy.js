// Today's outlook copy, built deterministically from the environment readouts (no AI).
// The headline only describes general conditions; recommendations live elsewhere.

const POLLEN_PHRASE = {
  Low: "Pollen is low today",
  Moderate: "Pollen is elevated today",
  High: "Pollen is high today",
  "Very High": "Pollen is very high today",
};

/** One short sentence, at most two clauses. */
export function outlookHeadline(environment) {
  if (!environment) return "Here's how today looks.";

  const clauses = [];
  if (POLLEN_PHRASE[environment.pollen]) clauses.push(POLLEN_PHRASE[environment.pollen]);

  if (environment.aqi_band >= 3) clauses.push("the air quality is poor");
  else if (environment.aqi_band === 2) clauses.push("the air quality is fair");

  const { temperature_high_f: high, temperature_low_f: low } = environment;
  if (clauses.length < 2 && high != null && low != null) {
    if (high - low >= 15 && low <= 55) clauses.push("temperatures will drop this evening");
    else if (low <= 40) clauses.push("it will be cold today");
  }

  if (clauses.length === 0) {
    if (environment.aqi_band === 1) return "The air is clean and conditions look calm today.";
    return "Conditions look fairly calm today.";
  }

  const sentence = clauses.slice(0, 2).join(", and ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

export function temperatureReadout(environment) {
  if (!environment) return null;
  const { temperature_high_f: high, temperature_low_f: low, temperature_f: mean } = environment;
  if (high != null && low != null) return `${high}° → ${low}°F`;
  if (mean != null) return `${mean}°F`;
  return null;
}

export const MOOD_LABELS = { 1: "Very low", 2: "Low", 3: "Okay", 4: "Good", 5: "Great" };

/** "Feeling okay" from the most recent check-in that recorded a mood. */
export function lastMoodLabel(checkIns) {
  const latest = [...(checkIns || [])]
    .filter((item) => item?.details?.mood)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return latest ? `Feeling ${MOOD_LABELS[latest.details.mood].toLowerCase()}` : null;
}

/** Greeting by local time of day. */
export function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * One plain line on what today's conditions can mean (no advice, no medicine).
 * Wording needs regulatory-claims review.
 */
export function outlookImplication(environment) {
  if (!environment) return null;
  const pollen = ["Moderate", "High", "Very High"].includes(environment.pollen);
  const air = environment.aqi_band >= 2;
  const { temperature_high_f: high, temperature_low_f: low } = environment;
  const cold = high != null && low != null && ((high - low >= 15 && low <= 55) || low <= 40);

  const count = [pollen, air, cold].filter(Boolean).length;
  if (count >= 2) return "Together, these can make airways more sensitive than usual.";
  if (pollen) return "Pollen can make sensitive airways more reactive.";
  if (air) return "Poorer air can irritate sensitive airways.";
  if (cold) return "Cold air can tighten sensitive airways, especially outdoors.";
  return null;
}
