// Quick logs: "right now" symptoms, saved with the time (POST /v1/symptom-logs).
// They pre-fill the Day check-in; nothing here is a forecast.
import { API_URL } from "../config";

async function request(path, { token, method = "GET", body } = {}, fallbackMessage) {
  const response = await fetch(`${API_URL}/v1/symptom-logs${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 204) return null;

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(typeof data?.detail === "string" ? data.detail : fallbackMessage);
    error.status = response.status;
    throw error;
  }
  return data;
}

export function getQuickLogs({ token, from, to }) {
  const params = new URLSearchParams({ from, ...(to ? { to } : {}) });
  return request(`?${params}`, { token }, "Failed to load quick logs");
}

export function saveQuickLog({ token, log }) {
  return request("", { token, method: "POST", body: log }, "We couldn't save your quick log. Please try again.");
}

export function deleteQuickLog({ token, id }) {
  return request(`/${id}`, { token, method: "DELETE" }, "We couldn't delete that quick log.");
}

export function getDayPrefill({ token, date }) {
  const params = new URLSearchParams({ date, tz_offset: String(new Date().getTimezoneOffset()) });
  return request(`/prefill?${params}`, { token }, "Failed to load your quick logs");
}

export { logTime, quickLogSummary, toQuickLogPayload } from "./quickLogDisplay.js";
