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

/** "6 more" / "2 fewer" / "Same", with a tone: "worse", "better" or "neutral". */
export function describeChange(previous, current, worseWhenMore) {
  const diff = Number(current || 0) - Number(previous || 0);
  if (diff === 0) return { text: "Same", tone: "neutral" };
  const text = `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"}`;
  if (worseWhenMore === null) return { text, tone: "neutral" };
  return { text, tone: (diff > 0) === worseWhenMore ? "worse" : "better" };
}

/** One plain sentence with the real counts behind a pattern. */
export function patternSentence(pattern) {
  const counts = `${pattern.harder_with} of ${pattern.days_with}`;
  const others = `${pattern.harder_without} of ${pattern.days_without} other days`;
  if (pattern.kind === "trigger") return `Harder breathing on ${counts} days you noted ${pattern.label.toLowerCase()}, vs ${others}.`;
  if (pattern.kind === "plan") return `Harder breathing on ${counts} days with “${pattern.label}”, vs ${others}.`;
  return `Harder breathing on ${counts} ${pattern.label.toLowerCase().replace(/ days$/, " days")}, vs ${others}.`;
}

export const TREND_TAGS = { newer: "Newer", steady: "Steady", fading: "Fading" };

/** Month key "2026-09" -> "Sep". */
export function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

/** Symptom level for a calendar day: none / mild / moderate / severe, or null when not checked in. */
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

export const LEVEL_LABELS = { none: "No symptoms", mild: "Mild", moderate: "Moderate", severe: "Severe" };
