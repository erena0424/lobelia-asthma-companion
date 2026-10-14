import { API_URL } from "../config";

// The asthma action plan reuses the existing support-memory field
// (GET/PUT/DELETE /v1/users/me/support-memory), so no schema change is needed.
// That field is also shared with the companion chat as saved background.
export const ACTION_PLAN_MAX_LENGTH = 500;

async function readError(response, fallback) {
  const data = await response.json().catch(() => null);
  return typeof data?.detail === "string" ? data.detail : fallback;
}

export async function getActionPlan(token) {
  const response = await fetch(`${API_URL}/v1/users/me/support-memory`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Unable to load your action plan."));
  }

  const data = await response.json();
  return data?.summary?.text || "";
}

export async function saveActionPlan(token, text) {
  const response = await fetch(`${API_URL}/v1/users/me/support-memory`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    // saving from the editor is the user's explicit approval
    body: JSON.stringify({ text, approved: true }),
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Unable to save your action plan."));
  }

  const data = await response.json();
  return data?.summary?.text || "";
}

export async function deleteActionPlan(token) {
  const response = await fetch(`${API_URL}/v1/users/me/support-memory`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(await readError(response, "Unable to remove your action plan."));
  }
}
