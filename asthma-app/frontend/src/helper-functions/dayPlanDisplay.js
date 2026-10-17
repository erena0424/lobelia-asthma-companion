// Pure display helpers for the day plan (no fetch, testable in plain Node).

/** "2:30 PM" from "2026-10-15T14:30" (local wall-clock time as entered). */
export function formatEventTime(start) {
  const match = /T(\d{2}):(\d{2})/.exec(String(start || ""));
  if (!match) return "All day";

  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${minutes} ${suffix}`;
}

function minutesOf(start) {
  const match = /T(\d{2}):(\d{2})/.exec(String(start || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** First timed event that hasn't ended yet (or started within the last hour if no end). */
export function nextEvent(events, now = new Date()) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    (events || []).find((event) => {
      if (event.all_day) return false;

      const end = minutesOf(event.end);
      const start = minutesOf(event.start);
      if (start === null) return false;

      return (end ?? start + 60) > nowMinutes;
    }) || null
  );
}

export function environmentLine(environment) {
  if (!environment) return "";

  return [
    environment.pollen && `Pollen is ${environment.pollen.toLowerCase()}`,
    environment.aqi_label && `Air quality: ${environment.aqi_label.toLowerCase()}`,
    environment.temperature_f !== null && environment.temperature_f !== undefined && `${environment.temperature_f}°F`,
  ]
    .filter(Boolean)
    .join(" · ");
}
