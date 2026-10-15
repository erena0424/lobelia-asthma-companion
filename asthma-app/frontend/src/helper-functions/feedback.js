import { API_URL } from "../config";

export const SUPPORT_EMAIL = "support@lobelia.app";
export const FEEDBACK_MAX_LENGTH = 5000;

/** Sends feedback to the support inbox; token is optional (signed-out visitors). */
export async function sendFeedback({ token, message, category, allowReply, email }) {
  const response = await fetch(`${API_URL}/v1/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message,
      category,
      allow_reply: allowReply,
      ...(email ? { email } : {}),
      page: window.location.hash.split("?")[0] || "#/",
      app_version: import.meta.env.VITE_APP_VERSION || "prototype",
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = new Error(
      response.status === 429
        ? "You've sent a lot of feedback in a short time. Please try again later."
        : typeof data?.detail === "string" && response.status < 500
          ? data.detail
          : "We couldn't send your feedback right now."
    );
    error.status = response.status;
    throw error;
  }
}
