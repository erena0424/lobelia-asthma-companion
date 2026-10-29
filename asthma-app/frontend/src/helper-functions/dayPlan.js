import { API_URL } from "../config";

export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  } catch {
    return "America/Chicago";
  }
}

async function parse(response, fallback) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : fallback);
  }

  return data;
}

/** Morning summary + one tip per event for a day (cached on the server). */
export async function getDayPlan({ token, lat, lon, date }) {
  const response = await fetch(`${API_URL}/v1/day-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lat, lon, timezone: browserTimezone(), ...(date ? { date } : {}) }),
  });

  return parse(response, "Unable to load today's plan.");
}

// google_event_id links a plan to the copy added to Google Calendar from Lobelia
const EVENT_FIELDS = ["id", "title", "start", "end", "all_day", "location", "environment", "intensity", "context", "notes", "google_event_id"];

// The forecast advice only reads title/time/location/description, so the
// extra details are also folded into description for it.
function describe(event) {
  return [
    event.environment && `${event.environment}`,
    event.intensity && `${event.intensity} intensity`,
    event.context && `may involve: ${event.context}`,
    event.notes,
  ]
    .filter(Boolean)
    .join(". ");
}

/** Replaces the user's own (non-Google) events for one day. */
export async function saveDayEvents({ token, date, events }) {
  const payload = events.map((event) => {
    const clean = Object.fromEntries(EVENT_FIELDS.map((key) => [key, event[key] ?? null]));
    return { ...clean, description: describe(event) || null, source: "manual" };
  });

  const response = await fetch(`${API_URL}/v1/calendar/manual-events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ date, events: payload }),
  });

  return parse(response, "Unable to save your plan.");
}

export { environmentLine, formatEventTime, nextEvent } from "./dayPlanDisplay";
