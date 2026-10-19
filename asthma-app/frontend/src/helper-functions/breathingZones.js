// Deterministic trouble-breathing rules. The LLM never picks the zone or a dose:
// zones come only from these rules, doses only from the user's saved plan.
// PROTOTYPE: these rules have NOT been clinically validated (clinical-advisor
// review required before real use). They loosely follow the common
// green/yellow/red asthma action plan layout.

export const DANGER_QUESTIONS = [
  { key: "cant_talk_or_walk", text: "Is it hard to talk or walk because you're short of breath?" },
  { key: "blue_or_gray", text: "Are your lips or fingernails blue, gray, or pale?" },
  { key: "confused_or_drowsy", text: "Are you confused or unusually drowsy?" },
];

export const BREATHING_LEVELS = ["None", "Mild", "Moderate", "Severe"];
export const ACTIVITY_OPTIONS = ["Yes", "Some", "No"];
export const RELIEVER_OPTIONS = ["No", "Yes, it helped", "Yes, but not enough"];

export function hasDangerSign(dangerAnswers) {
  return DANGER_QUESTIONS.some(({ key }) => dangerAnswers[key] === true);
}

/** Peak flow zone from saved thresholds, else from % of personal best (80% / 50%). */
export function peakFlowZone(reading, peakFlow) {
  const value = Number(reading);
  if (!reading || !Number.isFinite(value) || value <= 0) return null;

  const { personal_best: best, yellow_below: yellowBelow, red_below: redBelow } = peakFlow || {};
  const red = redBelow || (best ? best * 0.5 : null);
  const yellow = yellowBelow || (best ? best * 0.8 : null);

  if (red && value < red) return "red";
  if (yellow && value < yellow) return "yellow";
  if (red || yellow) return "green";
  return null;
}

/**
 * @param answers {breathing, cough, wheeze, chest_tightness, usual_activities, woke_at_night, reliever, yellow_24h, peak_flow}
 * @returns {{ zone: "green"|"yellow"|"red", reasons: string[] }}
 */
export function assessZone(answers, peakFlowSettings = null) {
  const red = [];
  const yellow = [];
  const flow = peakFlowZone(answers.peak_flow, peakFlowSettings);

  if (answers.breathing === "Severe") red.push("Severe trouble breathing");
  if (answers.usual_activities === "No") red.push("Can't do usual activities");
  if (answers.reliever === "Yes, but not enough") red.push("Reliever isn't helping enough");
  if (flow === "red") red.push("Peak flow in the red zone");
  // NHLBI 2020 action plan red-zone sign: same or worse after 24 hours in the Yellow Zone
  if (answers.yellow_24h) red.push("Not better after 24 hours in the Yellow Zone");

  if (answers.breathing === "Mild" || answers.breathing === "Moderate") yellow.push(`${answers.breathing} trouble breathing`);
  if (answers.cough) yellow.push("Coughing");
  if (answers.wheeze) yellow.push("Wheezing");
  if (answers.chest_tightness) yellow.push("Chest tightness");
  if (answers.usual_activities === "Some") yellow.push("Some trouble with usual activities");
  if (answers.woke_at_night) yellow.push("Woke up from sleep");
  if (answers.reliever === "Yes, it helped") yellow.push("Needed your reliever");
  if (flow === "yellow") yellow.push("Peak flow in the yellow zone");

  if (red.length > 0) return { zone: "red", reasons: red };
  if (yellow.length > 0) return { zone: "yellow", reasons: yellow };
  return { zone: "green", reasons: [] };
}
