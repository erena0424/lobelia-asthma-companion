// Pure helpers for quick logs (tested with node --test; no API calls here).
import { BREATHING_SYMPTOMS, severityLabel } from "./checkInMapping.js";

/** Body for POST /v1/symptom-logs from the Quick log form, stamped with the local time and day. */
export function toQuickLogPayload(draft, now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return {
    logged_at: now.toISOString(),
    local_date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    breathing: { ...draft.breathing },
    limiting_activity: draft.limiting ? true : null,
    reliever_puffs: Math.max(0, Math.min(50, Math.round(Number(draft.puffs) || 0))),
    triggers: draft.triggers,
    note: draft.note.trim() || null,
  };
}

/** One plain line for a saved log, e.g. "Noticeable wheezing, slight coughing · 2 reliever puffs · Exercise". */
export function quickLogSummary(log) {
  const symptoms = BREATHING_SYMPTOMS
    .map(({ key, label }) => ({ label, score: Number(log.breathing?.[key]) || 0 }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ label, score }) => `${severityLabel(score).toLowerCase()} ${label.toLowerCase()}`);

  const parts = [symptoms.length ? symptoms.join(", ") : "no symptoms"];
  if (log.limiting_activity) parts.push("limiting what I was doing");
  if (log.reliever_puffs > 0) parts.push(`${log.reliever_puffs} reliever ${log.reliever_puffs === 1 ? "puff" : "puffs"}`);
  if (log.triggers?.length) parts.push(log.triggers.join(", "));

  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** "2:10 pm" in the viewer's time zone. */
export function logTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}
