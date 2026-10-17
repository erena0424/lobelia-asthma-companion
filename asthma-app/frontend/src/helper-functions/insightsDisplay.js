// Pure display helpers for Insights and the Calendar log (no browser or network use, so node --test can run them).

export const INSIGHT_RANGES = [
  { days: 28, label: "4 weeks" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "Year" },
];

export const SYMPTOM_FILTERS = [
  { key: null, label: "All symptoms" },
  { key: "wheezing", label: "Wheezing" },
  { key: "coughing", label: "Coughing" },
  { key: "chest_tightness", label: "Chest tightness" },
  { key: "shortness_of_breath", label: "Shortness of breath" },
];

// For these, more is harder; "days checked in" is neutral.
export const COMPARISON_ROWS = [
  { key: "symptom_days", label: "Days with symptoms", worseWhenMore: true },
  { key: "nights_woken", label: "Nights woken by symptoms", worseWhenMore: true },
  { key: "activity_limited_days", label: "Days asthma limited activity", worseWhenMore: true },
  { key: "rescue_puffs", label: "Rescue inhaler puffs", worseWhenMore: true },
  { key: "days_checked_in", label: "Days you checked in", worseWhenMore: null },
];

/** "+6" / "−2" / "0", with a tone: "worse", "better" or "neutral". */
export function describeChange(previous, current, worseWhenMore) {
  const diff = Number(current || 0) - Number(previous || 0);
  if (diff === 0) return { text: "0", tone: "neutral" };
  const text = `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`;
  if (worseWhenMore === null) return { text, tone: "neutral" };
  return { text, tone: (diff > 0) === worseWhenMore ? "worse" : "better" };
}

/** The days a condition level describes, e.g. "very high pollen days". */
function conditionDays(key, level, days) {
  const lower = level.toLowerCase();
  const n = String(days);
  if (key === "pollen") return `${n} ${lower} pollen ${days === 1 ? "day" : "days"}`;
  if (key === "air") return `${n} ${days === 1 ? "day" : "days"} with ${lower} air quality`;
  if (level === "60°F+") return `${n} ${days === 1 ? "day" : "days"} after lows of 60°F or more`;
  if (level.startsWith("Below")) return `${n} ${days === 1 ? "day" : "days"} after lows ${level.replace("Below", "below")}`;
  return `${n} ${days === 1 ? "day" : "days"} after lows in the ${level}`;
}

/**
 * A plain comparison with the real day counts, or null when there's no clear difference.
 * Worded as a comparison, never as a cause (regulatory-claims review, Oct 2026).
 */
export function conditionSummary(curve) {
  if (!curve?.summary) return null;
  const { from, to } = curve.summary;
  return (
    `Average symptom level ${to.avg} on ${conditionDays(curve.key, to.level, to.days)}, ` +
    `compared with ${from.avg} on ${conditionDays(curve.key, from.level, from.days)}.`
  );
}

// shorter axis names where the full one would collide with its neighbour
const SHORT_LEVELS = { "Unhealthy for sensitive groups": "Unhealthy (sensitive)" };

/** Splits a long axis label onto at most two lines. */
export function axisLines(level, max = 10) {
  const label = SHORT_LEVELS[level] || level;
  if (label.length <= max) return [label];
  const words = label.split(" ");
  let first = "";
  while (words.length && (first + " " + words[0]).trim().length <= max) first = `${first} ${words.shift()}`.trim();
  return first ? [first, words.join(" ")] : [label];
}

/** Symptom level for a calendar day, shown as No symptoms / Slight / Noticeable / Strong (keys none/mild/moderate/severe), or null when not checked in. */
export function symptomLevel(checkIn) {
  if (!checkIn) return null;
  const logged = Boolean(checkIn.symptoms_logged) || Number(checkIn.puffs_today || 0) > 0;
  if (!logged) return null;
  const scores = Object.values(checkIn.details?.breathing || {}).filter((value) => typeof value === "number");
  const top = scores.length ? Math.max(...scores) : null;
  if (top !== null && top >= 7) return "severe";
  if (top !== null && top >= 4) return "moderate";
  const anySymptom =
    checkIn.daily_day_symp || checkIn.daily_night_symp || checkIn.daily_limit_activity || Number(checkIn.puffs_today || 0) > 0;
  if ((top !== null && top >= 1) || anySymptom) return "mild";
  return "none";
}

// plain words from the person's own 0-10 scores; not Low/Medium/High (the forecast uses those)
export const LEVEL_LABELS = { none: "No symptoms", mild: "Slight", moderate: "Noticeable", severe: "Strong" };
