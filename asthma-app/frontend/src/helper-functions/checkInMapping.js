// Maps the detailed check-in onto the fields the forecast model already uses
// (daily_day_symp, daily_night_symp, daily_limit_activity, puffs_today).
// Everything else is kept as readable text in notes. No new columns.
// The mapping below needs clinical-advisor review.

export const MOODS = [
  { value: 1, label: "Very low", face: "😣" },
  { value: 2, label: "Low", face: "🙁" },
  { value: 3, label: "Okay", face: "😐" },
  { value: 4, label: "Good", face: "🙂" },
  { value: 5, label: "Great", face: "😄" },
];

export const SEVERITY_LABELS = ["None", "Mild", "Moderate", "Severe"];

export const BREATHING_SYMPTOMS = [
  { key: "shortness_of_breath", label: "Shortness of breath" },
  { key: "chest_tightness", label: "Chest tightness" },
  { key: "wheezing", label: "Wheezing" },
  { key: "coughing", label: "Coughing" },
];

export const CONTEXT_CHIPS = [
  { key: "night_waking", label: "Night waking" },
  { key: "activity_limitation", label: "Activity limitation" },
  { key: "reliever_use", label: "Reliever use" },
];

const NOTES_PREFIX = "[Check-in] ";

export function emptyCheckIn() {
  return {
    mood: null,
    breathing: Object.fromEntries(BREATHING_SYMPTOMS.map(({ key }) => [key, 0])),
    context: [],
    puffs: 1,
    triggers: [],
    note: "",
  };
}

function summaryLine(answers) {
  const parts = [];
  const mood = MOODS.find((option) => option.value === answers.mood);

  if (mood) parts.push(`Feeling: ${mood.label}`);

  parts.push(
    "Breathing: " +
      BREATHING_SYMPTOMS.map(
        ({ key, label }) => `${label.toLowerCase()} ${SEVERITY_LABELS[answers.breathing[key] ?? 0].toLowerCase()}`
      ).join(", ")
  );

  const context = CONTEXT_CHIPS.filter(({ key }) => answers.context.includes(key)).map(({ label }) => label.toLowerCase());
  if (context.length > 0) parts.push(`Also: ${context.join(", ")}`);

  return NOTES_PREFIX + parts.join(". ") + ".";
}

/** Payload for POST /v1/check-ins plus the puff total to set (or null to leave it). */
export function toCheckInPayload(answers, date) {
  const note = answers.note.trim();

  return {
    body: {
      date,
      daily_day_symp: Object.values(answers.breathing).some((level) => level > 0),
      daily_night_symp: answers.context.includes("night_waking"),
      daily_limit_activity: answers.context.includes("activity_limitation"),
      notes: note ? `${summaryLine(answers)}\n${note}` : summaryLine(answers),
      triggers: answers.triggers,
    },
    puffs: answers.context.includes("reliever_use") ? Math.max(1, Number(answers.puffs) || 1) : null,
  };
}

/** The user's own words from a saved note, without the generated summary line. */
export function userNoteFrom(notes) {
  const text = String(notes || "");

  if (!text.startsWith(NOTES_PREFIX)) return text;

  const newline = text.indexOf("\n");
  return newline === -1 ? "" : text.slice(newline + 1);
}
