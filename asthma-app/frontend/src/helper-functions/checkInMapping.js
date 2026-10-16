// The check-in has four required yes/no questions that the forecast model uses
// (daily_day_symp, daily_night_symp, daily_limit_activity, puffs_today). Everything
// else (face, 0-10 scores, possible triggers, note) is optional and feeds the AI tips,
// chat and history. Readable text also goes in notes. No new columns.
// Question wording needs clinical-advisor review.

export const MOODS = [
  { value: 1, label: "Very low" },
  { value: 2, label: "Low" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Great" },
];

export const BREATHING_MAX = 10;


/** 0 No symptoms, 1-3 Slight, 4-6 Noticeable, 7-10 Strong (plain words, not clinical severity) */
export function severityLabel(score) {
  const value = Number(score) || 0;
  if (value <= 0) return "No symptoms";
  if (value <= 3) return "Slight";
  if (value <= 6) return "Noticeable";
  return "Strong";
}

export const BREATHING_SYMPTOMS = [
  { key: "shortness_of_breath", label: "Shortness of breath" },
  { key: "chest_tightness", label: "Chest tightness" },
  { key: "wheezing", label: "Wheezing" },
  { key: "coughing", label: "Coughing" },
];

// Required: the forecast model needs an explicit answer to each of these.
export const BASIC_QUESTIONS = [
  { key: "daySymptoms", label: "Did you have asthma symptoms during the day?" },
  { key: "nightSymptoms", label: "Did asthma symptoms wake you up at night?" },
  { key: "activityLimited", label: "Did asthma limit what you could do?" },
  { key: "relieverUsed", label: "Did you use your rescue inhaler?" },
];

// Offered as optional chips; people can also add their own.
export const COMMON_TRIGGERS = [
  "Pollen", "Cold air", "Exercise", "Smoke", "Strong scents", "Pets", "Dust", "Stress", "A cold or flu", "Humidity",
];

/** Common, profile and already-picked triggers, de-duplicated case-insensitively, in that order. */
export function triggerOptions(known = [], picked = []) {
  const seen = new Set();
  return [...COMMON_TRIGGERS, ...known, ...picked].filter((trigger) => {
    const key = String(trigger).trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The required questions still unanswered (puff count included when the reliever was used). */
export function missingBasics(answers) {
  const missing = BASIC_QUESTIONS.filter(({ key }) => answers[key] !== true && answers[key] !== false).map(({ key }) => key);
  if (answers.relieverUsed === true && !(Number(answers.puffs) >= 1)) missing.push("puffs");
  return missing;
}

function contextFrom(answers) {
  return [
    ...(answers.nightSymptoms ? ["night_waking"] : []),
    ...(answers.activityLimited ? ["activity_limitation"] : []),
    ...(answers.relieverUsed ? ["reliever_use"] : []),
  ];
}

const NOTES_PREFIX = "[Check-in] ";

export function emptyCheckIn() {
  return {
    daySymptoms: null,
    nightSymptoms: null,
    activityLimited: null,
    relieverUsed: null,
    mood: null,
    breathing: Object.fromEntries(BREATHING_SYMPTOMS.map(({ key }) => [key, 0])),
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
    `Daytime symptoms: ${answers.daySymptoms ? "yes" : "no"}, woke at night: ${answers.nightSymptoms ? "yes" : "no"}, ` +
      `activity limited: ${answers.activityLimited ? "yes" : "no"}, ` +
      `rescue inhaler: ${answers.relieverUsed ? `${Number(answers.puffs)} puffs` : "no"}`
  );

  parts.push(
    "Breathing: " +
      BREATHING_SYMPTOMS.map(
        ({ key, label }) => {
          const score = answers.breathing[key] ?? 0;
          return `${label.toLowerCase()} ${score}/10 (${severityLabel(score).toLowerCase()})`;
        }
      ).join(", ")
  );

  if (answers.triggers.length > 0) parts.push(`Possible triggers: ${answers.triggers.join(", ")}`);

  return NOTES_PREFIX + parts.join(". ") + ".";
}

/** Payload for POST /v1/check-ins plus the day's rescue puff total (0 when not used). */
export function toCheckInPayload(answers, date) {
  const note = answers.note.trim();

  return {
    body: {
      date,
      daily_day_symp: answers.daySymptoms === true,
      daily_night_symp: answers.nightSymptoms === true,
      daily_limit_activity: answers.activityLimited === true,
      notes: note ? `${summaryLine(answers)}\n${note}` : summaryLine(answers),
      triggers: answers.triggers,
      details: {
        ...(answers.mood ? { mood: answers.mood } : {}),
        breathing: { ...answers.breathing },
        context: contextFrom(answers),
      },
    },
    puffs: answers.relieverUsed ? Math.max(1, Number(answers.puffs) || 1) : 0,
  };
}

/** The user's own words from a saved note, without the generated summary line. */
export function userNoteFrom(notes) {
  const text = String(notes || "");

  if (!text.startsWith(NOTES_PREFIX)) return text;

  const newline = text.indexOf("\n");
  return newline === -1 ? "" : text.slice(newline + 1);
}

/** Answers prefilled from a saved check-in for that day (basics only when it was logged). */
export function answersFromSaved(existing) {
  const base = emptyCheckIn();
  if (!existing) return base;

  const logged = Boolean(existing.symptoms_logged);
  const puffs = Number(existing.puffs_today) || 0;
  const breathing = existing.details?.breathing;

  return {
    ...base,
    daySymptoms: logged ? Boolean(existing.daily_day_symp) : null,
    nightSymptoms: logged ? Boolean(existing.daily_night_symp) : null,
    activityLimited: logged ? Boolean(existing.daily_limit_activity) : null,
    // "Log a use" on Today records puffs without a check-in; carry those over
    relieverUsed: puffs > 0 ? true : logged ? false : null,
    puffs: puffs > 0 ? puffs : 1,
    mood: existing.details?.mood || null,
    breathing: breathing ? { ...base.breathing, ...breathing } : base.breathing,
    triggers: existing.triggers || [],
    note: userNoteFrom(existing.notes),
  };
}
