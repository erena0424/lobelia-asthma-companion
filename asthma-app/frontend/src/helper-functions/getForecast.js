import { API_URL } from "../config";
import { browserTimezone } from "./dayPlan";
import {
  selectCardPredictions,
  selectHomeForecast,
} from "./forecastDisplayLogic";

/**
 * Single Home/Statistics API: get stored predictions, or calculate + store if missing.
 * Also backfills advice when a stored forecast has none.
 */
export async function loadCardPredictions({ token, lat, lon, now = new Date() }) {
  const response = await fetch(`${API_URL}/v1/forecasts/today`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lat, lon, timezone: browserTimezone() }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data?.detail === "string"
        ? data.detail
        : data?.detail?.message || "Failed to load forecast";

    const error = new Error(message);
    error.code = data?.detail?.code || data?.code;
    error.status = response.status;
    throw error;
  }

  const visible = selectCardPredictions(
    {
      today: data.today || null,
      tomorrow: data.tomorrow || null,
    },
    now
  );

  if (!visible.today && !visible.tomorrow) {
    const error = new Error(
      "Complete a symptom check-in to generate your risk prediction."
    );
    error.code = "CHECK_IN_REQUIRED";
    throw error;
  }

  return visible;
}

/** Home card: today's risk before 6pm; after 6pm prefer tomorrow if available. */
export async function loadDisplayForecast({ token, lat, lon, now = new Date() }) {
  const cards = await loadCardPredictions({ token, lat, lon, now });
  return selectHomeForecast(cards, now);
}

export {
  forecastHasAdvice,
  homeRiskHeading,
  isAfterSixPm,
  localYmd,
  yesterdayYmd,
  selectCardPredictions,
  selectHomeForecast,
  statisticsReminderText,
} from "./forecastDisplayLogic";
