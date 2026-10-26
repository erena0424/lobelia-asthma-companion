import { API_URL } from "../config";
import { browserTimezone } from "./dayPlan";

async function parse(response, fallback) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : fallback);
  }

  return data;
}

/** Saves a change to an event that came from Google Calendar (the change lands in Google). */
export async function updateGoogleEvent({ token, id, event }) {
  const response = await fetch(`${API_URL}/v1/calendar/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: event.title,
      start: event.start,
      end: event.end,
      all_day: event.all_day,
      location: event.location,
      description: event.notes,
      timezone: browserTimezone(),
    }),
  });

  return parse(response, "We couldn't save this change to Google Calendar.");
}

/** Deletes an event in Google Calendar. */
export async function deleteGoogleEvent({ token, id }) {
  const response = await fetch(`${API_URL}/v1/calendar/events/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    await parse(response, "We couldn't delete this event from Google Calendar.");
  }
}
