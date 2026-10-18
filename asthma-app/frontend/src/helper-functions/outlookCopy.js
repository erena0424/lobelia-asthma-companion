// Today card headline, built deterministically from the readouts and the flags code chose (no AI).
// The headline only describes conditions; it never calls a day safe or calm (LBL-020 claims review).

const FLAG_SENTENCE = {
  air_quality: (env) => `Air quality is ${String(env.aqi_label || "poor").toLowerCase()} today.`,
  pollen: (env) => `Pollen is ${String(env.pollen).toLowerCase()} today.`,
  cold: (env) => (env.temperature_low_f <= 32 ? "Temperatures drop below freezing tonight." : `It gets down to ${env.temperature_low_f}°F tonight.`),
  temperature_swing: (env) => `Temperatures swing from ${env.temperature_high_f}° to ${env.temperature_low_f}°F today.`,
};

/** One or two short sentences naming what code flagged, or the air quality when nothing is flagged. */
export function outlookHeadline(environment, flags = []) {
  if (!environment) return "Here's how today looks.";
  const sentences = (flags || [])
    .map((flag) => FLAG_SENTENCE[flag.key]?.(environment))
    .filter(Boolean)
    .slice(0, 2);
  // say "today" once: "Air quality is poor today. Pollen is high."
  if (sentences.length === 2 && sentences[0].endsWith(" today.")) sentences[1] = sentences[1].replace(/ today\.$/, ".");
  if (sentences.length) return sentences.join(" ");
  const air = environment.aqi_label ? `Air quality is ${environment.aqi_label.toLowerCase()} today. ` : "";
  return `${air}Nothing you picked in your Profile is flagged.`;
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
 * One plain line on what flagged air quality can mean (no advice, no medicine).
 * Air quality is flagged for everyone; the user's own picks are explained by the "Because" line.
 */
export function outlookImplication(environment, flags = []) {
  if (!environment) return null;
  if ((flags || []).some((flag) => flag.key === "air_quality")) {
    return "Poorer air can irritate sensitive airways, especially during outdoor exercise.";
  }
  return null;
}
