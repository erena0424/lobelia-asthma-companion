// The forecast score is an uncalibrated model output, so the app shows only the
// level (thresholds 0.40 / 0.70 live in the backend) and never a percentage.

export const RISK_EXPLAINER =
  "Based on today's conditions and your recent check-ins. An estimate, not a diagnosis.";

/** "Low" | "Medium" | "High" (accepts "Moderate" as Medium), or null if unknown. */
export function riskLabel(level) {
  const value = String(level || "").trim().toLowerCase();
  if (value === "low") return "Low";
  if (value === "medium" || value === "moderate") return "Medium";
  if (value === "high") return "High";
  return null;
}
