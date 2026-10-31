import { API_URL } from "../config";
import { browserTimezone } from "./dayPlan";

async function parse(response, fallback) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(typeof data?.detail === "string" ? data.detail : fallback);
    error.code = data?.code;
    throw error;
  }

  return data;
}

// Only what Google keeps; a Lobelia plan's breathing details and notes stay in Lobelia.
function googleFields(event) {
  return {
    title: event.title,
    start: event.start,
    end: event.end,
    all_day: event.all_day,
    location: event.location,
    timezone: browserTimezone(),
  };
}

/** Adds a plan the person just made in Lobelia to their Google Calendar. */
export async function createGoogleEvent({ token, event }) {
  const response = await fetch(`${API_URL}/v1/calendar/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(googleFields(event)),
  });

  return parse(response, "We couldn't add this plan to Google Calendar.");
}

/**
 * Saves a change to an event in Google Calendar (the change lands in Google).
 * A Google event's notes are its description; a synced Lobelia plan leaves the description alone.
 */
export async function updateGoogleEvent({ token, id, event, keepDescription = false }) {
  const response = await fetch(`${API_URL}/v1/calendar/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(keepDescription ? googleFields(event) : { ...googleFields(event), description: event.notes }),
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

/**
 * Saves a new plan with `save(event)`, first adding it to Google Calendar when asked.
 * The plan remembers its Google copy (google_event_id); if saving in Lobelia fails,
 * the Google copy is removed again so it isn't left behind.
 */
export async function saveNewPlan({ token, event, addToGoogle, save }) {
  if (!addToGoogle) return save(event);

  const { event: created } = await createGoogleEvent({ token, event });
  try {
    return await save({ ...event, google_event_id: created.id });
  } catch (error) {
    await deleteGoogleEvent({ token, id: created.id }).catch(() => {});
    throw error;
  }
}

/**
 * Brings a synced plan's Google copy in line after it was edited in Lobelia.
 * Returns the plan to keep: if the Google copy was already deleted there, the link is dropped.
 */
export async function syncPlanEdit({ token, event }) {
  try {
    await updateGoogleEvent({ token, id: event.google_event_id, event, keepDescription: true });
    return event;
  } catch (error) {
    if (error.code === "CALENDAR_EVENT_NOT_FOUND") return { ...event, google_event_id: null };
    throw error;
  }
}
