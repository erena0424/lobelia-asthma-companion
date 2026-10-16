import "./StatisticsPage.css";
import { RISK_EXPLAINER, riskLabel } from "../../helper-functions/riskDisplay";
import { ComparisonCard, TrendCard } from "./InsightsSections";
import { useInsights } from "../../helper-functions/useInsights";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import { Button } from "react-bootstrap";
import { useAuth } from "../../context/AuthContext";
import { getCheckIns } from "../../helper-functions/checkIns";
import {
  loadCardPredictions,
  statisticsReminderText,
} from "../../helper-functions/getForecast";

const RANGE_OPTIONS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "threeMonths", label: "3 Months" },
  { key: "sixMonths", label: "6 Months" },
  { key: "year", label: "Year" },
];

function formatDateForApi(date) {
  return date.toISOString().slice(0, 10);
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function getDateRange(range) {
  const endDate = new Date();
  const startDate = new Date(endDate);

  switch (range) {
    case "day":
      break;

    case "week":
      startDate.setDate(endDate.getDate() - 6);
      break;

    case "month":
      startDate.setDate(endDate.getDate() - 29);
      break;

    case "threeMonths":
      startDate.setMonth(endDate.getMonth() - 3);
      startDate.setDate(startDate.getDate() + 1);
      break;

    case "sixMonths":
      startDate.setMonth(endDate.getMonth() - 6);
      startDate.setDate(startDate.getDate() + 1);
      break;

    case "year":
      startDate.setFullYear(endDate.getFullYear() - 1);
      startDate.setDate(startDate.getDate() + 1);
      break;

    default:
      startDate.setDate(endDate.getDate() - 6);
  }

  return {
    from: formatDateForApi(startDate),
    to: formatDateForApi(endDate),
  };
}

function getSymptomsCount(checkIn) {
  return (
    Number(Boolean(checkIn?.daily_day_symp)) +
    Number(Boolean(checkIn?.daily_night_symp)) +
    Number(Boolean(checkIn?.daily_limit_activity))
  );
}

function getPuffCount(checkIn) {
  return Number(checkIn?.puffs_today || 0);
}

function getGraphValue(checkIn, graphType) {
  return graphType === "puffs"
    ? getPuffCount(checkIn)
    : getSymptomsCount(checkIn);
}

function createDailyHistory(checkIns, from, to, graphType) {
  const checkInsByDate = new Map(
    checkIns.map((checkIn) => [checkIn.date, checkIn])
  );

  const labels = [];
  const values = [];

  const currentDate = parseLocalDate(from);
  const finalDate = parseLocalDate(to);

  while (currentDate <= finalDate) {
    const dateKey = formatDateForApi(currentDate);
    const checkIn = checkInsByDate.get(dateKey);

    labels.push(
      currentDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    );

    values.push(checkIn ? getGraphValue(checkIn, graphType) : 0);

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    labels,
    values,
  };
}

function createWeeklyHistory(checkIns, from, to, graphType) {
  const startDate = parseLocalDate(from);
  const endDate = parseLocalDate(to);

  const labels = [];
  const values = [];

  let weekStart = new Date(startDate);

  while (weekStart <= endDate) {
    let weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (weekEnd > endDate) {
      weekEnd = new Date(endDate);
    }

    const checkInsForWeek = checkIns.filter((checkIn) => {
      const checkInDate = parseLocalDate(checkIn.date);

      return checkInDate >= weekStart && checkInDate <= weekEnd;
    });

    const weeklyTotal = checkInsForWeek.reduce(
      (total, checkIn) => total + getGraphValue(checkIn, graphType),
      0
    );

    labels.push(
      weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    );

    values.push(weeklyTotal);

    weekStart = new Date(weekStart);
    weekStart.setDate(weekStart.getDate() + 7);
  }

  return {
    labels,
    values,
  };
}

function createMonthlyHistory(checkIns, from, to, graphType) {
  const startDate = parseLocalDate(from);
  const endDate = parseLocalDate(to);

  const labels = [];
  const values = [];

  let currentMonth = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    1
  );

  const finalMonth = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    1
  );

  while (currentMonth <= finalMonth) {
    const month = currentMonth.getMonth();
    const year = currentMonth.getFullYear();

    const checkInsForMonth = checkIns.filter((checkIn) => {
      const checkInDate = parseLocalDate(checkIn.date);

      return (
        checkInDate.getMonth() === month &&
        checkInDate.getFullYear() === year
      );
    });

    const monthlyTotal = checkInsForMonth.reduce(
      (total, checkIn) => total + getGraphValue(checkIn, graphType),
      0
    );

    labels.push(
      currentMonth.toLocaleDateString("en-US", {
        month: "short",
      })
    );

    values.push(monthlyTotal);

    currentMonth = new Date(year, month + 1, 1);
  }

  return {
    labels,
    values,
  };
}

function buildHistory(checkIns, selectedRange, graphType, from, to) {
  if (selectedRange === "day" || selectedRange === "week") {
    return createDailyHistory(checkIns, from, to, graphType);
  }

  if (selectedRange === "month") {
    return createWeeklyHistory(checkIns, from, to, graphType);
  }

  return createMonthlyHistory(checkIns, from, to, graphType);
}

function StatisticsPage() {
  const { token } = useAuth();

  const [forecast, setForecast] = useState(null);
  const [tomorrowForecast, setTomorrowForecast] = useState(null);
  const [forecastStatus, setForecastStatus] = useState("loading");
  const [forecastErrorMessage, setForecastErrorMessage] = useState("");

  // the downloadable summary covers the last month of check-ins
  const selectedRange = "month";
  const graphType = "symptoms";
  const insights = useInsights(token, 28);

  const [checkIns, setCheckIns] = useState([]);
  const [, setHistoryStatus] = useState("loading");
  const [, setHistoryErrorMessage] = useState("");

  const { location } = useOutletContext();

  useEffect(() => {
    let cancelled = false;

    async function loadForecast() {
      try {
        setForecastStatus("loading");
        setForecastErrorMessage("");

        const { today, tomorrow } = await loadCardPredictions({
          lat: location.lat,
          lon: location.lon,
          token,
        });

        if (!cancelled) {
          setForecast(today);
          setTomorrowForecast(tomorrow);
          setForecastStatus("success");
        }
      } catch (error) {
        if (cancelled) return;

        setForecastStatus("error");
        setTomorrowForecast(null);

        if (
          error.code === "CHECK_IN_REQUIRED" ||
          error.code === "FORECAST_NOT_FOUND"
        ) {
          setForecastErrorMessage(
            "Complete yesterday's symptom check-in to generate today's prediction.\nComplete today’s symptom check-in to generate tomorrow’s prediction."
          );
        } else {
          setForecastErrorMessage(
            error.message || "Your prediction is currently unavailable."
          );
        }
      }
    }

    if (token && location) {
      loadForecast();
    } else {
      setForecastStatus("error");
      setForecastErrorMessage("Log in to view your prediction.");
    }

    return () => {
      cancelled = true;
    };
  }, [token, location]);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        setHistoryStatus("loading");
        setHistoryErrorMessage("");

        const { from, to } = getDateRange(selectedRange);

        const response = await getCheckIns({
          from,
          to,
          token,
        });

        if (cancelled) return;

        setCheckIns(
          Array.isArray(response?.items)
            ? response.items
            : []
        );

        setHistoryStatus("success");
      } catch (error) {
        if (cancelled) return;

        setCheckIns([]);
        setHistoryStatus("error");

        setHistoryErrorMessage(
          error.message ||
            "Your recent check-in history is unavailable."
        );
      }
    }

    if (token) {
      loadHistory();
    } else {
      setHistoryStatus("error");
      setHistoryErrorMessage(
        "Log in to view your check-in history."
      );
    }

    return () => {
      cancelled = true;
    };
  }, [token, selectedRange]);


  const riskLevel =
    forecast?.risk_level || "Unavailable";

  const reasoning = useMemo(() => {
    const factors = forecast?.contributing_factors;

    if (
      !Array.isArray(factors) ||
      factors.length === 0
    ) {
      return "Not enough recent information is available to explain the prediction.";
    }

    if (factors.length === 1) {
      return `${factors[0]} contributed to this prediction.`;
    }

    const lastFactor =
      factors[factors.length - 1];

    const earlierFactors = factors
      .slice(0, -1)
      .join(", ");

    return `${earlierFactors}, and ${lastFactor} contributed to this prediction.`;
  }, [forecast]);


  const tomorrowRiskLevel =
    tomorrowForecast?.risk_level || "Unavailable";

  const tomorrowReasoning = useMemo(() => {
    const factors =
      tomorrowForecast?.contributing_factors;

    if (
      !Array.isArray(factors) ||
      factors.length === 0
    ) {
      return "Not enough recent information is available to explain the prediction.";
    }

    if (factors.length === 1) {
      return `${factors[0]} contributed to this prediction.`;
    }

    const lastFactor =
      factors[factors.length - 1];

    const earlierFactors = factors
      .slice(0, -1)
      .join(", ");

    return `${earlierFactors}, and ${lastFactor} contributed to this prediction.`;
  }, [tomorrowForecast]);

  const selectedHistory = useMemo(() => {
    const { from, to } =
      getDateRange(selectedRange);

    return buildHistory(
      checkIns,
      selectedRange,
      graphType,
      from,
      to
    );
  }, [checkIns, selectedRange, graphType]);

  const predictionReminder = useMemo(() => {
    const d = new Date();

    const todayLocal =
      `${d.getFullYear()}-` +
      `${String(d.getMonth() + 1).padStart(2, "0")}-` +
      `${String(d.getDate()).padStart(2, "0")}`;

    const todayCheckIn = checkIns.find(
      (row) => row.date === todayLocal
    );

    const todayCheckInComplete =
      todayCheckIn &&
      (Number(todayCheckIn.puffs_today || 0) > 0 ||
        Boolean(todayCheckIn.symptoms_logged));

    return statisticsReminderText({
      todayForecast: forecast,
      tomorrowForecast,
      todayCheckInComplete: Boolean(
        todayCheckInComplete
      ),
    });
  }, [checkIns, forecast, tomorrowForecast]);

  function downloadSummary() {
    const rangeLabel =
      RANGE_OPTIONS.find(
        (option) =>
          option.key === selectedRange
      )?.label || selectedRange;

    const graphLabel =
      graphType === "symptoms"
        ? "SYMPTOM HISTORY"
        : "RESCUE INHALER PUFF HISTORY";

    const summary = [
      "MIRROR LAKE ASTHMA SUMMARY",
      "",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "TODAY'S PREDICTION",
      `Risk level: ${riskLabel(riskLevel) ?? "Unavailable"}`,
      RISK_EXPLAINER,
      "",
      "REASONING",
      reasoning,
      "",
      `${graphLabel} RANGE: ${rangeLabel}`,
      ...selectedHistory.labels.map(
        (label, index) =>
          `${label}: ${selectedHistory.values[index]}`
      ),
      "",
      "Reminder: Enter today’s symptoms to receive a prediction for tomorrow.",
      "",
      "This summary does not replace professional medical advice.",
    ].join("\n");

    const file = new Blob([summary], {
      type: "text/plain;charset=utf-8",
    });

    const fileUrl = URL.createObjectURL(file);
    const link = document.createElement("a");

    link.href = fileUrl;

    link.download =
      `mirror-lake-summary-${new Date()
        .toISOString()
        .slice(0, 10)}.txt`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(fileUrl);
  }

  return (
    <main>
      <section className="statistics-grid">
        <article className="statistics-panel prediction-panel">
          <h2>
            {tomorrowForecast
              ? "Your Predictions"
              : "Today’s Prediction"}
          </h2>

          {forecastStatus === "loading" && (
            <div className="statistics-message">
              <h3>Loading your prediction...</h3>

              <p>
                We are reviewing your latest
                health and environment data.
              </p>
            </div>
          )}

          {forecastStatus === "error" && (
            <div className="statistics-message statistics-error-message">
              <h3>Prediction unavailable</h3>

              <p
                style={{
                  whiteSpace: "pre-line",
                  lineHeight: 1.3,
                }}
              >
                {forecastErrorMessage}
              </p>
            </div>
          )}

          {forecastStatus === "success" &&
            tomorrowForecast && (
              <div className="prediction-content">
                <div
                  className={`statistics-risk-circle risk-${tomorrowRiskLevel.toLowerCase()}`}
                >
                  <span className="risk-circle-label">
                    {riskLabel(tomorrowRiskLevel) ?? "—"}
                  </span>
                </div>

                <div className="prediction-reasoning">
                  <h3>Tomorrow’s Prediction</h3>
                  <p>{tomorrowReasoning}</p>
                </div>
              </div>
            )}

          {forecastStatus === "success" &&
            forecast && (
              <div className="prediction-content">
                <div
                  className={`statistics-risk-circle risk-${riskLevel.toLowerCase()}`}
                >
                  <span className="risk-circle-label">{riskLabel(riskLevel) ?? "—"}</span>
                </div>

                <div className="prediction-reasoning">
                  <h3>
                    {tomorrowForecast
                      ? "Today’s Prediction"
                      : "Reasoning"}
                  </h3>

                  <p>{reasoning}</p>
                  <p className="risk-explainer">{RISK_EXPLAINER}</p>
                </div>
              </div>
            )}

          {forecastStatus === "success" &&
            predictionReminder && (
              <p className="prediction-reminder">
                {predictionReminder}
              </p>
            )}
        </article>

        {insights.status === "success" && <ComparisonCard comparison={insights.data.comparison} />}
      </section>

      <TrendCard token={token} />
      {/* Possible patterns: waiting on Elena's choice of chart (condition level vs symptoms) */}

      <div className="insights-actions">
        <Button className="button-dark btn-large-text" onClick={downloadSummary}>
          Download Summary
        </Button>
      </div>
    </main>
  );
}

export default StatisticsPage;