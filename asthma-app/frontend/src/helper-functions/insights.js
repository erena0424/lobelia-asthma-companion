import { API_URL } from "../config";

// GET /v1/insights: weekly trend, last-4-weeks comparison and possible patterns.
export async function getInsights({ token, days = 28, today }) {
  const params = new URLSearchParams({ days: String(days) });
  if (today) params.set("today", today);

  const response = await fetch(`${API_URL}/v1/insights?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.detail === "string" ? data.detail : "Insights are unavailable right now.");
  }
  return data;
}
