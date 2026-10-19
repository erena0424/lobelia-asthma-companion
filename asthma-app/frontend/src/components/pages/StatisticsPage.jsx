import "./StatisticsPage.css";
import { ComparisonCard, PatternsCard, TrendCard } from "./InsightsSections";
import { useInsights } from "../../helper-functions/useInsights";
import { useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import { useAuth } from "../../context/AuthContext";
import { getCheckIns } from "../../helper-functions/checkIns";

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

  // the downloadable summary covers the last month of check-ins
  const selectedRange = "month";
  const graphType = "symptoms";
  const insights = useInsights(token, 28);

  const [checkIns, setCheckIns] = useState([]);
  const [, setHistoryStatus] = useState("loading");
  const [, setHistoryErrorMessage] = useState("");

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
      `${graphLabel} RANGE: ${rangeLabel}`,
      ...selectedHistory.labels.map(
        (label, index) =>
          `${label}: ${selectedHistory.values[index]}`
      ),
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
    <main className="statistics-page">
      {/* the Low/Medium/High prediction is retired (LBL-020); Today shows what was logged instead */}
      {insights.status === "success" && <ComparisonCard comparison={insights.data.comparison} />}

      <TrendCard token={token} />
      <PatternsCard insights={insights} />

      <div className="insights-actions">
        <Button className="button-dark btn-large-text" onClick={downloadSummary}>
          Download Summary
        </Button>
      </div>
    </main>
  );
}

export default StatisticsPage;